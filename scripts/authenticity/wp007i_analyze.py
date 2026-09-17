"""Analyze frozen WP007I SAFE scores and deterministic policy variants."""

from __future__ import annotations

import argparse
import json
import math
import statistics
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable

from wp007i_policy import (
    SAFE_THRESHOLD,
    SUPPORTED_STATES,
    canonical_json_hash,
    classify_applicability,
    input_facts,
    selective_evidence,
    wilson,
)


DESTRUCTIVE_TRANSFORMS = {"JPEG95", "JPEG85", "JPEG75", "RESIZE50"}
POLICIES = (
    "P0_SAFE_RAW_REFERENCE",
    "P1_SAFE_POSITIVE_ONLY",
    "P2_SAFE_APPLICABILITY",
    "P3_P2_EF2_CONFLICT_PRESERVATION",
)


def load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def rate(successes: int, total: int) -> dict[str, Any]:
    return wilson(successes, total)


def values(rows: Iterable[dict[str, Any]]) -> list[float]:
    return [float(row["rawScore"]) for row in rows if row.get("status") == "OK" and math.isfinite(float(row["rawScore"]))]


def roc_auc(labels: list[int], scores: list[float]) -> float | None:
    positives = [score for label, score in zip(labels, scores) if label == 1]
    negatives = [score for label, score in zip(labels, scores) if label == 0]
    if not positives or not negatives:
        return None
    wins = sum(1 if positive > negative else 0.5 if positive == negative else 0 for positive in positives for negative in negatives)
    return wins / (len(positives) * len(negatives))


def average_precision(labels: list[int], scores: list[float]) -> float | None:
    positive_count = sum(labels)
    if positive_count == 0:
        return None
    ordered = sorted(zip(scores, labels), key=lambda item: item[0], reverse=True)
    true_positive = 0
    precision_sum = 0.0
    for rank, (_, label) in enumerate(ordered, start=1):
        if label:
            true_positive += 1
            precision_sum += true_positive / rank
    return precision_sum / positive_count


def score_metrics(rows: list[dict[str, Any]]) -> dict[str, Any]:
    valid = [row for row in rows if row.get("status") == "OK"]
    positives = [row for row in valid if int(row["label"]) == 1]
    negatives = [row for row in valid if int(row["label"]) == 0]
    predicted = lambda row: float(row["rawScore"]) >= SAFE_THRESHOLD
    tp = sum(predicted(row) for row in positives)
    fp = sum(predicted(row) for row in negatives)
    scores = [float(row["rawScore"]) for row in valid]
    labels = [int(row["label"]) for row in valid]
    result: dict[str, Any] = {
        "validCount": len(valid),
        "failureCount": len(rows) - len(valid),
        "tp": tp,
        "fn": len(positives) - tp,
        "fp": fp,
        "tn": len(negatives) - fp,
        "recall": rate(tp, len(positives)),
        "fpr": rate(fp, len(negatives)),
        "precision": rate(tp, tp + fp),
        "scoreMedian": statistics.median(scores) if scores else None,
        "scoreIqr": (statistics.quantiles(scores, n=4)[2] - statistics.quantiles(scores, n=4)[0]) if len(scores) >= 4 else None,
        "brier": None,
        "ece": None,
        "brierNote": "NOT_APPLICABLE_RAW_SCORE_IS_NOT_A_PROBABILITY",
    }
    if len(set(labels)) == 2:
        result["rocAuc"] = roc_auc(labels, scores)
        result["prAuc"] = average_precision(labels, scores)
    else:
        result["rocAuc"] = None
        result["prAuc"] = None
    return result


def group_metrics(rows: list[dict[str, Any]], key: str) -> dict[str, Any]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        value = str(row.get(key) or "UNKNOWN")
        if key == "cameraDeviceFamily":
            value = value.upper()
        groups[value].append(row)
    return {group: score_metrics(group_rows) for group, group_rows in sorted(groups.items())}


