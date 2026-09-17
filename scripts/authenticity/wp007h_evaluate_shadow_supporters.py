#!/usr/bin/env python3
"""Evaluate WP007H supporter detectors without changing SAFE qualification.

This is descriptive error-diversity analysis only.  The frozen WP007H SAFE
threshold and the prior frozen supporter thresholds are never refit here.
No supporter score can change a SAFE pass/fail result.
"""

from __future__ import annotations

import argparse
import json
import math
from collections import Counter, defaultdict
from pathlib import Path
from statistics import mean, median
from typing import Any


SAFE_THRESHOLD = 0.5864923000335693
PRIOR_THRESHOLDS = {
    "SPAI_C512": 1.0,
    "RINE": 0.890092938,
    "UNIVERSAL_FAKE_DETECT": 0.543838277,
}
ROLES = {"QUALIFICATION_CONFIRM", "NEGATIVE_CONFIRM_H"}


def load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def safe_records(data: dict[str, Any]) -> dict[tuple[str, str, str], dict[str, Any]]:
    result = {}
    for row in data.get("records", []):
        if row.get("role") not in ROLES:
            continue
        key = (row["role"], row["sourceFamilyId"], row["sampleId"])
        result[key] = row
    return result


def detector_records(data: dict[str, Any]) -> dict[str, dict[tuple[str, str, str], dict[str, Any]]]:
    result: dict[str, dict[tuple[str, str, str], dict[str, Any]]] = {}
    for detector in data.get("detectors", []):
        detector_id = detector["detectorId"]
        rows = {}
        for row in detector.get("records", []):
            if row.get("role") not in ROLES:
                continue
            key = (row["role"], row["sourceFamilyId"], row["sampleId"])
            rows[key] = row
        result[detector_id] = rows
    return result


def spai_records(
    data: dict[str, Any],
    safe: dict[tuple[str, str, str], dict[str, Any]],
    manifest: dict[str, Any] | None = None,
) -> dict[tuple[str, str, str], dict[str, Any]]:
    result = {}
    score_rows = data.get("records", [])
    if manifest is not None:
        manifest_rows = manifest.get("records", [])
        if len(manifest_rows) != len(score_rows):
            raise ValueError("SPAI score and ordered input manifest lengths differ")
        score_rows = [dict(score, **{
            "role": meta.get("role"),
            "sourceFamilyId": meta.get("sourceFamilyId"),
            "sampleId": meta.get("sampleId"),
            "sourceSubtype": meta.get("sourceSubtype"),
        }) for score, meta in zip(score_rows, manifest_rows)]
    for row in score_rows:
        source_family = row.get("sourceFamilyId")
        sample_id = row.get("sampleId")
        role = row.get("role")
        if source_family is None or sample_id is None:
            continue
        if role is None:
            candidates = [key for key in safe if key[1] == source_family and key[2] == sample_id]
            if len(candidates) != 1:
                continue
            role = candidates[0][0]
        if role in ROLES:
            result[(role, source_family, sample_id)] = row
    return result


def percentile_rank(values: list[float]) -> list[float]:
    ordered = sorted(enumerate(values), key=lambda item: item[1])
    ranks = [0.0] * len(values)
    index = 0
    while index < len(ordered):
        end = index + 1
        while end < len(ordered) and ordered[end][1] == ordered[index][1]:
            end += 1
        rank = (index + 1 + end) / 2.0
        for position in range(index, end):
            ranks[ordered[position][0]] = rank
        index = end
    return ranks


def correlation(left: list[float], right: list[float]) -> dict[str, float | None]:
    if len(left) < 2 or len(left) != len(right):
        return {"n": len(left), "pearson": None, "spearman": None}

    def pearson(a: list[float], b: list[float]) -> float | None:
        ma, mb = mean(a), mean(b)
        numerator = sum((x - ma) * (y - mb) for x, y in zip(a, b))
        denominator = math.sqrt(sum((x - ma) ** 2 for x in a) * sum((y - mb) ** 2 for y in b))
        return numerator / denominator if denominator else None

    return {
        "n": len(left),
        "pearson": pearson(left, right),
        "spearman": pearson(percentile_rank(left), percentile_rank(right)),
    }


