import argparse
import csv
import hashlib
import json
from pathlib import Path

from PIL import Image


EXPECTED_SPLIT_SHA256 = "3a30dab63ace8b26f2684d1f658420f0f0fa66ad181cd94d8633aad86d64e721"
EXPECTED_HOLDOUT_SHA256 = "b1be6115a6ed3cb5d72c5ad3e90575ededbb4c969bd2bb248ec2806da32885c4"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def source_dataset(source_family_id: str, source_kind: str) -> str:
    if source_kind == "DEVELOPMENT_SYNTHETIC":
        return "DIFFUSIONDB_SYNTHETIC"
    if source_kind == "DEVELOPMENT_CAMERA_NEGATIVES":
        return "CSAFE_CAMERA_NEGATIVE"
    if source_family_id.startswith("LYTHAUS-PROGRAMMATIC-HN-"):
        return "LYTHAUS_PROGRAMMATIC_DIGITAL_NEGATIVE"
    return "OWNER_CONTROLLED_DIGITAL_NEGATIVE"


def find_input(root: Path, sample_id: str) -> Path:
    matches = [path for path in root.iterdir() if path.is_file() and path.stem == sample_id]
    if len(matches) != 1:
        raise RuntimeError(f"INPUT_MAPPING_INVALID:{sample_id}:{len(matches)}")
    return matches[0]


def c512_image(source_path: Path, destination: Path) -> tuple[str, str]:
    with Image.open(source_path) as image:
        image.load()
        rgb = image.convert("RGB")
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
        crop = rgb.crop((left, top, left + 512, top + 512))
        crop.save(destination, format="PNG", optimize=False, compress_level=0)
        crop.close()
        rgb.close()
    return sha256_file(destination), fallback


def metadata_present(image: Image.Image) -> bool:
    if image.getexif():
        return True
    return any(key in image.info for key in ("exif", "xmp", "xml", "comment", "icc_profile"))


def normalized_format(value: str) -> str:
    return "JPEG" if value.upper() in {"JPG", "JPEG"} else value.upper()


