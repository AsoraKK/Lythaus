"""Create deterministic SAFE-only transformation descendants."""

from __future__ import annotations

import argparse
import hashlib
import json
from collections import defaultdict
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageFilter


TRANSFORMS = ("JPEG95", "JPEG85", "JPEG75", "RESIZE75", "RESIZE50", "SCREENSHOT_STYLE_RESAMPLING", "METADATA_STRIP", "MILD_CROP", "MILD_BLUR", "MILD_SHARPEN")


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


def resize(image: Image.Image, scale: float, resampler: int) -> Image.Image:
    width = max(1, int(image.width * scale))
    height = max(1, int(image.height * scale))
    return image.resize((width, height), resampler)


def transform(image: Image.Image, name: str) -> tuple[Image.Image, str]:
    if name == "JPEG95":
        return image.copy(), "jpg"
    if name == "JPEG85":
        return image.copy(), "jpg"
    if name == "JPEG75":
        return image.copy(), "jpg"
    if name == "RESIZE75":
        return resize(image, 0.75, Image.Resampling.LANCZOS), "png"
    if name == "RESIZE50":
        return resize(image, 0.50, Image.Resampling.LANCZOS), "png"
    if name == "SCREENSHOT_STYLE_RESAMPLING":
        return resize(image, 0.75, Image.Resampling.BILINEAR), "png"
    if name == "METADATA_STRIP":
        return image.copy(), "png"
    if name == "MILD_CROP":
        margin_x = int(image.width * 0.05)
        margin_y = int(image.height * 0.05)
        cropped = image.crop((margin_x, margin_y, image.width - margin_x, image.height - margin_y))
        return cropped.resize(image.size, Image.Resampling.LANCZOS), "png"
    if name == "MILD_BLUR":
        return image.filter(ImageFilter.GaussianBlur(radius=0.6)), "png"
    if name == "MILD_SHARPEN":
        return image.filter(ImageFilter.UnsharpMask(radius=1, percent=150, threshold=3)), "png"
    raise RuntimeError(f"UNKNOWN_TRANSFORM:{name}")


def save(image: Image.Image, path: Path, transform_name: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if transform_name.startswith("JPEG"):
        quality = int(transform_name[4:])
        image.save(path, format="JPEG", quality=quality, subsampling=0, optimize=False, progressive=False)
    else:
        image.save(path, format="PNG", optimize=True, compress_level=6)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runtime-manifest", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    args = parser.parse_args()
    runtime = json.loads(args.runtime_manifest.read_text(encoding="utf-8"))
    positives = [row for row in runtime["records"] if row["role"] == "QUALIFICATION_CONFIRM"]
    negatives = [row for row in runtime["records"] if row["role"] == "NEGATIVE_CONFIRM_H"]
    by_family: dict[str, list[dict]] = defaultdict(list)
    for row in positives:
        by_family[row["generatorFamily"]].append(row)
    selected = []
    for family in sorted(by_family):
        selected.extend(sorted(by_family[family], key=lambda row: hashlib.sha256(f"WP007H-TRANSFORM{row['rowKey']}".encode()).hexdigest())[:5])
    for subtype in ("CAMERA", "DIGITAL_NON_AI"):
        members = [row for row in negatives if ("CAMERA" if row.get("sourceSubtype") == "CAMERA" else "DIGITAL_NON_AI") == subtype]
        selected.extend(sorted(members, key=lambda row: hashlib.sha256(f"WP007H-TRANSFORM{row['rowKey']}".encode()).hexdigest())[:20])
    base = sorted(selected, key=lambda row: row["rowKey"])
    if len(base) != 80:
        raise RuntimeError(f"TRANSFORM_SAMPLE_SELECTION_UNEXPECTED:{len(base)}")
    records = []
    for index, row in enumerate(sorted(base, key=lambda item: item["rowKey"])):
        source = decode_rgb(Path(row["inputPath"]))
        try:
            for name in TRANSFORMS:
                image, extension = transform(source, name)
                destination = args.output_root / name / f"{index:04d}-{hashlib.sha256(row['rowKey'].encode()).hexdigest()[:12]}.{extension}"
                save(image, destination, name)
                records.append({
                    "rowKey": f"{row['rowKey']}__{name}",
                    "baseRowKey": row["rowKey"],
                    "sampleId": row["sampleId"],
                    "sourceFamilyId": row["sourceFamilyId"],
                    "role": row["role"],
                    "label": row["label"],
                    "sourceSubtype": row.get("sourceSubtype"),
                    "cameraDeviceFamily": row.get("cameraDeviceFamily"),
                    "generatorFamily": row.get("generatorFamily"),
                    "transform": name,
                    "inputRegime": "MODERATELY_TRANSFORMED",
                    "sourceSha256": row["sourceSha256"],
                    "outputSha256": sha256_file(destination),
                    "outputBytes": destination.stat().st_size,
                    "outputRelativePath": f"{name}/{destination.name}",
                    "inputPath": str(destination.resolve()),
                })
        finally:
            source.close()
        if (index + 1) % 25 == 0 or index + 1 == len(base):
            print(f"TRANSFORM_BASES={index + 1}/{len(base)}", flush=True)
    output = {
        "schemaVersion": "lythaus-wp007h-transformation-inputs-v1",
        "scoreBlind": True,
        "sourceManifestSha256": hashlib.sha256(args.runtime_manifest.read_bytes()).hexdigest(),
        "transformationPlan": "research/wp007h/transformation-plan.json",
        "flux1PixelAccess": False,
        "flux2PixelAccess": False,
        "baseCount": len(base),
        "transformationCount": len(records),
        "baseSelection": [{"rowKey": row["rowKey"], "label": row["label"], "generatorFamily": row.get("generatorFamily"), "sourceSubtype": row.get("sourceSubtype")} for row in base],
        "records": records,
    }
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(json.dumps(output, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"baseCount": len(base), "transformationCount": len(records), "manifestSha256": hashlib.sha256(args.manifest.read_bytes()).hexdigest()}))


if __name__ == "__main__":
    main()
