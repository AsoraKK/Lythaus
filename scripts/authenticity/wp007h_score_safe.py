"""Score the frozen SAFE checkpoint on a score-blind WP007H manifest."""

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


SAFE_CHECKPOINT_SHA256 = "b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e"
FLUX2_MARKERS = ("flux.2", "flux2", "flux-2")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def decode_rgb(path: Path) -> Image.Image:
    if path.suffix.lower() == ".svg":
        import cairosvg

        raw = cairosvg.svg2png(bytestring=path.read_bytes(), output_width=1024, output_height=1024)
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
        if manifest.get("scoreBlind") or not manifest.get("flux1PixelAccess") or manifest.get("flux2PixelAccess"):
            raise RuntimeError("WP007H_POSTHOC_MANIFEST_REQUIRED")
        if manifest.get("diagnosticRole") != "POST_HOC_PUBLIC_TO_CLOUDFLARE_DOMAIN_SHIFT":
            raise RuntimeError("WP007H_POSTHOC_ROLE_REQUIRED")
    elif not manifest.get("scoreBlind") or manifest.get("flux1PixelAccess") or manifest.get("flux2PixelAccess"):
        raise RuntimeError("WP007H_SCORE_BLIND_MANIFEST_REQUIRED")
    torch.set_num_threads(args.threads)
    torch.set_num_interop_threads(1)
    load_started = time.perf_counter()
    model = load_model(args.safe_root, args.checkpoint)
    load_seconds = time.perf_counter() - load_started
    crop = transforms.CenterCrop((256, 256))
    to_tensor = transforms.ToTensor()
    runtimes: list[float] = []
    rows: list[dict] = []
    process_rss = None
    try:
        import psutil
        process_rss = psutil.Process()
    except ImportError:
        pass
    peak_rss = process_rss.memory_info().rss if process_rss else None
    with torch.inference_mode():
        for index, record in enumerate(manifest["records"], start=1):
            family = record.get("generatorFamily") or ""
            if any(marker in family.lower() for marker in FLUX2_MARKERS):
                raise RuntimeError(f"FLUX2_FAMILY_DENIED:{family}")
            path = Path(record["inputPath"])
            preprocess_started = time.perf_counter()
            with decode_rgb(path) as image:
                tensor = to_tensor(crop(image))
                width, height = image.size
            preprocess_ms = (time.perf_counter() - preprocess_started) * 1000.0
            inference_started = time.perf_counter()
            logits = model(tensor.unsqueeze(0))
            score = torch.softmax(logits, dim=1)[0, 1].item()
            runtime_ms = (time.perf_counter() - inference_started) * 1000.0
            runtimes.append(runtime_ms)
            if process_rss:
                peak_rss = max(peak_rss, process_rss.memory_info().rss)
            rows.append({
                "rowKey": record["rowKey"],
                "baseRowKey": record.get("baseRowKey"),
                "transform": record.get("transform", "ORIGINAL"),
                "sampleId": record["sampleId"],
                "sourceFamilyId": record["sourceFamilyId"],
                "sourceRootKey": record.get("sourceRootKey"),
                "generatorFamily": record.get("generatorFamily"),
                "role": record["role"],
                "label": record["label"],
                "sourceSubtype": record.get("sourceSubtype"),
                "cameraDeviceFamily": record.get("cameraDeviceFamily"),
                "generatorFamily": record.get("generatorFamily"),
                "detectorId": "SAFE",
                "detectorVersion": "SAFE_OFFICIAL_4e998724651b227def64f5be0cd60c0aa1552c35",
                "checkpointSha256": SAFE_CHECKPOINT_SHA256,
                "rawScore": score,
                "scoreDirection": "HIGHER_IS_MORE_SYNTHETIC_LIKE",
                "preprocessMs": preprocess_ms,
                "runtimeMs": runtime_ms,
                "inputPixelSha256": record["sourceSha256"],
                "decodedWidth": width,
                "decodedHeight": height,
                "format": record.get("format"),
                "inputRegime": record.get("inputRegime", "ORIGINAL_OR_HIGH_QUALITY"),
                "transformation": record.get("transform", record.get("transformation", "ORIGINAL")),
                "status": "OK",
                "flux2PixelAccess": False,
            })
            if index % 25 == 0 or index == len(manifest["records"]):
                print(f"SAFE_RECORDS={index}", flush=True)
    ordered = sorted(runtimes)
    output = {
        "schemaVersion": "lythaus-wp007h-safe-score-manifest-v1",
        "detectorId": "SAFE",
        "detectorVersion": "SAFE_OFFICIAL_4e998724651b227def64f5be0cd60c0aa1552c35",
        "checkpointSha256": SAFE_CHECKPOINT_SHA256,
        "officialPreprocessing": "RGB decode; torchvision CenterCrop(256,256); ToTensor; model DWT preprocessing; class-1 softmax",
        "scoreDirection": "HIGHER_IS_MORE_SYNTHETIC_LIKE",
        "frozenThreshold": 0.5864923000335693,
        "loadSeconds": load_seconds,
        "runtimeP50Ms": ordered[len(ordered) // 2] if ordered else None,
        "runtimeP95Ms": ordered[max(0, int(len(ordered) * 0.95) - 1)] if ordered else None,
        "peakRssBytes": peak_rss,
        "scoreBlind": not args.posthoc,
        "flux1PixelAccess": bool(manifest.get("flux1PixelAccess")),
        "flux2PixelAccess": False,
        "diagnosticRole": manifest.get("diagnosticRole") if args.posthoc else None,
        "records": rows,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"records": len(rows), "runtimeP95Ms": output["runtimeP95Ms"], "peakRssBytes": peak_rss}))


if __name__ == "__main__":
    main()
