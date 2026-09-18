"""Materialize the predeclared real-media JPEG lab with Pillow/libjpeg."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

from PIL import Image


PIL_SUBSAMPLING = {"4:4:4": 0, "4:2:2": 1, "4:2:0": 2}
QUALITY_REQUESTS = [100, 99, 98, 97, 96, 95, 92, 90, 85, 80, 75, 65, 50]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def canonical_sha(value: Any) -> str:
    raw = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def save_jpeg(image: Image.Image, path: Path, quality: int, subsampling: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(path, format="JPEG", quality=quality, subsampling=PIL_SUBSAMPLING[subsampling], optimize=False, progressive=False)


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(path, format="PNG", optimize=False)


def add_generated(rows: list[dict[str, Any]], *, output_root: Path, path: Path, parent: dict[str, Any], operation: str, encoder: str, quality: int | None, subsampling: str | None, source_image_sha: str) -> None:
    sampling_suffix = f"__{subsampling.replace(':', '')}" if subsampling else ""
    rows.append(
        {
            "derivedId": f"{parent['sampleId']}__{operation}{sampling_suffix}__{encoder}__{path.suffix[1:]}",
            "parentSampleId": parent["sampleId"],
            "sourceFamilyId": parent["sourceFamilyId"],
            "generatorFamily": parent.get("generatorFamily"),
            "truthLabel": parent["label"],
            "sourceSubtype": parent.get("sourceSubtype"),
            "operation": operation,
            "encoder": encoder,
            "requestedQuality": quality,
            "requestedSubsampling": subsampling,
            "relativeOutputPath": path.relative_to(output_root).as_posix(),
            "bytes": path.stat().st_size,
            "sha256": sha256_file(path),
            "sourceSha256": source_image_sha,
        }
    )


def resolve_parent(parent: dict[str, Any], root: Path) -> Path:
    path = root / parent["relativePath"]
    if not path.is_file() or sha256_file(path) != parent["sha256"]:
        raise RuntimeError(f"PARENT_HASH_MISMATCH:{parent['sampleId']}")
    return path


def safe_name(parent: dict[str, Any]) -> str:
    return parent["sampleId"].replace("/", "_").replace("\\", "_")


def materialize_subset(rows: list[dict[str, Any]], image: Image.Image, parent: dict[str, Any], output_root: Path) -> None:
    source_sha = parent["sha256"]
    name = safe_name(parent)
    for sampling in ["4:4:4", "4:2:2", "4:2:0"]:
        path = output_root / "pillow-subsampling" / sampling.replace(":", "") / f"{name}.jpg"
        save_jpeg(image, path, 95, sampling)
        add_generated(rows, output_root=output_root, path=path, parent=parent, operation="JPEG95_PILLOW_SUBSAMPLING", encoder="PILLOW_LIBJPEG", quality=95, subsampling=sampling, source_image_sha=source_sha)

    def transcode(operation: str, source_quality: int, target_quality: int) -> None:
        source = output_root / "pillow" / f"q{source_quality}" / f"{name}.jpg"
        target = output_root / "compound" / operation / f"{name}.jpg"
        with Image.open(source) as decoded:
            save_jpeg(decoded, target, target_quality, "4:2:0")
        add_generated(rows, output_root=output_root, path=target, parent=parent, operation=operation, encoder="PILLOW_LIBJPEG", quality=target_quality, subsampling="4:2:0", source_image_sha=source_sha)

    transcode("JPEG95_TO_JPEG85", 95, 85)
    transcode("JPEG85_TO_JPEG95", 85, 95)
    transcode("JPEG75_TO_JPEG95", 75, 95)

    crop = image.crop((3, 3, image.width - 3, image.height - 3))
    target = output_root / "compound" / "NON8_CROP_TO_JPEG95" / f"{name}.jpg"
    save_jpeg(crop, target, 95, "4:2:0")
    add_generated(rows, output_root=output_root, path=target, parent=parent, operation="NON8_CROP_TO_JPEG95", encoder="PILLOW_LIBJPEG", quality=95, subsampling="4:2:0", source_image_sha=source_sha)

    for fraction, operation in [(0.75, "RESIZE75_TO_JPEG95"), (0.5, "RESIZE50_TO_JPEG95")]:
        resized = image.resize((max(1, round(image.width * fraction)), max(1, round(image.height * fraction))), Image.Resampling.LANCZOS)
        target = output_root / "compound" / operation / f"{name}.jpg"
        save_jpeg(resized, target, 95, "4:2:0")
        add_generated(rows, output_root=output_root, path=target, parent=parent, operation=operation, encoder="PILLOW_LIBJPEG", quality=95, subsampling="4:2:0", source_image_sha=source_sha)

    with Image.open(output_root / "pillow" / "q95" / f"{name}.jpg") as q95:
        resized_q95 = q95.resize((max(1, round(q95.width * 0.75)), max(1, round(q95.height * 0.75))), Image.Resampling.LANCZOS)
    target = output_root / "compound" / "JPEG95_TO_RESIZE75" / f"{name}.jpg"
    save_jpeg(resized_q95, target, 95, "4:2:0")
    add_generated(rows, output_root=output_root, path=target, parent=parent, operation="JPEG95_TO_RESIZE75", encoder="PILLOW_LIBJPEG", quality=95, subsampling="4:2:0", source_image_sha=source_sha)

    canvas_side = max(image.width, image.height)
    canvas = Image.new("RGB", (canvas_side, canvas_side), (245, 245, 245))
    screenshot = image.copy()
    screenshot.thumbnail((int(canvas_side * 0.82), int(canvas_side * 0.82)), Image.Resampling.BICUBIC)
    canvas.paste(screenshot, ((canvas_side - screenshot.width) // 2, (canvas_side - screenshot.height) // 2))
    screenshot = canvas.resize((max(256, round(canvas_side * 0.75)), max(256, round(canvas_side * 0.75))), Image.Resampling.BICUBIC)
    target = output_root / "compound" / "SCREENSHOT_STYLE_TO_JPEG95" / f"{name}.jpg"
    save_jpeg(screenshot, target, 95, "4:2:0")
    add_generated(rows, output_root=output_root, path=target, parent=parent, operation="SCREENSHOT_STYLE_TO_JPEG95", encoder="PILLOW_LIBJPEG", quality=95, subsampling="4:2:0", source_image_sha=source_sha)

    target = output_root / "compound" / "JPEG_TO_PNG" / f"{name}.png"
    with Image.open(output_root / "pillow" / "q95" / f"{name}.jpg") as source_jpeg:
        save_png(source_jpeg, target)
    add_generated(rows, output_root=output_root, path=target, parent=parent, operation="JPEG_TO_PNG", encoder="PILLOW_DECODE_PNG", quality=None, subsampling=None, source_image_sha=source_sha)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cohort", type=Path, required=True)
    parser.add_argument("--media-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--manifest-output", type=Path, required=True)
    args = parser.parse_args()
    cohort = json.loads(args.cohort.read_text(encoding="utf-8"))
    if not cohort.get("scoreBlind") or cohort.get("flux2PixelAccess") or cohort.get("flux2ProviderCalls") != 0:
        raise RuntimeError("JPEG_COHORT_NOT_FROZEN_OR_SEALED")
    parents = cohort["records"]
    args.output_root.mkdir(parents=True, exist_ok=True)
    rows: list[dict[str, Any]] = []
    parent_paths = {parent["sampleId"]: resolve_parent(parent, args.media_root) for parent in parents}
    for parent in parents:
        with Image.open(parent_paths[parent["sampleId"]]) as source:
            image = source.convert("RGB")
            name = safe_name(parent)
            for quality in QUALITY_REQUESTS:
                path = args.output_root / "pillow" / f"q{quality}" / f"{name}.jpg"
                save_jpeg(image, path, quality, "4:2:0")
                add_generated(rows, output_root=args.output_root, path=path, parent=parent, operation=f"JPEG{quality}_PILLOW_420", encoder="PILLOW_LIBJPEG", quality=quality, subsampling="4:2:0", source_image_sha=parent["sha256"])

    subset = [p for p in parents if p["role"] == "JPEG_LAB_SYNTHETIC"]
    subset += [p for p in parents if p["sourceSubtype"] == "CAMERA_NATIVE"][:10]
    subset += [p for p in parents if p["sourceSubtype"] != "CAMERA_NATIVE"][:10]
    subset = sorted({p["sampleId"]: p for p in subset}.values(), key=lambda p: p["sampleId"])
    for parent in subset:
        with Image.open(parent_paths[parent["sampleId"]]) as source:
            materialize_subset(rows, source.convert("RGB"), parent, args.output_root)

    rows.sort(key=lambda row: row["derivedId"])
    payload = {
        "schemaVersion": "lythaus-wp007jr1-jpeg-lab-generated-v1",
        "sourceCohortFreezeSha256": cohort["freezeSha256"],
        "scoreBlind": True,
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
        "encoder": "PILLOW_LIBJPEG",
        "records": rows,
    }
    payload["generatedManifestSha256"] = canonical_sha(payload)
    args.manifest_output.parent.mkdir(parents=True, exist_ok=True)
    args.manifest_output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"parents": len(parents), "subsetParents": len(subset), "generated": len(rows), "manifestSha256": payload["generatedManifestSha256"]}, sort_keys=True))


if __name__ == "__main__":
    main()
