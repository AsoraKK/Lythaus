"""Prepare score-blind WP007F detector inputs and SPAI C512 derivatives."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps


TARGET_ROLES = ("CAMERA_DEV", "DIGITAL_DEV", "DDB_DETECTOR_DEV", "CAMERA_CONFIRM", "DIGITAL_CONFIRM", "DDB_DETECTOR_CONFIRM")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


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
    rgb = image
    width, height = rgb.size
    fallback = "NONE"
    if width < 512 or height < 512:
        fallback = "BLACK_PAD_TO_MINIMUM_512_THEN_CENTER_CROP"
        canvas = Image.new("RGB", (max(width, 512), max(height, 512)), (0, 0, 0))
        canvas.paste(rgb, ((canvas.width - width) // 2, (canvas.height - height) // 2))
        rgb = canvas
        width, height = rgb.size
    left = (width - 512) // 2
    top = (height - 512) // 2
    return rgb.crop((left, top, left + 512, top + 512)), fallback


def write_csv(path: Path, records: list[dict], image_field: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["image", "split", "class"])
        writer.writeheader()
        for record in records:
            writer.writerow({"image": record[image_field], "split": "test", "class": record["label"]})


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--roles", type=Path, required=True)
    parser.add_argument("--data-root", type=Path, required=True)
    parser.add_argument("--digital-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    args = parser.parse_args()

    roles_document = json.loads(args.roles.read_text(encoding="utf-8"))
    output_root = args.output_root
    c512_root = output_root / "c512"
    output_root.mkdir(parents=True, exist_ok=True)
    c512_root.mkdir(parents=True, exist_ok=True)
    output_records: list[dict] = []

    for role in TARGET_ROLES:
        label = 1 if role.startswith("DDB_") else 0
        for source_record in roles_document["roles"][role]:
            source_path = resolve_record(source_record, args.data_root, args.digital_root)
            image = decode_rgb(source_path)
            c512, fallback = make_c512(image)
            c512_name = f"{source_record['sampleId']}.png"
            c512_path = c512_root / c512_name
            c512.save(c512_path, format="PNG", optimize=False, compress_level=0)
            output_records.append({
                "role": role,
                "label": label,
                "sampleId": source_record["sampleId"],
                "sourceFamilyId": source_record["sourceFamilyId"],
                "sourceRootKey": source_record["sourceRootKey"],
                "sourceRelativePath": source_record["sourceRelativePath"],
                "sourceSha256": source_record["sourceSha256"],
                "sourceBytes": source_record["bytes"],
                "sourceFormat": source_record["format"],
                "inputWidth": image.width,
                "inputHeight": image.height,
                "inputFormat": source_path.suffix.lower().lstrip("."),
                "c512File": c512_name,
                "c512Sha256": sha256_file(c512_path),
                "c512Bytes": c512_path.stat().st_size,
                "c512Fallback": fallback,
            })
            image.close()
            c512.close()

    output_records.sort(key=lambda item: item["sampleId"])
    if len(output_records) != len({item["sampleId"] for item in output_records}):
        raise RuntimeError("DUPLICATE_SAMPLE_ID")
    write_csv(output_root / "dev-c512.csv", [item for item in output_records if item["role"].endswith("_DEV")], "c512File")
    write_csv(output_root / "confirm-c512.csv", [item for item in output_records if item["role"].endswith("_CONFIRM")], "c512File")
    manifest = {
        "schemaVersion": "lythaus-wp007f-qualification-inputs-v1",
        "rolesFreezeSha256": hashlib.sha256(args.roles.read_bytes()).hexdigest(),
        "scoreBlind": True,
        "pixelAccess": {"flux1": False, "flux2": False},
        "preprocessing": {
            "decode": "Pillow decode, EXIF orientation, RGB conversion",
            "rawDetectors": "original decoded pixels through each official preprocessing",
            "spaiC512": "center crop decoded RGB pixels to 512x512; black-pad smaller dimensions",
        },
        "records": output_records,
    }
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"INPUT_RECORDS={len(output_records)}")
    print(f"DEV_RECORDS={sum(item['role'].endswith('_DEV') for item in output_records)}")
    print(f"CONFIRM_RECORDS={sum(item['role'].endswith('_CONFIRM') for item in output_records)}")
    print(f"MANIFEST_SHA256={hashlib.sha256(args.manifest.read_bytes()).hexdigest()}")


if __name__ == "__main__":
    main()
