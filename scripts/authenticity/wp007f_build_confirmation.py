"""Evaluate frozen detector thresholds on the independent confirmation roles."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def wilson(successes: int, total: int, z: float = 1.959963984540054) -> list[float | None]:
    if total == 0:
        return [None, None]
    p = successes / total
    denominator = 1 + z * z / total
    centre = (p + z * z / (2 * total)) / denominator
    margin = z * math.sqrt((p * (1 - p) / total) + (z * z / (4 * total * total))) / denominator
    return [round(max(0.0, centre - margin), 6), round(min(1.0, centre + margin), 6)]


def rate(values: list[float], threshold: float) -> dict:
    count = sum(value >= threshold for value in values)
    return {"count": count, "total": len(values), "rate": round(count / len(values), 6) if values else None, "wilson95": wilson(count, len(values))}


def distribution(values: list[float]) -> dict:
    if not values:
        return {"count": 0, "median": None, "iqr": None, "min": None, "max": None}
    array = np.asarray(values, dtype=float)
    q1, median, q3 = np.quantile(array, [0.25, 0.5, 0.75])
    return {"count": len(values), "median": round(float(median), 6), "iqr": [round(float(q1), 6), round(float(q3), 6)], "min": round(float(array.min()), 6), "max": round(float(array.max()), 6)}


def records_for(detector: dict, manifest: dict) -> list[dict]:
    by_id = {item["sampleId"]: item for item in manifest["records"]}
    return [{**by_id[item["sampleId"]], **item} for item in detector["records"] if item["sampleId"] in by_id]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-manifest", type=Path, required=True)
    parser.add_argument("--dev-curves", type=Path, required=True)
    parser.add_argument("--spai", type=Path, required=True)
    parser.add_argument("--pretrained", type=Path, nargs="+", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    manifest = load(args.input_manifest)
    curves = load(args.dev_curves)
    sources = [load(args.spai), *(load(path) for path in args.pretrained)]
    detectors = [{
        "detectorId": "SPAI_C512",
        "checkpointSha256": load(args.spai).get("checkpointSha256"),
        "records": [{"sampleId": item["sampleId"], "rawScore": item["score"], "runtimeSeconds": item.get("runtimeSeconds")} for item in load(args.spai)["records"]],
    }, *[detector for source in sources[1:] for detector in source.get("detectors", [])]]
    curve_by_id = {item["detectorId"]: item for item in curves["detectors"]}
    results = []
    for detector in detectors:
        threshold_rows = {round(float(item["targetOverallNegativeFpr"]), 6): item for item in curve_by_id[detector["detectorId"]]["curves"]}
        threshold_row = threshold_rows.get(0.01) or threshold_rows[min(threshold_rows, key=lambda value: abs(value - 0.01))]
        threshold = float(threshold_row["threshold"])
        rows = records_for(detector, manifest)
        positives = [float(item["rawScore"]) for item in rows if item["role"] == "DDB_DETECTOR_CONFIRM"]
        camera = [float(item["rawScore"]) for item in rows if item["role"] == "CAMERA_CONFIRM"]
        digital = [float(item["rawScore"]) for item in rows if item["role"] == "DIGITAL_CONFIRM"]
        negative = camera + digital
        results.append({
            "detectorId": detector["detectorId"],
            "checkpointSha256": detector.get("checkpointSha256"),
            "thresholdSource": "development pooled CAMERA_DEV + DIGITAL_DEV at target 1%",
            "frozenThreshold": round(threshold, 9),
            "syntheticConfirmRecall": rate(positives, threshold),
            "cameraConfirmFpr": rate(camera, threshold),
            "digitalConfirmFpr": rate(digital, threshold),
            "overallConfirmFpr": rate(negative, threshold),
            "syntheticScore": distribution(positives),
            "cameraScore": distribution(camera),
            "digitalScore": distribution(digital),
            "runtimeSeconds": distribution([float(item["runtimeSeconds"]) for item in rows if item.get("runtimeSeconds") is not None]),
            "recordCount": len(rows),
        })
    result = {
        "schemaVersion": "lythaus-wp007f-confirmation-results-v1",
        "inputManifestSha256": hashlib.sha256(args.input_manifest.read_bytes()).hexdigest(),
        "scoreBlind": True,
        "flux1PixelAccess": False,
        "flux2PixelAccess": False,
        "thresholdsFrozenBeforeConfirmation": True,
        "results": results,
    }
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"detectors": [{"id": item["detectorId"], "recall": item["syntheticConfirmRecall"]["rate"], "overallFpr": item["overallConfirmFpr"]["rate"]} for item in results]}))


if __name__ == "__main__":
    main()
