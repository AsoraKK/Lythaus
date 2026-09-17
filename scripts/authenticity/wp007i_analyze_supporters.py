"""Descriptive SAFE versus SPAI/RINE/UFD shadow comparison."""

from __future__ import annotations

import argparse
import json
import math
import statistics
from collections import defaultdict
from pathlib import Path
from typing import Any

from wp007i_policy import SAFE_THRESHOLD, wilson


SUPPORTER_THRESHOLDS = {
    "SPAI_C512": 1.0,
    "RINE": 0.890092938,
    "UNIVERSAL_FAKE_DETECT": 0.543838277,
}


def load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def proportion(numerator: int, denominator: int) -> dict[str, Any]:
    return wilson(numerator, denominator)


def detector_rows(payload: dict[str, Any]) -> dict[str, dict[str, Any]]:
    return {detector["detectorId"]: {row["rowKey"]: row for row in detector["records"]} for detector in payload["detectors"]}


def pair_summary(rows: list[dict[str, Any]], supporter: str) -> dict[str, Any]:
    threshold = SUPPORTER_THRESHOLDS[supporter]
    positives = [row for row in rows if int(row["label"]) == 1]
    negatives = [row for row in rows if int(row["label"]) == 0]
    safe_high = lambda row: float(row["safeScore"]) >= SAFE_THRESHOLD
    supporter_high = lambda row: float(row["supporterScore"]) >= threshold
    safe_fn = [row for row in positives if not safe_high(row)]
    support_rescue = [row for row in safe_fn if supporter_high(row)]
    safe_fp = [row for row in negatives if safe_high(row)]
    support_fp = [row for row in negatives if supporter_high(row)]
    return {
        "supporterThreshold": threshold,
        "positive": {
            "n": len(positives),
            "safeCorrect": sum(safe_high(row) for row in positives),
            "supporterCorrect": sum(supporter_high(row) for row in positives),
            "bothCorrect": sum(safe_high(row) and supporter_high(row) for row in positives),
            "bothWrong": sum(not safe_high(row) and not supporter_high(row) for row in positives),
            "safeOnlyCorrect": sum(safe_high(row) and not supporter_high(row) for row in positives),
            "supporterOnlyCorrect": sum(not safe_high(row) and supporter_high(row) for row in positives),
            "safeRecall": proportion(sum(safe_high(row) for row in positives), len(positives)),
            "supporterRecall": proportion(sum(supporter_high(row) for row in positives), len(positives)),
            "safeMissesRescued": proportion(len(support_rescue), len(safe_fn)),
            "safeMisses": len(safe_fn),
            "rescueCount": len(support_rescue),
        },
        "negative": {
            "n": len(negatives),
            "safeFalsePositives": len(safe_fp),
            "supporterFalsePositives": len(support_fp),
            "safeFpr": proportion(len(safe_fp), len(negatives)),
            "supporterFpr": proportion(len(support_fp), len(negatives)),
            "supporterIntroducedFalseContradictions": sum(supporter_high(row) and not safe_high(row) for row in negatives),
            "safeFalsePositivesNotSupported": sum(not supporter_high(row) for row in safe_fp),
        },
        "rescuePrecision": proportion(sum(int(row["label"]) == 1 for row in [*support_rescue, *[item for item in negatives if not safe_high(item) and supporter_high(item)]]), len(support_rescue) + sum(not safe_high(row) and supporter_high(row) for row in negatives)),
        "byGeneratorFamily": _group_pair(rows, supporter, "generatorFamily"),
        "byNegativeSubtype": _group_pair([row for row in rows if int(row["label"]) == 0], supporter, "sourceSubtype"),
        "byTransformation": _group_pair(rows, supporter, "transformation"),
    }


def _group_pair(rows: list[dict[str, Any]], supporter: str, field: str) -> dict[str, Any]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups[str(row.get(field) or "UNKNOWN")].append(row)
    return {key: _simple_pair(group, supporter) for key, group in sorted(groups.items())}


def _simple_pair(rows: list[dict[str, Any]], supporter: str) -> dict[str, Any]:
    threshold = SUPPORTER_THRESHOLDS[supporter]
    positives = [row for row in rows if int(row["label"]) == 1]
    negatives = [row for row in rows if int(row["label"]) == 0]
    safe_high = lambda row: float(row["safeScore"]) >= SAFE_THRESHOLD
    support_high = lambda row: float(row["supporterScore"]) >= threshold
    return {
        "count": len(rows),
        "syntheticN": len(positives),
        "syntheticSafeRecall": proportion(sum(safe_high(row) for row in positives), len(positives)),
        "syntheticSupporterRecall": proportion(sum(support_high(row) for row in positives), len(positives)),
        "syntheticUniqueSupporterRescue": sum(not safe_high(row) and support_high(row) for row in positives),
        "negativeN": len(negatives),
        "safeFpr": proportion(sum(safe_high(row) for row in negatives), len(negatives)),
        "supporterFpr": proportion(sum(support_high(row) for row in negatives), len(negatives)),
    }


