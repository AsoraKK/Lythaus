"""Build exact SPAI C512 shadow inputs for WP007I rows."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from io import BytesIO
from pathlib import Path
from typing import Any

from PIL import Image, ImageOps


def load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def decode(path: Path) -> Image.Image:
    if path.suffix.lower() == ".svg":
        import cairosvg

        raw = cairosvg.svg2png(bytestring=path.read_bytes(), output_width=1024, output_height=1024)
        image = Image.open(BytesIO(raw))
    else:
        image = Image.open(path)
    image.load()
    return ImageOps.exif_transpose(image).convert("RGB")


def c512(image: Image.Image) -> tuple[Image.Image, str]:
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
    parser.add_argument("--supporter-manifest", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--output-csv", type=Path, required=True)
    parser.add_argument("--output-manifest", type=Path, required=True)
    args = parser.parse_args()
    payload = load(args.supporter_manifest)
    if not payload.get("scoreBlind") or payload.get("flux2PixelAccess"):
        raise RuntimeError("SPAI_SCORE_BLIND_MANIFEST_REQUIRED")
    records = sorted(payload["records"], key=lambda row: row["rowKey"])
    args.output_root.mkdir(parents=True, exist_ok=True)
    output = []
    for index, row in enumerate(records):
        source = Path(row["inputPath"])
        image = decode(source)
        cropped, fallback = c512(image)
        name = f"{index:04d}-{hashlib.sha256(row['rowKey'].encode()).hexdigest()[:16]}.png"
        destination = args.output_root / name
        cropped.save(destination, format="PNG", optimize=False, compress_level=0)
        output.append({
            **{key: row.get(key) for key in ("rowKey", "sampleId", "sourceFamilyId", "role", "label", "sourceSubtype", "cameraDeviceFamily", "generatorFamily", "transform", "transformation")},
            "sourceSha256": row["sourceSha256"],
            "c512Sha256": sha256_file(destination),
            "c512Bytes": destination.stat().st_size,
            "c512Path": str(destination.resolve()),
            "c512Fallback": fallback,
            "flux2PixelAccess": False,
        })
        image.close()
        cropped.close()
        if (index + 1) % 100 == 0 or index + 1 == len(records):
            print(f"SPAI_INPUTS={index + 1}/{len(records)}", flush=True)
    args.output_csv.parent.mkdir(parents=True, exist_ok=True)
    with args.output_csv.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["image", "split", "class"])
        writer.writeheader()
        for row in output:
            writer.writerow({"image": row["c512Path"], "split": "test", "class": row["label"]})
    manifest = {
        "schemaVersion": "lythaus-wp007i-spai-c512-shadow-inputs-v1",
        "candidateId": "SPAI_C512",
        "preprocessing": "Pillow decode, EXIF orientation, RGB, black-pad if below 512, center crop 512, PNG compress_level=0",
        "scoreBlind": True,
        "flux1PixelAccess": False,
        "flux2PixelAccess": False,
        "records": output,
    }
    args.output_manifest.parent.mkdir(parents=True, exist_ok=True)
    args.output_manifest.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"records": len(output), "csvSha256": sha256_file(args.output_csv), "manifestSha256": sha256_file(args.output_manifest)}))


if __name__ == "__main__":
    main()
