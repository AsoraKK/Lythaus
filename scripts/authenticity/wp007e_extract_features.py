"""Extract and hash frozen CLIP and DINOv2 representations for WP007E."""

from __future__ import annotations

import argparse
import gc
import json
import os
import sys
import time
from pathlib import Path

import numpy as np
import torch
from PIL import Image
from torchvision import transforms

from wp007e_common import canonicalize, load_json, sha256_bytes, sha256_file, write_json


def percentile(values: list[float], q: float) -> float:
    return float(np.percentile(np.asarray(values, dtype=np.float64), q))


def sample_records(repo_root: Path, media_root: Path) -> list[dict]:
    roles = load_json(repo_root / "research" / "wp007e" / "data-role-freeze.json")
    canonical = load_json(repo_root / "research" / "wp007e" / "canonicalizer-spec.json")
    decoder = load_json(media_root / "decoder-proxies" / "proxy-manifest.json")
    benign = load_json(media_root / "benign-negatives" / "benign-manifest.json")
    negative_benign = load_json(repo_root / "research" / "wp007e" / "negative-benign-manifest.json")
    role_by_family = {
        item["sourceFamilyId"]: item
        for role_name in ("PAIR_BASE", "NEGATIVE_CALIBRATION", "NEGATIVE_DEV_CONTROL", "NEGATIVE_CONFIRM", "DDB_TRANSFER_DEV", "DDB_TRANSFER_CONFIRM")
        for item in roles["roles"][role_name]["records"]
    }
    result: list[dict] = []
    for item in canonical["records"]:
        result.append({
            "sampleId": item["sampleId"],
            "sourceFamilyId": item["sourceFamilyId"],
            "role": item["role"],
            "pixelRelativePath": item["canonicalRelativePath"],
            "inputPixelSha256": item["canonicalSha256"],
            "canonical": True,
            "sourceType": role_by_family.get(item["sourceFamilyId"], {}).get("sourceType"),
            "sourceSubtype": role_by_family.get(item["sourceFamilyId"], {}).get("sourceSubtype"),
        })
    for item in decoder["records"]:
        result.append({
            "sampleId": item["sampleId"],
            "sourceFamilyId": item["sourceFamilyId"],
            "role": "MATCHED_DECODER_PROXY",
            "lineage": item["lineage"],
            "variantId": item["variantId"],
            "pixelRelativePath": item["proxyRelativePath"],
            "inputPixelSha256": item["proxySha256"],
            "canonical": False,
        })
    for item in benign["records"]:
        result.append({
            "sampleId": item["sampleId"],
            "sourceFamilyId": item["sourceFamilyId"],
            "role": "BENIGN_HARD_NEGATIVE",
            "transform": item["transform"],
            "pixelRelativePath": item["outputRelativePath"],
            "inputPixelSha256": item["outputSha256"],
            "canonical": False,
        })
    for item in negative_benign["records"]:
        result.append({
            "sampleId": item["sampleId"],
            "sourceFamilyId": item["sourceFamilyId"],
            "role": "BENIGN_NEGATIVE_CONTROL",
            "sourceRole": item["sourceRole"],
            "transform": item["transform"],
            "pixelRelativePath": item["outputRelativePath"],
            "inputPixelSha256": item["outputSha256"],
            "canonical": False,
        })
    if len({item["sampleId"] for item in result}) != len(result):
        raise RuntimeError("feature_sample_id_collision")
    return sorted(result, key=lambda item: item["sampleId"])


def load_pil(sample: dict, media_root: Path) -> Image.Image:
    path = media_root / sample["pixelRelativePath"]
    if not path.is_file():
        raise FileNotFoundError(path)
    with Image.open(path) as opened:
        image = opened.convert("RGB")
    return canonicalize(image) if not sample["canonical"] else image


def load_clip(backbone_root: Path):
    clip_repo = backbone_root / "openai-CLIP"
    sys.path.insert(0, str(clip_repo))
    import clip

    model, preprocess = clip.load("ViT-B/32", device="cpu", download_root=str(backbone_root / "weights"), jit=False)
    model.eval()
    model.requires_grad_(False)
    return model, preprocess


def load_dino(backbone_root: Path):
    os.environ["TORCH_HOME"] = str(backbone_root / "torch-home")
    model = torch.hub.load(str(backbone_root / "facebookresearch-dinov2"), "dinov2_vits14", source="local", pretrained=True)
    model = model.to("cpu").eval()
    model.requires_grad_(False)
    preprocess = transforms.Compose([
        transforms.Resize(256, interpolation=transforms.InterpolationMode.BICUBIC),
        transforms.CenterCrop(224),
        transforms.ToTensor(),
        transforms.Normalize((0.485, 0.456, 0.406), (0.229, 0.224, 0.225)),
    ])
    return model, preprocess


@torch.inference_mode()
def extract_batch(model, backbone_id: str, batch: torch.Tensor) -> torch.Tensor:
    if backbone_id == "CLIP_VIT_B32":
        features = model.encode_image(batch).float()
    else:
        output = model.forward_features(batch)
        class_token = output["x_norm_clstoken"].float()
        patch_mean = output["x_norm_patchtokens"].float().mean(dim=1)
        features = torch.cat([class_token, patch_mean], dim=1)
    return torch.nn.functional.normalize(features, dim=1)


