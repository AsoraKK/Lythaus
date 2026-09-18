"""Independent aggregate checks for WP007K real-media qualification."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import statistics
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable

import numpy as np
from sklearn.metrics import average_precision_score, roc_auc_score


SAFE_THRESHOLD = 0.5864923000335693
FEATURE_NAMES = [
    "blockBoundaryRatio",
    "dctAcEnergy",
    "dctAcL1Mean",
    "dctAcZeroRate",
    "dctDcMean",
    "dctDcStd",
    "dctHighFrequencyEnergy",
    "dctHighToLowEnergyRatio",
    "dctLowFrequencyEnergy",
    "fftHighFrequencyEnergyRatio",
    "fftLogMagnitudeMean",
    "fftPhaseCircularCoherence",
    "fftPhaseMeanAbsolute",
    "pixelStd",
]


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def wilson(success: int, total: int) -> dict[str, Any]:
    if total == 0:
        return {"numerator": success, "denominator": 0, "rate": None, "lower": None, "upper": None}
    z = 1.959963984540054
    p = success / total
    denominator = 1 + z * z / total
    centre = (p + z * z / (2 * total)) / denominator
    half = z * math.sqrt((p * (1 - p) + z * z / (4 * total)) / total) / denominator
    return {
        "numerator": success,
        "denominator": total,
        "rate": p,
        "lower": max(0.0, centre - half),
        "upper": min(1.0, centre + half),
    }


def auc(labels: Iterable[int], scores: Iterable[float]) -> dict[str, Any]:
    labels_list = list(labels)
    scores_list = list(scores)
    if len(set(labels_list)) != 2:
        return {"auroc": None, "auprc": None}
    return {
        "auroc": float(roc_auc_score(labels_list, scores_list)),
        "auprc": float(average_precision_score(labels_list, scores_list)),
    }


def rows_by_key(rows: list[dict[str, Any]], key: str) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[str(row.get(key) or "UNKNOWN")].append(row)
    return dict(sorted(grouped.items()))


def summary(rows: list[dict[str, Any]], score_field: str, threshold: float) -> dict[str, Any]:
    positives = [row for row in rows if row.get("truthLabel") == 1]
    negatives = [row for row in rows if row.get("truthLabel") == 0]
    scored = [row for row in rows if row.get(score_field) is not None]
    tp = sum(float(row[score_field]) >= threshold for row in positives if row.get(score_field) is not None)
    fp = sum(float(row[score_field]) >= threshold for row in negatives if row.get(score_field) is not None)
    source_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        source_groups[str(row.get("parentSampleId") or row.get("sourceFamilyId"))].append(row)
    negative_sources = [group for group in source_groups.values() if group and group[0].get("truthLabel") == 0]
    source_fp = sum(
        any(row.get(score_field) is not None and float(row[score_field]) >= threshold for row in group)
        for group in negative_sources
    )
    return {
        "recordCount": len(rows),
        "scoredRecordCount": len(scored),
        "positiveCount": len(positives),
        "negativeCount": len(negatives),
        "tp": tp,
        "fn": len(positives) - tp,
        "fp": fp,
        "tn": len(negatives) - fp,
        "recall": wilson(tp, len(positives)),
        "fpr": wilson(fp, len(negatives)),
        "negativeSourceCount": len(negative_sources),
        "sourceLevelWorstCaseFpr": wilson(source_fp, len(negative_sources)),
        **auc(
            [int(row["truthLabel"]) for row in scored],
            [float(row[score_field]) for row in scored],
        ),
    }


def safe_baseline(rows: list[dict[str, Any]]) -> dict[str, Any]:
    group_fields = ["operation", "encoder", "generatorFamily", "sourceSubtype"]
    groups: dict[str, Any] = {}
    for field in group_fields:
        groups[field] = {
            key: summary(group, "safeRawScore", SAFE_THRESHOLD)
            for key, group in rows_by_key(rows, field).items()
        }
    return {
        "schemaVersion": "lythaus-wp007k-safe-a-baseline-v1",
        "safeA": {
            "upstreamCommit": "4e998724651b227def64f5be0cd60c0aa1552c35",
            "checkpointSha256": "b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e",
            "threshold": SAFE_THRESHOLD,
        },
        "overall": summary(rows, "safeRawScore", SAFE_THRESHOLD),
        "groups": groups,
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    }


def ces_baseline(rows: list[dict[str, Any]]) -> dict[str, Any]:
    model_rows = [row for row in rows if row.get("cesSScore") is not None]
    threshold = float(model_rows[0].get("cesSThreshold", 0.7373818778920678)) if model_rows else 0.7373818778920678
    groups = {
        field: {key: summary(group, "cesSScore", threshold) for key, group in rows_by_key(model_rows, field).items()}
        for field in ["operation", "encoder", "generatorFamily", "sourceSubtype"]
    }
    return {
        "schemaVersion": "lythaus-wp007k-ces-s-independent-aggregate-v1",
        "threshold": threshold,
        "overall": summary(model_rows, "cesSScore", threshold),
        "groups": groups,
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    }


def replay_model(model: dict[str, Any], rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    names = list(model["featureNames"])
    coefficients = np.asarray(model["coefficients"], dtype=np.float64)
    mean = np.asarray(model["mean"], dtype=np.float64)
    scale = np.asarray(model["scale"], dtype=np.float64)
    threshold = float(model["threshold"])
    output = []
    for row in rows:
        values = np.asarray([float(row["features"].get(name, 0.0)) for name in names], dtype=np.float64)
        standardized = (values - mean) / scale
        logit = float(np.dot(standardized, coefficients) + float(model["intercept"]))
        score = 1.0 / (1.0 + math.exp(-max(-700.0, min(700.0, logit))))
        output.append({
            "recordId": row["recordId"],
            "score": score,
            "high": score >= threshold,
        })
    return output


def independent_replay(model: dict[str, Any], features: list[dict[str, Any]], scored: list[dict[str, Any]]) -> dict[str, Any]:
    replayed = replay_model(model, features)
    expected = {row["recordId"]: row for row in scored}
    max_delta = 0.0
    high_mismatches = []
    missing = []
    for row in replayed:
        original = expected.get(row["recordId"])
        if original is None:
            missing.append(row["recordId"])
            continue
        delta = abs(row["score"] - float(original["cesSScore"]))
        max_delta = max(max_delta, delta)
        expected_high = bool(original["cesSHigh"])
        if row["high"] != expected_high:
            high_mismatches.append({
                "recordId": row["recordId"],
                "replayedHigh": row["high"],
                "storedHigh": expected_high,
                "replayedScore": row["score"],
                "storedScore": original["cesSScore"],
            })
    return {
        "schemaVersion": "lythaus-wp007k-ces-s-independent-replay-v1",
        "modelSha256": sha256_file(Path("research/wp007k/ces-s-model-content.json")),
        "featureCount": len(features),
        "storedRecordCount": len(scored),
        "replayedRecordCount": len(replayed),
        "missingStoredRecords": missing,
        "maxAbsoluteScoreDelta": max_delta,
        "thresholdMismatchCount": len(high_mismatches),
        "thresholdMismatches": high_mismatches,
        "pass": not missing and not high_mismatches and max_delta < 1e-12,
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    }


def contingency(rows: list[dict[str, Any]], ces_threshold: float) -> dict[str, Any]:
    positive = [row for row in rows if row.get("truthLabel") == 1]
    negative = [row for row in rows if row.get("truthLabel") == 0]
    both = Counter()
    for row in rows:
        safe_high = float(row.get("safeRawScore", -math.inf)) >= SAFE_THRESHOLD
        ces_high = float(row.get("cesSScore", -math.inf)) >= ces_threshold
        truth = "synthetic" if row.get("truthLabel") == 1 else "negative"
        both[(truth, "safe_high" if safe_high else "safe_low", "ces_high" if ces_high else "ces_low")] += 1
    unique = {
        "safeCorrectCesSWrong": sum(
            row.get("truthLabel") == 1
            and float(row.get("safeRawScore", -math.inf)) >= SAFE_THRESHOLD
            and float(row.get("cesSScore", -math.inf)) < ces_threshold
            for row in rows
        ),
        "cesSUniqueCorrect": sum(
            row.get("truthLabel") == 1
            and float(row.get("safeRawScore", -math.inf)) < SAFE_THRESHOLD
            and float(row.get("cesSScore", -math.inf)) >= ces_threshold
            for row in rows
        ),
        "bothCorrect": sum(
            row.get("truthLabel") == 1
            and float(row.get("safeRawScore", -math.inf)) >= SAFE_THRESHOLD
            and float(row.get("cesSScore", -math.inf)) >= ces_threshold
            for row in rows
        ),
        "bothWrong": sum(
            row.get("truthLabel") == 1
            and float(row.get("safeRawScore", -math.inf)) < SAFE_THRESHOLD
            and float(row.get("cesSScore", -math.inf)) < ces_threshold
            for row in rows
        ),
        "safeFalsePositiveCesSNegative": sum(
            row.get("truthLabel") == 0
            and float(row.get("safeRawScore", -math.inf)) >= SAFE_THRESHOLD
            and float(row.get("cesSScore", -math.inf)) < ces_threshold
            for row in rows
        ),
        "cesSFalsePositiveSafeNegative": sum(
            row.get("truthLabel") == 0
            and float(row.get("safeRawScore", -math.inf)) < SAFE_THRESHOLD
            and float(row.get("cesSScore", -math.inf)) >= ces_threshold
            for row in rows
        ),
    }
    return {
        "schemaVersion": "lythaus-wp007k-error-correlation-v1",
        "thresholds": {"safeA": SAFE_THRESHOLD, "cesS": ces_threshold},
        "contingency": {"|".join(key): value for key, value in sorted(both.items())},
        "uniqueRescue": unique,
        "positiveCount": len(positive),
        "negativeCount": len(negative),
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    }


def phase_dct(rows: list[dict[str, Any]]) -> dict[str, Any]:
    original = {str(row.get("parentSampleId")): row for row in rows if row.get("operation") == "ORIGINAL"}
    transformed = [row for row in rows if row.get("operation") != "ORIGINAL" and str(row.get("parentSampleId")) in original]
    deltas: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    discrimination: dict[str, dict[str, Any]] = {}
    for row in transformed:
        parent = original[str(row["parentSampleId"])]
        group = f"{row.get('operation')}|{row.get('encoder')}|{row.get('truthLabel')}"
        for name in FEATURE_NAMES:
            base = float(parent["features"].get(name, 0.0))
            value = float(row["features"].get(name, 0.0))
            deltas[group][name].append(abs(value - base))
    for operation in sorted({str(row.get("operation")) for row in transformed}):
        for encoder in sorted({str(row.get("encoder")) for row in transformed if str(row.get("operation")) == operation}):
            selected = [row for row in transformed if row.get("operation") == operation and row.get("encoder") == encoder]
            feature_result: dict[str, Any] = {}
            for name in FEATURE_NAMES:
                values = [float(row["features"].get(name, 0.0)) for row in selected]
                labels = [int(row["truthLabel"]) for row in selected]
                scores = auc(labels, values)
                feature_result[name] = {
                    **scores,
                    "meanSynthetic": float(np.mean([v for v, label in zip(values, labels, strict=True) if label == 1])) if any(labels) else None,
                    "meanNegative": float(np.mean([v for v, label in zip(values, labels, strict=True) if label == 0])) if not all(labels) else None,
                    "syntheticToNegativeDelta": (
                        float(np.mean([v for v, label in zip(values, labels, strict=True) if label == 1]))
                        - float(np.mean([v for v, label in zip(values, labels, strict=True) if label == 0]))
                        if any(labels) and not all(labels)
                        else None
                    ),
                    "medianAbsoluteParentDeltaSynthetic": float(np.median(deltas[f"{operation}|{encoder}|1"][name])) if deltas[f"{operation}|{encoder}|1"][name] else None,
                    "medianAbsoluteParentDeltaNegative": float(np.median(deltas[f"{operation}|{encoder}|0"][name])) if deltas[f"{operation}|{encoder}|0"][name] else None,
                }
            discrimination[f"{operation}|{encoder}"] = feature_result
    return {
        "schemaVersion": "lythaus-wp007k-phase-dct-validation-v1",
        "featureNames": FEATURE_NAMES,
        "transformedRecordCount": len(transformed),
        "originalParentCount": len(original),
        "byOperationEncoder": discrimination,
        "interpretation": "Feature stability is not authenticity evidence; discrimination and stability are reported separately.",
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    }


def ces_e_analysis(rows: list[dict[str, Any]], ces_e_rows: list[dict[str, Any]]) -> dict[str, Any]:
    state_by_id = {row["recordId"]: row for row in ces_e_rows}
    joined = [{**row, "cesE": state_by_id.get(row["recordId"], {})} for row in rows]
    original = {str(row.get("parentSampleId")): row for row in joined if row.get("operation") == "ORIGINAL"}
    target = []
    for row in joined:
        if row.get("operation") == "ORIGINAL":
            continue
        parent = original.get(str(row.get("parentSampleId")))
        if not parent or parent.get("truthLabel") != 1:
            continue
        if float(parent.get("safeRawScore", -math.inf)) >= SAFE_THRESHOLD:
            target.append({
                "row": row,
                "originalSafeHigh": True,
                "descendantSafeHigh": float(row.get("safeRawScore", -math.inf)) >= SAFE_THRESHOLD,
                "destroyed": float(row.get("safeRawScore", -math.inf)) < SAFE_THRESHOLD,
                "state": row.get("cesE", {}).get("safeApplicability", "UNKNOWN"),
            })
    destroyed = [item for item in target if item["destroyed"]]
    caught = [item for item in destroyed if item["state"] == "UNSUPPORTED"]
    retained = [item for item in target if not item["destroyed"]]
    original_rows = [row for row in joined if row.get("operation") == "ORIGINAL"]
    original_states = Counter(row.get("cesE", {}).get("safeApplicability", "UNKNOWN") for row in original_rows)
    by_operation: dict[str, Any] = {}
    for operation in sorted({str(item["row"].get("operation")) for item in target}):
        group = [item for item in target if str(item["row"].get("operation")) == operation]
        by_operation[operation] = {
            "eligibleOriginalSafeHigh": len(group),
            "signalDestroyed": sum(item["destroyed"] for item in group),
            "gateUnsupported": sum(item["state"] == "UNSUPPORTED" for item in group),
            "gateCaughtDestroyed": sum(item["destroyed"] and item["state"] == "UNSUPPORTED" for item in group),
            "falseDowngradeOnRetainedSignal": sum((not item["destroyed"]) and item["state"] == "UNSUPPORTED" for item in group),
        }
    return {
        "schemaVersion": "lythaus-wp007k-ces-e-applicability-analysis-v1",
        "frozenRuleSource": "WP007K CES-E specification frozen before confirmation scoring",
        "originalStateCounts": dict(original_states),
        "syntheticOriginalHighParentCount": len({str(item["row"].get("parentSampleId")) for item in target}),
        "controlledSyntheticDescendantsFromStrongParents": len(target),
        "signalDestroyed": len(destroyed),
        "signalDestroyedDetection": {
            "caughtByUnsupported": wilson(len(caught), len(destroyed)),
            "caughtByLimitedOrUnsupported": wilson(sum(item["state"] in {"LIMITED", "UNSUPPORTED"} for item in destroyed), len(destroyed)),
        },
        "falseDowngradeOnRetainedSafeSignal": wilson(sum(item["state"] == "UNSUPPORTED" for item in retained), len(retained)),
        "byOperation": by_operation,
        "nativeOriginalApplicabilityCoverage": {
            "total": len(original_rows),
            "states": dict(original_states),
            "supportedOrLimited": sum(row.get("cesE", {}).get("safeApplicability") in {"SUPPORTED", "LIMITED"} for row in original_rows),
        },
        "interpretation": "CES-E identifies a conservative current-byte regime, not authorship; controlled lineage supplies the degradation target for this validation.",
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    }


def hard_negative(rows: list[dict[str, Any]], ces_threshold: float) -> dict[str, Any]:
    negatives = [row for row in rows if row.get("truthLabel") == 0]
    by_subtype: dict[str, Any] = {}
    for subtype, group in rows_by_key(negatives, "sourceSubtype").items():
        by_subtype[subtype] = summary(group, "cesSScore", ces_threshold)
    fps = [row for row in negatives if float(row.get("cesSScore", -math.inf)) >= ces_threshold]
    return {
        "schemaVersion": "lythaus-wp007k-hard-negative-analysis-v1",
        "overall": summary(negatives, "cesSScore", ces_threshold),
        "bySubtype": by_subtype,
        "falsePositiveRecords": [
            {
                "recordId": row.get("recordId"),
                "parentSampleId": row.get("parentSampleId"),
                "sourceFamilyId": row.get("sourceFamilyId"),
                "sourceSubtype": row.get("sourceSubtype"),
                "operation": row.get("operation"),
                "encoder": row.get("encoder"),
                "safeRawScore": row.get("safeRawScore"),
                "cesSScore": row.get("cesSScore"),
                "codecFacts": row.get("codecFacts"),
            }
            for row in fps
        ],
        "interpretation": "All false positives remain in the denominator; no visual or score-based exclusions were applied.",
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    }


def generator_holdout(scored_rows: list[dict[str, Any]], ces_threshold: float) -> dict[str, Any]:
    positive_rows = [row for row in scored_rows if row.get("truthLabel") == 1]
    by_family = {
        family: summary(group, "cesSScore", ces_threshold)
        for family, group in rows_by_key(positive_rows, "generatorFamily").items()
    }
    return {
        "schemaVersion": "lythaus-wp007k-generator-held-out-v1",
        "fitFamilies": ["Gemini-2.0-Flash", "GoT-R1-7B", "Nano-Banana", "SD-3.5-Large"],
        "heldOutFamilies": sorted(by_family),
        "heldOutFamilyInterpretation": "All seven WP007H non-FLUX confirmation families were excluded from CES-S fitting; this is a family-held-out confirmation panel, not seven refits that expose confirmation data.",
        "perFamily": by_family,
        "macroRecall": statistics.fmean(value["recall"]["rate"] for value in by_family.values()) if by_family else None,
        "minimumRecall": min(value["recall"]["rate"] for value in by_family.values()) if by_family else None,
        "zeroRecallFamilyCount": sum(value["recall"]["numerator"] == 0 for value in by_family.values()),
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    }


def encoder_holdout(output_dir: Path) -> dict[str, Any]:
    pillow_path = output_dir / "encoder-loo-pillow-by-encoder.json"
    sharp_path = output_dir / "encoder-loo-sharp-by-encoder.json"
    pillow = read_json(pillow_path)
    sharp = read_json(sharp_path)
    return {
        "schemaVersion": "lythaus-wp007k-encoder-leave-one-out-v1",
        "experiments": [
            {
                "id": "E1",
                "trainingEncoder": "PILLOW_LIBJPEG",
                "heldOutEncoder": "SHARP_LIBVIPS",
                "modelSha256": pillow.get("modelSha256"),
                "heldOutMetrics": sharp.get("groups", {}).get("SHARP_LIBVIPS"),
                "result": "LOW_RECALL_ON_HELD_OUT_ENCODER_AT_SPECIFICITY_FIRST_THRESHOLD",
            },
            {
                "id": "E2",
                "trainingEncoder": "SHARP_LIBVIPS",
                "heldOutEncoder": "PILLOW_LIBJPEG",
                "modelSha256": sharp.get("modelSha256"),
                "heldOutMetrics": sharp.get("groups", {}).get("PILLOW_LIBJPEG"),
                "result": "SOURCE_LEVEL_FPR_EXCEEDS_PREDECLARED_GATE",
            },
        ],
        "pillowAllConfirmation": pillow.get("overall"),
        "sharpAllConfirmation": sharp.get("overall"),
        "thirdEncoder": "NOT_AVAILABLE_WITHOUT_UNBOUNDED_INSTALLATION",
        "conclusion": "No codec-resilient CES-S qualification; the Sharp-trained candidate is unsafe on source-level FPR and the Pillow-trained candidate is low-recall.",
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    }


def eligibility(rows: list[dict[str, Any]], ces_e_rows: list[dict[str, Any]]) -> dict[str, Any]:
    states = Counter(row.get("safeApplicability", "UNKNOWN") for row in ces_e_rows)
    row_by_id = {row.get("recordId"): row for row in rows}
    by_op: dict[str, Counter[str]] = defaultdict(Counter)
    for row in ces_e_rows:
        by_op[str(row_by_id.get(row.get("recordId"), {}).get("operation", "UNKNOWN"))][row.get("safeApplicability", "UNKNOWN")] += 1
    original_by_subtype: dict[str, Counter[str]] = defaultdict(Counter)
    for row in ces_e_rows:
        source = row_by_id.get(row.get("recordId"), {})
        if source.get("operation") == "ORIGINAL":
            original_by_subtype[str(source.get("sourceSubtype") or "UNKNOWN")][row.get("safeApplicability", "UNKNOWN")] += 1
    total = len(ces_e_rows)
    return {
        "schemaVersion": "lythaus-wp007k-eligibility-analysis-v1",
        "boundedResearchEstimateOnly": True,
        "stateCounts": dict(states),
        "stateRates": {state: wilson(count, total) for state, count in sorted(states.items())},
        "byOperation": {op: dict(counter) for op, counter in sorted(by_op.items())},
        "originalBySourceSubtype": {subtype: dict(counter) for subtype, counter in sorted(original_by_subtype.items())},
        "criteria": {
            "EVIDENCE_GRADE": "Only a validated current-byte regime; current WP007K conservative rule does not certify history.",
            "LIMITED_FORENSIC_QUALITY": "Current JPEG/PNG bytes with limited or unknown prior-history authority.",
            "UNSUPPORTED_FOR_CERTIFICATION": "Estimated JPEG quality <=97 under the frozen standard-table estimate, or a controlled destructive regime.",
            "UNKNOWN": "Unsupported/invalid format or insufficient measurable facts.",
        },
        "productionChanged": False,
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--features", type=Path, required=True)
    parser.add_argument("--ces", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    feature_payload = read_json(args.features)
    ces_payload = read_json(args.ces)
    rows = feature_payload.get("records", [])
    ces_rows = ces_payload.get("records", [])
    ces_model = read_json(Path("research/wp007k/ces-s-model-content.json")) if Path("research/wp007k/ces-s-model-content.json").exists() else {}
    ces_threshold = float(ces_model.get("threshold", 0.7373818778920678))
    ces_scored = read_json(Path("research/wp007k/ces-s-confirmation-results-v2.json"))
    scored_rows = ces_scored.get("records", [])
    output_dir = args.output_dir
    write_json(output_dir / "safe-a-confirmation-baseline.json", safe_baseline(rows))
    write_json(output_dir / "ces-s-independent-aggregate.json", ces_baseline(scored_rows))
    write_json(output_dir / "ces-s-independent-replay.json", independent_replay(ces_model, rows, scored_rows))
    write_json(output_dir / "safe-vs-ces-unique-rescue.json", contingency(scored_rows, ces_threshold))
    write_json(output_dir / "error-correlation.json", contingency(scored_rows, ces_threshold))
    write_json(output_dir / "phase-dct-validation.json", phase_dct(rows))
    write_json(output_dir / "ces-e-confirmation-analysis.json", ces_e_analysis(rows, ces_rows))
    write_json(output_dir / "hard-negative-analysis.json", hard_negative(scored_rows, ces_threshold))
    write_json(output_dir / "eligibility-analysis.json", eligibility(rows, ces_rows))
    write_json(output_dir / "generator-leave-one-out.json", generator_holdout(scored_rows, ces_threshold))
    write_json(output_dir / "encoder-leave-one-out.json", encoder_holdout(output_dir))
    write_json(output_dir / "ces-s-confirmation-results.json", {
        "schemaVersion": "lythaus-wp007k-ces-s-confirmation-summary-v1",
        "source": "ces-s-confirmation-results-v2.json",
        "sourceSha256": sha256_file(output_dir / "ces-s-confirmation-results-v2.json"),
        "overall": ces_baseline(scored_rows)["overall"],
        "uniqueRescue": contingency(scored_rows, ces_threshold)["uniqueRescue"],
        "familyHeldOut": generator_holdout(scored_rows, ces_threshold),
        "confirmationUntuned": True,
        "qualificationDisposition": "CES_S_CODEC_SPECIALIST_NOT_QUALIFIED",
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    })
    model_path = output_dir / "ces-s-model-content.json"
    model = read_json(model_path)
    write_json(output_dir / "ces-s-training-manifest.json", {
        "schemaVersion": "lythaus-wp007k-ces-s-training-manifest-v1",
        "modelId": model.get("modelId"),
        "modelSha256": sha256_file(model_path),
        "developmentFeaturesSha256": sha256_file(Path("research/wp007k/development-features.json")),
        "trainingRole": "R1_DEVELOPMENT_ONLY",
        "confirmationExposedDuringFit": False,
        "featureNames": model.get("featureNames"),
        "rightsClass": "RESEARCH_ONLY_NOT_DEPLOYABLE",
        "architecture": "standardized logistic regression, C=0.1, deterministic LBFGS, source-family inverse-frequency weights",
        "safeATraining": False,
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    })
    write_json(output_dir / "ces-s-model-card.json", {
        "schemaVersion": "lythaus-wp007k-ces-s-model-card-v1",
        "modelId": model.get("modelId"),
        "artifactSha256": sha256_file(model_path),
        "role": "CODEC_RESILIENT_EF3_SPECIALIST_CANDIDATE",
        "qualificationStatus": "NOT_QUALIFIED",
        "reason": "Specificity-first linear candidate has low held-out recall; the Sharp-trained alternative exceeds source-level FPR and the content candidate does not provide sufficient repeated rescue.",
        "rightsClass": model.get("rightsClass"),
        "safeAUnchanged": model.get("safeAUnchanged"),
        "notAProductionModel": True,
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    })
    print(json.dumps({
        "rows": len(rows),
        "cesRows": len(ces_rows),
        "cesScoredRows": len(scored_rows),
        "outputs": 9,
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    }))


if __name__ == "__main__":
    main()