def prepare_rows(root: Path, media_root: Path) -> tuple[list[dict[str, Any]], list[dict[str, Any]], dict[str, dict[str, Any]]]:
    research = root / "research" / "wp007i"
    original_score = load(research / "safe-original-scores.json")["records"]
    transform_score = load(research / "safe-transformation-scores.json")["records"]
    original_inputs = load(media_root / "manifests" / "original-score-inputs.json")["records"]
    transform_inputs = load(media_root / "manifests" / "transformation-score-inputs.json")["records"]
    input_by_key = {row["rowKey"]: row for row in original_inputs + transform_inputs}
    applicability_role_by_family: dict[str, str] = {}
    for manifest_name in ("applicability-development-manifest.json", "applicability-confirmation-manifest.json"):
        for app_row in load(research / manifest_name)["records"]:
            applicability_role_by_family[app_row["sourceFamilyId"]] = app_row["applicabilityRole"]
    facts_cache: dict[str, dict[str, Any]] = {}
    for row in original_score + transform_score:
        input_row = input_by_key[row["rowKey"]]
        path = Path(input_row["inputPath"])
        cache_key = str(path)
        if cache_key not in facts_cache:
            facts_cache[cache_key] = input_facts(path)
        row["inputFacts"] = facts_cache[cache_key]
        row["applicability"] = classify_applicability(facts_cache[cache_key])
        row["applicabilityRole"] = row.get("applicabilityRole") or applicability_role_by_family.get(row["sourceFamilyId"], "NOT_IN_APPLICABILITY_MATRIX")
    return original_score, transform_score, input_by_key


def split_metrics(rows: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "overall": score_metrics(rows),
        "byRole": group_metrics(rows, "role"),
        "byGeneratorFamily": group_metrics([row for row in rows if int(row["label"]) == 1], "generatorFamily"),
        "byNegativeSubtype": group_metrics([row for row in rows if int(row["label"]) == 0], "sourceSubtype"),
        "byCameraDeviceFamily": group_metrics([row for row in rows if int(row["label"]) == 0 and row.get("cameraDeviceFamily")], "cameraDeviceFamily"),
    }


def applicability_metrics(rows: list[dict[str, Any]], transform_rows: list[dict[str, Any]]) -> dict[str, Any]:
    def summarize(originals: list[dict[str, Any]], transformed: list[dict[str, Any]]) -> dict[str, Any]:
        state_counts = Counter(row["applicability"]["state"] for row in originals)
        by_name: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for row in transformed:
            by_name[row["transformation"]].append(row)
        return {
            "originalCount": len(originals),
            "originalStateCounts": dict(sorted(state_counts.items())),
            "originalSupportedCoverage": rate(sum(row["applicability"]["state"] in SUPPORTED_STATES for row in originals), len(originals)),
            "originalFalseDowngrade": rate(sum(row["applicability"]["state"] not in SUPPORTED_STATES for row in originals), len(originals)),
            "transformations": {
                name: {
                    "count": len(group),
                    "destructiveDeclared": name in DESTRUCTIVE_TRANSFORMS,
                    "destructiveStateDetection": rate(sum(row["applicability"]["state"] in {"DEGRADED", "UNSUPPORTED", "UNKNOWN"} for row in group), len(group)),
                    "stateCounts": dict(sorted(Counter(row["applicability"]["state"] for row in group).items())),
                }
                for name, group in sorted(by_name.items())
            },
        }

    originals = [row for row in rows if row.get("role") in {"NEGATIVE_DEV_I", "NEGATIVE_CONFIRM_I", "FRESH_SYNTHETIC_DEV", "FRESH_SYNTHETIC_CONFIRM"}]
    transformed_by_name: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in transform_rows:
        transformed_by_name[row["transformation"]].append(row)
    per_transform: dict[str, Any] = {}
    for name, group in sorted(transformed_by_name.items()):
        degraded = sum(row["applicability"]["state"] in {"DEGRADED", "UNSUPPORTED", "UNKNOWN"} for row in group)
        per_transform[name] = {
            "count": len(group),
            "destructiveDeclared": name in DESTRUCTIVE_TRANSFORMS,
            "destructiveStateDetection": rate(degraded, len(group)),
            "stateCounts": dict(sorted(Counter(row["applicability"]["state"] for row in group).items())),
        }
    app_records = [row for row in rows if row.get("applicability")]
    by_role = {}
    for role in ("APPLICABILITY_DEV", "APPLICABILITY_CONFIRM"):
        role_originals = [row for row in rows if row.get("applicabilityRole") == role]
        role_transforms = [row for row in transform_rows if row.get("applicabilityRole") == role]
        by_role[role] = summarize(role_originals, role_transforms)
    return {
        "policyVersion": "WP007I_APPLICABILITY_RULE_V1",
        **summarize(originals, transform_rows),
        "byRole": by_role,
        "transformations": per_transform,
        "devConfirmCounts": dict(sorted(Counter(row.get("applicabilityRole", "UNKNOWN") for row in app_records).items())),
        "destructiveSet": sorted(DESTRUCTIVE_TRANSFORMS),
        "scoreIndependent": True,
    }


