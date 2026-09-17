#!/usr/bin/env python3
"""Summarize descriptive RINE/UFD transformation behaviour beside SAFE."""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path
from typing import Any


THRESHOLDS = {
    "SAFE": 0.5864923000335693,
    "RINE": 0.890092938,
    "UNIVERSAL_FAKE_DETECT": 0.543838277,
}


def load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def detector_rows(data: dict[str, Any]) -> dict[str, dict[str, dict[str, Any]]]:
    output: dict[str, dict[str, dict[str, Any]]] = {}
    for detector in data.get("detectors", []):
        detector_id = detector["detectorId"]
        rows = {}
        for row in detector.get("records", []):
            key = row.get("rowKey") or "|".join(str(row.get(k, "")) for k in ("role", "sourceFamilyId", "sampleId", "transform"))
            rows[key] = row
        output[detector_id] = rows
    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--safe", type=Path, required=True)
    parser.add_argument("--supporters", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    safe_data = load(args.safe)
    safe_rows = {}
    for row in safe_data.get("records", []):
        key = row.get("rowKey") or "|".join(str(row.get(k, "")) for k in ("role", "sourceFamilyId", "sampleId", "transform"))
        safe_rows[key] = row
    supporter_maps = detector_rows(load(args.supporters))
    transforms = sorted({row.get("transform") for row in safe_rows.values() if row.get("transform")})
    results: dict[str, Any] = {}
    for transform in transforms:
        base = {
            key: row for key, row in safe_rows.items() if row.get("transform") == transform
        }
        truth = {key: 1 if row.get("role") == "QUALIFICATION_CONFIRM" else 0 for key, row in base.items()}
        results[transform] = {"safe": {}, "supporters": {}}
        for detector_id, threshold in THRESHOLDS.items():
            if detector_id == "SAFE":
                rows = {key: row for key, row in base.items()}
                score = {key: float(row["rawScore"]) for key, row in rows.items()}
            else:
                rows = {key: row for key, row in supporter_maps.get(detector_id, {}).items() if row.get("transform") == transform}
                score = {key: float(row["rawScore"]) for key, row in rows.items()}
            keys = sorted(set(base) & set(score))
            synthetic = [key for key in keys if truth[key] == 1]
            negative = [key for key in keys if truth[key] == 0]
            predictions = {key: score[key] >= threshold for key in keys}
            tp = sum(predictions[key] for key in synthetic)
            fp = sum(predictions[key] for key in negative)
            target = results[transform]["safe" if detector_id == "SAFE" else "supporters"]
            target[detector_id] = {
                "threshold": threshold,
                "matched": len(keys),
                "synthetic": {"tp": tp, "n": len(synthetic), "recall": tp / len(synthetic) if synthetic else None},
                "negative": {"fp": fp, "n": len(negative), "fpr": fp / len(negative) if negative else None},
            }
        for detector_id in supporter_maps:
            support = results[transform]["supporters"].get(detector_id)
            if not support:
                continue
            safe_result = results[transform]["safe"]["SAFE"]
            safe_pred = {key: float(base[key]["rawScore"]) >= THRESHOLDS["SAFE"] for key in base}
            support_map = {key: float(row["rawScore"]) >= THRESHOLDS[detector_id] for key, row in supporter_maps[detector_id].items() if row.get("transform") == transform and key in base}
            keys = sorted(set(safe_pred) & set(support_map))
            results[transform]["supporters"][detector_id]["errorDiversity"] = {
                "matched": len(keys),
                "safeFalseNegativeRescued": sum(truth[key] == 1 and not safe_pred[key] and support_map[key] for key in keys),
                "safeFalsePositiveRescued": sum(truth[key] == 0 and safe_pred[key] and not support_map[key] for key in keys),
                "supporterFalseNegativeIntroduced": sum(truth[key] == 1 and safe_pred[key] and not support_map[key] for key in keys),
                "supporterFalsePositiveIntroduced": sum(truth[key] == 0 and not safe_pred[key] and support_map[key] for key in keys),
            }
    output = {
        "schemaVersion": "lythaus-wp007h-shadow-transformation-results-v1",
        "descriptiveOnly": True,
        "safeQualificationUnaffectedBySupporters": True,
        "thresholds": THRESHOLDS,
        "transforms": results,
        "spaiTransformationCoverage": "NOT_RUN_FULL_MATRIX_CPU_BOUND",
        "flux1PixelAccess": False,
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    }
    args.output.write_text(json.dumps(output, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "transforms": len(results)}, sort_keys=True))


if __name__ == "__main__":
    main()
