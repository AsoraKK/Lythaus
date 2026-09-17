"""Evaluate frozen SAFE scores without fitting or threshold retuning."""

from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from pathlib import Path


THRESHOLD = 0.5864923000335693


def wilson(successes: int, total: int) -> list[float] | None:
    if total == 0:
        return None
    z = 1.959963984540054
    p = successes / total
    denominator = 1 + z * z / total
    centre = (p + z * z / (2 * total)) / denominator
    margin = z * math.sqrt((p * (1 - p) / total) + (z * z / (4 * total * total))) / denominator
    return [max(0.0, centre - margin), min(1.0, centre + margin)]


def binary(hits: int, total: int) -> dict:
    return {"count": hits, "n": total, "rate": hits / total if total else None, "wilson95": wilson(hits, total)}


def auc(rows: list[dict]) -> dict:
    try:
        from sklearn.metrics import average_precision_score, roc_auc_score
        labels = [row["label"] for row in rows]
        scores = [row["rawScore"] for row in rows]
        return {"rocAuc": float(roc_auc_score(labels, scores)), "prAuc": float(average_precision_score(labels, scores))}
    except Exception as exc:
        return {"rocAuc": None, "prAuc": None, "error": type(exc).__name__}


def score_metrics(rows: list[dict], threshold: float) -> dict:
    positives = [row for row in rows if row["label"] == 1]
    negatives = [row for row in rows if row["label"] == 0]
    camera = [row for row in negatives if row.get("sourceSubtype") == "CAMERA" or row.get("cameraDeviceFamily")]
    digital = [row for row in negatives if row not in camera]
    positive_hits = sum(row["rawScore"] >= threshold for row in positives)
    negative_hits = sum(row["rawScore"] >= threshold for row in negatives)
    camera_hits = sum(row["rawScore"] >= threshold for row in camera)
    digital_hits = sum(row["rawScore"] >= threshold for row in digital)
    return {
        "threshold": threshold,
        "synthetic": binary(positive_hits, len(positives)),
        "falsePositive": binary(negative_hits, len(negatives)),
        "cameraFpr": binary(camera_hits, len(camera)),
        "digitalFpr": binary(digital_hits, len(digital)),
        "falseNegative": binary(len(positives) - positive_hits, len(positives)),
        "auc": auc(rows),
    }


def grouped(rows: list[dict], key: str, threshold: float) -> dict:
    output = {}
    groups: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        groups[str(row.get(key) or "UNKNOWN")].append(row)
    for name, members in sorted(groups.items()):
        positives = [row for row in members if row["label"] == 1]
        negatives = [row for row in members if row["label"] == 0]
        output[name] = {
            "count": len(members),
            "positive": binary(sum(row["rawScore"] >= threshold for row in positives), len(positives)) if positives else None,
            "negativeFpr": binary(sum(row["rawScore"] >= threshold for row in negatives), len(negatives)) if negatives else None,
            "auc": auc(members) if positives and negatives else None,
            "scoreMedian": sorted(row["rawScore"] for row in members)[len(members) // 2],
        }
    return output


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scores", type=Path, required=True)
    parser.add_argument("--input-freeze", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    scores = json.loads(args.scores.read_text(encoding="utf-8"))
    input_freeze = json.loads(args.input_freeze.read_text(encoding="utf-8"))
    if scores.get("checkpointSha256") != "b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e":
        raise RuntimeError("SAFE_ARTIFACT_MISMATCH")
    if scores.get("flux2PixelAccess") or not scores.get("scoreBlind"):
        raise RuntimeError("SAFE_SCORE_INTEGRITY_INVALID")
    rows = list(scores["records"])
    confirm = [row for row in rows if row["role"] in {"QUALIFICATION_CONFIRM", "NEGATIVE_CONFIRM_H"}]
    positives = [row for row in rows if row["role"] == "QUALIFICATION_CONFIRM"]
    negatives = [row for row in rows if row["role"] == "NEGATIVE_CONFIRM_H"]
    results = {
        "schemaVersion": "lythaus-wp007h-safe-qualification-results-v1",
        "detectorId": "SAFE",
        "checkpointSha256": scores["checkpointSha256"],
        "threshold": THRESHOLD,
        "thresholdFrozenFrom": "WP007G-R1 NEGATIVE_CALIBRATION_G",
        "qualificationInputFreezeSha256": __import__("hashlib").sha256(args.input_freeze.read_bytes()).hexdigest(),
        "scoreIntegrity": {"rows": len(rows), "allStatusOk": all(row.get("status") == "OK" for row in rows), "flux1PixelAccess": False, "flux2PixelAccess": False},
        "qualificationConfirm": score_metrics(confirm, THRESHOLD),
        "qualificationGeneratorFamilies": grouped(positives, "generatorFamily", THRESHOLD),
        "negativeSubtypes": grouped(negatives, "sourceSubtype", THRESHOLD),
        "negativeCameraDevices": grouped(negatives, "cameraDeviceFamily", THRESHOLD),
        "expandedAuxiliaryDescriptive": score_metrics([row for row in rows if row["role"] in {"QUALIFICATION_CONFIRM", "NEGATIVE_AUXILIARY_REUSED"}], THRESHOLD),
        "runtime": {"loadSeconds": scores.get("loadSeconds"), "p50Ms": scores.get("runtimeP50Ms"), "p95Ms": scores.get("runtimeP95Ms"), "peakRssBytes": scores.get("peakRssBytes")},
        "calibrationInterpretation": "Raw SAFE output is not a probability; frozen threshold is a research operating point.",
        "fprTargetStatus": "FPR_TARGET_NOT_YET_DEMONSTRATED",
        "gates": {
            "minimumIndependentGeneratorFamilies": len({row.get("generatorFamily") for row in positives}),
            "minimumSyntheticSamples": len(positives),
            "minimumRecallPass": score_metrics(confirm, THRESHOLD)["synthetic"]["rate"] is not None and score_metrics(confirm, THRESHOLD)["synthetic"]["rate"] >= 0.70,
            "minimumMacroFamilyRecallPass": sum(v["positive"]["rate"] >= 0.60 for v in grouped(positives, "generatorFamily", THRESHOLD).values()) / max(1, len(grouped(positives, "generatorFamily", THRESHOLD))) >= 0.60,
            "observedNegativeFprPass": score_metrics(confirm, THRESHOLD)["falsePositive"]["rate"] <= 0.05,
            "runtimePass": (scores.get("runtimeP95Ms") or 10**9) / 1000 <= 20,
        },
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(results, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"synthetic": results["qualificationConfirm"]["synthetic"], "negative": results["qualificationConfirm"]["falsePositive"], "camera": results["qualificationConfirm"]["cameraFpr"], "digital": results["qualificationConfirm"]["digitalFpr"]}))


if __name__ == "__main__":
    main()
