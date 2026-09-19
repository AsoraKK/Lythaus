"""Summarize a pinned ExifTool oracle run without persisting metadata values."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--feature-records", type=Path, required=True)
    parser.add_argument("--exiftool-json", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    features = [json.loads(line) for line in args.feature_records.read_text(encoding="utf-8").splitlines() if line.strip()]
    features = {Path(row["sampleId"]).name if False else row["sampleId"]: row for row in features if row.get("kind") == "ORIGINAL" and row.get("role", "").startswith("DEVELOPMENT")}
    oracle = json.loads(args.exiftool_json.read_text(encoding="utf-8"))
    oracle_by_name = {item.get("FileName"): item for item in oracle}
    dimension_matches = 0
    format_matches = 0
    records = []
    for sample_id, row in sorted(features.items()):
        name = Path(row.get("sourcePath", row.get("sampleId", ""))).name
        candidates = [item for item in oracle if item.get("FileName") and item.get("FileName") in str(row.get("sampleId"))]
        if not candidates:
            candidates = [item for item in oracle if str(item.get("FileName", "")).startswith(sample_id)]
        item = candidates[0] if candidates else None
        if item:
            dims = row.get("dimensions") or {}
            dimension_matches += int(dims.get("width") == item.get("ImageWidth") and dims.get("height") == item.get("ImageHeight"))
            format_matches += int(row.get("format") == item.get("FileType"))
            records.append({"sampleId": sample_id, "oraclePresent": True, "dimensionMatch": dims.get("width") == item.get("ImageWidth") and dims.get("height") == item.get("ImageHeight"), "formatMatch": row.get("format") == item.get("FileType"), "makePresent": bool(item.get("EXIF:Make")), "modelPresent": bool(item.get("EXIF:Model"))})
        else:
            records.append({"sampleId": sample_id, "oraclePresent": False, "dimensionMatch": False, "formatMatch": False, "makePresent": False, "modelPresent": False})
    output = {
        "schemaVersion": "lythaus-wp007l-exiftool-crosscheck-v2",
        "repo": "exiftool/exiftool via pinned Sherloq bundle",
        "exiftoolVersion": "13.55",
        "sherloqCommit": "3fe95fcb56037e47e2eefbc2d3785804a31a74f5",
        "sampleCount": len(features),
        "oracleFileCount": len(oracle),
        "dimensionMatches": dimension_matches,
        "formatMatches": format_matches,
        "records": records,
        "rawMetadataPersisted": False,
        "rawOracleSha256": hashlib.sha256(args.exiftool_json.read_bytes()).hexdigest(),
        "interpretation": "Independent metadata/container cross-check only; values were not persisted and no authorship inference is permitted.",
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    }
    args.output.write_text(json.dumps(output, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"samples": len(features), "oracleFiles": len(oracle), "dimensionMatches": dimension_matches, "formatMatches": format_matches}))


if __name__ == "__main__":
    main()
