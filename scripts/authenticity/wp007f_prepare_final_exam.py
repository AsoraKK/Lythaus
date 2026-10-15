"""Prepare the post-freeze FLUX.1 exam and final-control inputs."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from pathlib import Path

from PIL import Image, ImageOps


HOLDOUT_SHA = "b1be6115a6ed3cb5d72c5ad3e90575ededbb4c969bd2bb248ec2806da32885c4"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonicalize(source: Path, target: Path) -> tuple[str, int, int]:
    with Image.open(source) as image:
        image.load()
        rgb = ImageOps.exif_transpose(image).convert("RGB")
        width, height = rgb.size
        if width < 512 or height < 512:
            canvas = Image.new("RGB", (max(width, 512), max(height, 512)), (0, 0, 0))
            canvas.paste(rgb, ((canvas.width - width) // 2, (canvas.height - height) // 2))
            rgb.close()
            rgb = canvas
        left = (rgb.width - 512) // 2
        top = (rgb.height - 512) // 2
        crop = rgb.crop((left, top, left + 512, top + 512))
        crop.save(target, format="PNG", optimize=False, compress_level=0)
        crop.close()
        rgb.close()
    return sha256(target), width, height


def find_by_stem(root: Path, stem: str) -> Path:
    matches = [path for path in root.iterdir() if path.is_file() and path.stem == stem]
    if len(matches) != 1:
        raise RuntimeError(f"FINAL_INPUT_MAPPING_INVALID:{stem}:{len(matches)}")
    return matches[0]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--split", type=Path, required=True)
    parser.add_argument("--prior-input-manifest", type=Path, required=True)
    parser.add_argument("--final-root", type=Path, required=True)
    parser.add_argument("--flux-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--output-manifest", type=Path, required=True)
    args = parser.parse_args()

    split = json.loads(args.split.read_text(encoding="utf-8"))
    if split["holdoutFreezeSha256"] != HOLDOUT_SHA:
        raise RuntimeError("FINAL_INPUT_HOLDOUT_HASH_MISMATCH")
    prior = json.loads(args.prior_input_manifest.read_text(encoding="utf-8"))
    prior_by_sample = {item["sampleId"]: item for item in prior["records"]}
    flux = json.loads((args.flux_root / "cloudflare-generation-manifest.json").read_text(encoding="utf-8"))
    flux_hashes = {item["logicalPath"]: item for item in json.loads((args.flux_root / "sha256-manifest.json").read_text(encoding="utf-8"))["files"]}

    args.output_root.mkdir(parents=True, exist_ok=True)
    c512_root = args.output_root / "c512"
    c512_root.mkdir(parents=True, exist_ok=True)
    records = []

    for role, members in (("FINAL_CAMERA_CONTROLS", split["sealedFinalCamera"]), ("FINAL_DIGITAL_CONTROLS", split["sealedFinalDigital"])):
        for member in members:
            sample_id = member["sampleId"]
            prior_record = prior_by_sample.get(sample_id)
            if prior_record is None:
                raise RuntimeError(f"FINAL_CONTROL_PRIOR_MANIFEST_MISSING:{sample_id}")
            source = find_by_stem(args.final_root, sample_id)
            actual_source_hash = sha256(source)
            if actual_source_hash != prior_record["inferenceInputSha256"]:
                raise RuntimeError(f"FINAL_CONTROL_INPUT_HASH_MISMATCH:{sample_id}")
            target = c512_root / f"{sample_id}.png"
            c512_hash, width, height = canonicalize(source, target)
            records.append({
                "sampleId": sample_id,
                "sourceFamilyId": member["sourceFamilyId"],
                "role": role,
                "label": 0,
                "sourceSha256": member["fileSha256"],
                "inputSha256": actual_source_hash,
                "inputPath": str(target),
                "c512Sha256": c512_hash,
                "inputWidth": width,
                "inputHeight": height,
                "inputFormat": source.suffix[1:].upper(),
                "cameraDeviceFamily": member.get("cameraDeviceFamily"),
                "digitalSubtype": member.get("hardNegativeSubtype"),
            })

    flux_dir = args.flux_root / "wp007ah-cloudflare" / "FLUX_1_SCHNELL"
    for item in flux["records"]:
        sample_id = item["sampleId"]
        logical_path = item["file"]["cacheId"]
        expected = flux_hashes.get(logical_path)
        if expected is None:
            raise RuntimeError(f"FLUX_HASH_MANIFEST_MISSING:{sample_id}")
        source = args.flux_root / logical_path
        if sha256(source) != expected["sha256"] or source.stat().st_size != expected["byteSize"]:
            raise RuntimeError(f"FLUX_INPUT_HASH_MISMATCH:{sample_id}")
        target = c512_root / f"{sample_id}.png"
        c512_hash, width, height = canonicalize(source, target)
        records.append({
            "sampleId": sample_id,
            "sourceFamilyId": item["sourceFamilyId"],
            "role": "FLUX1_HOLDOUT",
            "label": 1,
            "sourceSha256": item["file"]["sha256"],
            "inputSha256": expected["sha256"],
            "inputPath": str(target),
            "c512Sha256": c512_hash,
            "inputWidth": width,
            "inputHeight": height,
            "inputFormat": item["file"]["format"],
            "promptId": item["promptId"],
            "generatorModelId": item["generatorModelId"],
            "originalDerivedSeed": item["originalDerivedSeed"],
            "submittedSeedState": item["submittedSeedState"],
            "contractAmendmentSha256": item["contractAmendmentSha256"],
        })

    if len(records) != 104 or len({item["sourceFamilyId"] for item in records}) != 104:
        raise RuntimeError("FINAL_EXAM_COUNT_OR_FAMILY_INVALID")
    with (args.output_root / "c512.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["image", "split", "class"])
        writer.writeheader()
        for item in records:
            writer.writerow({"image": Path(item["inputPath"]).name, "split": "test", "class": item["label"]})
    safe_records = [{key: value for key, value in item.items() if key != "inputPath"} | {"inputPath": item["inputPath"]} for item in records]
    output = {
        "schemaVersion": "lythaus-wp007f-final-exam-inputs-v1",
        "calibrationFreeze": "research/wp007f/alpha-calibration-freeze.json",
        "holdoutFreezeSha256": HOLDOUT_SHA,
        "pixelAccessAfterCalibrationFreeze": True,
        "flux1PixelAccess": True,
        "flux2PixelAccess": False,
        "records": safe_records,
    }
    args.output_manifest.parent.mkdir(parents=True, exist_ok=True)
    args.output_manifest.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "records": len(records),
        "finalCamera": sum(item["role"] == "FINAL_CAMERA_CONTROLS" for item in records),
        "finalDigital": sum(item["role"] == "FINAL_DIGITAL_CONTROLS" for item in records),
        "flux1": sum(item["role"] == "FLUX1_HOLDOUT" for item in records),
        "flux2PixelAccess": False,
    }))


if __name__ == "__main__":
    main()