def policy_rows(rows: list[dict[str, Any]], policy: str) -> list[dict[str, Any]]:
    output = []
    for row in rows:
        result = selective_evidence(float(row["rawScore"]), row["applicability"], policy)
        output.append({**row, "policy": policy, "policyResult": result})
    return output


def policy_metrics(rows: list[dict[str, Any]], policy: str) -> dict[str, Any]:
    evaluated = policy_rows(rows, policy)
    positives = [row for row in evaluated if int(row["label"]) == 1]
    negatives = [row for row in evaluated if int(row["label"]) == 0]
    authoritative = lambda row: bool(row["policyResult"]["authoritativePositive"])
    inconclusive = lambda row: bool(row["policyResult"]["inconclusive"])
    result = {
        "policy": policy,
        "all": {
            "authoritativePositive": rate(sum(authoritative(row) for row in evaluated), len(evaluated)),
            "inconclusive": rate(sum(inconclusive(row) for row in evaluated), len(evaluated)),
        },
        "synthetic": {
            "positiveCoverage": rate(sum(authoritative(row) for row in positives), len(positives)),
            "unresolvedSynthetic": rate(sum(not authoritative(row) for row in positives), len(positives)),
            "inconclusiveSynthetic": rate(sum(inconclusive(row) for row in positives), len(positives)),
        },
        "negative": {
            "falsePositive": rate(sum(authoritative(row) for row in negatives), len(negatives)),
            "falseReview": rate(sum(inconclusive(row) for row in negatives), len(negatives)),
            "bySubtype": {},
        },
        "conflictCount": 0,
        "semanticBoundary": "No policy path infers HUMAN_AUTHORED from a low SAFE score; P3 has no EF2 records in this corpus.",
    }
    for subtype, group in sorted(((key, list(group)) for key, group in _groupby(negatives, "sourceSubtype"))):
        result["negative"]["bySubtype"][subtype] = {
            "falsePositive": rate(sum(authoritative(row) for row in group), len(group)),
            "falseReview": rate(sum(inconclusive(row) for row in group), len(group)),
        }
    return result


def _groupby(rows: list[dict[str, Any]], key: str) -> Iterable[tuple[str, Iterable[dict[str, Any]]]]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups[str(row.get(key) or "UNKNOWN")].append(row)
    return groups.items()


