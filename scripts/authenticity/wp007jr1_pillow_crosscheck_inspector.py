"""Cross-check the byte inspector with Pillow's independent JPEG parser."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image
from PIL.JpegImagePlugin import get_sampling


def sampling_label(image: Image.Image) -> str | None:
    if image.format != "JPEG":
        return None
    value = get_sampling(image)
    return {0: "4:4:4", 1: "4:2:2", 2: "4:2:0"}.get(value, "OTHER")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--validation", type=Path, required=True)
    parser.add_argument("--pillow-manifest", type=Path, required=True)
    parser.add_argument("--pillow-root", type=Path, required=True)
    parser.add_argument("--sharp-manifest", type=Path, required=True)
    parser.add_argument("--sharp-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    validation = json.loads(args.validation.read_text(encoding="utf-8"))
    by_id = {row["derivedId"]: row for row in validation["rows"]}
    records = []
    for manifest_path, root in [(args.pillow_manifest, args.pillow_root), (args.sharp_manifest, args.sharp_root)]:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        for record in manifest["records"]:
            path = root / record["relativeOutputPath"]
            with Image.open(path) as image:
                expected = by_id[record["derivedId"]]
                actual_format = image.format or "UNKNOWN"
                actual_sampling = sampling_label(image)
                expected_format = "PNG" if record["operation"] == "JPEG_TO_PNG" else "JPEG"
                inspector = expected["inspector"]
                records.append({
                    "derivedId": record["derivedId"],
                    "format": actual_format,
                    "sampling": actual_sampling,
                    "width": image.width,
                    "height": image.height,
                    "quantizationTableCount": len(getattr(image, "quantization", {}) or {}),
                    "progressive": bool(image.info.get("progressive", False)) if expected_format == "JPEG" else None,
                    "checks": {
                        "formatAgreement": actual_format == inspector["format"] == expected_format,
                        "dimensionsAgreement": image.width == inspector["dimensions"]["width"] and image.height == inspector["dimensions"]["height"],
                        "samplingAgreement": expected_format != "JPEG" or actual_sampling == inspector["sampling"],
                        "quantizationCountAgreement": len(getattr(image, "quantization", {}) or {}) == inspector["quantizationTableCount"],
                        "progressiveAgreement": expected_format != "JPEG" or bool(image.info.get("progressive", False)) == inspector["progressive"],
                    },
                })
    mismatches = [{"derivedId": row["derivedId"], "check": check} for row in records for check, value in row["checks"].items() if not value]
    output = {
        "schemaVersion": "lythaus-wp007jr1-jpeg-inspector-pillow-crosscheck-v1",
        "independentDecoder": "Pillow JpegImagePlugin",
        "records": len(records),
        "mismatches": mismatches,
        "summary": {check: sum(row["checks"][check] for row in records) for check in records[0]["checks"]},
        "priorJpegHistory": "UNDETERMINED_FROM_FINAL_BYTES",
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"records": len(records), "mismatches": len(mismatches), "summary": output["summary"]}))


if __name__ == "__main__":
    main()
