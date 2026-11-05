"""Summarize fixed transformation scores without using holdout pixels."""

from __future__ import annotations

import argparse
import json
import math
import statistics
from pathlib import Path


def wilson(successes: int, total: int) -> list[float]:
    if total == 0:
        return [None, None]
    z = 1.959963984540054
    p = successes / total
    denominator = 1 + z * z / total
    centre = p + z * z / (2 * total)
    spread = z * math.sqrt((p * (1 - p) + z * z / (4 * total)) / total)
    return [round((centre - spread) / denominator, 6), round((centre + spread) / denominator, 6)]


def rate(successes: int, total: int) -> dict:
    return {
        "count": successes,
        "total": total,
        "rate": round(successes / total, 6) if total else None,
        "wilson95": wilson(successes, total),
    }


def summary(values: list[float]) -> dict:
    if not values:
        return {"count": 0, "median": None, "iqr": [None, None], "min": None, "max": None}
    ordered = sorted(values)
    return {
        "count": len(values),
        "median": round(statistics.median(values), 9),
        "iqr": [round(ordered[len(ordered) // 4], 9), round(ordered[(3 * len(ordered)) // 4], 9)],
        "min": round(min(values), 9),
        "max": round(max(values), 9),
    }


def thresholds(curves_path: Path) -> dict[str, float]:
    payload = json.loads(curves_path.read_text(encoding="utf-8"))
    result = {}
    for detector in payload["detectors"]:
        curve = next(item for item in detector["curves"] if item["targetOverallNegativeFpr"] == 0.01)
        result[detector["detectorId"]] = float(curve["threshold"])
    return result


def score_records(path: Path) -> dict[str, list[dict]]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if "records" in payload:
        return {payload.get("candidateId", "SPAI_C512"): payload["records"]}
    return {item["detectorId"]: item["records"] for item in payload.get("detectors", [])}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--inputs", type=Path, required=True)
    parser.add_argument("--curves", type=Path, required=True)
    parser.add_argument("--scores", type=Path, nargs="+", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    inputs = json.loads(args.inputs.read_text(encoding="utf-8"))
    by_sample = {item["sampleId"]: item for item in inputs["records"]}
    thresholds_by_detector = thresholds(args.curves)
    detector_rows: dict[str, list[dict]] = {}
    for path in args.scores:
        for detector_id, records in score_records(path).items():
            rows = detector_rows.setdefault(detector_id, [])
            for record in records:
                sample_id = record["sampleId"]
                source = by_sample.get(sample_id)
                if source is None:
                    raise RuntimeError(f"TRANSFORM_SAMPLE_NOT_IN_MANIFEST:{sample_id}")
                raw_score = record.get("rawScore", record.get("score"))
                if raw_score is None:
                    raise RuntimeError(f"TRANSFORM_SCORE_MISSING:{detector_id}:{sample_id}")
                rows.append({
                    "sampleId": sample_id,
                    "parentSampleId": source["parentSampleId"],
                    "sourceFamilyId": source["sourceFamilyId"],
                    "role": source["role"],
                    "transform": source["transform"],
                    "rawScore": float(raw_score),
                    "runtimeSeconds": record.get("runtimeSeconds"),
                })

    detector_results = []
    for detector_id, rows in sorted(detector_rows.items()):
        threshold = thresholds_by_detector[detector_id]
        by_transform: dict[str, list[dict]] = {}
        for row in rows:
            by_transform.setdefault(row["transform"], []).append(row)
        canonical_by_parent = {
            row["parentSampleId"]: row["rawScore"]
            for row in rows
            if row["transform"] == "CANONICAL"
        }
        transform_results = []
        for transform, transform_rows in sorted(by_transform.items()):
            positives = [row for row in transform_rows if row["role"] == "DDB_DETECTOR_DEV"]
            cameras = [row for row in transform_rows if row["role"] == "CAMERA_DEV"]
            digitals = [row for row in transform_rows if row["role"] == "DIGITAL_DEV"]
            negatives = cameras + digitals
            shifts = [row["rawScore"] - canonical_by_parent[row["parentSampleId"]] for row in transform_rows]
            transform_results.append({
                "transform": transform,
                "syntheticRecall": rate(sum(row["rawScore"] >= threshold for row in positives), len(positives)),
                "cameraFpr": rate(sum(row["rawScore"] >= threshold for row in cameras), len(cameras)),
                "digitalFpr": rate(sum(row["rawScore"] >= threshold for row in digitals), len(digitals)),
                "overallNegativeFpr": rate(sum(row["rawScore"] >= threshold for row in negatives), len(negatives)),
                "score": {
                    "synthetic": summary([row["rawScore"] for row in positives]),
                    "camera": summary([row["rawScore"] for row in cameras]),
                    "digital": summary([row["rawScore"] for row in digitals]),
                    "negative": summary([row["rawScore"] for row in negatives]),
                    "parentMatchedShift": summary(shifts),
                },
                "runtimeSeconds": summary([float(row["runtimeSeconds"]) for row in transform_rows if row.get("runtimeSeconds") is not None]),
            })
        detector_results.append({
            "detectorId": detector_id,
            "thresholdSource": "operating-curves development pooled negatives target 1%",
            "frozenThreshold": threshold,
            "sampleCount": len(rows),
            "transforms": transform_results,
        })

    result = {
        "schemaVersion": "lythaus-wp007f-transformation-results-v1",
        "scoreBlind": True,
        "flux1PixelAccess": False,
        "flux2PixelAccess": False,
        "inputManifestSha256": inputs["sourceManifestSha256"],
        "thresholds": thresholds_by_detector,
        "detectors": detector_results,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"detectors": [item["detectorId"] for item in detector_results], "records": sum(item["sampleCount"] for item in detector_results)}))


if __name__ == "__main__":
    main()