def run_backbone(backbone_id: str, model, preprocess, samples: list[dict], media_root: Path, cache_root: Path, weight_sha: str, batch_size: int = 8) -> tuple[list[dict], dict]:
    output_root = cache_root / backbone_id
    output_root.mkdir(parents=True, exist_ok=True)
    records = []
    runtimes = []
    smoke_ids = []
    pair_camera = [item for item in samples if item["role"] == "PAIR_BASE" and item.get("sourceType") == "CAMERA_NEGATIVE"]
    pair_digital = [item for item in samples if item["role"] == "PAIR_BASE" and item.get("sourceType") == "DIGITAL_NON_AI_NEGATIVE"]
    smoke_ids.extend(item["sampleId"] for item in pair_camera[:3])
    smoke_ids.extend(item["sampleId"] for item in pair_digital[:2])
    proxy_smoke = [item for item in samples if item["role"] == "MATCHED_DECODER_PROXY"][:2]
    ddb_smoke = [item for item in samples if item["sampleId"].startswith("DDB_")][:2]
    smoke_ids.extend(item["sampleId"] for item in proxy_smoke + ddb_smoke)
    smoke_set = set(smoke_ids)
    for start in range(0, len(samples), batch_size):
        chunk = samples[start : start + batch_size]
        tensors = []
        for item in chunk:
            tensors.append(preprocess(load_pil(item, media_root)))
        batch = torch.stack(tensors).to(dtype=torch.float32)
        started = time.perf_counter()
        features = extract_batch(model, backbone_id, batch).cpu().numpy().astype("<f4")
        elapsed = time.perf_counter() - started
        per_item = elapsed / len(chunk)
        runtimes.extend([per_item] * len(chunk))
        for item, feature in zip(chunk, features, strict=True):
            safe_name = item["sampleId"].replace("/", "_").replace("\\", "_")
            feature_path = output_root / f"{safe_name}.npy"
            with feature_path.open("wb") as handle:
                np.save(handle, feature, allow_pickle=False)
            records.append({
                "sampleId": item["sampleId"],
                "sourceFamilyId": item["sourceFamilyId"],
                "role": item["role"],
                "variantId": item.get("variantId"),
                "lineage": item.get("lineage"),
                "transform": item.get("transform"),
                "inputPixelSha256": item["inputPixelSha256"],
                "backboneId": backbone_id,
                "weightSha256": weight_sha,
                "featureDimension": int(feature.shape[0]),
                "featureRelativePath": f"{backbone_id}/{feature_path.name}",
                "featureSha256": sha256_file(feature_path),
            })
        if (start + len(chunk)) % 80 == 0 or start + len(chunk) == len(samples):
            print(json.dumps({"status": "PROGRESS", "backbone": backbone_id, "completed": start + len(chunk), "total": len(samples)}, sort_keys=True), flush=True)
    runtime = {
        "smokeSampleIds": smoke_ids,
        "runtimeSecondsPerImageAllBatched": runtimes,
        "runtimeP50Seconds": percentile(runtimes, 50),
        "runtimeP95Seconds": percentile(runtimes, 95),
        "runtimeTier": "FAST" if percentile(runtimes, 95) <= 5 else "MODERATE" if percentile(runtimes, 95) <= 20 else "SLOW" if percentile(runtimes, 95) <= 60 else "NOT_PRACTICAL",
        "smokeCount": len(smoke_set),
        "smokeIncludesCameraDigitalProxyDdb": len(smoke_set) == 9,
        "batchSize": batch_size,
    }
    return sorted(records, key=lambda item: item["sampleId"]), runtime


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--backbone-root", required=True)
    parser.add_argument("--media-root", required=True)
    args = parser.parse_args()
    repo_root = Path(__file__).resolve().parents[2]
    backbone_root = Path(args.backbone_root)
    media_root = Path(args.media_root)
    cache_root = media_root / "feature-cache"
    samples = sample_records(repo_root, media_root)
    registry = load_json(repo_root / "research" / "wp007e" / "backbone-registry.json")
    all_records = []
    runtimes = {}
    for backbone_id, registry_key in (("CLIP_VIT_B32", "CLIP"), ("DINOV2_VITS14", "DINOv2")):
        if backbone_id.startswith("CLIP"):
            model, preprocess = load_clip(backbone_root)
        else:
            model, preprocess = load_dino(backbone_root)
        records, runtime = run_backbone(
            backbone_id,
            model,
            preprocess,
            samples,
            media_root,
            cache_root,
            registry["backbones"][registry_key]["weightSha256"],
        )
        all_records.extend(records)
        runtimes[backbone_id] = runtime
        del model
        gc.collect()
    if len(all_records) != len(samples) * 2:
        raise RuntimeError(f"feature_record_count:{len(all_records)}:{len(samples) * 2}")
    manifest = {
        "schemaVersion": "lythaus-wp007e-feature-manifest-v1",
        "dataRoleFreezeSha256": load_json(repo_root / "research" / "wp007e" / "data-role-freeze.json")["dataRoleFreezeSha256"],
        "pairedCorpusFreezeSha256": load_json(repo_root / "research" / "wp007e" / "paired-decoder-corpus-freeze.json")["pairedCorpusFreezeSha256"],
        "backboneRegistrySha256": registry["registrySha256"],
        "sampleCount": len(samples),
        "backboneCount": 2,
        "records": sorted(all_records, key=lambda item: (item["backboneId"], item["sampleId"])),
        "runtime": runtimes,
        "featuresOutsideGit": True,
        "flux1PixelAccess": False,
        "flux2PixelAccess": False,
    }
    manifest["featureManifestSha256"] = sha256_bytes(json.dumps(manifest, ensure_ascii=True, sort_keys=True, separators=(",", ":")).encode("utf-8"))
    write_json(repo_root / "research" / "wp007e" / "feature-manifest.json", manifest)
    print(json.dumps({"status": "PASS", "sampleCount": len(samples), "featureRecordCount": len(all_records), "featureManifestSha256": manifest["featureManifestSha256"], "runtime": runtimes}, sort_keys=True), flush=True)


if __name__ == "__main__":
    main()
