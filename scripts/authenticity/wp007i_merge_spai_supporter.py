"""Merge the frozen SPAI shadow scores with the WP007I supporter table.

The SPAI runner emits its own ordered sample identifiers.  The input manifest
is the authoritative row mapping, so this script joins by the frozen input
order and refuses count, status, or FLUX.2 mismatches.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


def load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-supporters", type=Path, required=True)
    parser.add_argument("--spai-scores", type=Path, required=True)
    parser.add_argument("--spai-inputs", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    base = load(args.base_supporters)
    scores = load(args.spai_scores)
    inputs = load(args.spai_inputs)
    if not base.get("scoreBlind") or base.get("flux2PixelAccess"):
        raise RuntimeError("BASE_SUPPORTER_MANIFEST_NOT_SCORE_BLIND")
    if not inputs.get("scoreBlind") or inputs.get("flux2PixelAccess"):
        raise RuntimeError("SPAI_INPUT_MANIFEST_NOT_SCORE_BLIND")
    score_rows = scores.get("records")
    input_rows = inputs.get("records")
    if not isinstance(score_rows, list) or not isinstance(input_rows, list):
        raise RuntimeError("SPAI_RECORDS_REQUIRED")
    if len(score_rows) != len(input_rows):
        raise RuntimeError(f"SPAI_COUNT_MISMATCH:{len(score_rows)}:{len(input_rows)}")
    if len({row["rowKey"] for row in input_rows}) != len(input_rows):
        raise RuntimeError("SPAI_INPUT_DUPLICATE_ROW")

    records = []
    for index, (score, source) in enumerate(zip(score_rows, input_rows, strict=True)):
        status = score.get("status", "OK")
        if status != "OK":
            raise RuntimeError(f"SPAI_SCORE_NOT_OK:{index}:{status}")
        records.append({
            "rowKey": source["rowKey"],
            "sampleId": source.get("sampleId"),
            "label": source["label"],
            "sourceFamilyId": source["sourceFamilyId"],
            "role": source.get("role"),
            "sourceSubtype": source.get("sourceSubtype"),
            "cameraDeviceFamily": source.get("cameraDeviceFamily"),
            "generatorFamily": source.get("generatorFamily"),
            "transformation": source.get("transformation", "ORIGINAL"),
            "rawScore": score.get("rawScore", score.get("score")),
            "runtimeSeconds": score.get("runtimeSeconds"),
            "status": status,
        })
        if records[-1]["rawScore"] is None:
            raise RuntimeError(f"SPAI_SCORE_MISSING:{index}")

    detector = {
        "detectorId": "SPAI_C512",
        "detectorVersion": scores.get("candidateId", "SPAI_C512"),
        "threshold": 1.0,
        "records": records,
        "role": "SHADOW_SPECTRAL_SPECIALIST",
        "scoreDirection": "HIGHER_IS_MORE_SYNTHETIC_LIKE",
        "sourceManifest": str(args.spai_inputs.name),
    }
    detectors = [detector]
    for existing in base.get("detectors", []):
        if existing.get("detectorId") == "SPAI_C512":
            raise RuntimeError("SPAI_ALREADY_PRESENT")
        detectors.append(existing)
    payload = {
        **base,
        "schemaVersion": "lythaus-wp007i-supporter-score-inputs-v2",
        "detectors": detectors,
        "spaiMerged": True,
        "spaiScoreManifest": str(args.spai_scores.name),
        "spaiInputManifest": str(args.spai_inputs.name),
        "noRouterOptimization": True,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"detectors": [item["detectorId"] for item in detectors], "records": len(records)}, sort_keys=True))


if __name__ == "__main__":
    main()
