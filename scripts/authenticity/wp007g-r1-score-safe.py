"""Score the frozen SAFE checkpoint on the R1 input manifest.

This mirrors SAFE's published evaluation path: RGB decode, a 256-pixel
center crop, tensor conversion, the model's own DWT preprocessing, and the
class-1 softmax score.  Input media and score output remain outside Git.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
from io import BytesIO
from pathlib import Path

import torch
from PIL import Image
from torchvision import transforms


FLUX2_MARKERS = ("flux.2", "flux2", "flux-2")
SAFE_CHECKPOINT_SHA256 = "b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def decode_rgb(path: Path) -> Image.Image:
    if path.suffix.lower() == ".svg":
        import cairosvg

        raw = cairosvg.svg2png(
            bytestring=path.read_bytes(),
            output_width=1024,
            output_height=1024,
        )
        image = Image.open(BytesIO(raw))
    else:
        image = Image.open(path)
    image.load()
    return image.convert("RGB")


def load_model(safe_root: Path, checkpoint: Path) -> torch.nn.Module:
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


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--safe-root", type=Path, required=True)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--threads", type=int, default=8)
    parser.add_argument("--posthoc", action="store_true")
    args = parser.parse_args()

    if sha256_file(args.checkpoint) != SAFE_CHECKPOINT_SHA256:
        raise RuntimeError("SAFE_CHECKPOINT_HASH_MISMATCH")
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    if args.posthoc:
        if not manifest.get("posthocDiagnostic") or not manifest.get("flux1PixelAccess") or manifest.get("flux2PixelAccess"):
            raise RuntimeError("POSTHOC_MANIFEST_REQUIRED")
    elif not manifest.get("scoreBlind"):
        raise RuntimeError("SCORE_BLIND_MANIFEST_REQUIRED")
    if manifest.get("flux2PixelAccess"):
        raise RuntimeError("SEALED_HOLDOUT_ACCESS_FLAG")

    torch.set_num_threads(args.threads)
    torch.set_num_interop_threads(1)
    load_started = time.perf_counter()
    model = load_model(args.safe_root, args.checkpoint)
    load_seconds = time.perf_counter() - load_started
    crop = transforms.CenterCrop((256, 256))
    to_tensor = transforms.ToTensor()

    results: list[dict] = []
    inference_seconds: list[float] = []
    process_rss = None
    try:
        import psutil

        process_rss = psutil.Process()
    except ImportError:
        pass
    peak_rss = process_rss.memory_info().rss if process_rss else None

    with torch.inference_mode():
        for index, record in enumerate(manifest["records"], start=1):
            family = record.get("generatorFamily", "") or ""
            if any(marker in family.lower() for marker in FLUX2_MARKERS):
                raise RuntimeError(f"FLUX2_FAMILY_DENIED:{family}")
            path = Path(record["inputPath"])
            preprocess_started = time.perf_counter()
            with decode_rgb(path) as image:
                tensor = to_tensor(crop(image))
                width, height = image.size
            preprocess_seconds = time.perf_counter() - preprocess_started
            inference_started = time.perf_counter()
            logits = model(tensor.unsqueeze(0))
            score = torch.softmax(logits, dim=1)[0, 1].item()
            inference_time = time.perf_counter() - inference_started
            inference_seconds.append(inference_time)
            if process_rss:
                peak_rss = max(peak_rss, process_rss.memory_info().rss)
            results.append({
                "rowKey": record["rowKey"],
                "sampleId": record["sampleId"],
                "sourceFamilyId": record["sourceFamilyId"],
                "role": record["role"],
                "label": record["label"],
                "sourceSubtype": record.get("sourceSubtype"),
                "generatorFamily": record.get("generatorFamily"),
                "cameraDeviceFamily": record.get("cameraDeviceFamily"),
                "detectorId": "SAFE",
                "detectorVersion": "SAFE_OFFICIAL_4e998724651b227def64f5be0cd60c0aa1552c35",
                "checkpointSha256": SAFE_CHECKPOINT_SHA256,
                "rawScore": score,
                "scoreDirection": "HIGHER_IS_MORE_SYNTHETIC_LIKE",
                "preprocessMs": preprocess_seconds * 1000.0,
                "runtimeMs": inference_time * 1000.0,
                "inputPixelSha256": record["sourceSha256"],
                "decodedWidth": width,
                "decodedHeight": height,
                "format": record["format"],
                "bytes": record["bytes"],
                "status": "OK",
            })
            if index % 50 == 0 or index == len(manifest["records"]):
                print(f"SAFE_RECORDS={index}", flush=True)

    output = {
        "schemaVersion": "lythaus-wp007g-r1-detector-scores-v1",
        "stage": "modern-r1-score-blind-development-inputs",
        "detectorId": "SAFE",
        "detectorVersion": "SAFE_OFFICIAL_4e998724651b227def64f5be0cd60c0aa1552c35",
        "checkpointSha256": SAFE_CHECKPOINT_SHA256,
        "officialPreprocessing": "RGB decode; torchvision CenterCrop(256,256); ToTensor; model DWT preprocessing; softmax class 1",
        "scoreDirection": "HIGHER_IS_MORE_SYNTHETIC_LIKE",
        "loadSeconds": load_seconds,
        "runtimeP50Seconds": sorted(inference_seconds)[len(inference_seconds) // 2],
        "runtimeP95Seconds": sorted(inference_seconds)[max(0, int(len(inference_seconds) * 0.95) - 1)],
        "peakRssBytes": peak_rss,
        "scoreBlind": not args.posthoc,
        "posthocDiagnostic": args.posthoc,
        "flux1PixelAccess": args.posthoc,
        "flux2PixelAccess": False,
        "records": results,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "detector": "SAFE",
        "records": len(results),
        "loadSeconds": load_seconds,
        "runtimeP50Seconds": output["runtimeP50Seconds"],
        "runtimeP95Seconds": output["runtimeP95Seconds"],
        "peakRssBytes": peak_rss,
    }))


if __name__ == "__main__":
    main()
