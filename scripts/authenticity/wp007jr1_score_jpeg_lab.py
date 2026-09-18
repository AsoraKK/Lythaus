"""Score the frozen SAFE-A model across the real-media JPEG laboratory."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from pathlib import Path
from typing import Any

import numpy as np
import torch
from PIL import Image
from torchvision import transforms


SAFE_CHECKPOINT_SHA256 = "b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e"
SAFE_COMMIT = "4e998724651b227def64f5be0cd60c0aa1552c35"
SAFE_THRESHOLD = 0.5864923000335693
FLUX2_MARKERS = ("flux.2", "flux2", "flux-2")


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def verify_generated_manifest(path: Path) -> dict[str, Any]:
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if not manifest.get("scoreBlind") or manifest.get("flux2PixelAccess") or manifest.get("flux2ProviderCalls") != 0:
        raise RuntimeError(f"JPEG_MANIFEST_NOT_SCORE_BLIND_OR_SEALED:{path}")
    expected = manifest.get("generatedManifestSha256")
    payload = dict(manifest)
    payload.pop("generatedManifestSha256", None)
    actual = sha256_bytes(canonical_bytes(payload))
    if expected != actual:
        raise RuntimeError(f"JPEG_MANIFEST_HASH_MISMATCH:{path}:{expected}:{actual}")
    return manifest


def load_model(safe_root: Path, checkpoint: Path) -> torch.nn.Module:
    if sha256_file(checkpoint) != SAFE_CHECKPOINT_SHA256:
        raise RuntimeError("SAFE_CHECKPOINT_HASH_MISMATCH")
    sys.path.insert(0, str(safe_root))
    from models.resnet import resnet50

    model = resnet50(num_classes=2)
    checkpoint_data = torch.load(checkpoint, map_location="cpu", weights_only=False)
    state = checkpoint_data.get("model", checkpoint_data)
    model.load_state_dict(state, strict=True)
    model.eval()
    for parameter in model.parameters():
        parameter.requires_grad_(False)
    return model


def safe_score(model: torch.nn.Module, path: Path, crop: transforms.CenterCrop, to_tensor: transforms.ToTensor) -> tuple[float, int, int, float, float]:
    preprocess_started = time.perf_counter()
    with Image.open(path) as image:
        image.load()
        rgb = image.convert("RGB")
        width, height = rgb.size
        tensor = to_tensor(crop(rgb)).unsqueeze(0)
    preprocess_ms = (time.perf_counter() - preprocess_started) * 1000.0
    started = time.perf_counter()
    with torch.inference_mode():
        logits = model(tensor)
    runtime_ms = (time.perf_counter() - started) * 1000.0
    score = float(torch.softmax(logits, dim=1)[0, 1].item())
    return score, width, height, preprocess_ms, runtime_ms


def score_manifest(
    *,
    model: torch.nn.Module,
    manifest: dict[str, Any],
    manifest_path: Path,
    root: Path,
    encoder_role: str,
    parent_scores: dict[str, float],
    crop: transforms.CenterCrop,
    to_tensor: transforms.ToTensor,
) -> tuple[list[dict[str, Any]], list[float], list[float]]:
    rows: list[dict[str, Any]] = []
    runtimes: list[float] = []
    preprocess_times: list[float] = []
    for index, record in enumerate(manifest["records"]):
        family = record.get("generatorFamily") or ""
        relative = record["relativeOutputPath"]
        if any(marker in f"{family} {relative}".lower() for marker in FLUX2_MARKERS):
            raise RuntimeError(f"FLUX2_ACCESS_DENIED:{family}:{relative}")
        path = root / relative
        if not path.is_file():
            raise FileNotFoundError(path)
        actual_sha = sha256_file(path)
        if actual_sha != record["sha256"]:
            raise RuntimeError(f"JPEG_OUTPUT_HASH_MISMATCH:{record['derivedId']}")
        parent_id = record["parentSampleId"]
        if parent_id not in parent_scores:
            raise RuntimeError(f"PARENT_SCORE_MISSING:{parent_id}")
        score, width, height, preprocess_ms, runtime_ms = safe_score(model, path, crop, to_tensor)
        original_score = parent_scores[parent_id]
        rows.append(
            {
                "derivedId": record["derivedId"],
                "parentSampleId": parent_id,
                "sourceFamilyId": record["sourceFamilyId"],
                "generatorFamily": record.get("generatorFamily"),
                "truthLabel": record["truthLabel"],
                "sourceSubtype": record.get("sourceSubtype"),
                "operation": record["operation"],
                "encoder": record["encoder"],
                "encoderRole": encoder_role,
                "requestedQuality": record.get("requestedQuality"),
                "requestedSubsampling": record.get("requestedSubsampling"),
                "relativeOutputPath": relative,
                "manifestPath": manifest_path.as_posix(),
                "inputSha256": actual_sha,
                "decodedWidth": width,
                "decodedHeight": height,
                "rawScore": score,
                "originalRawScore": original_score,
                "scoreDeltaFromOriginal": score - original_score,
                "threshold": SAFE_THRESHOLD,
                "thresholdPass": score >= SAFE_THRESHOLD,
                "originalThresholdPass": original_score >= SAFE_THRESHOLD,
                "preprocessMs": preprocess_ms,
                "runtimeMs": runtime_ms,
                "status": "OK",
            }
        )
        runtimes.append(runtime_ms)
        preprocess_times.append(preprocess_ms)
        if (index + 1) % 100 == 0 or index + 1 == len(manifest["records"]):
            print(f"SAFE_JPEG_RECORDS={index + 1}", flush=True)
    return rows, runtimes, preprocess_times


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    if not ordered:
        return 0.0
    index = min(len(ordered) - 1, max(0, int(len(ordered) * fraction) - 1))
    return ordered[index]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--safe-root", type=Path, required=True)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--parent-results", type=Path, required=True)
    parser.add_argument("--pillow-manifest", type=Path, required=True)
    parser.add_argument("--pillow-root", type=Path, required=True)
    parser.add_argument("--sharp-manifest", type=Path, required=True)
    parser.add_argument("--sharp-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--threads", type=int, default=4)
    args = parser.parse_args()

    if sha256_file(args.checkpoint) != SAFE_CHECKPOINT_SHA256:
        raise RuntimeError("SAFE_CHECKPOINT_HASH_MISMATCH")
    parent_results = json.loads(args.parent_results.read_text(encoding="utf-8"))
    if parent_results.get("checkpointSha256") != SAFE_CHECKPOINT_SHA256 or parent_results.get("threshold") != SAFE_THRESHOLD:
        raise RuntimeError("PARENT_SAFE_REFERENCE_MISMATCH")
    parent_scores = {row["sampleId"]: float(row["rawScore"]) for row in parent_results["records"]}
    pillow_manifest = verify_generated_manifest(args.pillow_manifest)
    sharp_manifest = verify_generated_manifest(args.sharp_manifest)
    if pillow_manifest.get("sourceCohortFreezeSha256") != sharp_manifest.get("sourceCohortFreezeSha256"):
        raise RuntimeError("JPEG_MANIFEST_COHORT_MISMATCH")

    torch.set_num_threads(args.threads)
    torch.set_num_interop_threads(1)
    model = load_model(args.safe_root, args.checkpoint)
    crop = transforms.CenterCrop((256, 256))
    to_tensor = transforms.ToTensor()
    rows: list[dict[str, Any]] = []
    runtimes: list[float] = []
    preprocess_times: list[float] = []
    for manifest, manifest_path, root, role in [
        (pillow_manifest, args.pillow_manifest, args.pillow_root, "PILLOW_LIBJPEG"),
        (sharp_manifest, args.sharp_manifest, args.sharp_root, "SHARP_LIBVIPS"),
    ]:
        scored, elapsed, preprocessed = score_manifest(
            model=model,
            manifest=manifest,
            manifest_path=manifest_path,
            root=root,
            encoder_role=role,
            parent_scores=parent_scores,
            crop=crop,
            to_tensor=to_tensor,
        )
        rows.extend(scored)
        runtimes.extend(elapsed)
        preprocess_times.extend(preprocessed)

    rows.sort(key=lambda row: row["derivedId"])
    output = {
        "schemaVersion": "lythaus-wp007jr1-safe-jpeg-lab-results-v1",
        "detectorId": "SAFE",
        "detectorVersion": f"SAFE_OFFICIAL_{SAFE_COMMIT}",
        "checkpointSha256": SAFE_CHECKPOINT_SHA256,
        "threshold": SAFE_THRESHOLD,
        "officialPreprocessing": "RGB decode; torchvision CenterCrop(256,256); ToTensor; official SAFE forward; class-1 softmax",
        "scoreBlindCuration": True,
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
        "sourceCohortFreezeSha256": pillow_manifest["sourceCohortFreezeSha256"],
        "pillowManifestSha256": pillow_manifest["generatedManifestSha256"],
        "sharpManifestSha256": sharp_manifest["generatedManifestSha256"],
        "records": rows,
        "runtimeP50Ms": percentile(runtimes, 0.50),
        "runtimeP95Ms": percentile(runtimes, 0.95),
        "runtimeMaxMs": max(runtimes) if runtimes else 0.0,
        "preprocessP50Ms": percentile(preprocess_times, 0.50),
        "preprocessP95Ms": percentile(preprocess_times, 0.95),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"records": len(rows), "runtimeP95Ms": output["runtimeP95Ms"], "pillow": len(pillow_manifest["records"]), "sharp": len(sharp_manifest["records"])}))


if __name__ == "__main__":
    main()