def compatible_format(actual: str, expected: str) -> bool:
    actual_normalized = normalized_format(actual)
    expected_normalized = normalized_format(expected)
    return actual_normalized == expected_normalized or (
        expected_normalized == "JPEG" and actual_normalized == "MPO"
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--split", required=True, type=Path)
    parser.add_argument("--input-manifest", required=True, type=Path)
    parser.add_argument("--input-root", required=True, type=Path)
    parser.add_argument("--output-root", required=True, type=Path)
    parser.add_argument("--repository-manifest", required=True, type=Path)
    args = parser.parse_args()

    split = json.loads(args.split.read_text(encoding="utf-8"))
    if split["developmentSplitSha256"] != EXPECTED_SPLIT_SHA256:
        raise RuntimeError("DEVELOPMENT_SPLIT_HASH_MISMATCH")
    if split["holdoutFreezeSha256"] != EXPECTED_HOLDOUT_SHA256:
        raise RuntimeError("HOLDOUT_FREEZE_HASH_MISMATCH")
    input_manifest = json.loads(args.input_manifest.read_text(encoding="utf-8"))
    input_by_sample = {record["sampleId"]: record for record in input_manifest["records"]}

    groups = [
        ("developmentSynthetic", split["commonDevelopment"]["synthetic"], 1),
        ("developmentCamera", split["commonDevelopment"]["camera"], 0),
        ("developmentDigital", split["commonDevelopment"]["digital"], 0),
    ]
    args.output_root.mkdir(parents=True, exist_ok=True)
    c512_root = args.output_root / "c512"
    c512_root.mkdir(parents=True, exist_ok=True)
    records = []
    c512_records = []

    for split_name, members, label in groups:
        for member in members:
            sample_id = member["sampleId"]
            source_path = find_input(args.input_root, sample_id)
            source_record = input_by_sample.get(sample_id)
            if source_record is None:
                raise RuntimeError(f"INPUT_MANIFEST_MISSING:{sample_id}")
            actual_source_sha = sha256_file(source_path)
            if actual_source_sha != source_record["inferenceInputSha256"]:
                raise RuntimeError(f"INPUT_HASH_MISMATCH:{sample_id}")
            with Image.open(source_path) as image:
                image.load()
                width, height = image.size
                actual_format = image.format or source_record["inferenceInputFormat"]
                has_metadata = metadata_present(image)
            if [width, height] != [member["width"], member["height"]]:
                raise RuntimeError(f"INPUT_DIMENSION_MISMATCH:{sample_id}")
            if not compatible_format(actual_format, source_record["inferenceInputFormat"]):
                raise RuntimeError(f"INPUT_FORMAT_MISMATCH:{sample_id}")

            record = {
                "split": split_name,
                "sampleId": sample_id,
                "sourceFamilyId": member["sourceFamilyId"],
                "label": label,
                "sourceKind": member["sourceKind"],
                "sourceDataset": source_dataset(member["sourceFamilyId"], member["sourceKind"]),
                "digitalNegativeSubtype": member.get("hardNegativeSubtype"),
                "cameraDeviceFamily": member.get("cameraDeviceFamily"),
                "inputFileName": source_path.name,
                "inputSha256": actual_source_sha,
                "sourceSha256": source_record["sourceSha256"],
                "sourceFormat": source_record["sourceFormat"],
                "inputFormat": source_record["inferenceInputFormat"],
                "inputBytes": source_path.stat().st_size,
                "width": width,
                "height": height,
                "metadataPresence": has_metadata,
            }
            records.append(record)

            c512_path = c512_root / f"{sample_id}.png"
            c512_sha, fallback = c512_image(source_path, c512_path)
            c512_records.append({
                "sampleId": sample_id,
                "sourceFamilyId": member["sourceFamilyId"],
                "c512FileName": c512_path.name,
                "c512Sha256": c512_sha,
                "c512Bytes": c512_path.stat().st_size,
                "c512Width": 512,
                "c512Height": 512,
                "fallback": fallback,
            })

    if len(records) != 128 or len({record["sourceFamilyId"] for record in records}) != 128:
        raise RuntimeError("DEVELOPMENT_RECORD_COUNT_OR_FAMILY_INVALID")
    if len(c512_records) != 128:
        raise RuntimeError("C512_RECORD_COUNT_INVALID")

    def write_csv(path: Path, rows: list[dict]) -> None:
        with path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=["image", "split", "class"])
            writer.writeheader()
            writer.writerows({"image": row["inputFileName"], "split": "test", "class": row["label"]} for row in rows)

    write_csv(args.output_root / "development.csv", records)
    c512_csv_rows = []
    c512_by_sample = {record["sampleId"]: record for record in c512_records}
    for record in records:
        c512_row = c512_by_sample[record["sampleId"]]
        c512_csv_rows.append({"inputFileName": c512_row["c512FileName"], "label": record["label"]})
    with (args.output_root / "c512.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["image", "split", "class"])
        writer.writeheader()
        writer.writerows({"image": row["inputFileName"], "split": "test", "class": row["label"]} for row in c512_csv_rows)

    profile_ids = {
        "CSAFE_WP006E_iPhone11_1_02",
        "CSAFE_WP006E_iPhone11_1_03",
        "CSAFE_WP006E_iPhone11_1_07",
    }
    profile_rows = [row for row in records if row["sampleId"] in profile_ids]
    if len(profile_rows) != 3:
        raise RuntimeError("NATIVE_PROFILE_CASES_MISSING")
    write_csv(args.output_root / "native-profile.csv", profile_rows)

    manifest = {
        "schemaVersion": "lythaus-wp007c-input-manifest-v1",
        "developmentSplitSha256": EXPECTED_SPLIT_SHA256,
        "holdoutFreezeSha256": EXPECTED_HOLDOUT_SHA256,
        "scoreBlind": True,
        "pixelSeal": {
            "flux1PixelsRead": False,
            "flux2PixelsRead": False,
            "holdoutPathsPassedToDevelopmentRunners": False,
        },
        "records": records,
        "c512Records": c512_records,
        "preprocessing": {
            "native": "SOURCE_BYTES_UNCHANGED",
            "c512": "DETERMINISTIC_NATIVE_DECODED_PIXEL_CENTER_CROP_512_NO_RESIZE",
            "c512Fallback": "BLACK_PAD_TO_MINIMUM_512_THEN_CENTER_CROP",
            "c512FallbackCount": sum(record["fallback"] != "NONE" for record in c512_records),
        },
    }
    args.repository_manifest.parent.mkdir(parents=True, exist_ok=True)
    args.repository_manifest.write_text(f"{json.dumps(manifest, indent=2)}\n", encoding="utf-8")
    print(f"WP007C_DEVELOPMENT_INPUTS={len(records)}")
    print(f"WP007C_C512_INPUTS={len(c512_records)}")
    print(f"WP007C_C512_FALLBACKS={manifest['preprocessing']['c512FallbackCount']}")


if __name__ == "__main__":
    main()
