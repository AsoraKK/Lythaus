"""Build development raw results and negative-FPR operating curves."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from sklearn.metrics import average_precision_score, roc_auc_score


def wilson(successes: int, total: int, z: float = 1.959963984540054) -> list[float]:
    if total == 0:
        return [None, None]
    p = successes / total
    denominator = 1 + z * z / total
    centre = (p + z * z / (2 * total)) / denominator
    margin = z * math.sqrt((p * (1 - p) / total) + (z * z / (4 * total * total))) / denominator
    return [round(max(0, centre - margin), 6), round(min(1, centre + margin), 6)]


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def normalized_spai(path: Path) -> dict:
    source = load(path)
    return {
        "detectorId": "SPAI_C512",
        "displayName": "SPAI C512",
        "checkpointSha256": source.get("checkpointSha256", "24159f27d7c8c2cd0cb6c4019189eb89ad0874a0d9d15f8dc9afd39ca9648a55"),
        "scoreDirection": "HIGHER_SCORE_SYNTHETIC",
        "loadSeconds": None,
        "records": [{"sampleId": item["sampleId"], "rawScore": item["score"], "runtimeSeconds": item.get("runtimeSeconds")} for item in source["records"]],
    }


def wilson_rate(values: list[float], predicate) -> dict:
    count = sum(predicate(value) for value in values)
    return {"count": count, "total": len(values), "rate": round(count / len(values), 6) if values else None, "wilson95": wilson(count, len(values))}


def detector_metrics(detector: dict, input_manifest: dict, target_fprs: list[float]) -> tuple[dict, dict]:
    by_sample = {item["sampleId"]: item for item in input_manifest["records"]}
    rows = [{**by_sample[item["sampleId"]], **item} for item in detector["records"]]
    positives = [row for row in rows if row["role"] == "DDB_DETECTOR_DEV"]
    camera = [row for row in rows if row["role"] == "CAMERA_DEV"]
    digital = [row for row in rows if row["role"] == "DIGITAL_DEV"]
    negatives = camera + digital
    y = [1] * len(positives) + [0] * len(negatives)
    scores = [row["rawScore"] for row in positives + negatives]
    try:
        auc = round(float(roc_auc_score(y, scores)), 6)
    except ValueError:
        auc = None
    try:
        pr_auc = round(float(average_precision_score(y, scores)), 6)
    except ValueError:
        pr_auc = None
    negative_scores = np.array([row["rawScore"] for row in negatives], dtype=float)
    curves = []
    for target in target_fprs:
        threshold = float(np.quantile(negative_scores, 1 - target, method="linear"))
        positive_values = [row["rawScore"] for row in positives]
        camera_values = [row["rawScore"] for row in camera]
        digital_values = [row["rawScore"] for row in digital]
        all_negative_values = [row["rawScore"] for row in negatives]
        curves.append({
            "targetOverallNegativeFpr": target,
            "threshold": round(threshold, 9),
            "cameraFpr": wilson_rate(camera_values, lambda value: value >= threshold),
            "digitalFpr": wilson_rate(digital_values, lambda value: value >= threshold),
            "overallNegativeFpr": wilson_rate(all_negative_values, lambda value: value >= threshold),
            "syntheticRecall": wilson_rate(positive_values, lambda value: value >= threshold),
        })
    metrics = {
        "detectorId": detector["detectorId"],
        "displayName": detector.get("displayName"),
        "checkpointSha256": detector.get("checkpointSha256"),
        "scoreDirection": detector.get("scoreDirection", "HIGHER_SCORE_SYNTHETIC"),
        "recordCount": len(rows),
        "roleCounts": {role: sum(row["role"] == role for row in rows) for role in sorted({row["role"] for row in rows})},
        "syntheticRocAuc": auc,
        "syntheticPrAuc": pr_auc,
        "syntheticScore": distribution([row["rawScore"] for row in positives]),
        "cameraScore": distribution([row["rawScore"] for row in camera]),
        "digitalScore": distribution([row["rawScore"] for row in digital]),
        "runtimeSeconds": distribution([row["runtimeSeconds"] for row in rows if row.get("runtimeSeconds") is not None]),
        "loadSeconds": detector.get("loadSeconds"),
    }
    return metrics, {"detectorId": detector["detectorId"], "curves": curves}


def distribution(values: list[float]) -> dict:
    if not values:
        return {"count": 0, "median": None, "iqr": None, "min": None, "max": None}
    array = np.array(values, dtype=float)
    q1, median, q3 = np.quantile(array, [0.25, 0.5, 0.75])
    return {"count": len(values), "median": round(float(median), 6), "iqr": [round(float(q1), 6), round(float(q3), 6)], "min": round(float(array.min()), 6), "max": round(float(array.max()), 6)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-manifest", type=Path, required=True)
    parser.add_argument("--spai", type=Path, required=True)
    parser.add_argument("--pretrained", type=Path, nargs="+", required=True)
    parser.add_argument("--raw-output", type=Path, required=True)
    parser.add_argument("--curves-output", type=Path, required=True)
    args = parser.parse_args()
    input_manifest = load(args.input_manifest)
    pretrained_detectors = [detector for path in args.pretrained for detector in load(path).get("detectors", [])]
    detectors = [normalized_spai(args.spai), *pretrained_detectors]
    metrics = []
    curves = []
    for detector in detectors:
        metric, curve = detector_metrics(detector, input_manifest, [0.005, 0.01, 0.02, 0.05, 0.10])
        metrics.append(metric)
        curves.append(curve)
    raw_result = {
        "schemaVersion": "lythaus-wp007f-raw-detector-results-v1",
        "inputManifestSha256": hashlib.sha256(args.input_manifest.read_bytes()).hexdigest(),
        "scoreBlind": True,
        "flux1PixelAccess": False,
        "flux2PixelAccess": False,
        "detectors": metrics,
    }
    curves_result = {
        "schemaVersion": "lythaus-wp007f-operating-curves-v1",
        "source": "DDB_DETECTOR_DEV positives and CAMERA_DEV + DIGITAL_DEV negatives; all thresholds derived from pooled dev negatives",
        "detectors": curves,
    }
    args.raw_output.write_text(json.dumps(raw_result, indent=2) + "\n", encoding="utf-8")
    args.curves_output.write_text(json.dumps(curves_result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"detectors": [{"id": metric["detectorId"], "auc": metric["syntheticRocAuc"], "p50": metric["runtimeSeconds"]["median"]} for metric in metrics]}))


if __name__ == "__main__":
    main()
