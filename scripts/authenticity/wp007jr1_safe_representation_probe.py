"""Extract frozen SAFE-A scores and the 512-D pre-fc1 representation."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import sys
import time
from io import BytesIO
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


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def resolve_roots(values: list[str]) -> dict[str, Path]:
    roots: dict[str, Path] = {}
    for value in values:
        key, separator, raw_path = value.partition("=")
        if not separator or not key or not raw_path:
            raise ValueError(f"ROOT_MAPPING_REQUIRED:{value}")
        roots[key] = Path(raw_path).expanduser().resolve()
    return roots


def decode_rgb(path: Path) -> Image.Image:
    image = Image.open(path)
    image.load()
    return image.convert("RGB")


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


def features_and_logits(model: torch.nn.Module, tensor: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
    """Mirror official forward while exposing the vector before fc1."""
    transformed = model._preprocess_dwt(tensor)
    hidden = model.conv1(transformed)
    hidden = model.bn1(hidden)
    hidden = model.relu(hidden)
    hidden = model.maxpool(hidden)
    hidden = model.layer1(hidden)
    hidden = model.layer2(hidden)
    pooled = model.avgpool(hidden)
    vector = pooled.view(pooled.size(0), -1)
    logits = model.fc1(vector)
    official_logits = model(tensor)
    return vector, logits, official_logits


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--safe-root", type=Path, required=True)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--embedding-output", type=Path, required=True)
    parser.add_argument("--threads", type=int, default=4)
    parser.add_argument("--root", action="append", default=[])
    parser.add_argument("--limit", type=int, default=None)
    args = parser.parse_args()

    if sha256_file(args.checkpoint) != SAFE_CHECKPOINT_SHA256:
        raise RuntimeError("SAFE_CHECKPOINT_HASH_MISMATCH")
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    if not manifest.get("scoreBlind") or manifest.get("flux2PixelAccess") or manifest.get("flux2ProviderCalls") != 0:
        raise RuntimeError("SAFE_REPRESENTATION_MANIFEST_NOT_SCORE_BLIND_OR_SEALED")
    roots = resolve_roots(args.root)
    records = manifest["records"][: args.limit]
    if not records:
        raise RuntimeError("EMPTY_REPRESENTATION_COHORT")

    torch.set_num_threads(args.threads)
    torch.set_num_interop_threads(1)
    load_started = time.perf_counter()
    model = load_model(args.safe_root, args.checkpoint)
    load_seconds = time.perf_counter() - load_started
    crop = transforms.CenterCrop((256, 256))
    to_tensor = transforms.ToTensor()
    vectors: list[np.ndarray] = []
    rows: list[dict[str, Any]] = []
    runtimes: list[float] = []
    preprocess_times: list[float] = []
    max_logit_delta = 0.0
    process = None
    try:
        import psutil

        process = psutil.Process(os.getpid())
    except ImportError:
        pass
    peak_rss = process.memory_info().rss if process else None

    with torch.inference_mode():
        for index, record in enumerate(records):
            family = record.get("generatorFamily") or ""
            relative = record["relativePath"]
            if any(marker in f"{family} {relative}".lower() for marker in FLUX2_MARKERS):
                raise RuntimeError(f"FLUX2_ACCESS_DENIED:{family}:{relative}")
            if record["rootKey"] not in roots:
                raise RuntimeError(f"ROOT_KEY_MISSING:{record['rootKey']}")
            path = roots[record["rootKey"]] / relative
            if not path.is_file():
                raise FileNotFoundError(path)
            actual_sha = sha256_file(path)
            if actual_sha != record["sha256"]:
                raise RuntimeError(f"INPUT_HASH_MISMATCH:{record['sampleId']}")
            preprocess_started = time.perf_counter()
            with decode_rgb(path) as image:
                width, height = image.size
                tensor = to_tensor(crop(image)).unsqueeze(0)
            preprocess_ms = (time.perf_counter() - preprocess_started) * 1000.0
            started = time.perf_counter()
            vector, logits, official_logits = features_and_logits(model, tensor)
            runtime_ms = (time.perf_counter() - started) * 1000.0
            vector_np = vector[0].detach().cpu().numpy().astype(np.float32, copy=True)
            logits_np = logits[0].detach().cpu().numpy().astype(np.float64)
            official_np = official_logits[0].detach().cpu().numpy().astype(np.float64)
            if vector_np.shape != (512,) or not np.isfinite(vector_np).all():
                raise RuntimeError(f"SAFE_EMBEDDING_INVALID:{record['sampleId']}")
            delta = float(np.max(np.abs(logits_np - official_np)))
            max_logit_delta = max(max_logit_delta, delta)
            if delta > 1e-5:
                raise RuntimeError(f"SAFE_FEATURE_FORWARD_MISMATCH:{record['sampleId']}:{delta}")
            score = float(torch.softmax(logits, dim=1)[0, 1].item())
            vectors.append(vector_np)
            rows.append(
                {
                    "sampleId": record["sampleId"],
                    "sourceFamilyId": record["sourceFamilyId"],
                    "generatorFamily": record.get("generatorFamily"),
                    "role": record["role"],
                    "label": record["label"],
                    "sourceSubtype": record.get("sourceSubtype"),
                    "rootKey": record["rootKey"],
                    "relativePath": relative,
                    "inputSha256": actual_sha,
                    "decodedWidth": width,
                    "decodedHeight": height,
                    "rawScore": score,
                    "logit0": float(logits_np[0]),
                    "logit1": float(logits_np[1]),
                    "threshold": SAFE_THRESHOLD,
                    "thresholdPass": score >= SAFE_THRESHOLD,
                    "preprocessMs": preprocess_ms,
                    "runtimeMs": runtime_ms,
                    "status": "OK",
                    "diagnosticRole": record.get("diagnosticRole"),
                }
            )
            runtimes.append(runtime_ms)
            preprocess_times.append(preprocess_ms)
            if process:
                peak_rss = max(peak_rss, process.memory_info().rss)
            if (index + 1) % 25 == 0 or index + 1 == len(records):
                print(f"SAFE_REPRESENTATION_RECORDS={index + 1}", flush=True)

    args.embedding_output.parent.mkdir(parents=True, exist_ok=True)
    matrix = np.stack(vectors, axis=0)
    np.savez_compressed(
        args.embedding_output,
        vectors=matrix,
        sample_ids=np.asarray([row["sampleId"] for row in rows]),
        labels=np.asarray([row["label"] for row in rows], dtype=np.int8),
        source_families=np.asarray([row["sourceFamilyId"] for row in rows]),
    )
    embedding_sha = sha256_file(args.embedding_output)
    sorted_runtime = sorted(runtimes)
    sorted_preprocess = sorted(preprocess_times)
    output = {
        "schemaVersion": "lythaus-wp007jr1-safe-representation-results-v1",
        "detectorId": "SAFE",
        "detectorVersion": f"SAFE_OFFICIAL_{SAFE_COMMIT}",
        "checkpointSha256": SAFE_CHECKPOINT_SHA256,
        "threshold": SAFE_THRESHOLD,
        "officialPreprocessing": "RGB decode; torchvision CenterCrop(256,256); ToTensor; official DWT bior1.3 J=1; class-1 softmax",
        "embeddingDefinition": "flattened avgpool output immediately before fc1",
        "embeddingDimension": 512,
        "scoreBlind": True,
        "flux1PixelAccess": True,
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
        "records": rows,
        "embeddingArtifact": {"pathLogical": "external/wp007jr1/safe-a-embeddings.npz", "sha256": embedding_sha, "shape": list(matrix.shape)},
        "embeddingFinite": bool(np.isfinite(matrix).all()),
        "maxFeatureForwardLogitDelta": max_logit_delta,
        "loadSeconds": load_seconds,
        "runtimeP50Ms": sorted_runtime[len(sorted_runtime) // 2],
        "runtimeP95Ms": sorted_runtime[max(0, int(len(sorted_runtime) * 0.95) - 1)],
        "preprocessP50Ms": sorted_preprocess[len(sorted_preprocess) // 2],
        "peakRssBytes": peak_rss,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"records": len(rows), "embeddingShape": list(matrix.shape), "embeddingSha256": embedding_sha, "runtimeP95Ms": output["runtimeP95Ms"], "peakRssBytes": peak_rss}, sort_keys=True))


if __name__ == "__main__":
    main()
