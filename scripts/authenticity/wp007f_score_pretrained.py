"""Score frozen actual-image roles with published UFD and RINE heads."""

from __future__ import annotations

import argparse
import gc
import hashlib
import json
import sys
import time
from io import BytesIO
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageOps


def decode_rgb(path: Path) -> Image.Image:
    if path.suffix.lower() == ".svg":
        import cairosvg

        raw = cairosvg.svg2png(bytestring=path.read_bytes(), output_width=1024, output_height=1024)
        image = Image.open(BytesIO(raw))
    else:
        image = Image.open(path)
    image.load()
    return ImageOps.exif_transpose(image).convert("RGB")


def resolve_record(record: dict, data_root: Path, digital_root: Path) -> Path:
    if record.get("inputPath"):
        path = Path(record["inputPath"])
        if not path.is_file():
            raise FileNotFoundError(path)
        return path
    roots = {
        "CSAFE_WP006E_CACHE": data_root / "wp006e-csafe-cache-4e8c0d40f2c7",
        "WP007E_CONTROLLED_DIGITAL_CACHE": digital_root,
        "WP007A_DIFFUSIONDB_CACHE": data_root / "90_RESEARCH_ONLY" / "wp007a-diffusiondb-cache",
    }
    path = roots[record["sourceRootKey"]] / record["sourceRelativePath"]
    if not path.is_file():
        raise FileNotFoundError(path)
    return path


def select_records(roles: dict, stage: str) -> list[dict]:
    suffix = "_DEV" if stage == "dev" else "_CONFIRM"
    selected = [record for role, records in roles["roles"].items() if role.endswith(suffix) for record in records]
    return sorted(selected, key=lambda item: (item["role"], item["sampleId"]))


def load_clip(clip_root: Path, clip_weight: Path):
    if str(clip_root) not in sys.path:
        sys.path.insert(0, str(clip_root))
    import clip

    model, preprocess = clip.load(str(clip_weight), device="cpu", jit=False)
    model.eval()
    return model, preprocess


def prepared_tensors(records: list[dict], args: argparse.Namespace, preprocess) -> tuple[torch.Tensor, list[dict]]:
    tensors: list[torch.Tensor] = []
    metadata: list[dict] = []
    for record in records:
        image = decode_rgb(resolve_record(record, args.data_root, args.digital_root))
        tensors.append(preprocess(image))
        metadata.append({
            "sampleId": record["sampleId"],
            "sourceFamilyId": record["sourceFamilyId"],
            "role": record["role"],
            "rowKey": record.get("rowKey"),
            "baseRowKey": record.get("baseRowKey"),
            "transform": record.get("transform"),
            "transformation": record.get("transformation"),
            "inputRegime": record.get("inputRegime"),
            "generatorFamily": record.get("generatorFamily"),
            "sourceSubtype": record.get("sourceSubtype"),
            "cameraDeviceFamily": record.get("cameraDeviceFamily"),
            "decodedPixelSha256": hashlib.sha256(np.asarray(image).tobytes()).hexdigest(),
            "nativeWidth": image.width,
            "nativeHeight": image.height,
            "nativePixelCount": image.width * image.height,
            "inputFormat": record.get("format"),
            "inputBytes": record.get("bytes"),
        })
        image.close()
    return torch.stack(tensors), metadata


def run_ufd(records: list[dict], args: argparse.Namespace) -> dict:
    started = time.perf_counter()
    clip_model, preprocess = load_clip(args.clip_root, args.clip_weight)
    state = torch.load(args.ufd_head, map_location="cpu", weights_only=True)
    head = torch.nn.Linear(768, 1)
    head.load_state_dict(state)
    head.eval()
    load_seconds = time.perf_counter() - started
    batch, metadata = prepared_tensors(records, args, preprocess)
    output: list[dict] = []
    with torch.inference_mode():
        for start in range(0, len(metadata), args.batch_size):
            stop = min(len(metadata), start + args.batch_size)
            inference_started = time.perf_counter()
            features = clip_model.encode_image(batch[start:stop]).float()
            scores = torch.sigmoid(head(features)).reshape(-1).tolist()
            elapsed = time.perf_counter() - inference_started
            per_item = elapsed / max(1, stop - start)
            for item, score in zip(metadata[start:stop], scores):
                output.append({**item, "rawScore": float(score), "runtimeSeconds": round(per_item, 6), "batchRuntimeSeconds": round(elapsed, 6)})
    result = {
        "detectorId": "UNIVERSAL_FAKE_DETECT",
        "displayName": "UniversalFakeDetect",
        "checkpointSha256": "477100745713bcc957beb2b40859536859b6483fd6301b3b9293151b194c7847",
        "clipWeightSha256": "b8cca3fd41ae0c99ba7e8951adf17d267cdb84cd88be6f7c2e0eca1737a03836",
        "scoreDirection": "HIGHER_SCORE_SYNTHETIC",
        "loadSeconds": round(load_seconds, 6),
        "records": output,
    }
    del head, clip_model, batch
    gc.collect()
    return result


