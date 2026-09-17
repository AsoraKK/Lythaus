"""Compute deterministic detector-group fusion metrics at frozen thresholds."""

from __future__ import annotations

import argparse
import json
import math
import statistics
from pathlib import Path


def wilson(successes: int, total: int) -> list[float]:
    if not total:
        return [None, None]
    z = 1.959963984540054
    p = successes / total
    denominator = 1 + z * z / total
    centre = p + z * z / (2 * total)
    spread = z * math.sqrt((p * (1 - p) + z * z / (4 * total)) / total)
    return [round((centre - spread) / denominator, 6), round((centre + spread) / denominator, 6)]


def rate(count: int, total: int) -> dict:
    return {"count": count, "total": total, "rate": round(count / total, 6) if total else None, "wilson95": wilson(count, total)}


def load_detector(path: Path) -> dict[str, float]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if "records" in payload:
        return {item["sampleId"]: float(item["score"]) for item in payload["records"]}
    detector = payload["detectors"]
    if len(detector) != 1:
        raise RuntimeError(f"EXPECTED_SINGLE_DETECTOR:{path}")
    return {item["sampleId"]: float(item["rawScore"]) for item in detector[0]["records"]}


def thresholds(path: Path) -> dict[str, float]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    result = {}
    for detector in payload["detectors"]:
        point = next(item for item in detector["curves"] if item["targetOverallNegativeFpr"] == 0.01)
        result[detector["detectorId"]] = float(point["threshold"])
    return result


def score_summary(values: list[float]) -> dict:
    if not values:
        return {"count": 0, "median": None, "iqr": [None, None]}
    ordered = sorted(values)
    return {
        "count": len(values),
        "median": round(statistics.median(values), 9),
        "iqr": [round(ordered[len(ordered) // 4], 9), round(ordered[(3 * len(ordered)) // 4], 9)],
    }


def metrics(rows: list[dict], predicate) -> dict:
    positives = [row for row in rows if row["role"] == "DDB_DETECTOR_DEV" or row["role"] == "DDB_DETECTOR_CONFIRM"]
    cameras = [row for row in rows if row["role"] == "CAMERA_DEV" or row["role"] == "CAMERA_CONFIRM"]
    digitals = [row for row in rows if row["role"] == "DIGITAL_DEV" or row["role"] == "DIGITAL_CONFIRM"]
    negatives = cameras + digitals
    return {
        "syntheticRecall": rate(sum(predicate(row) for row in positives), len(positives)),
        "cameraFpr": rate(sum(predicate(row) for row in cameras), len(cameras)),
        "digitalFpr": rate(sum(predicate(row) for row in digitals), len(digitals)),
        "overallNegativeFpr": rate(sum(predicate(row) for row in negatives), len(negatives)),
    }


def build_rows(inputs: dict, scores: dict[str, dict[str, float]], stage: str) -> list[dict]:
    suffix = "_DEV" if stage == "dev" else "_CONFIRM"
    records = [item for item in inputs["records"] if item["role"].endswith(suffix)]
    rows = []
    for record in records:
        sample_id = record["sampleId"]
        if any(sample_id not in values for values in scores.values()):
            raise RuntimeError(f"FUSION_SCORE_MISSING:{stage}:{sample_id}")
        rows.append({"sampleId": sample_id, "role": record["role"], **{key: values[sample_id] for key, values in scores.items()}})
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--inputs", type=Path, required=True)
    parser.add_argument("--curves", type=Path, required=True)
    parser.add_argument("--dev", type=Path, nargs=3, metavar="SCORE", required=True)
    parser.add_argument("--confirm", type=Path, nargs=3, metavar="SCORE", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    inputs = json.loads(args.inputs.read_text(encoding="utf-8"))
    threshold = thresholds(args.curves)
    ids = ("SPAI_C512", "UNIVERSAL_FAKE_DETECT", "RINE")
    dev_scores = dict(zip(ids, [load_detector(path) for path in args.dev]))
    confirm_scores = dict(zip(ids, [load_detector(path) for path in args.confirm]))
    results = []
    for stage, score_map in (("dev", dev_scores), ("confirm", confirm_scores)):
        rows = build_rows(inputs, score_map, stage)
        for name, predicate in {
            "SPAI_ONLY": lambda row: row["SPAI_C512"] >= threshold["SPAI_C512"],
            "CLIP_GROUP_ANY": lambda row: row["UNIVERSAL_FAKE_DETECT"] >= threshold["UNIVERSAL_FAKE_DETECT"] or row["RINE"] >= threshold["RINE"],
            "SPAI_AND_UFD": lambda row: row["SPAI_C512"] >= threshold["SPAI_C512"] and row["UNIVERSAL_FAKE_DETECT"] >= threshold["UNIVERSAL_FAKE_DETECT"],
            "SPAI_AND_RINE": lambda row: row["SPAI_C512"] >= threshold["SPAI_C512"] and row["RINE"] >= threshold["RINE"],
            "SPAI_AND_ANY_CLIP": lambda row: row["SPAI_C512"] >= threshold["SPAI_C512"] and (row["UNIVERSAL_FAKE_DETECT"] >= threshold["UNIVERSAL_FAKE_DETECT"] or row["RINE"] >= threshold["RINE"]),
        }.items():
            result = metrics(rows, predicate)
            result.update({"stage": stage, "rule": name, "thresholds": threshold})
            results.append(result)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({
        "schemaVersion": "lythaus-wp007f-fusion-results-v1",
        "scoreBlind": True,
        "flux1PixelAccess": False,
        "flux2PixelAccess": False,
        "thresholdSource": "development pooled negatives target 1%; fixed before confirmation",
        "results": results,
    }, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"rules": len(results), "thresholds": threshold}))


if __name__ == "__main__":
    main()
