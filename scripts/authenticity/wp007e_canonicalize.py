"""Materialise the frozen 512x512 RGB inputs for WP007E development roles."""

from __future__ import annotations

import argparse
import time
from pathlib import Path

from wp007e_common import (
    CANONICAL_RESAMPLER,
    CANONICAL_SIZE,
    canonicalize,
    decode_source,
    implementation_hash,
    load_json,
    save_png,
    sha256_file,
    write_json,
)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output-root", required=True)
    args = parser.parse_args()
    repo_root = Path(__file__).resolve().parents[2]
    roles = load_json(repo_root / "research" / "wp007e" / "data-role-freeze.json")
    output_root = Path(args.output_root)
    canonical_root = output_root / "canonical"
    records = []
    roles_to_materialise = (
        "PAIR_BASE",
        "NEGATIVE_CALIBRATION",
        "NEGATIVE_DEV_CONTROL",
        "NEGATIVE_CONFIRM",
        "DDB_TRANSFER_DEV",
        "DDB_TRANSFER_CONFIRM",
    )
    implementation = implementation_hash(Path(__file__).with_name("wp007e_common.py"))
    for role in roles_to_materialise:
        for source in roles["roles"][role]["records"]:
            source_path = __import__("wp007e_common").source_path(source)
            if sha256_file(source_path) != source["sourceSha256"]:
                raise RuntimeError(f"source_hash_changed:{source['sourceFamilyId']}")
            started = time.perf_counter()
            image = canonicalize(decode_source(source))
            output_path = canonical_root / f"{source['sampleId']}.png"
            output_hash = save_png(image, output_path)
            records.append(
                {
                    "sampleId": source["sampleId"],
                    "sourceFamilyId": source["sourceFamilyId"],
                    "role": role,
                    "sourceSha256": source["sourceSha256"],
                    "canonicalSha256": output_hash,
                    "canonicalRelativePath": f"canonical/{source['sampleId']}.png",
                    "width": image.width,
                    "height": image.height,
                    "format": "PNG",
                    "colorSpace": "RGB",
                    "metadataInput": False,
                    "elapsedSeconds": round(time.perf_counter() - started, 6),
                }
            )
    artifact = {
        "schemaVersion": "lythaus-wp007e-canonicalizer-output-v1",
        "dataRoleFreezeSha256": roles["dataRoleFreezeSha256"],
        "canonicalizerSha256": implementation,
        "canonicalizer": {
            "decode": "Pillow plus cairosvg for deterministic controlled SVG fixtures",
            "orientation": "PIL.ImageOps.exif_transpose",
            "color": "RGB",
            "shortEdge": CANONICAL_SIZE,
            "resampler": CANONICAL_RESAMPLER,
            "crop": "center",
            "output": "512x512 RGB PNG with detector metadata excluded",
            "smallInputRule": "upscale with the same resampler",
        },
        "pixelAccess": {
            "flux1": False,
            "flux2": False,
            "finalSealedControls": False,
        },
        "records": records,
    }
    write_json(repo_root / "research" / "wp007e" / "canonicalizer-spec.json", artifact)
    print({"status": "PASS", "canonicalizerSha256": implementation, "records": len(records), "outputRoot": str(output_root)})


if __name__ == "__main__":
    main()
