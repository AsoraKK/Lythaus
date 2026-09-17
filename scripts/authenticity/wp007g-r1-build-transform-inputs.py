"""Build deterministic transformation-stress inputs outside Git."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from io import BytesIO
from pathlib import Path

from PIL import Image


TRANSFORMS = ("JPEG95", "JPEG85", "JPEG75", "resize75", "resize50", "metadata_strip", "screenshot_like")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


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


def make_c512(image: Image.Image) -> Image.Image:
    width, height = image.size
    if width < 512 or height < 512:
        canvas = Image.new("RGB", (max(width, 512), max(height, 512)), (0, 0, 0))
        canvas.paste(image, ((canvas.width - width) // 2, (canvas.height - height) // 2))
        image = canvas
        width, height = image.size
    left = (width - 512) // 2
    top = (height - 512) // 2
    return image.crop((left, top, left + 512, top + 512))


def transformed(image: Image.Image, transform: str) -> tuple[Image.Image, str]:
    if transform.startswith("JPEG"):
        quality = int(transform[4:])
        buffer = BytesIO()
        image.save(buffer, format="JPEG", quality=quality, optimize=False, progressive=False, subsampling=0)
        with Image.open(BytesIO(buffer.getvalue())) as decoded:
            return decoded.convert("RGB"), "JPEG"
    if transform == "resize75":
        size = (max(1, round(image.width * 0.75)), max(1, round(image.height * 0.75)))
        return image.resize(size, Image.Resampling.LANCZOS), "PNG"
    if transform == "resize50":
        size = (max(1, round(image.width * 0.50)), max(1, round(image.height * 0.50)))
        return image.resize(size, Image.Resampling.LANCZOS), "PNG"
    if transform == "metadata_strip":
        return image.copy(), "PNG"
    if transform == "screenshot_like":
        scale = min(1024 / image.width, 1024 / image.height)
        size = (max(1, round(image.width * scale)), max(1, round(image.height * scale)))
        resized = image.resize(size, Image.Resampling.LANCZOS)
        canvas = Image.new("RGB", (1024, 1024), (255, 255, 255))
        canvas.paste(resized, ((1024 - resized.width) // 2, (1024 - resized.height) // 2))
        return canvas, "PNG"
    raise ValueError(transform)


def save_image(image: Image.Image, path: Path, image_format: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if image_format == "JPEG":
        image.save(path, format="JPEG", quality=95, optimize=False, progressive=False, subsampling=0)
    else:
        image.save(path, format="PNG", optimize=False, compress_level=0)


def choose_base_records(manifest: dict) -> list[dict]:
    records = manifest["records"]
    selected: list[dict] = []
    for family in sorted({row["generatorFamily"] for row in records if row["role"] == "MODERN_SYNTH_DEV"}):
        candidates = [row for row in records if row["role"] == "MODERN_SYNTH_DEV" and row["generatorFamily"] == family]
        candidates.sort(key=lambda row: hashlib.sha256(f"WP007G-R1-TRANSFORM{family}{row['rowKey']}".encode()).hexdigest())
        selected.extend(candidates[:5])
    for subtype in ("CAMERA", "DIGITAL_NON_AI"):
        candidates = [row for row in records if row["label"] == 0 and (row.get("sourceSubtype") == subtype or (subtype == "CAMERA" and row.get("cameraDeviceFamily")))]
        candidates.sort(key=lambda row: hashlib.sha256(f"WP007G-R1-TRANSFORM{row['rowKey']}".encode()).hexdigest())
        selected.extend(candidates[:10])
    return selected


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--output-manifest", type=Path, required=True)
    args = parser.parse_args()
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    if manifest.get("flux1PixelAccess") or manifest.get("flux2PixelAccess"):
        raise RuntimeError("SEALED_HOLDOUT_ACCESS_IN_TRANSFORM_INPUT")
    base_records = choose_base_records(manifest)
    if len(base_records) != 60:
        raise RuntimeError(f"EXPECTED_60_TRANSFORM_BASE_RECORDS:{len(base_records)}")
    output_records: list[dict] = []
    c512_root = args.output_root / "c512"
    for base in base_records:
        original_path = Path(base["inputPath"])
        with decode_rgb(original_path) as image:
            for transform in TRANSFORMS:
                transformed_image, output_format = transformed(image, transform)
                transform_key = f"{transform}__{base['rowKey']}"
                extension = ".jpg" if output_format == "JPEG" else ".png"
                output_path = args.output_root / "media" / f"{transform_key}{extension}"
                save_image(transformed_image, output_path, output_format)
                c512 = make_c512(transformed_image)
                c512_path = c512_root / f"{transform_key}.png"
                save_image(c512, c512_path, "PNG")
                output_records.append({
                    **{key: base.get(key) for key in ("sampleId", "label", "sourceSubtype", "cameraDeviceFamily", "generatorFamily")},
                    "rowKey": transform_key,
                    "baseRowKey": base["rowKey"],
                    "sourceFamilyId": f"{base['sourceFamilyId']}__{transform}",
                    "baseSourceFamilyId": base["sourceFamilyId"],
                    "role": base["role"],
                    "transform": transform,
                    "inputPath": str(output_path.resolve()),
                    "sourceSha256": sha256_file(output_path),
                    "format": output_format,
                    "bytes": output_path.stat().st_size,
                    "c512File": c512_path.name,
                    "c512Sha256": sha256_file(c512_path),
                    "c512Bytes": c512_path.stat().st_size,
                })
    output_records.sort(key=lambda row: row["rowKey"])
    csv_path = args.output_root / "r1-transform-c512.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=("image", "split", "class"))
        writer.writeheader()
        for row in output_records:
            writer.writerow({"image": f"c512/{row['c512File']}", "split": "test", "class": row["label"]})
    output = {
        "schemaVersion": "lythaus-wp007g-r1-transformation-inputs-v1",
        "sourceManifestSha256": sha256_file(args.manifest),
        "transforms": list(TRANSFORMS),
        "selection": "five modern DEV samples per generator family; ten camera and ten digital NEGATIVE_CONFIRM_G samples; deterministic hash order; no detector scores",
        "scoreBlind": True,
        "flux1PixelAccess": False,
        "flux2PixelAccess": False,
        "records": output_records,
    }
    args.output_manifest.parent.mkdir(parents=True, exist_ok=True)
    args.output_manifest.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"baseRecords": len(base_records), "records": len(output_records), "manifestSha256": sha256_file(args.output_manifest), "c512Csv": str(csv_path)}))


if __name__ == "__main__":
    main()
