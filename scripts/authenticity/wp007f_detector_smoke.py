"""Bounded CPU smoke for frozen WP007F pretrained detector adapters."""

from __future__ import annotations

import argparse
import gc
import hashlib
import json
import sys
import time
from pathlib import Path

import numpy as np
import torch
from PIL import Image


def load_image(path: Path) -> Image.Image:
    if path.suffix.lower() == ".svg":
        import cairosvg

        raw = cairosvg.svg2png(bytestring=path.read_bytes(), output_width=1024, output_height=1024)
        from io import BytesIO

        return Image.open(BytesIO(raw)).convert("RGB")
    return Image.open(path).convert("RGB")


def resolve_record(record: dict, data_root: Path, digital_root: Path) -> Path:
    roots = {
        "CSAFE_WP006E_CACHE": data_root / "wp006e-csafe-cache-4e8c0d40f2c7",
        "WP007E_CONTROLLED_DIGITAL_CACHE": digital_root,
        "WP007A_DIFFUSIONDB_CACHE": data_root / "90_RESEARCH_ONLY" / "wp007a-diffusiondb-cache",
    }
    path = roots[record["sourceRootKey"]] / record["sourceRelativePath"]
    if not path.is_file():
        raise FileNotFoundError(path)
    return path


def load_clip(clip_root: Path, weight: Path):
    sys.path.insert(0, str(clip_root))
    import clip

    model, preprocess = clip.load(str(weight), device="cpu", jit=False)
    model.eval()
    return model, preprocess


def image_batch(records: list[dict], data_root: Path, digital_root: Path, preprocess) -> tuple[torch.Tensor, list[dict]]:
    tensors = []
    selected = []
    for record in records:
        path = resolve_record(record, data_root, digital_root)
        image = load_image(path)
        tensors.append(preprocess(image))
        selected.append({
            "sampleId": record["sampleId"],
            "sourceFamilyId": record["sourceFamilyId"],
            "role": record["role"],
            "pathType": path.suffix.lower(),
            "pixelSha256": hashlib.sha256(np.asarray(image).tobytes()).hexdigest(),
        })
    return torch.stack(tensors), selected


def run_ufd(args: argparse.Namespace, records: list[dict]) -> dict:
    started_load = time.perf_counter()
    clip_model, preprocess = load_clip(args.clip_root, args.clip_weight)
    state = torch.load(args.ufd_head, map_location="cpu", weights_only=True)
    head = torch.nn.Linear(768, 1)
    head.load_state_dict(state)
    head.eval()
    load_seconds = time.perf_counter() - started_load
    batch, selected = image_batch(records, args.data_root, args.digital_root, preprocess)
    times = []
    scores = []
    with torch.inference_mode():
        for index in range(len(selected)):
            started = time.perf_counter()
            features = clip_model.encode_image(batch[index:index + 1]).float()
            score = torch.sigmoid(head(features)).reshape(-1)[0].item()
            times.append(time.perf_counter() - started)
            scores.append(float(score))
    result = {
        "detectorId": "UNIVERSAL_FAKE_DETECT",
        "checkpointSha256": "477100745713bcc957beb2b40859536859b6483fd6301b3b9293151b194c7847",
        "loadSeconds": round(load_seconds, 6),
        "records": [dict(meta, rawScore=score, runtimeSeconds=round(runtime, 6)) for meta, score, runtime in zip(selected, scores, times)],
    }
    del head, clip_model, batch
    gc.collect()
    return result


def run_rine(args: argparse.Namespace, records: list[dict]) -> dict:
    import clip as clip_package

    original_load = clip_package.load

    def load_pinned_clip(name, device="cpu", jit=False, **kwargs):
        if name == "ViT-L/14":
            return original_load(str(args.clip_weight), device=device, jit=jit, **kwargs)
        return original_load(name, device=device, jit=jit, **kwargs)

    clip_package.load = load_pinned_clip
    sys.path.insert(0, str(args.rine_root))
    from src.models import Model

    started_load = time.perf_counter()
    model = Model(backbone=("ViT-L/14", 1024), nproj=4, proj_dim=1024, device="cpu")
    state = torch.load(args.rine_head, map_location="cpu", weights_only=True)
    missing, unexpected = model.load_state_dict(state, strict=False)
    if unexpected:
        raise RuntimeError(f"RINE_UNEXPECTED_KEYS:{unexpected}")
    model.eval()
    load_seconds = time.perf_counter() - started_load
    batch, selected = image_batch(records, args.data_root, args.digital_root, model.preprocess)
    times = []
    scores = []
    with torch.inference_mode():
        for index in range(len(selected)):
            started = time.perf_counter()
            output, _ = model(batch[index:index + 1])
            score = torch.sigmoid(output).reshape(-1)[0].item()
            times.append(time.perf_counter() - started)
            scores.append(float(score))
    result = {
        "detectorId": "RINE",
        "checkpointSha256": "13986ffc86e1bd9d57fd640f891358c4f14c0f8aea8e590e52c598541f69fdc1",
        "loadSeconds": round(load_seconds, 6),
        "missingKeys": list(missing),
        "records": [dict(meta, rawScore=score, runtimeSeconds=round(runtime, 6)) for meta, score, runtime in zip(selected, scores, times)],
    }
    del model, batch
    gc.collect()
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--roles", type=Path, required=True)
    parser.add_argument("--data-root", type=Path, required=True)
    parser.add_argument("--digital-root", type=Path, required=True)
    parser.add_argument("--clip-root", type=Path, required=True)
    parser.add_argument("--clip-weight", type=Path, required=True)
    parser.add_argument("--ufd-head", type=Path, required=True)
    parser.add_argument("--rine-root", type=Path, required=True)
    parser.add_argument("--rine-head", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--threads", type=int, default=8)
    args = parser.parse_args()
    torch.set_num_threads(args.threads)
    torch.set_num_interop_threads(1)
    roles = json.loads(args.roles.read_text(encoding="utf-8"))
    records = [roles["roles"][role][0] for role in ("CAMERA_DEV", "DIGITAL_DEV", "DDB_DETECTOR_DEV")]
    output = {
        "schemaVersion": "lythaus-wp007f-detector-smoke-v1",
        "cpuThreads": args.threads,
        "roleCount": len(records),
        "detectors": [run_ufd(args, records), run_rine(args, records)],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "detectors": [
            {"detectorId": item["detectorId"], "loadSeconds": item["loadSeconds"], "runtimes": [record["runtimeSeconds"] for record in item["records"]]}
            for item in output["detectors"]
        ]
    }))


if __name__ == "__main__":
    main()
