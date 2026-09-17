"""Fit and evaluate the predeclared WP007G-R1 calibrators.

The script deliberately keeps the calibration boundary explicit: modern DEV
families and DEV negatives fit the logistic head; NEGATIVE_CALIBRATION_G is
used only for robust score transforms and evidence-band thresholds.  The
confirmation and reserve roles are never read by the ``dev`` command.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
from typing import Iterable

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score


DETECTORS = ("SPAI_C512", "RINE", "UFD", "SAFE")
BANDS = (("VERY_HIGH", 0.01), ("HIGH", 0.02), ("MODERATE", 0.05))
SEED = 20260916
FLUX2_MARKERS = ("flux.2", "flux2", "flux-2")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def rate(count: int, total: int) -> dict:
    if total <= 0:
        return {"count": count, "n": total, "rate": None, "wilson95": None}
    p = count / total
    z = 1.959963984540054
    denominator = 1.0 + z * z / total
    center = (p + z * z / (2.0 * total)) / denominator
    half = z * math.sqrt((p * (1.0 - p) / total) + (z * z / (4.0 * total * total))) / denominator
    return {
        "count": count,
        "n": total,
        "rate": p,
        "wilson95": [max(0.0, center - half), min(1.0, center + half)],
    }


def median_iqr(values: Iterable[float]) -> dict:
    array = np.asarray(list(values), dtype=float)
    if array.size == 0:
        return {"median": None, "iqr": None}
    return {
        "median": float(np.median(array)),
        "iqr": float(np.percentile(array, 75) - np.percentile(array, 25)),
    }


def detector_value(row: dict, detector: str) -> float | None:
    value = row.get("detectorScores", {}).get(detector)
    return None if value is None else float(value)


def calibration_values(rows: list[dict]) -> dict[str, list[float]]:
    values: dict[str, list[float]] = {}
    for detector in DETECTORS:
        current = [detector_value(row, detector) for row in rows]
        values[detector] = sorted(float(value) for value in current if value is not None)
        if not values[detector]:
            raise RuntimeError(f"NO_CALIBRATION_VALUES:{detector}")
    return values


def robust_parameters(calibration: dict[str, list[float]]) -> dict:
    result = {}
    for detector in DETECTORS:
        values = np.asarray(calibration[detector], dtype=float)
        center = float(np.median(values))
        mad = float(np.median(np.abs(values - center)))
        scale = 1.4826 * mad
        if scale <= 1e-12:
            scale = float(np.std(values))
        if scale <= 1e-12:
            scale = 1.0
        result[detector] = {"center": center, "mad": mad, "scale": scale}
    return result


def empirical_tail(value: float | None, calibration: dict[str, list[float]]) -> tuple[float, float]:
    if value is None:
        return 0.0, 0.0
    values = calibration
    # The specification intentionally uses <= for the empirical CDF.  A
    # deterministic right-biased search makes ties conservative and repeatable.
    import bisect

    u = bisect.bisect_right(values, float(value)) / len(values)
    return max(0.0, 2.0 * (u - 0.5)), max(0.0, 2.0 * (0.5 - u))


def tail_row(row: dict, calibration: dict[str, list[float]]) -> dict[str, float]:
    tails = {}
    for detector in DETECTORS:
        high, low = empirical_tail(detector_value(row, detector), calibration[detector])
        tails[f"{detector}_HIGH_TAIL"] = high
        tails[f"{detector}_LOW_TAIL"] = low
    tails["SPAI_HIGH_TAIL"] = tails["SPAI_C512_HIGH_TAIL"]
    tails["SPAI_LOW_TAIL"] = tails["SPAI_C512_LOW_TAIL"]
    tails["CLIP_HIGH_TAIL"] = max(tails["RINE_HIGH_TAIL"], tails["UFD_HIGH_TAIL"])
    tails["CLIP_LOW_TAIL"] = max(tails["RINE_LOW_TAIL"], tails["UFD_LOW_TAIL"])
    tails["CLIP_BOTH_HIGH"] = min(tails["RINE_HIGH_TAIL"], tails["UFD_HIGH_TAIL"])
    tails["CLIP_BOTH_LOW"] = min(tails["RINE_LOW_TAIL"], tails["UFD_LOW_TAIL"])
    return tails


def feature_names(candidate: str) -> list[str]:
    if candidate == "G1_SIGNED_LINEAR_V0":
        return [
            *[f"{detector}_ROBUST_Z" for detector in DETECTORS],
            *[f"{detector}_MISSING" for detector in DETECTORS],
        ]
    if candidate == "G2_TWO_TAIL_GROUPED_V0":
        return [
            "SPAI_HIGH_TAIL", "SPAI_LOW_TAIL",
            "CLIP_HIGH_TAIL", "CLIP_LOW_TAIL",
            "CLIP_BOTH_HIGH", "CLIP_BOTH_LOW",
            "SAFE_HIGH_TAIL", "SAFE_LOW_TAIL",
        ]
    raise ValueError(candidate)


def feature_row(row: dict, candidate: str, calibration: dict[str, list[float]], robust: dict) -> list[float]:
    if candidate == "G1_SIGNED_LINEAR_V0":
        values: list[float] = []
        for detector in DETECTORS:
            value = detector_value(row, detector)
            if value is None:
                values.append(0.0)
            else:
                values.append((value - robust[detector]["center"]) / robust[detector]["scale"])
        values.extend(1.0 if detector_value(row, detector) is None else 0.0 for detector in DETECTORS)
        return values
    tails = tail_row(row, calibration)
    return [float(tails[name]) for name in feature_names(candidate)]


def source_class(row: dict) -> str:
    subtype = (row.get("sourceSubtype") or "").upper()
    return "CAMERA" if subtype == "CAMERA" or row.get("cameraDeviceFamily") else "DIGITAL"


def family_balanced_weights(positive_rows: list[dict], negative_rows: list[dict]) -> np.ndarray:
    positive_families = sorted({row["generatorFamily"] for row in positive_rows})
    weights: list[float] = []
    for row in positive_rows:
        family_count = sum(item["generatorFamily"] == row["generatorFamily"] for item in positive_rows)
        weights.append((1.0 / len(positive_families)) / family_count)
    classes = ("CAMERA", "DIGITAL")
    present = [name for name in classes if any(source_class(row) == name for row in negative_rows)]
    for row in negative_rows:
        class_count = sum(source_class(item) == source_class(row) for item in negative_rows)
        weights.append((1.0 / len(present)) / class_count)
    return np.asarray(weights, dtype=float)


def fit_model(
    candidate: str,
    positive_rows: list[dict],
    negative_rows: list[dict],
    calibration_rows: list[dict],
) -> dict:
    calibration = calibration_values(calibration_rows)
    robust = robust_parameters(calibration)
    train_rows = positive_rows + negative_rows
    x = np.asarray([feature_row(row, candidate, calibration, robust) for row in train_rows], dtype=float)
    y = np.asarray([1] * len(positive_rows) + [0] * len(negative_rows), dtype=int)
    weights = family_balanced_weights(positive_rows, negative_rows)
    model = LogisticRegression(
        C=1.0,
        max_iter=2000,
        random_state=SEED,
        solver="liblinear",
        fit_intercept=True,
    )
    model.fit(x, y, sample_weight=weights)
    calibration_scores = model.decision_function(
        np.asarray([feature_row(row, candidate, calibration, robust) for row in calibration_rows], dtype=float)
    )
    sorted_scores = np.sort(np.asarray(calibration_scores, dtype=float))
    thresholds = {}
    for band, target in BANDS:
        allowed = int(math.floor(target * len(sorted_scores)))
        if allowed == 0:
            threshold = float(np.nextafter(sorted_scores[-1], np.inf))
        else:
            threshold = float(sorted_scores[-allowed])
        thresholds[band] = {"targetFpr": target, "threshold": threshold, "calibrationFpr": rate(int(np.sum(calibration_scores >= threshold)), len(sorted_scores))}
    return {
        "candidateId": candidate,
        "featureNames": feature_names(candidate),
        "calibrationNegativeCount": len(calibration_rows),
        "calibrationNegativeScoreCdf": calibration,
        "robustParameters": robust,
        "coefficients": [float(value) for value in model.coef_[0]],
        "intercept": float(model.intercept_[0]),
        "thresholds": thresholds,
        "solver": "liblinear",
        "C": 1.0,
        "maxIter": 2000,
        "randomState": SEED,
        "fitIntercept": True,
        "positiveFamilies": sorted({row["generatorFamily"] for row in positive_rows}),
        "negativeRole": "NEGATIVE_DEV_G",
        "model": model,
    }


def score_with_model(model_data: dict, rows: list[dict]) -> np.ndarray:
    candidate = model_data["candidateId"]
    calibration = model_data["calibrationNegativeScoreCdf"]
    robust = model_data["robustParameters"]
    x = np.asarray([feature_row(row, candidate, calibration, robust) for row in rows], dtype=float)
    return x @ np.asarray(model_data["coefficients"], dtype=float) + float(model_data["intercept"])


def metric_for_scores(scores: np.ndarray, threshold: float) -> dict:
    return rate(int(np.sum(scores >= threshold)), len(scores))


def auc_pair(positive_scores: Iterable[float], negative_scores: Iterable[float]) -> float | None:
    pos = list(positive_scores)
    neg = list(negative_scores)
    if not pos or not neg:
        return None
    return float(roc_auc_score([1] * len(pos) + [0] * len(neg), pos + neg))


def evaluate_model(model_data: dict, positive_rows: list[dict], negative_rows: list[dict], label: str) -> dict:
    positive_scores = score_with_model(model_data, positive_rows)
    negative_scores = score_with_model(model_data, negative_rows)
    result = {
        "label": label,
        "candidateId": model_data["candidateId"],
        "positiveCount": len(positive_rows),
        "negativeCount": len(negative_rows),
        "positiveScore": median_iqr(positive_scores),
        "negativeScore": median_iqr(negative_scores),
        "rocAuc": auc_pair(positive_scores, negative_scores),
        "prAuc": float(average_precision_score([1] * len(positive_scores) + [0] * len(negative_scores), np.concatenate([positive_scores, negative_scores]))) if positive_scores.size and negative_scores.size else None,
        "bands": {},
        "negativeBySubtype": {},
        "perFamily": {},
    }
    for band, _target in BANDS:
        threshold = model_data["thresholds"][band]["threshold"]
        result["bands"][band] = {
            "threshold": threshold,
            "syntheticRecall": metric_for_scores(positive_scores, threshold),
            "negativeFpr": metric_for_scores(negative_scores, threshold),
        }
        for subgroup, rows in (("CAMERA", [row for row in negative_rows if source_class(row) == "CAMERA"]), ("DIGITAL", [row for row in negative_rows if source_class(row) == "DIGITAL"])):
            subgroup_scores = score_with_model(model_data, rows)
            result["bands"][band][f"{subgroup.lower()}Fpr"] = metric_for_scores(subgroup_scores, threshold)
    families = sorted({row["generatorFamily"] for row in positive_rows if row.get("generatorFamily")})
    for family in families:
        family_rows = [row for row in positive_rows if row.get("generatorFamily") == family]
        family_scores = score_with_model(model_data, family_rows)
        result["perFamily"][family] = {
            "count": len(family_rows),
            "score": median_iqr(family_scores),
            "rocAucAgainstNegatives": auc_pair(family_scores, negative_scores),
            "bands": {
                band: metric_for_scores(family_scores, model_data["thresholds"][band]["threshold"])
                for band, _target in BANDS
            },
        }
    result["negativeBySubtype"] = {
        subgroup: {
            "count": len([row for row in negative_rows if source_class(row) == subgroup]),
            "bands": {
                band: result["bands"][band][f"{subgroup.lower()}Fpr"]
                for band, _target in BANDS
            },
        }
        for subgroup in ("CAMERA", "DIGITAL")
    }
    return result


def aggregate_folds(folds: list[dict], candidate: str) -> dict:
    family_values: dict[str, dict[str, list[float]]] = {}
    for fold in folds:
        for family, details in fold["metrics"]["perFamily"].items():
            family_values.setdefault(family, {band: [] for band, _target in BANDS})
            for band, _target in BANDS:
                family_values[family][band].append(details["bands"][band]["rate"] or 0.0)
    aggregate = {"candidateId": candidate, "familyCount": len(family_values), "bands": {}, "perFamily": {}}
    for band, _target in BANDS:
        values = [family_values[family][band] for family in family_values]
        flat = [value for family_values_for_band in values for value in family_values_for_band]
        aggregate["bands"][band] = {
            "macroGeneratorRecall": float(np.mean(flat)) if flat else None,
            "medianGeneratorRecall": float(np.median(flat)) if flat else None,
            "minGeneratorRecall": float(np.min(flat)) if flat else None,
            "maxGeneratorRecall": float(np.max(flat)) if flat else None,
            "zeroRecallFamilyCount": int(sum(value == 0.0 for value in flat)),
            "nonzeroRecallFamilyCount": int(sum(value > 0.0 for value in flat)),
            "recallAtLeast50FamilyCount": int(sum(value >= 0.5 for value in flat)),
            "recallAtLeast75FamilyCount": int(sum(value >= 0.75 for value in flat)),
        }
    for family, bands in family_values.items():
        aggregate["perFamily"][family] = {
            band: {
                "values": values,
                "mean": float(np.mean(values)),
            }
            for band, values in bands.items()
        }
    for band, _target in BANDS:
        fprs = [fold["metrics"]["bands"][band]["negativeFpr"]["rate"] for fold in folds]
        camera = [fold["metrics"]["bands"][band]["cameraFpr"]["rate"] for fold in folds]
        digital = [fold["metrics"]["bands"][band]["digitalFpr"]["rate"] for fold in folds]
        aggregate["bands"][band].update({
            "foldNegativeFpr": fprs,
            "pooledNegativeFpr": float(np.mean(fprs)) if fprs else None,
            "worstFoldNegativeFpr": float(np.max(fprs)) if fprs else None,
            "foldCameraFpr": camera,
            "foldDigitalFpr": digital,
            "worstFoldCameraFpr": float(np.max(camera)) if camera else None,
            "worstFoldDigitalFpr": float(np.max(digital)) if digital else None,
        })
    aggregate["decoderInstability"] = any(
        aggregate["bands"]["HIGH"]["minGeneratorRecall"] is not None
        and aggregate["bands"]["HIGH"]["minGeneratorRecall"] < 0.5
        and aggregate["bands"]["HIGH"]["maxGeneratorRecall"] is not None
        and aggregate["bands"]["HIGH"]["maxGeneratorRecall"] > 0.9
        for _ in [0]
    )
    return aggregate


def stability(folds: list[dict], candidate: str) -> dict:
    names = feature_names(candidate)
    output = {}
    for index, name in enumerate(names):
        coefficients = [fold["model"]["coefficients"][index] for fold in folds]
        positive = sum(value > 1e-9 for value in coefficients)
        negative = sum(value < -1e-9 for value in coefficients)
        zero = len(coefficients) - positive - negative
        if positive / len(coefficients) >= 0.75:
            classification = "STABLE_SUPPORT"
        elif negative / len(coefficients) >= 0.75:
            classification = "STABLE_CONTRADICTION"
        else:
            classification = "UNSTABLE"
        output[name] = {
            "coefficients": coefficients,
            "positiveFolds": positive,
            "negativeFolds": negative,
            "zeroFolds": zero,
            "classification": classification,
        }
    return output


def stage_gate(aggregate: dict) -> dict:
    very_high = aggregate["bands"]["VERY_HIGH"]
    high = aggregate["bands"]["HIGH"]
    def present(value: float | None, fallback: float) -> float:
        return fallback if value is None else value

    passes = (
        (very_high["macroGeneratorRecall"] or 0.0) >= 0.40
        or (high["macroGeneratorRecall"] or 0.0) >= 0.55
    ) and (
        present(very_high["pooledNegativeFpr"], 1.0) <= 0.015
        and present(high["pooledNegativeFpr"], 1.0) <= 0.03
        and present(very_high["worstFoldCameraFpr"], 1.0) <= 0.10
        and present(very_high["worstFoldDigitalFpr"], 1.0) <= 0.10
        and high["nonzeroRecallFamilyCount"] >= math.ceil(aggregate["familyCount"] / 2)
    )
    return {
        "passes": bool(passes),
        "criteria": {
            "veryHighOrHighMacroRecall": bool((very_high["macroGeneratorRecall"] or 0.0) >= 0.40 or (high["macroGeneratorRecall"] or 0.0) >= 0.55),
            "veryHighPooledNegativeFpr": bool(present(very_high["pooledNegativeFpr"], 1.0) <= 0.015),
            "highPooledNegativeFpr": bool(present(high["pooledNegativeFpr"], 1.0) <= 0.03),
            "noCatastrophicCameraFpr": bool(present(very_high["worstFoldCameraFpr"], 1.0) <= 0.10),
            "noCatastrophicDigitalFpr": bool(present(very_high["worstFoldDigitalFpr"], 1.0) <= 0.10),
            "halfFamiliesNonzero": bool(high["nonzeroRecallFamilyCount"] >= math.ceil(aggregate["familyCount"] / 2)),
        },
    }


def serializable_model(model_data: dict) -> dict:
    return {key: value for key, value in model_data.items() if key != "model"}


def choose_candidate(candidate_results: dict[str, dict]) -> str | None:
    passing = [candidate for candidate, result in candidate_results.items() if result["stageGate"]["passes"]]
    if not passing:
        return None
    # Fixed priority: lower worst high-band FPR, higher minimum high-band
    # recall, higher macro high-band recall, then simpler G2 tie preference.
    return sorted(
        passing,
        key=lambda candidate: (
            candidate_results[candidate]["aggregate"]["bands"]["HIGH"]["worstFoldNegativeFpr"],
            -candidate_results[candidate]["aggregate"]["bands"]["HIGH"]["minGeneratorRecall"],
            -candidate_results[candidate]["aggregate"]["bands"]["HIGH"]["macroGeneratorRecall"],
            0 if candidate == "G2_TWO_TAIL_GROUPED_V0" else 1,
        ),
    )[0]


def fit_ufd_tail_model(positive_rows: list[dict], negative_rows: list[dict], calibration_rows: list[dict], include_low: bool) -> dict:
    calibration = calibration_values(calibration_rows)
    names = ["UFD_HIGH_TAIL"] + (["UFD_LOW_TAIL"] if include_low else [])
    train_rows = positive_rows + negative_rows
    x = np.asarray([[tail_row(row, calibration)[name] for name in names] for row in train_rows], dtype=float)
    y = np.asarray([1] * len(positive_rows) + [0] * len(negative_rows), dtype=int)
    model = LogisticRegression(C=1.0, max_iter=2000, random_state=SEED, solver="liblinear", fit_intercept=True)
    model.fit(x, y, sample_weight=family_balanced_weights(positive_rows, negative_rows))
    cal_x = np.asarray([[tail_row(row, calibration)[name] for name in names] for row in calibration_rows], dtype=float)
    cal_scores = model.decision_function(cal_x)
    sorted_scores = np.sort(np.asarray(cal_scores, dtype=float))
    thresholds = {}
    for band, target in BANDS:
        allowed = int(math.floor(target * len(sorted_scores)))
        threshold = float(np.nextafter(sorted_scores[-1], np.inf)) if allowed == 0 else float(sorted_scores[-allowed])
        thresholds[band] = threshold
    return {
        "featureNames": names,
        "coefficients": [float(value) for value in model.coef_[0]],
        "intercept": float(model.intercept_[0]),
        "calibration": calibration,
        "thresholds": thresholds,
    }


def score_ufd_tail_model(model_data: dict, rows: list[dict]) -> np.ndarray:
    calibration = model_data["calibration"]
    x = np.asarray([[tail_row(row, calibration)[name] for name in model_data["featureNames"]] for row in rows], dtype=float)
    return x @ np.asarray(model_data["coefficients"], dtype=float) + model_data["intercept"]


def run_ufd_analysis(raw: dict, output_dir: Path) -> None:
    rows = raw["records"]
    dev_positive = [row for row in rows if row["role"] == "MODERN_SYNTH_DEV"]
    dev_negative = [row for row in rows if row["role"] == "NEGATIVE_DEV_G"]
    calibration_negative = [row for row in rows if row["role"] == "NEGATIVE_CALIBRATION_G"]
    calibration = calibration_values(calibration_negative)
    families = sorted({row["generatorFamily"] for row in dev_positive})
    negative_ufd = [detector_value(row, "UFD") for row in calibration_negative]
    family_descriptives = {}
    for family in families:
        positive_ufd = [detector_value(row, "UFD") for row in dev_positive if row["generatorFamily"] == family]
        high_tail = [empirical_tail(value, calibration["UFD"])[0] for value in positive_ufd]
        low_tail = [empirical_tail(value, calibration["UFD"])[1] for value in positive_ufd]
        family_descriptives[family] = {
            "count": len(positive_ufd),
            "rawScore": median_iqr(positive_ufd),
            "rawHighAucAgainstCalibrationNegatives": auc_pair(positive_ufd, negative_ufd),
            "rawLowTailAucAgainstCalibrationNegatives": auc_pair(low_tail, [empirical_tail(value, calibration["UFD"])[1] for value in negative_ufd]),
            "highTail": median_iqr(high_tail),
            "lowTail": median_iqr(low_tail),
        }

    folds = []
    for family in families:
        train_positive = [row for row in dev_positive if row["generatorFamily"] != family]
        heldout_positive = [row for row in dev_positive if row["generatorFamily"] == family]
        with_low = fit_ufd_tail_model(train_positive, dev_negative, calibration_negative, include_low=True)
        high_only = fit_ufd_tail_model(train_positive, dev_negative, calibration_negative, include_low=False)
        with_scores = score_ufd_tail_model(with_low, heldout_positive)
        high_scores = score_ufd_tail_model(high_only, heldout_positive)
        with_negative = score_ufd_tail_model(with_low, dev_negative)
        high_negative = score_ufd_tail_model(high_only, dev_negative)
        folds.append({
            "heldOutGeneratorFamily": family,
            "withLowTail": {
                "coefficients": with_low["coefficients"],
                "intercept": with_low["intercept"],
                "highRecall": metric_for_scores(with_scores, with_low["thresholds"]["HIGH"]),
                "veryHighRecall": metric_for_scores(with_scores, with_low["thresholds"]["VERY_HIGH"]),
                "highNegativeFpr": metric_for_scores(with_negative, with_low["thresholds"]["HIGH"]),
            },
            "highTailOnly": {
                "coefficient": high_only["coefficients"][0],
                "highRecall": metric_for_scores(high_scores, high_only["thresholds"]["HIGH"]),
                "highNegativeFpr": metric_for_scores(high_negative, high_only["thresholds"]["HIGH"]),
            },
        })
    low_coefficients = [fold["withLowTail"]["coefficients"][1] for fold in folds]
    deltas = [fold["withLowTail"]["highRecall"]["rate"] - fold["highTailOnly"]["highRecall"]["rate"] for fold in folds]
    fpr_deltas = [fold["withLowTail"]["highNegativeFpr"]["rate"] - fold["highTailOnly"]["highNegativeFpr"]["rate"] for fold in folds]
    positive_folds = sum(value > 1e-9 for value in low_coefficients)
    aggregate = {
        "lowTailPositiveFolds": positive_folds,
        "foldCount": len(folds),
        "lowTailPositiveFraction": positive_folds / len(folds),
        "lowTailStableSupport": positive_folds / len(folds) >= 0.75,
        "macroHighRecallDeltaVsHighOnly": float(np.mean(deltas)),
        "macroHighNegativeFprDeltaVsHighOnly": float(np.mean(fpr_deltas)),
        "improvesMacroRecallByAtLeastFivePoints": float(np.mean(deltas)) >= 0.05,
        "negativeFprIncreaseWithinOnePoint": float(np.mean(fpr_deltas)) <= 0.01,
    }
    result = {
        "schemaVersion": "lythaus-wp007g-r1-ufd-inversion-analysis-v1",
        "hypothesis": "H_UFD_LOWTAIL",
        "rawScoreDirection": "UPSTREAM_HIGHER_SCORE_SYNTHETIC_LIKE",
        "calibrationRole": "NEGATIVE_CALIBRATION_G_ONLY",
        "developmentRole": "MODERN_SYNTH_DEV",
        "folds": folds,
        "perGeneratorDescriptives": family_descriptives,
        "aggregate": aggregate,
        "decision": "PROMOTE_LOW_TAIL_ONLY_IF_STABLE_AND_IMPROVES_WITHOUT_FPR_PENALTY",
        "conclusion": "UFD_LOWTAIL_SUPPORTED" if all((aggregate["lowTailStableSupport"], aggregate["improvesMacroRecallByAtLeastFivePoints"], aggregate["negativeFprIncreaseWithinOnePoint"])) else "UFD_LOWTAIL_NOT_PROMOTED",
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    destination = output_dir / "ufd-inversion-analysis.json"
    destination.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"conclusion": result["conclusion"], "aggregate": aggregate, "sha256": sha256_file(destination)}))


def run_dev(raw: dict, output_dir: Path) -> None:
    rows = raw["records"]
    if not raw.get("scoreBlind") or raw.get("flux1PixelAccess") or raw.get("flux2PixelAccess"):
        raise RuntimeError("RAW_SCORE_SEAL_REQUIRED")
    if any(any(marker in (row.get("generatorFamily") or "").lower() for marker in FLUX2_MARKERS) for row in rows):
        raise RuntimeError("FLUX2_FAMILY_IN_RAW_SCORES")
    dev_positive = [row for row in rows if row["role"] == "MODERN_SYNTH_DEV"]
    dev_negative = [row for row in rows if row["role"] == "NEGATIVE_DEV_G"]
    calibration_negative = [row for row in rows if row["role"] == "NEGATIVE_CALIBRATION_G"]
    heldout_families = sorted({row["generatorFamily"] for row in dev_positive})
    if len(heldout_families) < 2:
        raise RuntimeError("INSUFFICIENT_MODERN_DEV_FAMILIES")
    if not dev_negative or not calibration_negative:
        raise RuntimeError("MISSING_NEGATIVE_ROLE")

    candidate_results = {}
    all_fold_results = []
    for candidate in ("G1_SIGNED_LINEAR_V0", "G2_TWO_TAIL_GROUPED_V0"):
        folds = []
        for family in heldout_families:
            train_positive = [row for row in dev_positive if row["generatorFamily"] != family]
            heldout_positive = [row for row in dev_positive if row["generatorFamily"] == family]
            model_data = fit_model(candidate, train_positive, dev_negative, calibration_negative)
            metrics = evaluate_model(model_data, heldout_positive, dev_negative, f"LOO:{family}")
            fold = {
                "heldOutGeneratorFamily": family,
                "trainGeneratorFamilies": sorted({row["generatorFamily"] for row in train_positive}),
                "model": serializable_model(model_data),
                "metrics": metrics,
            }
            folds.append(fold)
            all_fold_results.append({"candidate": candidate, **fold})
        aggregate = aggregate_folds(folds, candidate)
        candidate_results[candidate] = {
            "candidateId": candidate,
            "folds": folds,
            "aggregate": aggregate,
            "coefficientStability": stability(folds, candidate),
            "stageGate": stage_gate(aggregate),
        }

    selected = choose_candidate(candidate_results)
    refit = None
    if selected:
        refit_data = fit_model(selected, dev_positive, dev_negative, calibration_negative)
        refit = serializable_model(refit_data)
    output_dir.mkdir(parents=True, exist_ok=True)
    fold_output = {
        "schemaVersion": "lythaus-wp007g-r1-calibrator-fold-results-v1",
        "rawScoreSha256": raw.get("rawScoreSha256"),
        "modernDevFamilies": heldout_families,
        "positiveRole": "MODERN_SYNTH_DEV",
        "negativeRole": "NEGATIVE_DEV_G",
        "calibrationRole": "NEGATIVE_CALIBRATION_G",
        "thresholdPolicy": {band: {"targetNegativeFpr": target, "source": "NEGATIVE_CALIBRATION_G_ONLY"} for band, target in BANDS},
        "candidateResults": candidate_results,
    }
    (output_dir / "calibrator-fold-results.json").write_text(json.dumps(fold_output, indent=2) + "\n", encoding="utf-8")
    selection_output = {
        "schemaVersion": "lythaus-wp007g-r1-calibrator-selection-v1",
        "selectedCalibrator": selected,
        "selectionBasis": "stage-gated LOO family transfer; worst high-band negative FPR, minimum recall, macro recall, then G2 tie preference",
        "candidateStageGate": {candidate: result["stageGate"] for candidate, result in candidate_results.items()},
        "refit": refit,
        "trainingRoles": {
            "positive": "MODERN_SYNTH_DEV",
            "negative": "NEGATIVE_DEV_G",
            "cdfAndThresholds": "NEGATIVE_CALIBRATION_G",
        },
    }
    (output_dir / "calibrator-selection.json").write_text(json.dumps(selection_output, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "selected": selected,
        "candidates": {candidate: result["stageGate"]["passes"] for candidate, result in candidate_results.items()},
        "foldResultsSha256": sha256_file(output_dir / "calibrator-fold-results.json"),
        "selectionSha256": sha256_file(output_dir / "calibrator-selection.json"),
    }))


def run_evaluate(raw: dict, selection_path: Path, positive_role: str, negative_role: str, output_path: Path) -> None:
    if raw.get("flux1PixelAccess") or raw.get("flux2PixelAccess"):
        raise RuntimeError("SEALED_HOLDOUT_ACCESS_IN_EVALUATION")
    selection = json.loads(selection_path.read_text(encoding="utf-8"))
    selected = selection.get("selectedCalibrator")
    if not selected or not selection.get("refit"):
        raise RuntimeError("CANDIDATE_SELECTION_REQUIRED_BEFORE_CONFIRMATION")
    if positive_role not in ("MODERN_SYNTH_CONFIRM", "MODERN_SYNTH_RESERVE"):
        raise RuntimeError("EVALUATION_ROLE_NOT_CONFIRM_OR_RESERVE")
    if negative_role not in ("NEGATIVE_CONFIRM_G", "NEGATIVE_RESERVE_G"):
        raise RuntimeError("EVALUATION_NEGATIVE_ROLE_NOT_CONFIRM_OR_RESERVE")
    model_data = selection["refit"]
    positive_rows = [row for row in raw["records"] if row["role"] == positive_role]
    negative_rows = [row for row in raw["records"] if row["role"] == negative_role]
    if not positive_rows or not negative_rows:
        raise RuntimeError("EMPTY_CONFIRMATION_ROLE")
    metrics = evaluate_model(model_data, positive_rows, negative_rows, f"{positive_role}_ON_{negative_role}")
    output = {
        "schemaVersion": "lythaus-wp007g-r1-modern-evaluation-v1",
        "candidateId": selected,
        "selectionSha256": sha256_file(selection_path),
        "positiveRole": positive_role,
        "negativeRole": negative_role,
        "thresholdSource": "NEGATIVE_CALIBRATION_G_ONLY_FROZEN_IN_SELECTION",
        "noRetuning": True,
        "metrics": metrics,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"candidate": selected, "positiveRole": positive_role, "negativeRole": negative_role, "sha256": sha256_file(output_path)}))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=("dev", "ufd", "evaluate"), required=True)
    parser.add_argument("--raw-scores", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--selection", type=Path)
    parser.add_argument("--positive-role")
    parser.add_argument("--negative-role")
    parser.add_argument("--output")
    args = parser.parse_args()
    raw = json.loads(args.raw_scores.read_text(encoding="utf-8"))
    raw["rawScoreSha256"] = sha256_file(args.raw_scores)
    if args.mode == "dev":
        run_dev(raw, args.output_dir)
    else:
        if args.mode == "ufd":
            run_ufd_analysis(raw, args.output_dir)
        else:
            if not args.selection or not args.positive_role or not args.negative_role or not args.output:
                raise RuntimeError("EVALUATION_ARGUMENTS_REQUIRED")
            run_evaluate(raw, args.selection, args.positive_role, args.negative_role, Path(args.output))


if __name__ == "__main__":
    main()