def run_rine(records: list[dict], args: argparse.Namespace) -> dict:
    if str(args.clip_root) not in sys.path:
        sys.path.insert(0, str(args.clip_root))
    if str(args.rine_root) not in sys.path:
        sys.path.insert(0, str(args.rine_root))
    import clip as clip_package

    original_load = clip_package.load

    def load_pinned_clip(name, device="cpu", jit=False, **kwargs):
        if name == "ViT-L/14":
            return original_load(str(args.clip_weight), device=device, jit=jit, **kwargs)
        return original_load(name, device=device, jit=jit, **kwargs)

    clip_package.load = load_pinned_clip
    from src.models import Model

    started = time.perf_counter()
    model = Model(backbone=("ViT-L/14", 1024), nproj=4, proj_dim=1024, device="cpu")
    state = torch.load(args.rine_head, map_location="cpu", weights_only=True)
    missing, unexpected = model.load_state_dict(state, strict=False)
    if unexpected:
        raise RuntimeError(f"RINE_UNEXPECTED_KEYS:{unexpected}")
    model.eval()
    load_seconds = time.perf_counter() - started
    batch, metadata = prepared_tensors(records, args, model.preprocess)
    output: list[dict] = []
    with torch.inference_mode():
        for start in range(0, len(metadata), args.batch_size):
            stop = min(len(metadata), start + args.batch_size)
            inference_started = time.perf_counter()
            logits, _ = model(batch[start:stop])
            scores = torch.sigmoid(logits).reshape(-1).tolist()
            elapsed = time.perf_counter() - inference_started
            per_item = elapsed / max(1, stop - start)
            for item, score in zip(metadata[start:stop], scores):
                output.append({**item, "rawScore": float(score), "runtimeSeconds": round(per_item, 6), "batchRuntimeSeconds": round(elapsed, 6)})
    result = {
        "detectorId": "RINE",
        "displayName": "RINE",
        "checkpointSha256": "13986ffc86e1bd9d57fd640f891358c4f14c0f8aea8e590e52c598541f69fdc1",
        "clipWeightSha256": "b8cca3fd41ae0c99ba7e8951adf17d267cdb84cd88be6f7c2e0eca1737a03836",
        "scoreDirection": "HIGHER_SCORE_SYNTHETIC",
        "loadSeconds": round(load_seconds, 6),
        "missingKeys": list(missing),
        "records": output,
    }
    del model, batch
    gc.collect()
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--roles", type=Path, required=True)
    parser.add_argument("--stage", choices=["dev", "confirm"], required=True)
    parser.add_argument("--data-root", type=Path, required=True)
    parser.add_argument("--digital-root", type=Path, required=True)
    parser.add_argument("--clip-root", type=Path, required=True)
    parser.add_argument("--clip-weight", type=Path, required=True)
    parser.add_argument("--ufd-head", type=Path, required=True)
    parser.add_argument("--rine-root", type=Path, required=True)
    parser.add_argument("--rine-head", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--threads", type=int, default=8)
    parser.add_argument("--detector", choices=["UNIVERSAL_FAKE_DETECT", "RINE"], action="append")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--records-json", type=Path, default=None)
    parser.add_argument("--role", action="append", dest="roles_filter")
    parser.add_argument("--final-exam", action="store_true")
    args = parser.parse_args()
    torch.set_num_threads(args.threads)
    torch.set_num_interop_threads(1)
    if args.batch_size < 1:
        raise ValueError("BATCH_SIZE_MUST_BE_POSITIVE")
    roles = json.loads(args.roles.read_text(encoding="utf-8"))
    records = json.loads(args.records_json.read_text(encoding="utf-8"))["records"] if args.records_json else select_records(roles, args.stage)
    if args.roles_filter:
        allowed = set(args.roles_filter)
        records = [record for record in records if record.get("role") in allowed]
    if args.limit is not None:
        if args.limit < 1:
            raise ValueError("LIMIT_MUST_BE_POSITIVE")
        records = records[:args.limit]
    detector_ids = args.detector or ["UNIVERSAL_FAKE_DETECT", "RINE"]
    detector_runs = []
    if "UNIVERSAL_FAKE_DETECT" in detector_ids:
        detector_runs.append(run_ufd(records, args))
    if "RINE" in detector_ids:
        detector_runs.append(run_rine(records, args))
    result = {
        "schemaVersion": "lythaus-wp007f-pretrained-raw-score-run-v1",
        "stage": args.stage,
        "scoreBlind": not args.final_exam,
        "flux1PixelAccess": args.final_exam,
        "flux2PixelAccess": False,
        "roleCounts": {role: sum(item["role"] == role for item in records) for role in sorted({item["role"] for item in records})},
        "detectors": detector_runs,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"stage": args.stage, "records": len(records), "detectors": [{"id": d["detectorId"], "loadSeconds": d["loadSeconds"], "runtimeP50": float(np.median([r["runtimeSeconds"] for r in d["records"]]))} for d in result["detectors"]]}))


if __name__ == "__main__":
    main()