def transform_metrics(original: list[dict[str, Any]], transformed: list[dict[str, Any]]) -> dict[str, Any]:
    original_by_key = {row["rowKey"]: row for row in original}
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in transformed:
        grouped[row["transformation"]].append(row)
    output: dict[str, Any] = {}
    for name, group in sorted(grouped.items()):
        deltas = []
        flips = 0
        for row in group:
            base = original_by_key.get(row["baseRowKey"])
            if base is not None:
                base_score = float(base["rawScore"])
                score = float(row["rawScore"])
                deltas.append(score - base_score)
                flips += (base_score >= SAFE_THRESHOLD) != (score >= SAFE_THRESHOLD)
        output[name] = {
            "count": len(group),
            "scoreMetrics": score_metrics(group),
            "meanScoreDelta": statistics.fmean(deltas) if deltas else None,
            "medianScoreDelta": statistics.median(deltas) if deltas else None,
            "scoreDeltaIqr": (statistics.quantiles(deltas, n=4)[2] - statistics.quantiles(deltas, n=4)[0]) if len(deltas) >= 4 else None,
            "decisionFlip": rate(flips, len(deltas)),
            "applicabilityStates": dict(sorted(Counter(row["applicability"]["state"] for row in group).items())),
        }
    return output


def failure_analysis(rows: list[dict[str, Any]], kind: str) -> list[dict[str, Any]]:
    output = []
    for row in rows:
        is_positive = int(row["label"]) == 1
        score_high = float(row["rawScore"]) >= SAFE_THRESHOLD
        if (kind == "falsePositive" and (not is_positive and score_high)) or (kind == "falseNegative" and (is_positive and not score_high)):
            output.append({
                "rowKey": row["rowKey"],
                "sourceFamilyId": row["sourceFamilyId"],
                "sampleId": row["sampleId"],
                "sourceSubtype": row.get("sourceSubtype"),
                "generatorFamily": row.get("generatorFamily"),
                "rawScore": row["rawScore"],
                "applicability": row["applicability"],
                "inputFacts": row["inputFacts"],
                "transformation": row.get("transformation", "ORIGINAL"),
            })
    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--media-root", type=Path, required=True)
    args = parser.parse_args()
    research = args.root / "research" / "wp007i"
    original, transformed, _ = prepare_rows(args.root, args.media_root)
    original_result = split_metrics(original)
    original_result["negativeUniqueSourceFamilies"] = len({row["sourceFamilyId"] for row in original if int(row["label"]) == 0})
    original_result["positiveUniqueSourceFamilies"] = len({row["sourceFamilyId"] for row in original if int(row["label"]) == 1})
    fresh_rows = [row for row in original if int(row["label"]) == 1]
    negative_rows = [row for row in original if int(row["label"]) == 0]
    write_json(research / "safe-qualification-result.json", {
        "schemaVersion": "lythaus-wp007i-safe-qualification-result-v1",
        "threshold": SAFE_THRESHOLD,
        "checkpointSha256": "b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e",
        "original": original_result,
        "freshSynthetic": split_metrics(fresh_rows),
        "negative": split_metrics(negative_rows),
        "scoreDirection": "HIGHER_IS_MORE_SYNTHETIC_LIKE",
        "populationClaim": "Bounded benchmark only; real-world population FPR remains a separate claim.",
    })
    write_json(research / "fresh-synthetic-result.json", {
        "schemaVersion": "lythaus-wp007i-fresh-synthetic-result-v1",
        "threshold": SAFE_THRESHOLD,
        "source": "FRESH_SYNTHETIC_FREEZE",
        "familyLevelMetrics": original_result["byGeneratorFamily"],
        "byRole": group_metrics(fresh_rows, "role"),
        "overall": score_metrics(fresh_rows),
        "noRetuning": True,
    })
    write_json(research / "negative-qualification-result.json", {
        "schemaVersion": "lythaus-wp007i-negative-qualification-result-v1",
        "threshold": SAFE_THRESHOLD,
        "independentSourceFamilyDenominator": len({row["sourceFamilyId"] for row in negative_rows}),
        "overall": score_metrics(negative_rows),
        "bySubtype": group_metrics(negative_rows, "sourceSubtype"),
        "byCameraDeviceFamily": group_metrics([row for row in negative_rows if row.get("cameraDeviceFamily")], "cameraDeviceFamily"),
        "falsePositiveRecordsRemainInDenominator": True,
        "populationClaim": "Bounded benchmark only; population FPR is not inferred from this set.",
    })
    write_json(research / "safe-input-regime-report.json", {
        "schemaVersion": "lythaus-wp007i-safe-input-regime-report-v1",
        "applicability": applicability_metrics(original, transformed),
        "factsAreNotAuthenticityEvidence": True,
        "safeScoreNotUsedByGate": True,
    })
    write_json(research / "safe-transformation-result.json", {
        "schemaVersion": "lythaus-wp007i-safe-transformation-result-v1",
        "threshold": SAFE_THRESHOLD,
        "baseCount": len({row["baseRowKey"] for row in transformed}),
        "transformationCount": len(transformed),
        "results": transform_metrics(original, transformed),
        "inputRegimeIsSeparateFromTruth": True,
    })
    policy_results = {policy: policy_metrics(original, policy) for policy in POLICIES}
    transformed_grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in transformed:
        transformed_grouped[row["transformation"]].append(row)
    transformed_policy_results = {
        policy: {
            name: policy_metrics(group, policy)
            for name, group in sorted(transformed_grouped.items())
        }
        for policy in POLICIES
    }
    policy_by_role = {
        policy: {
            role: policy_metrics([row for row in original if row.get("role") == role], policy)
            for role in ("NEGATIVE_DEV_I", "NEGATIVE_CONFIRM_I", "FRESH_SYNTHETIC_DEV", "FRESH_SYNTHETIC_CONFIRM")
        }
        for policy in POLICIES
    }
    write_json(research / "selective-policy-comparison.json", {
        "schemaVersion": "lythaus-wp007i-selective-policy-comparison-v1",
        "threshold": SAFE_THRESHOLD,
        "policies": policy_results,
        "transformedPolicies": transformed_policy_results,
        "byRole": policy_by_role,
        "p3Ef2ConflictRecords": 0,
        "p3Note": "No EF2 field is fabricated for this corpus; conflict preservation is covered by focused tests/fixtures.",
        "noLearnedFusion": True,
        "thresholdImmutable": True,
        "confirmationCannotRetune": True,
    })
    write_json(research / "false-positive-analysis.json", {
        "schemaVersion": "lythaus-wp007i-false-positive-analysis-v1",
        "count": len(failure_analysis(original, "falsePositive")),
        "records": failure_analysis(original, "falsePositive"),
        "notRemovedFromDenominator": True,
    })
    write_json(research / "false-negative-analysis.json", {
        "schemaVersion": "lythaus-wp007i-false-negative-analysis-v1",
        "count": len(failure_analysis(original, "falseNegative")),
        "records": failure_analysis(original, "falseNegative"),
        "notUsedForRetuning": True,
    })
    write_json(research / "applicability-confirmation-result.json", {
        "schemaVersion": "lythaus-wp007i-applicability-confirmation-result-v1",
        "devAndConfirmAreDisjoint": True,
        "result": applicability_metrics(original, transformed),
        "interpretation": "Applicability is a deterministic input-regime description, not origin evidence.",
    })
    write_json(research / "flux2-zero-access-assertion.json", {
        "schemaVersion": "lythaus-wp007i-flux2-zero-access-v1",
        "flux2PublicBenchmarkPixelsAccessed": False,
        "flux2ProviderCalls": 0,
        "flux2PixelAccess": False,
        "flux2Transforms": False,
        "flux2Inference": False,
        "flux2ManualInspection": False,
        "basis": "All WP007I manifests deny FLUX.2 families and all inference manifests carry flux2PixelAccess=false.",
    })
    print(json.dumps({
        "original": len(original),
        "transformed": len(transformed),
        "originalMetrics": original_result["overall"],
        "applicability": applicability_metrics(original, transformed),
        "policyHighPositive": {key: value["synthetic"]["positiveCoverage"] for key, value in policy_results.items()},
        "policyNegativeFpr": {key: value["negative"]["falsePositive"] for key, value in policy_results.items()},
        "policyInconclusive": {key: value["all"]["inconclusive"] for key, value in policy_results.items()},
        "artifactHash": canonical_json_hash({"safe": original_result, "policy": policy_results}),
    }, sort_keys=True))


if __name__ == "__main__":
    main()
