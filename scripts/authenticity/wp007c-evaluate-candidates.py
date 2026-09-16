import argparse
import json
import math
import pathlib
import statistics
from collections import defaultdict


SEVERITY = {"LOW": 0, "MODERATE": 1, "HIGH": 2}


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    if not ordered:
        raise RuntimeError("PERCENTILE_EMPTY")
    position = (len(ordered) - 1) * fraction
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def pearson(xs: list[float], ys: list[float]) -> float | None:
    if len(xs) < 3:
        return None
    x_mean = statistics.fmean(xs)
    y_mean = statistics.fmean(ys)
    x_dev = [x - x_mean for x in xs]
    y_dev = [y - y_mean for y in ys]
    denominator = math.sqrt(sum(value * value for value in x_dev) * sum(value * value for value in y_dev))
    if denominator == 0:
        return None
    return sum(x * y for x, y in zip(x_dev, y_dev)) / denominator


def eta_squared(values: list[float], groups: list[str]) -> float | None:
    if len(values) < 3 or len(set(groups)) < 2:
        return None
    mean = statistics.fmean(values)
    between = 0.0
    total = 0.0
    grouped: dict[str, list[float]] = defaultdict(list)
    for value, group in zip(values, groups):
        grouped[group].append(value)
        total += (value - mean) ** 2
    for group_values in grouped.values():
        between += len(group_values) * (statistics.fmean(group_values) - mean) ** 2
    return between / total if total else None


def auc(positives: list[float], negatives: list[float]) -> float | None:
    if not positives or not negatives:
        return None
    wins = 0.0
    for positive in positives:
        for negative in negatives:
            wins += 1.0 if positive > negative else 0.5 if positive == negative else 0.0
    return wins / (len(positives) * len(negatives))


def average_precision(positives: list[float], negatives: list[float]) -> float | None:
    if not positives or not negatives:
        return None
    ranked = sorted([(score, 1) for score in positives] + [(score, 0) for score in negatives], reverse=True)
    seen_positive = 0
    total = 0.0
    for index, (_, label) in enumerate(ranked, start=1):
        if label:
            seen_positive += 1
            total += seen_positive / index
    return total / len(positives)


def p50(values: list[float]) -> float | None:
    return percentile(values, 0.50) if values else None


def p95(values: list[float]) -> float | None:
    return percentile(values, 0.95) if values else None


def risk_numeric(value: float | None) -> str:
    if value is None or abs(value) < 0.20:
        return "LOW"
    if abs(value) < 0.40:
        return "MODERATE"
    return "HIGH"


def risk_categorical(value: float | None) -> str:
    if value is None or value < 0.04:
        return "LOW"
    if value < 0.16:
        return "MODERATE"
    return "HIGH"


def max_risk(risks: dict[str, str]) -> str:
    return max(risks.values(), key=lambda risk: SEVERITY[risk]) if risks else "LOW"


def shortcut_audit(records: list[dict]) -> dict:
    by_label = {
        "synthetic": [record for record in records if record["label"] == 1],
        "negative": [record for record in records if record["label"] == 0],
    }
    numeric = {
        "dimensions": "width",
        "height": "height",
        "aspectRatio": "aspectRatio",
        "fileSize": "inputBytes",
    }
    evidence = {}
    risks = {}
    for name, key in numeric.items():
        correlations = {}
        for group_name, group_records in by_label.items():
            value = pearson([float(item[key]) for item in group_records], [item["score"] for item in group_records])
            if value is not None:
                correlations[group_name] = value
        strongest = max((abs(value) for value in correlations.values()), default=0.0)
        evidence[name] = {"withinClassPearson": correlations, "maxAbsolute": strongest}
        risk_name = "DIMENSION" if name == "dimensions" else name.upper()
        risks[risk_name + "_SHORTCUT_RISK"] = risk_numeric(strongest)

    categorical = {
        "format": (records, "inputFormat"),
        "metadataPresence": (by_label["negative"], "metadataPresence"),
        "sourceDataset": (by_label["negative"], "sourceDataset"),
        "digitalNegativeSubtype": ([record for record in records if record["sourceKind"] == "DEVELOPMENT_DIGITAL_NEGATIVES"], "digitalNegativeSubtype"),
    }
    for name, (scope, key) in categorical.items():
        values = [item["score"] for item in scope]
        groups = [str(item.get(key)) for item in scope]
        eta = eta_squared(values, groups)
        evidence[name] = {"etaSquared": eta, "groupCount": len(set(groups))}
        risks[name.upper() + "_SHORTCUT_RISK"] = risk_categorical(eta)
    return {
        "evidence": evidence,
        "risks": risks,
        "overallShortcutRisk": max_risk(risks),
    }