def correlation(rows: list[dict[str, Any]], left: str, right: str) -> dict[str, Any]:
    left_values = [float(row[left]) for row in rows]
    right_values = [float(row[right]) for row in rows]
    if len(left_values) < 3 or len(set(left_values)) < 2 or len(set(right_values)) < 2:
        return {"n": len(rows), "pearson": None, "spearman": None}
    left_mean = statistics.fmean(left_values)
    right_mean = statistics.fmean(right_values)
    numerator = sum((left_value - left_mean) * (right_value - right_mean) for left_value, right_value in zip(left_values, right_values))
    left_denominator = math.sqrt(sum((value - left_mean) ** 2 for value in left_values))
    right_denominator = math.sqrt(sum((value - right_mean) ** 2 for value in right_values))

    def ranks(values: list[float]) -> list[float]:
        indexed = sorted(enumerate(values), key=lambda item: item[1])
        result = [0.0] * len(values)
        index = 0
        while index < len(indexed):
            end = index + 1
            while end < len(indexed) and indexed[end][1] == indexed[index][1]:
                end += 1
            rank = (index + 1 + end) / 2
            for position in range(index, end):
                result[indexed[position][0]] = rank
            index = end
        return result

    left_ranks = ranks(left_values)
    right_ranks = ranks(right_values)
    left_rank_mean = statistics.fmean(left_ranks)
    right_rank_mean = statistics.fmean(right_ranks)
    rank_numerator = sum((left_value - left_rank_mean) * (right_value - right_rank_mean) for left_value, right_value in zip(left_ranks, right_ranks))
    rank_left_denominator = math.sqrt(sum((value - left_rank_mean) ** 2 for value in left_ranks))
    rank_right_denominator = math.sqrt(sum((value - right_rank_mean) ** 2 for value in right_ranks))
    return {
        "n": len(rows),
        "pearson": numerator / (left_denominator * right_denominator),
        "spearman": rank_numerator / (rank_left_denominator * rank_right_denominator),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--supporters", type=Path, required=True)
    args = parser.parse_args()
    research = args.root / "research" / "wp007i"
    safe_original = load(research / "safe-original-scores.json")["records"]
    safe_transforms = load(research / "safe-transformation-scores.json")["records"]
    supporter_payload = load(args.supporters)
    by_detector = detector_rows(supporter_payload)
    all_safe = safe_original + safe_transforms
    available_detectors = [detector for detector in SUPPORTER_THRESHOLDS if detector in by_detector]
    comparison_rows: dict[str, list[dict[str, Any]]] = {detector: [] for detector in available_detectors}
    for safe_row in all_safe:
        for detector in available_detectors:
            support_row = by_detector[detector][safe_row["rowKey"]]
            comparison_rows[detector].append({
                "rowKey": safe_row["rowKey"],
                "label": safe_row["label"],
                "sourceFamilyId": safe_row["sourceFamilyId"],
                "generatorFamily": safe_row.get("generatorFamily"),
                "sourceSubtype": safe_row.get("sourceSubtype"),
                "transformation": safe_row.get("transformation", "ORIGINAL"),
                "safeScore": safe_row["rawScore"],
                "supporterScore": support_row["rawScore"],
                "safeStatus": safe_row.get("status"),
                "supporterRuntimeSeconds": support_row.get("runtimeSeconds"),
            })
    summaries = {detector: pair_summary(rows, detector) for detector, rows in comparison_rows.items()}
    clip_rows = comparison_rows["RINE"] if "RINE" in comparison_rows else []
    clip_by_key = {row["rowKey"]: row for row in comparison_rows.get("UNIVERSAL_FAKE_DETECT", [])}
    clip_corr_rows = [{"RINE": row["supporterScore"], "UFD": clip_by_key[row["rowKey"]]["supporterScore"]} for row in clip_rows]
    correlations = {
        "RINE_UFD": correlation([{"left": row["RINE"], "right": row["UFD"]} for row in clip_corr_rows], "left", "right"),
        "SAFE_RINE": correlation([{"left": row["safeScore"], "right": row["supporterScore"]} for row in clip_rows], "left", "right"),
    }
    runtime = {}
    for detector, rows in comparison_rows.items():
        values = sorted(float(row["supporterRuntimeSeconds"]) for row in rows if row.get("supporterRuntimeSeconds") is not None)
        runtime[detector] = {
            "count": len(values),
            "p50Seconds": statistics.median(values) if values else None,
            "p95Seconds": values[max(0, int(len(values) * 0.95) - 1)] if values else None,
            "maxSeconds": max(values) if values else None,
            "wholeRunRole": "SHADOW_ONLY_NOT_NORMAL_PATH",
        }
    payload = {
        "schemaVersion": "lythaus-wp007i-shadow-supporter-analysis-v1",
        "safeThreshold": SAFE_THRESHOLD,
        "supporterThresholds": SUPPORTER_THRESHOLDS,
        "rowsPerDetector": {key: len(value) for key, value in comparison_rows.items()},
        "summaries": summaries,
        "correlations": correlations,
        "runtime": runtime,
        "promotionDecision": {
            "SPAI_C512": "SHADOW_ONLY_PENDING_UNIQUE_RESCUE" if "SPAI_C512" in available_detectors else "UNAVAILABLE",
            "RINE": "SHADOW_ONLY_PENDING_UNIQUE_RESCUE" if "RINE" in available_detectors else "UNAVAILABLE",
            "UNIVERSAL_FAKE_DETECT": "SHADOW_ONLY_PENDING_UNIQUE_RESCUE" if "UNIVERSAL_FAKE_DETECT" in available_detectors else "UNAVAILABLE",
        },
        "unavailableDetectors": [detector for detector in SUPPORTER_THRESHOLDS if detector not in available_detectors],
        "safeQualificationUnaffectedBySupporters": True,
        "noRouterOptimization": True,
    }
    write_json(research / "shadow-supporter-analysis.json", payload)
    print(json.dumps({
        "rows": len(all_safe),
        "rescueCount": {key: value["positive"]["rescueCount"] for key, value in summaries.items()},
        "supporterFpr": {key: value["negative"]["supporterFpr"] for key, value in summaries.items()},
        "runtime": runtime,
        "correlations": correlations,
    }, sort_keys=True))


if __name__ == "__main__":
    main()
