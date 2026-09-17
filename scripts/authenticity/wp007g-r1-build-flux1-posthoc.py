"""Build the post-freeze FLUX.1 diagnostic manifest from existing C512 media."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import re
from pathlib import Path

from PIL import Image


NAME = re.compile(r"WP007AH_FLUX_1_SCHNELL_PROMPT_(\d+)\.png$", re.IGNORECASE)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--csv", type=Path, required=True)
    args = parser.parse_args()
    files = []
    for path in args.root.glob("WP007AH_FLUX_1_SCHNELL_PROMPT_*.png"):
        match = NAME.search(path.name)
        if match:
            files.append((int(match.group(1)), path))
    files.sort()
    if len(files) != 40 or len({number for number, _path in files}) != 40:
        raise RuntimeError(f"EXPECTED_40_FLUX1_FILES:{len(files)}")
    records = []
    for number, path in files:
        with Image.open(path) as image:
            image.load()
            width, height = image.size
            image_format = image.format
        records.append({
            "rowKey": f"FLUX1_POSTHOC__{path.stem}",
            "sampleId": path.stem,
            "sourceFamilyId": f"WP007AH-FLUX1-{number:03d}",
            "role": "FLUX1_POSTHOC",
            "label": 1,
            "sourceSubtype": "SYNTHETIC_FLUX1_POSTHOC",
            "generatorFamily": "FLUX.1",
            "promptRegime": f"PROMPT_GROUP_{number // 10}",
            "inputPath": str(path.resolve()),
            "sourceSha256": sha256_file(path),
            "format": image_format or "PNG",
            "bytes": path.stat().st_size,
            "nativeWidth": width,
            "nativeHeight": height,
        })
    args.csv.parent.mkdir(parents=True, exist_ok=True)
    with args.csv.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=("image", "split", "class"))
        writer.writeheader()
        for record in records:
            writer.writerow({"image": Path(record["inputPath"]).name, "split": "test", "class": 1})
    output = {
        "schemaVersion": "lythaus-wp007g-r1-flux1-posthoc-manifest-v1",
        "posthocDiagnostic": True,
        "initialTrainingUse": False,
        "calibratorFittingUse": False,
        "scoreBlind": False,
        "flux1PixelAccess": True,
        "flux2PixelAccess": False,
        "source": "existing WP007F frozen FLUX.1 C512 media; no regeneration or exclusions",
        "records": records,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"records": len(records), "manifestSha256": sha256_file(args.output), "csv": str(args.csv)}))


if __name__ == "__main__":
    main()