def evaluate(candidate_id: str, score_result: dict, input_records: list[dict]) -> dict:
    score_by_id = {record["sampleId"]: record for record in score_result["records"]}
    expected_ids = {record["sampleId"] for record in input_records}
    if set(score_by_id) != expected_ids or len(score_by_id) != 128:
        raise RuntimeError(f"SCORE_MEMBERSHIP_INVALID:{candidate_id}")
    rows = []
    for input_record in input_records:
        scored = score_by_id[input_record["sampleId"]]
        rows.append({**input_record, **scored, "aspectRatio": input_record["width"] / input_record["height"]})
    negatives = [row for row in rows if row["label"] == 0]
    synthetic = [row for row in rows if row["label"] == 1]
    camera = [row for row in rows if row["split"] == "developmentCamera"]
    digital = [row for row in rows if row["split"] == "developmentDigital"]
    threshold = percentile([row["score"] for row in negatives], 0.95)
    is_positive = lambda row: row["score"] >= threshold
    synthetic_recall = sum(is_positive(row) for row in synthetic) / len(synthetic)
    camera_fpr = sum(is_positive(row) for row in camera) / len(camera)
    digital_fpr = sum(is_positive(row) for row in digital) / len(digital)
    overall_fpr = sum(is_positive(row) for row in negatives) / len(negatives)
    camera_digital_auc = auc([row["score"] for row in digital], [row["score"] for row in camera])
    fpr_gap = digital_fpr - camera_fpr
    if abs(fpr_gap) > 0.25 or (camera_digital_auc is not None and (camera_digital_auc > 0.80 or camera_digital_auc < 0.20)):
        confounding = "HIGH"
    elif abs(fpr_gap) > 0.15 or (camera_digital_auc is not None and (camera_digital_auc > 0.65 or camera_digital_auc < 0.35)):
        confounding = "MODERATE"
    else:
        confounding = "LOW"
    shortcut = shortcut_audit(rows)
    runtimes = [row["runtimeSeconds"] for row in rows]
    stage_a_pass = all([
        synthetic_recall >= 0.60,
        camera_fpr <= 0.15,
        digital_fpr <= 0.25,
        overall_fpr <= 0.15,
        confounding != "HIGH",
        shortcut["overallShortcutRisk"] != "HIGH",
        (p95(runtimes) or 0) <= 60.0,
    ])
    scores_by_group = {
        "synthetic": [row["score"] for row in synthetic],
        "camera": [row["score"] for row in camera],
        "digital": [row["score"] for row in digital],
        "overallNegative": [row["score"] for row in negatives],
    }
    score_summary = {}
    for group, values in scores_by_group.items():
        score_summary[group] = {
            "median": statistics.median(values),
            "q1": percentile(values, 0.25),
            "q3": percentile(values, 0.75),
            "iqr": percentile(values, 0.75) - percentile(values, 0.25),
        }
    return {
        "candidateId": candidate_id,
        "scoreDirection": score_result["scoreDirection"],
        "threshold": threshold,
        "thresholdMethod": "95TH_PERCENTILE_POOLED_DEVELOPMENT_NEGATIVES_LINEAR_INTERPOLATION",
        "metrics": {
            "developmentSyntheticRecall": synthetic_recall,
            "developmentCameraFpr": camera_fpr,
            "developmentDigitalFpr": digital_fpr,
            "developmentOverallNegativeFpr": overall_fpr,
            "rocAuc": auc([row["score"] for row in synthetic], [row["score"] for row in negatives]),
            "prAuc": average_precision([row["score"] for row in synthetic], [row["score"] for row in negatives]),
            "cameraDigitalAuc": camera_digital_auc,
            "digitalMinusCameraFpr": fpr_gap,
            "runtimeP50Seconds": p50(runtimes),
            "runtimeP95Seconds": p95(runtimes),
            "runtimeMaxSeconds": max(runtimes),
        },
        "scoreSummary": score_summary,
        "nonCameraConfounding": confounding,
        "shortcutAudit": shortcut,
        "stageAPass": stage_a_pass,
        "records": rows,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-manifest", required=True, type=pathlib.Path)
    parser.add_argument("--score-json", action="append", required=True, type=pathlib.Path)
    parser.add_argument("--output", required=True, type=pathlib.Path)
    args = parser.parse_args()
    manifest = json.loads(args.input_manifest.read_text(encoding="utf-8"))
    records = manifest["records"]
    results = []
    for score_path in args.score_json:
        score_result = json.loads(score_path.read_text(encoding="utf-8"))
        results.append(evaluate(score_result["candidateId"], score_result, records))
    result = {
        "schemaVersion": "lythaus-wp007c-candidate-development-results-v1",
        "developmentSplitSha256": manifest["developmentSplitSha256"],
        "holdoutFreezeSha256": manifest["holdoutFreezeSha256"],
        "scoreBlind": True,
        "candidates": results,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(f"{json.dumps(result, indent=2)}\n", encoding="utf-8")
    for candidate in results:
        metrics = candidate["metrics"]
        print(f"{candidate['candidateId']} STAGE_A={candidate['stageAPass']} RECALL={metrics['developmentSyntheticRecall']:.6f} CAMERA_FPR={metrics['developmentCameraFpr']:.6f} DIGITAL_FPR={metrics['developmentDigitalFpr']:.6f} OVERALL_FPR={metrics['developmentOverallNegativeFpr']:.6f} P50={metrics['runtimeP50Seconds']:.6f} P95={metrics['runtimeP95Seconds']:.6f}")


if __name__ == "__main__":
    main()
