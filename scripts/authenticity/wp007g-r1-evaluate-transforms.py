"""Evaluate frozen R1 calibrator behavior under deterministic transforms."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path

import numpy as np


BANDS = ("VERY_HIGH", "HIGH", "MODERATE")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def rate(count: int, total: int) -> dict:
    return {"count": count, "n": total, "rate": (count / total if total else None)}


def median_iqr(values: list[float]) -> dict:
    if not values:
        return {"median": None, "iqr": None}
    array = np.asarray(values, dtype=float)
    return {"median": float(np.median(array)), "iqr": float(np.percentile(array, 75) - np.percentile(array, 25))}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw", type=Path, required=True)
    parser.add_argument("--transformed", type=Path, required=True)
    parser.add_argument("--selection", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    raw = json.loads(args.raw.read_text(encoding="utf-8"))
    transformed = json.loads(args.transformed.read_text(encoding="utf-8"))
    selection = json.loads(args.selection.read_text(encoding="utf-8"))
    if selection.get("selectedCalibrator") != "G2_TWO_TAIL_GROUPED_V0" or not selection.get("refit"):
        raise RuntimeError("FROZEN_G2_SELECTION_REQUIRED")
    if raw.get("flux1PixelAccess") or raw.get("flux2PixelAccess") or transformed.get("flux1PixelAccess") or transformed.get("flux2PixelAccess"):
        raise RuntimeError("SEALED_HOLDOUT_ACCESS_IN_TRANSFORM_EVALUATION")

    import importlib.util

    calibrator_path = Path(__file__).with_name("wp007g-r1-calibrate.py")
    spec = importlib.util.spec_from_file_location("wp007g_r1_calibrate", calibrator_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("CALIBRATOR_MODULE_LOAD_FAILED")
    calibrator = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(calibrator)
    score_with_model = calibrator.score_with_model

    model = selection["refit"]
    original_by_key = {row["rowKey"]: row for row in raw["records"]}
    transformed_rows = transformed["records"]
    if len(transformed_rows) != 420:
        raise RuntimeError(f"UNEXPECTED_TRANSFORM_RECORD_COUNT:{len(transformed_rows)}")

    base_rows = {}
    for row in transformed_rows:
        base_rows.setdefault(row["baseRowKey"], row)
    baseline_rows = [original_by_key[key] for key in base_rows]
    baseline_scores = {key: float(score) for key, score in zip(base_rows, score_with_model(model, baseline_rows))}
    output_transforms = {}
    for transform in sorted({row["transform"] for row in transformed_rows}):
        current = [row for row in transformed_rows if row["transform"] == transform]
        scores = score_with_model(model, current)
        by_base = {row["baseRowKey"]: float(score) for row, score in zip(current, scores)}
        positive_rows = [row for row in current if row["label"] == 1]
        negative_rows = [row for row in current if row["label"] == 0]
        positive_base = [row["baseRowKey"] for row in positive_rows]
        negative_base = [row["baseRowKey"] for row in negative_rows]
        positive_current = [by_base[key] for key in positive_base]
        positive_baseline = [baseline_scores[key] for key in positive_base]
        negative_current = [by_base[key] for key in negative_base]
        negative_baseline = [baseline_scores[key] for key in negative_base]
        bands = {}
        for band in BANDS:
            threshold = model["thresholds"][band]["threshold"]
            current_positive_hits = sum(score >= threshold for score in positive_current)
            baseline_positive_hits = sum(score >= threshold for score in positive_baseline)
            current_negative_hits = sum(score >= threshold for score in negative_current)
            baseline_negative_hits = sum(score >= threshold for score in negative_baseline)
            camera_current = [score for score, row in zip(negative_current, negative_rows) if row.get("sourceSubtype") == "CAMERA" or row.get("cameraDeviceFamily")]
            digital_current = [score for score, row in zip(negative_current, negative_rows) if not (row.get("sourceSubtype") == "CAMERA" or row.get("cameraDeviceFamily"))]
            bands[band] = {
                "threshold": threshold,
                "syntheticRecall": rate(current_positive_hits, len(positive_current)),
                "baselineSyntheticRecall": rate(baseline_positive_hits, len(positive_baseline)),
                "syntheticRecallRetention": (current_positive_hits / baseline_positive_hits if baseline_positive_hits else None),
                "negativeFpr": rate(current_negative_hits, len(negative_current)),
                "baselineNegativeFpr": rate(baseline_negative_hits, len(negative_baseline)),
                "negativeFprDelta": (current_negative_hits - baseline_negative_hits) / len(negative_current) if negative_current else None,
                "cameraFpr": rate(sum(score >= threshold for score in camera_current), len(camera_current)),
                "digitalFpr": rate(sum(score >= threshold for score in digital_current), len(digital_current)),
            }
        shift = [by_base[key] - baseline_scores[key] for key in by_base]
        output_transforms[transform] = {
            "recordCount": len(current),
            "syntheticCount": len(positive_current),
            "negativeCount": len(negative_current),
            "scoreShift": median_iqr(shift),
            "bands": bands,
        }

    fragile = False
    mixed = False
    for result in output_transforms.values():
        for band in BANDS:
            metrics = result["bands"][band]
            retention = metrics["syntheticRecallRetention"]
            fpr_delta = metrics["negativeFprDelta"]
            if (retention is not None and retention < 0.70) or (fpr_delta is not None and fpr_delta > 0.05):
                fragile = True
            elif (retention is not None and retention < 0.90) or (fpr_delta is not None and fpr_delta > 0.02):
                mixed = True
    classification = "FRAGILE" if fragile else ("MIXED" if mixed else "ROBUST")
    result = {
        "schemaVersion": "lythaus-wp007g-r1-transformation-results-v1",
        "candidateId": selection["selectedCalibrator"],
        "selectionSha256": sha256_file(args.selection),
        "source": "60 deterministic representatives; five per modern DEV family, ten camera and ten digital NEGATIVE_CONFIRM_G",
        "noThresholdRetuning": True,
        "transforms": output_transforms,
        "classificationRule": "FRAGILE if any band has synthetic retention <0.70 or negative FPR increase >0.05; MIXED if otherwise any retention <0.90 or FPR increase >0.02; ROBUST otherwise",
        "classification": classification,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"classification": classification, "sha256": sha256_file(args.output)}))


if __name__ == "__main__":
    main()
