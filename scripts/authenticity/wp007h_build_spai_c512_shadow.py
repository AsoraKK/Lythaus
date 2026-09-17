"""Materialise exact SPAI C512 derivatives for WP007H shadow-only scoring."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps


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
    return ImageOps.exif_transpose(image).convert("RGB")


def make_c512(image: Image.Image) -> tuple[Image.Image, str]:
    width, height = image.size
    fallback = "NONE"
    if width < 512 or height < 512:
        fallback = "BLACK_PAD_TO_MINIMUM_512_THEN_CENTER_CROP"
        canvas = Image.new("RGB", (max(width, 512), max(height, 512)), (0, 0, 0))
        canvas.paste(image, ((canvas.width - width) // 2, (canvas.height - height) // 2))
        image = canvas
        width, height = image.size
    left = (width - 512) // 2
    top = (height - 512) // 2
    return image.crop((left, top, left + 512, top + 512)), fallback


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runtime-manifest", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--output-csv", type=Path, required=True)
    parser.add_argument("--output-manifest", type=Path, required=True)
    args = parser.parse_args()
    manifest = json.loads(args.runtime_manifest.read_text(encoding="utf-8"))
    allowed = {"QUALIFICATION_CONFIRM", "NEGATIVE_CONFIRM_H"}
    source_records = sorted((row for row in manifest["records"] if row.get("role") in allowed), key=lambda row: row["rowKey"])
    if len(source_records) != 272:
        raise RuntimeError(f"SPAI_C512_SHADOW_RECORD_COUNT:{len(source_records)}")
    args.output_root.mkdir(parents=True, exist_ok=True)
    records = []
    for record in source_records:
        source = Path(record["inputPath"])
        image = decode_rgb(source)
        c512, fallback = make_c512(image)
        path = args.output_root / f"{record['sampleId']}.png"
        c512.save(path, format="PNG", optimize=False, compress_level=0)
        records.append({
            "rowKey": record["rowKey"],
            "sampleId": record["sampleId"],
            "sourceFamilyId": record["sourceFamilyId"],
            "role": record["role"],
            "label": record["label"],
            "sourceSubtype": record.get("sourceSubtype"),
            "cameraDeviceFamily": record.get("cameraDeviceFamily"),
            "sourceSha256": record["sourceSha256"],
            "c512Sha256": sha256_file(path),
            "c512Bytes": path.stat().st_size,
            "c512Path": str(path.resolve()),
            "c512Fallback": fallback,
        })
        image.close()
        c512.close()
    args.output_csv.parent.mkdir(parents=True, exist_ok=True)
    with args.output_csv.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["image", "split", "class"])
        writer.writeheader()
        for record in records:
            writer.writerow({"image": record["c512Path"], "split": "test", "class": record["label"]})
    output = {
        "schemaVersion": "lythaus-wp007h-spai-c512-shadow-inputs-v1",
        "candidateId": "SPAI_C512",
        "preprocessing": "Pillow decode, EXIF orientation, RGB, black-pad if below 512, center crop 512, PNG compress_level=0",
        "scoreBlind": True,
        "flux1PixelAccess": False,
        "flux2PixelAccess": False,
        "records": records,
    }
    args.output_manifest.parent.mkdir(parents=True, exist_ok=True)
    args.output_manifest.write_text(json.dumps(output, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"records": len(records), "csvSha256": sha256_file(args.output_csv), "manifestSha256": sha256_file(args.output_manifest)}))


if __name__ == "__main__":
    main()