def summarize(rows: list[dict[str, Any]], detector_id: str, threshold: float) -> dict[str, Any]:
    synthetic = [row for row in rows if row["truth"] == 1]
    negative = [row for row in rows if row["truth"] == 0]
    predicted = lambda row: row["score"] >= threshold
    tp = sum(predicted(row) for row in synthetic)
    fp = sum(predicted(row) for row in negative)
    return {
        "detectorId": detector_id,
        "priorFrozenThreshold": threshold,
        "matchedRecords": len(rows),
        "synthetic": {"tp": tp, "n": len(synthetic), "recall": tp / len(synthetic) if synthetic else None},
        "negative": {"fp": fp, "n": len(negative), "fpr": fp / len(negative) if negative else None},
        "scoreMedian": median([row["score"] for row in rows]) if rows else None,
        "scoreMin": min((row["score"] for row in rows), default=None),
        "scoreMax": max((row["score"] for row in rows), default=None),
    }


def subgroup_summary(rows: list[dict[str, Any]], detector_id: str, threshold: float, field: str) -> dict[str, Any]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups[str(row.get(field) or "UNKNOWN")].append(row)
    result = {}
    for name, group in sorted(groups.items()):
        result[name] = summarize(group, detector_id, threshold)
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--safe", type=Path, required=True)
    parser.add_argument("--clip", type=Path, required=True)
    parser.add_argument("--spai", type=Path, required=True)
    parser.add_argument("--spai-manifest", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    safe_map = safe_records(load(args.safe))
    clip_maps = detector_records(load(args.clip))
    spai_manifest = load(args.spai_manifest) if args.spai_manifest else None
    spai_map = spai_records(load(args.spai), safe_map, spai_manifest)

    source_maps = dict(clip_maps)
    source_maps["SPAI_C512"] = spai_map
    joined: dict[str, list[dict[str, Any]]] = {}
    for detector_id, rows in source_maps.items():
        out = []
        for key, support_row in rows.items():
            safe_row = safe_map.get(key)
            if safe_row is None:
                continue
            score = support_row.get("score", support_row.get("rawScore"))
            if score is None:
                continue
            out.append({
                "key": list(key),
                "role": key[0],
                "sourceFamilyId": key[1],
                "sampleId": key[2],
                "truth": 1 if key[0] == "QUALIFICATION_CONFIRM" else 0,
                "sourceSubtype": safe_row.get("sourceSubtype"),
                "generatorFamily": safe_row.get("generatorFamily"),
                "cameraDeviceFamily": safe_row.get("cameraDeviceFamily"),
                "safeScore": safe_row.get("rawScore"),
                "supporterScore": float(score),
                "score": float(score),
                "safePrediction": float(safe_row.get("rawScore", 0.0)) >= SAFE_THRESHOLD,
                "supporterPrediction": float(score) >= PRIOR_THRESHOLDS[detector_id],
            })
        joined[detector_id] = out

    summaries = {}
    error_diversity = {}
    for detector_id, rows in joined.items():
        for row in rows:
            safe_pred = row["safePrediction"]
            support_pred = row["supporterPrediction"]
            truth = row["truth"] == 1
            row["safeCorrect"] = safe_pred == truth
            row["supporterCorrect"] = support_pred == truth
            row["safeFalsePositiveRescued"] = (not truth) and safe_pred and not support_pred
            row["safeFalseNegativeRescued"] = truth and not safe_pred and support_pred
            row["supporterFalsePositiveIntroduced"] = (not truth) and not safe_pred and support_pred
            row["supporterFalseNegativeIntroduced"] = truth and safe_pred and not support_pred
        threshold = PRIOR_THRESHOLDS[detector_id]
        summaries[detector_id] = {
            "overall": summarize(rows, detector_id, threshold),
            "byGeneratorFamily": subgroup_summary([r for r in rows if r["truth"] == 1], detector_id, threshold, "generatorFamily"),
            "byNegativeSubtype": subgroup_summary([r for r in rows if r["truth"] == 0], detector_id, threshold, "sourceSubtype"),
            "byRole": subgroup_summary(rows, detector_id, threshold, "role"),
        }
        error_diversity[detector_id] = {
            "matchedRecords": len(rows),
            "agreement": sum(r["safePrediction"] == r["supporterPrediction"] for r in rows) / len(rows) if rows else None,
            "disagreement": sum(r["safePrediction"] != r["supporterPrediction"] for r in rows) / len(rows) if rows else None,
            "bothCorrect": sum(r["safeCorrect"] and r["supporterCorrect"] for r in rows),
            "bothWrong": sum(not r["safeCorrect"] and not r["supporterCorrect"] for r in rows),
            "safeOnlyCorrect": sum(r["safeCorrect"] and not r["supporterCorrect"] for r in rows),
            "supporterOnlyCorrect": sum(not r["safeCorrect"] and r["supporterCorrect"] for r in rows),
            "safeFalsePositiveRescued": sum(r["safeFalsePositiveRescued"] for r in rows),
            "safeFalseNegativeRescued": sum(r["safeFalseNegativeRescued"] for r in rows),
            "supporterFalsePositiveIntroduced": sum(r["supporterFalsePositiveIntroduced"] for r in rows),
            "supporterFalseNegativeIntroduced": sum(r["supporterFalseNegativeIntroduced"] for r in rows),
            "byGeneratorFamily": {},
            "byNegativeSubtype": {},
        }
        for field, key_name in (("generatorFamily", "byGeneratorFamily"), ("sourceSubtype", "byNegativeSubtype")):
            groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
            for row in rows:
                if (field == "generatorFamily" and row["truth"] == 1) or (field == "sourceSubtype" and row["truth"] == 0):
                    groups[str(row.get(field) or "UNKNOWN")].append(row)
            for name, group in sorted(groups.items()):
                error_diversity[detector_id][key_name][name] = {
                    "n": len(group),
                    "safeCorrect": sum(r["safeCorrect"] for r in group),
                    "supporterCorrect": sum(r["supporterCorrect"] for r in group),
                    "safeOnlyCorrect": sum(r["safeCorrect"] and not r["supporterCorrect"] for r in group),
                    "supporterOnlyCorrect": sum(not r["safeCorrect"] and r["supporterCorrect"] for r in group),
                }

    correlations = {}
    ids = sorted(joined)
    for index, left_id in enumerate(ids):
        left = {tuple(row["key"]): row["supporterScore"] for row in joined[left_id]}
        for right_id in ids[index + 1:]:
            right = {tuple(row["key"]): row["supporterScore"] for row in joined[right_id]}
            keys = sorted(set(left) & set(right))
            correlations[f"{left_id}__{right_id}"] = correlation([left[k] for k in keys], [right[k] for k in keys])

    result = {
        "schemaVersion": "lythaus-wp007h-shadow-supporter-results-v1",
        "scoreBlind": True,
        "qualificationRole": "SAFE_ONLY_PRIMARY",
        "safeQualificationUnaffectedBySupporters": True,
        "noRouterOptimization": True,
        "safeThreshold": SAFE_THRESHOLD,
        "supporterThresholds": PRIOR_THRESHOLDS,
        "thresholdProvenance": "Prior frozen WP007F descriptive thresholds; no refit in WP007H.",
        "roles": sorted(ROLES),
        "summaries": summaries,
        "errorDiversity": error_diversity,
        "scoreCorrelations": correlations,
        "matchedKeys": {detector_id: len(rows) for detector_id, rows in joined.items()},
        "flux1PixelAccess": False,
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
        "supporterTransformationCoverage": "NOT_RUN_FULL_MATRIX_CPU_BOUND; SAFE_ONLY_TRANSFORMATION_MATRIX_IS_AUTHORITATIVE",
    }
    args.output.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"output": str(args.output), "matchedKeys": result["matchedKeys"]}, sort_keys=True))


if __name__ == "__main__":
    main()
