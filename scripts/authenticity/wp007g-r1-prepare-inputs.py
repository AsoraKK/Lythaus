"""Prepare score-blind WP007G-R1 detector inputs outside Git.

This keeps raw modern/negative media external, validates their frozen hashes,
and materialises only the deterministic C512 derivatives required by SPAI.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps


FLUX2_MARKERS = ("flux.2", "flux2", "flux-2")


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


def resolve_negative(record: dict, csafe_root: Path, digital_root: Path) -> Path:
    roots = {
        "CSAFE_WP006E_CACHE": csafe_root,
        "WP007E_CONTROLLED_DIGITAL_CACHE": digital_root,
    }
    try:
        return roots[record["sourceRootKey"]] / record["sourceRelativePath"]
    except KeyError as exc:
        raise RuntimeError(f"UNKNOWN_NEGATIVE_SOURCE_ROOT:{record.get('sourceRootKey')}") from exc


def build_records(
    modern_freeze: dict,
    negative_freeze: dict,
    modern_root: Path,
    csafe_root: Path,
    digital_root: Path,
) -> list[dict]:
    records: list[dict] = []
    for frozen in modern_freeze["records"]:
        family = frozen["generatorFamily"]
        if any(marker in family.lower() for marker in FLUX2_MARKERS):
            raise RuntimeError(f"FLUX2_FAMILY_DENIED:{family}")
        path = modern_root / frozen["mediaRelativePath"]
        if not path.is_file():
            raise FileNotFoundError(path)
        actual_hash = sha256_file(path)
        if actual_hash != frozen["mediaSha256"]:
            raise RuntimeError(f"MODERN_HASH_MISMATCH:{frozen['sampleId']}:{actual_hash}")
        records.append({
            "rowKey": f"{frozen['role']}__{frozen['sourceFamilyId']}",
            "sampleId": frozen["sampleId"],
            "sourceFamilyId": frozen["sourceFamilyId"],
            "role": frozen["role"],
            "label": 1,
            "sourceSubtype": "SYNTHETIC_ACTUAL_GENERATED",
            "generatorFamily": family,
            "format": frozen["format"],
            "bytes": frozen["bytes"],
            "sourceSha256": actual_hash,
            "inputPath": str(path.resolve()),
            "provenance": "T2I-COREBENCH_OFFICIAL_HISTORICAL_INDIVIDUAL_LFS",
        })
    for role, frozen_records in negative_freeze["roles"].items():
        for frozen in frozen_records:
            path = resolve_negative(frozen, csafe_root, digital_root)
            if not path.is_file():
                raise FileNotFoundError(path)
            actual_hash = sha256_file(path)
            if actual_hash != frozen["sourceSha256"]:
                raise RuntimeError(f"NEGATIVE_HASH_MISMATCH:{frozen['sampleId']}:{actual_hash}")
            records.append({
                "rowKey": f"{role}__{frozen['sourceFamilyId']}",
                "sampleId": frozen["sampleId"],
                "sourceFamilyId": frozen["sourceFamilyId"],
                "role": role,
                "label": 0,
                "sourceSubtype": frozen["sourceSubtype"],
                "cameraDeviceFamily": frozen.get("cameraDeviceFamily"),
                "format": frozen["format"],
                "bytes": frozen["bytes"],
                "sourceSha256": actual_hash,
                "inputPath": str(path.resolve()),
                "provenance": frozen["provenanceClass"],
            })
    records.sort(key=lambda item: item["rowKey"])
    keys = [record["rowKey"] for record in records]
    if len(keys) != len(set(keys)):
        raise RuntimeError("DUPLICATE_SCORE_ROW_KEY")
    return records


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--modern-freeze", type=Path, required=True)
    parser.add_argument("--negative-freeze", type=Path, required=True)
    parser.add_argument("--modern-root", type=Path, required=True)
    parser.add_argument("--csafe-root", type=Path, required=True)
    parser.add_argument("--digital-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    args = parser.parse_args()

    modern_freeze = json.loads(args.modern_freeze.read_text(encoding="utf-8"))
    negative_freeze = json.loads(args.negative_freeze.read_text(encoding="utf-8"))
    records = build_records(modern_freeze, negative_freeze, args.modern_root, args.csafe_root, args.digital_root)
    c512_root = args.output_root / "c512"
    c512_root.mkdir(parents=True, exist_ok=True)
    for record in records:
        with decode_rgb(Path(record["inputPath"])) as image:
            c512, fallback = make_c512(image)
            destination = c512_root / f"{record['rowKey']}.png"
            c512.save(destination, format="PNG", optimize=False, compress_level=0)
            c512.close()
        record["c512File"] = destination.name
        record["c512Sha256"] = sha256_file(destination)
        record["c512Bytes"] = destination.stat().st_size
        record["c512Fallback"] = fallback

    csv_path = args.output_root / "r1-c512.csv"
    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["image", "split", "class"])
        writer.writeheader()
        for record in records:
            writer.writerow({"image": f"c512/{record['c512File']}", "split": "test", "class": record["label"]})

    manifest = {
        "schemaVersion": "lythaus-wp007g-r1-score-inputs-v1",
        "scoreBlind": True,
        "flux1PixelAccess": False,
        "flux2PixelAccess": False,
        "preprocessing": {
            "rawDetectors": "decoded RGB pixels through each exact upstream detector preprocessing",
            "spaiC512": "native decoded RGB center crop to 512; black-pad smaller dimensions; no resize",
            "svg": "CairoSVG rasterized to 1024x1024 before RGB decode for detector compatibility",
        },
        "records": records,
    }
    args.manifest.parent.mkdir(parents=True, exist_ok=True)
    args.manifest.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "records": len(records),
        "modern": sum(record["label"] == 1 for record in records),
        "negative": sum(record["label"] == 0 for record in records),
        "manifestSha256": sha256_file(args.manifest),
        "c512Csv": str(csv_path),
    }))


if __name__ == "__main__":
    main()
