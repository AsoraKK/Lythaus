#!/usr/bin/env python3
"""Attach ordered transformation metadata to an already completed score run."""

from __future__ import annotations

import argparse
import copy
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scores", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    scores = json.loads(args.scores.read_text(encoding="utf-8"))
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    output = copy.deepcopy(scores)
    manifest_rows = manifest["records"]
    for detector in output.get("detectors", []):
        rows = detector.get("records", [])
        if len(rows) != len(manifest_rows):
            raise ValueError("score and transformation manifest lengths differ")
        enriched = []
        for score_row, input_row in zip(rows, manifest_rows):
            row = dict(score_row)
            for key in ("rowKey", "baseRowKey", "transform", "transformation", "inputRegime", "generatorFamily"):
                row[key] = input_row.get(key)
            enriched.append(row)
        detector["records"] = enriched
    args.output.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "records": len(manifest_rows)}))


if __name__ == "__main__":
    main()
