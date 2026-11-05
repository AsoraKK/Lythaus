"""Build a deterministic development-only transformation audit set."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from pathlib import Path

from PIL import Image


TRANSFORMS = ("CANONICAL", "JPEG95", "JPEG85", "JPEG75", "RESIZE75", "RESIZE50", "METADATA_STRIPPED", "SCREENSHOT_STYLE_RESAMPLING")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-manifest", type=Path, required=True)
    parser.add_argument("--c512-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--output-manifest", type=Path, required=True)
    parser.add_argument("--per-role", type=int, default=4)
    args = parser.parse_args()
    source = json.loads(args.input_manifest.read_text(encoding="utf-8"))
    roles = ("CAMERA_DEV", "DIGITAL_DEV", "DDB_DETECTOR_DEV")
    selected = []
    for role in roles:
        candidates = sorted((item for item in source["records"] if item["role"] == role), key=lambda item: hashlib.sha256(item["sourceFamilyId"].encode()).hexdigest())
        selected.extend(candidates[:args.per_role])
    args.output_root.mkdir(parents=True, exist_ok=True)
    rows = []
    for item in selected:
        source_path = args.c512_root / item["c512File"]
        with Image.open(source_path) as image:
            base = image.convert("RGB")
            for transform in TRANSFORMS:
                transformed = base.copy()
                suffix = "png"
                save_options = {}
                if transform == "JPEG95":
                    suffix = "jpg"
                    save_options = {"quality": 95, "subsampling": 0, "optimize": False}
                elif transform == "JPEG85":
                    suffix = "jpg"
                    save_options = {"quality": 85, "subsampling": 0, "optimize": False}
                elif transform == "JPEG75":
                    suffix = "jpg"
                    save_options = {"quality": 75, "subsampling": 0, "optimize": False}
                elif transform == "RESIZE75":
                    transformed = transformed.resize((384, 384), Image.Resampling.LANCZOS).resize((512, 512), Image.Resampling.LANCZOS)
                elif transform == "RESIZE50":
                    transformed = transformed.resize((256, 256), Image.Resampling.LANCZOS).resize((512, 512), Image.Resampling.LANCZOS)
                elif transform == "SCREENSHOT_STYLE_RESAMPLING":
                    transformed = transformed.resize((768, 768), Image.Resampling.BILINEAR).resize((512, 512), Image.Resampling.BILINEAR)
                path = args.output_root / f"{item['sampleId']}__{transform.lower()}.{suffix}"
                transformed.save(path, format="JPEG" if suffix == "jpg" else "PNG", **save_options)
                rows.append({
                    "sampleId": f"{item['sampleId']}__{transform.lower()}",
                    "parentSampleId": item["sampleId"],
                    "sourceFamilyId": item["sourceFamilyId"],
                    "role": item["role"],
                    "transform": transform,
                    "inputPath": str(path),
                    "inputSha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                    "width": 512,
                    "height": 512,
                    "format": suffix.upper(),
                    "sourceC512Sha256": item["c512Sha256"],
                })
    result = {
        "schemaVersion": "lythaus-wp007f-transformation-inputs-v1",
        "sourceManifestSha256": hashlib.sha256(args.input_manifest.read_bytes()).hexdigest(),
        "scoreBlind": True,
        "flux1PixelAccess": False,
        "flux2PixelAccess": False,
        "transforms": list(TRANSFORMS),
        "records": rows,
    }
    args.output_manifest.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    with (args.output_root.parent / "transforms.csv").open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["image", "split", "class"])
        writer.writeheader()
        for row in rows:
            writer.writerow({"image": Path(row["inputPath"]).name, "split": "test", "class": 0})
    print(json.dumps({"records": len(rows), "families": len(selected), "transforms": len(TRANSFORMS)}))


if __name__ == "__main__":
    main()
