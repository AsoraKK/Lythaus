"""Evaluate the frozen R1 calibrator on the consumed FLUX.1 diagnostic."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
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


def wilson(count: int, total: int) -> list[float] | None:
    if not total:
        return None
    z = 1.959963984540054
    p = count / total
    denominator = 1.0 + z * z / total
    center = (p + z * z / (2 * total)) / denominator
    half = z * ((p * (1 - p) / total) + (z * z / (4 * total * total))) ** 0.5 / denominator
    return [max(0.0, center - half), min(1.0, center + half)]


def binary(count: int, total: int) -> dict:
    return {"count": count, "n": total, "rate": count / total if total else None, "wilson95": wilson(count, total)}


def distribution(values: list[float]) -> dict:
    if not values:
        return {"count": 0, "median": None, "iqr": None, "min": None, "max": None}
    array = np.asarray(values, dtype=float)
    return {
        "count": len(values),
        "median": float(np.median(array)),
        "iqr": float(np.percentile(array, 75) - np.percentile(array, 25)),
        "min": float(np.min(array)),
        "max": float(np.max(array)),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw", type=Path, required=True)
    parser.add_argument("--selection", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    raw = json.loads(args.raw.read_text(encoding="utf-8"))
    selection = json.loads(args.selection.read_text(encoding="utf-8"))
    if not raw.get("posthocDiagnostic") or not raw.get("flux1PixelAccess") or raw.get("flux2PixelAccess"):
        raise RuntimeError("FLUX1_POSTHOC_RAW_SCORE_REQUIRED")
    if selection.get("selectedCalibrator") != "G2_TWO_TAIL_GROUPED_V0" or not selection.get("refit"):
        raise RuntimeError("FROZEN_G2_SELECTION_REQUIRED")
    calibrator_path = Path(__file__).with_name("wp007g-r1-calibrate.py")
    spec = importlib.util.spec_from_file_location("wp007g_r1_calibrate", calibrator_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("CALIBRATOR_MODULE_LOAD_FAILED")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    model = selection["refit"]
    rows = raw["records"]
    scores = module.score_with_model(model, rows)
    tails = [module.tail_row(row, model["calibrationNegativeScoreCdf"]) for row in rows]
    result_bands = {}
    for band in BANDS:
        threshold = model["thresholds"][band]["threshold"]
        result_bands[band] = {
            "threshold": threshold,
            "recall": binary(int(np.sum(scores >= threshold)), len(rows)),
        }
    prompt_groups = {}
    for prompt in sorted({row.get("promptRegime") for row in rows}):
        indices = [index for index, row in enumerate(rows) if row.get("promptRegime") == prompt]
        prompt_scores = scores[indices]
        prompt_groups[prompt] = {
            "count": len(indices),
            "score": distribution([float(value) for value in prompt_scores]),
            "bands": {
                band: binary(int(np.sum(prompt_scores >= model["thresholds"][band]["threshold"])), len(indices))
                for band in BANDS
            },
        }
    detector_distributions = {}
    detector_tails = {}
    for detector in ("SPAI_C512", "RINE", "UFD", "SAFE"):
        detector_distributions[detector] = distribution([float(row["detectorScores"][detector]) for row in rows])
        detector_tails[detector] = {
            "highTail": distribution([float(tail[f"{detector}_HIGH_TAIL"]) for tail in tails]),
            "lowTail": distribution([float(tail[f"{detector}_LOW_TAIL"]) for tail in tails]),
        }
    result = {
        "schemaVersion": "lythaus-wp007g-r1-flux1-posthoc-diagnostic-v1",
        "diagnosticRole": "POST_HOC_FAILURE_MODE_DIAGNOSTIC",
        "calibratorId": selection["selectedCalibrator"],
        "selectionSha256": sha256_file(args.selection),
        "rawScoreSha256": sha256_file(args.raw),
        "count": len(rows),
        "fitUse": False,
        "thresholdUse": "frozen from NEGATIVE_CALIBRATION_G; no posthoc retuning",
        "bands": result_bands,
        "score": distribution([float(value) for value in scores]),
        "promptRegimes": prompt_groups,
        "detectorRawDistributions": detector_distributions,
        "detectorTailDistributions": detector_tails,
        "historicalWP007FComparison": {
            "SPAI_C512": "11/40",
            "RINE": "1/40",
            "UFD": "1/40",
            "hardFusion": "0/40",
        },
        "posthocNoTuning": True,
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"count": len(rows), "bands": {band: result_bands[band]["recall"] for band in BANDS}, "sha256": sha256_file(args.output)}))


if __name__ == "__main__":
    main()
