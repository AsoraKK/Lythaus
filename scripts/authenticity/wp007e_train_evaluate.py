"""Train and evaluate the frozen WP007E primary linear candidates.

All decisions in this module are made from development roles.  FLUX records
are never loaded or resolved here.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import statistics
from collections import defaultdict
from pathlib import Path
from typing import Iterable

import numpy as np
from PIL import Image
from scipy.stats import spearmanr
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score

from wp007e_common import canonicalize, decode_source, load_json, sha256_file, stable_hash, write_json


SEED = 20260916
MODEL_CONFIG = {
    "penalty": "l2",
    "C": 1.0,
    "max_iter": 2000,
    "solver": "liblinear",
    "random_state": SEED,
}


def rate_record(scores: np.ndarray, threshold: float) -> dict:
    count = int(scores.size)
    positive = int(np.count_nonzero(scores >= threshold))
    if count == 0:
        return {"positive": 0, "count": 0, "rate": None, "wilson95": None}
    z = 1.959963984540054
    p = positive / count
    denominator = 1 + z * z / count
    center = (p + z * z / (2 * count)) / denominator
    half = z * math.sqrt((p * (1 - p) / count) + z * z / (4 * count * count)) / denominator
    return {"positive": positive, "count": count, "rate": p, "wilson95": [max(0.0, center - half), min(1.0, center + half)]}


def summarize(values: Iterable[float]) -> dict:
    values = [float(value) for value in values]
    if not values:
        return {"count": 0, "median": None, "iqr": None, "min": None, "max": None}
    q1, median, q3 = np.percentile(np.asarray(values, dtype=np.float64), [25, 50, 75])
    return {"count": len(values), "median": float(median), "iqr": float(q3 - q1), "min": float(min(values)), "max": float(max(values))}


def symmetric_auc(labels: list[int], scores: list[float]) -> tuple[float | None, float | None]:
    if len(set(labels)) < 2:
        return None, None
    value = float(roc_auc_score(labels, scores))
    return value, max(value, 1 - value)


def load_feature_map(repo_root: Path, feature_root: Path) -> tuple[dict[tuple[str, str], np.ndarray], dict[tuple[str, str], dict]]:
    manifest = load_json(repo_root / "research" / "wp007e" / "feature-manifest.json")
    arrays: dict[tuple[str, str], np.ndarray] = {}
    records: dict[tuple[str, str], dict] = {}
    for item in manifest["records"]:
        path = feature_root / item["featureRelativePath"]
        if not path.is_file() or sha256_file(path) != item["featureSha256"]:
            raise RuntimeError(f"feature_cache_integrity_failure:{item['backboneId']}:{item['sampleId']}")
        array = np.load(path, allow_pickle=False).astype(np.float32)
        if array.ndim != 1 or array.shape[0] != item["featureDimension"]:
            raise RuntimeError(f"feature_shape_failure:{item['sampleId']}")
        arrays[(item["backboneId"], item["sampleId"])] = array
        records[(item["backboneId"], item["sampleId"])] = item
    return arrays, records


def feature(array_map: dict[tuple[str, str], np.ndarray], backbone: str, sample_id: str) -> np.ndarray:
    try:
        return array_map[(backbone, sample_id)]
    except KeyError as error:
        raise RuntimeError(f"missing_feature:{backbone}:{sample_id}") from error


def family_weights(proxies: list[dict], allowed_lineages: set[str]) -> dict[str, float]:
    allowed = [item for item in proxies if item["lineage"] in allowed_lineages]
    by_lineage: dict[str, list[dict]] = defaultdict(list)
    for item in allowed:
        by_lineage[item["lineage"]].append(item)
    result = {}
    for lineage, items in by_lineage.items():
        variants = len({item["variantId"] for item in items})
        for item in items:
            result[item["sampleId"]] = 1.0 / len(by_lineage) / variants
    return result


def group_by_family(items: Iterable[dict]) -> dict[str, list[dict]]:
    result: dict[str, list[dict]] = defaultdict(list)
    for item in items:
        result[item["sourceFamilyId"]].append(item)
    return result


def fit_candidate(candidate: dict, backbone: str, family_ids: list[str], allowed_lineages: set[str], pair_by_family: dict[str, dict], proxy_by_family: dict[str, list[dict]], benign_by_family: dict[str, list[dict]], arrays: dict[tuple[str, str], np.ndarray]) -> LogisticRegression:
    x_rows: list[np.ndarray] = []
    y_rows: list[int] = []
    weights: list[float] = []
    delta_mode = candidate["kind"] == "PAIRDELTA"
    for family in sorted(family_ids):
        real = feature(arrays, backbone, pair_by_family[family]["sampleId"])
        proxies = [item for item in proxy_by_family[family] if item["lineage"] in allowed_lineages]
        if not proxies:
            continue
        proxy_weight = family_weights(proxy_by_family[family], allowed_lineages)
        benign = benign_by_family[family]
        if delta_mode:
            for proxy in proxies:
                delta = feature(arrays, backbone, proxy["sampleId"]) - real
                weight = proxy_weight[proxy["sampleId"]]
                x_rows.extend((delta, -delta))
                y_rows.extend((1, 0))
                weights.extend((weight, weight))
            benign_weight = 1.0 / len(benign)
            for transform in benign:
                delta = feature(arrays, backbone, transform["sampleId"]) - real
                x_rows.extend((delta, -delta))
                y_rows.extend((0, 0))
                weights.extend((benign_weight, benign_weight))
        else:
            x_rows.append(real)
            y_rows.append(0)
            weights.append(1.0)
            benign_weight = 1.0 / len(benign)
            for transform in benign:
                x_rows.append(feature(arrays, backbone, transform["sampleId"]))
                y_rows.append(0)
                weights.append(benign_weight)
            for proxy in proxies:
                x_rows.append(feature(arrays, backbone, proxy["sampleId"]))
                y_rows.append(1)
                weights.append(proxy_weight[proxy["sampleId"]])
    if len(set(y_rows)) < 2:
        raise RuntimeError(f"candidate_training_single_class:{candidate['id']}")
    model = LogisticRegression(fit_intercept=not delta_mode, **MODEL_CONFIG)
    model.fit(np.asarray(x_rows, dtype=np.float32), np.asarray(y_rows), sample_weight=np.asarray(weights, dtype=np.float64))
    if delta_mode:
        # The paired construction defines +delta as synthetic.  This one-time
        # sign check guards against a solver orientation reversal only.
        positive_rows = np.asarray([row for row, label in zip(x_rows, y_rows, strict=True) if label == 1], dtype=np.float32)
        negative_rows = np.asarray([row for row, label in zip(x_rows, y_rows, strict=True) if label == 0], dtype=np.float32)
        if float(np.mean(model.decision_function(positive_rows))) < float(np.mean(model.decision_function(negative_rows))):
            model.coef_ *= -1
    return model


def score(model: LogisticRegression, vectors: list[np.ndarray]) -> np.ndarray:
    if not vectors:
        return np.asarray([], dtype=np.float64)
    return model.decision_function(np.asarray(vectors, dtype=np.float32)).astype(np.float64)


def metrics_for_binary(labels: list[int], scores: list[float]) -> dict:
    result = {"rocAuc": None, "prAuc": None}
    if len(set(labels)) >= 2:
        result["rocAuc"] = float(roc_auc_score(labels, scores))
        result["prAuc"] = float(average_precision_score(labels, scores))
    return result


def open_feature_image(path: Path) -> np.ndarray:
    with Image.open(path) as opened:
        image = opened.convert("RGB")
    array = np.asarray(image, dtype=np.float32) / 255.0
    luminance = 0.2126 * array[:, :, 0] + 0.7152 * array[:, :, 1] + 0.0722 * array[:, :, 2]
    gx = np.diff(luminance, axis=1)
    gy = np.diff(luminance, axis=0)
    edge_density = float(np.mean(np.sqrt(gx[:-1, :] ** 2 + gy[:, :-1] ** 2) > 0.08))
    histogram, _ = np.histogram(luminance, bins=64, range=(0, 1), density=False)
    probabilities = histogram[histogram > 0] / histogram.sum()
    entropy = float(-np.sum(probabilities * np.log2(probabilities)))
    centered = luminance - luminance.mean()
    spectrum = np.abs(np.fft.rfft2(centered)) ** 2
    high_frequency = float(spectrum[int(spectrum.shape[0] * 0.25) :, int(spectrum.shape[1] * 0.25) :].mean() / (spectrum.mean() + 1e-12))
    return np.asarray([float(luminance.mean()), float(luminance.std()), edge_density, entropy, high_frequency], dtype=np.float64)


def classification_from_level(levels: list[str]) -> str:
    if "HIGH" in levels:
        return "HIGH"
    if "MODERATE" in levels:
        return "MODERATE"
    return "LOW"


def audit_scores(candidate: dict, backbone: str, model: LogisticRegression, threshold: float, controls: list[dict], negative_benign: list[dict], roles_by_family: dict[str, dict], pixel_paths: dict[str, Path], arrays: dict[tuple[str, str], np.ndarray]) -> dict:
    all_items = controls + negative_benign
    scores = score(model, [feature(arrays, backbone, item["sampleId"]) for item in all_items])
    source_labels = [0 if roles_by_family[item["sourceFamilyId"]]["sourceType"] == "CAMERA_NEGATIVE" else 1 for item in all_items]
    _, camera_digital = symmetric_auc(source_labels, scores.tolist())
    subtype_groups: dict[str, list[float]] = defaultdict(list)
    for item, value in zip(all_items, scores, strict=True):
        source = roles_by_family[item["sourceFamilyId"]]
        group = source["cameraDeviceFamily"] if source["sourceType"] == "CAMERA_NEGATIVE" else source["sourceSubtype"]
        subtype_groups[str(group)].append(float(value))
    subtype_pairs = []
    for left_index, left in enumerate(sorted(subtype_groups)):
        for right in sorted(subtype_groups)[left_index + 1 :]:
            if len(subtype_groups[left]) < 3 or len(subtype_groups[right]) < 3:
                continue
            labels = [0] * len(subtype_groups[left]) + [1] * len(subtype_groups[right])
            _, symmetric = symmetric_auc(labels, subtype_groups[left] + subtype_groups[right])
            subtype_pairs.append({"left": left, "right": right, "symmetricAuc": symmetric, "leftCount": len(subtype_groups[left]), "rightCount": len(subtype_groups[right])})
    max_subtype = max((item["symmetricAuc"] for item in subtype_pairs), default=None)
    subtype_risk = "INSUFFICIENT_FOR_SUBTYPE_AUDIT" if not subtype_pairs else "HIGH" if max_subtype > 0.85 else "MODERATE" if max_subtype > 0.75 else "LOW"
    nuisance_names = ["luminanceMean", "luminanceStd", "edgeDensity", "entropy", "highFrequencyEnergy"]
    nuisance_values = []
    nuisance_scores = []
    for item in all_items:
        nuisance_values.append(open_feature_image(pixel_paths[item["sampleId"]]))
        nuisance_scores.append(float(score(model, [feature(arrays, backbone, item["sampleId"])])[0]))
    nuisance_matrix = np.asarray(nuisance_values)
    nuisance_correlations = {}
    nuisance_levels = []
    for index, name in enumerate(nuisance_names):
        rho = float(spearmanr(nuisance_matrix[:, index], nuisance_scores).statistic)
        absolute = abs(rho) if math.isfinite(rho) else 0.0
        level = "HIGH" if absolute > 0.50 else "MODERATE" if absolute >= 0.30 else "LOW"
        nuisance_levels.append(level)
        nuisance_correlations[name] = {"spearmanRho": rho, "absoluteRho": absolute, "risk": level}
    native_aspect = []
    native_pixels = []
    for item in all_items:
        source = roles_by_family[item["sourceFamilyId"]]
        width = source.get("width")
        height = source.get("height")
        if width is None or height is None:
            width, height = decode_source(source).size
        native_aspect.append(float(width) / float(height))
        native_pixels.append(float(width) * float(height))
    for name, values in (("nativeAspectRatio", native_aspect), ("nativePixelCount", native_pixels)):
        rho = float(spearmanr(values, nuisance_scores).statistic)
        absolute = abs(rho) if math.isfinite(rho) else 0.0
        level = "HIGH" if absolute > 0.50 else "MODERATE" if absolute >= 0.30 else "LOW"
        nuisance_levels.append(level)
        nuisance_correlations[name] = {"spearmanRho": rho, "absoluteRho": absolute, "risk": level}
    confounding_level = "HIGH" if camera_digital is not None and camera_digital > 0.80 else "MODERATE" if camera_digital is not None and camera_digital > 0.65 else "LOW"
    levels = [confounding_level] + nuisance_levels + ([] if subtype_risk == "INSUFFICIENT_FOR_SUBTYPE_AUDIT" else [subtype_risk])
    overall = classification_from_level(levels)
    source_shortcut = classification_from_level([confounding_level] + ([] if subtype_risk == "INSUFFICIENT_FOR_SUBTYPE_AUDIT" else [subtype_risk]))
    return {
        "nonCameraConfounding": {"cameraDigitalSymmetricAuc": camera_digital, "classification": confounding_level},
        "negativeSubtypeAudit": {"groups": {key: summarize(value) for key, value in subtype_groups.items()}, "pairs": subtype_pairs, "maximumSymmetricAuc": max_subtype, "classification": subtype_risk},
        "nuisanceAudit": nuisance_correlations,
        "sourceDatasetShortcutRisk": source_shortcut,
        "overallShortcutRisk": overall,
        "allAuditedSamples": len(all_items),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--media-root", required=True)
    args = parser.parse_args()
    repo_root = Path(__file__).resolve().parents[2]
    media_root = Path(args.media_root)
    arrays, feature_records = load_feature_map(repo_root, media_root / "feature-cache")
    roles = load_json(repo_root / "research" / "wp007e" / "data-role-freeze.json")
    pair_split = load_json(repo_root / "research" / "wp007e" / "pair-family-split-freeze.json")
    benign_pair = load_json(media_root / "benign-negatives" / "benign-manifest.json")["records"]
    negative_benign = load_json(repo_root / "research" / "wp007e" / "negative-benign-manifest.json")["records"]
    canonicalizer = load_json(repo_root / "research" / "wp007e" / "canonicalizer-spec.json")
    backbone_registry = load_json(repo_root / "research" / "wp007e" / "backbone-registry.json")
    decoder_plan = load_json(repo_root / "research" / "wp007e" / "decoder-proxy-plan.json")
    proxy_manifest = load_json(media_root / "decoder-proxies" / "proxy-manifest.json")

    role_records = [item for role in ("PAIR_BASE", "NEGATIVE_CALIBRATION", "NEGATIVE_DEV_CONTROL", "NEGATIVE_CONFIRM") for item in roles["roles"][role]["records"]]
    roles_by_family = {item["sourceFamilyId"]: item for item in role_records}
    pair_real_records = [item for item in feature_records.values() if item["role"] == "PAIR_BASE"]
    pair_by_family = {item["sourceFamilyId"]: item for item in pair_real_records}
    proxy_records = proxy_manifest["records"]
    proxy_by_family = group_by_family(proxy_records)
    benign_by_family = group_by_family(benign_pair)
    controls_by_role = {
        role: [item for item in feature_records.values() if item["role"] == role]
        for role in ("NEGATIVE_CALIBRATION", "NEGATIVE_DEV_CONTROL", "NEGATIVE_CONFIRM")
    }
    negative_benign_by_role = {
        role: [item for item in negative_benign if item["sourceRole"] == role]
        for role in ("NEGATIVE_CALIBRATION", "NEGATIVE_DEV_CONTROL", "NEGATIVE_CONFIRM")
    }
    canonical_paths = {item["sampleId"]: media_root / item["canonicalRelativePath"] for item in canonicalizer["records"]}
    negative_benign_paths = {item["sampleId"]: media_root / item["outputRelativePath"] for item in negative_benign}
    pixel_paths = {**canonical_paths, **negative_benign_paths}
    all_lineages = set(proxy_manifest["eligibleLineages"])
    candidates = [
        {"id": "C1_CLIP_STD_LR_V0", "backbone": "CLIP_VIT_B32", "kind": "STD"},
        {"id": "C2_CLIP_PAIRDELTA_ROBUST_LR_V0", "backbone": "CLIP_VIT_B32", "kind": "PAIRDELTA"},
        {"id": "C3_DINO2_STD_LR_V0", "backbone": "DINOV2_VITS14", "kind": "STD"},
        {"id": "C4_DINO2_PAIRDELTA_ROBUST_LR_V0", "backbone": "DINOV2_VITS14", "kind": "PAIRDELTA"},
    ]
    train_families = pair_split["pairTrainSourceFamilyIds"]
    validation_families = set(pair_split["pairValidationSourceFamilyIds"])
    results = []
    audit_results = {}
    for candidate in candidates:
        backbone = candidate["backbone"]
        calibration = controls_by_role["NEGATIVE_CALIBRATION"] + negative_benign_by_role["NEGATIVE_CALIBRATION"]
        dev_controls = controls_by_role["NEGATIVE_DEV_CONTROL"]
        dev_benign = negative_benign_by_role["NEGATIVE_DEV_CONTROL"]
        fold_results = []
        for heldout in sorted(all_lineages):
            model = fit_candidate(candidate, backbone, train_families, all_lineages - {heldout}, pair_by_family, proxy_by_family, benign_by_family, arrays)
            calibration_scores = score(model, [feature(arrays, backbone, item["sampleId"]) for item in calibration])
            threshold = float(np.percentile(calibration_scores, 95))
            heldout_proxy = [item for item in proxy_records if item["lineage"] == heldout and item["sourceFamilyId"] in validation_families]
            heldout_scores = score(model, [feature(arrays, backbone, item["sampleId"]) for item in heldout_proxy])
            dev_scores = score(model, [feature(arrays, backbone, item["sampleId"]) for item in dev_controls])
            dev_benign_scores = score(model, [feature(arrays, backbone, item["sampleId"]) for item in dev_benign])
            fold_results.append({
                "heldOutLineage": heldout,
                "thresholdFromNegativeCalibration95thPercentile": threshold,
                "heldOutProxyRecall": rate_record(heldout_scores, threshold),
                "heldOutVariantRecall": {
                    variant: rate_record(heldout_scores[[i for i, item in enumerate(heldout_proxy) if item["variantId"] == variant]], threshold)
                    for variant in sorted({item["variantId"] for item in heldout_proxy})
                },
                "heldOutProxyScore": summarize(heldout_scores.tolist()),
                "devCameraFpr": rate_record(dev_scores[[i for i, item in enumerate(dev_controls) if roles_by_family[item["sourceFamilyId"]]["sourceType"] == "CAMERA_NEGATIVE"]], threshold),
                "devDigitalFpr": rate_record(dev_scores[[i for i, item in enumerate(dev_controls) if roles_by_family[item["sourceFamilyId"]]["sourceType"] == "DIGITAL_NON_AI_NEGATIVE"]], threshold),
                "devOverallNegativeFpr": rate_record(dev_scores, threshold),
                "devBenignTransformFpr": rate_record(dev_benign_scores, threshold),
                "proxyDiscrimination": metrics_for_binary([0] * len(calibration_scores) + [1] * len(heldout_scores), calibration_scores.tolist() + heldout_scores.tolist()),
            })
        lineage_recalls = [item["heldOutProxyRecall"]["rate"] for item in fold_results]
        development_model = fit_candidate(candidate, backbone, train_families, all_lineages, pair_by_family, proxy_by_family, benign_by_family, arrays)
        calibration_scores = score(development_model, [feature(arrays, backbone, item["sampleId"]) for item in calibration])
        threshold = float(np.percentile(calibration_scores, 95))
        ddb = [item for item in feature_records.values() if item["role"] == "DDB_TRANSFER_DEV"]
        ddb_scores = score(development_model, [feature(arrays, backbone, item["sampleId"]) for item in ddb])
        dev_scores = score(development_model, [feature(arrays, backbone, item["sampleId"]) for item in dev_controls])
        dev_benign_scores = score(development_model, [feature(arrays, backbone, item["sampleId"]) for item in dev_benign])
        ddb_record = rate_record(ddb_scores, threshold)
        ddb_record["score"] = summarize(ddb_scores.tolist())
        camera_scores = dev_scores[[i for i, item in enumerate(dev_controls) if roles_by_family[item["sourceFamilyId"]]["sourceType"] == "CAMERA_NEGATIVE"]]
        digital_scores = dev_scores[[i for i, item in enumerate(dev_controls) if roles_by_family[item["sourceFamilyId"]]["sourceType"] == "DIGITAL_NON_AI_NEGATIVE"]]
        audit = audit_scores(candidate, backbone, development_model, threshold, dev_controls, dev_benign, roles_by_family, pixel_paths, arrays)
        audit_results[candidate["id"]] = audit
        runtime = load_json(repo_root / "research" / "wp007e" / "feature-manifest.json")["runtime"][backbone]
        instability = "HIGH" if min(lineage_recalls) < 0.50 and max(lineage_recalls) > 0.90 else "LOW"
        metrics = {
            "id": candidate["id"],
            "backbone": backbone,
            "kind": candidate["kind"],
            "rightsStatus": "PASS",
            "runtime": runtime,
            "pairTrainFamilies": len(train_families),
            "pairValidationFamilies": len(validation_families),
            "lineageFolds": fold_results,
            "minHeldoutLineageRecall": float(min(lineage_recalls)),
            "medianHeldoutLineageRecall": float(statistics.median(lineage_recalls)),
            "maxHeldoutLineageRecall": float(max(lineage_recalls)),
            "ddbDevRecall": ddb_record,
            "devCameraFpr": rate_record(camera_scores, threshold),
            "devDigitalFpr": rate_record(digital_scores, threshold),
            "devOverallNegativeFpr": rate_record(dev_scores, threshold),
            "devBenignTransformFpr": rate_record(dev_benign_scores, threshold),
            "threshold": threshold,
            "thresholdMethod": "95th_percentile_NEGATIVE_CALIBRATION_canonical_plus_benign",
            "scoreDirection": "higher_is_synthetic_like_from_proxy_semantics",
            "generatorInstability": instability,
            "pairwiseDirectionTraining": candidate["kind"] == "PAIRDELTA",
            "contentMatchedTraining": candidate["kind"] == "PAIRDELTA",
            "noFluxPixelAccess": True,
            "noFlux2PixelAccess": True,
            "stageAGates": {},
        }
        metrics["stageAGates"] = {
            "rights": metrics["rightsStatus"] == "PASS",
            "runtime": runtime["runtimeTier"] != "NOT_PRACTICAL",
            "threeDecoderLineages": len(all_lineages) >= 3,
            "minHeldoutLineageRecall": metrics["minHeldoutLineageRecall"] >= 0.70,
            "medianHeldoutLineageRecall": metrics["medianHeldoutLineageRecall"] >= 0.80,
            "ddbDevRecall": ddb_record["rate"] is not None and ddb_record["rate"] >= 0.65,
            "cameraFpr": metrics["devCameraFpr"]["rate"] <= 0.10,
            "digitalFpr": metrics["devDigitalFpr"]["rate"] <= 0.15,
            "overallNegativeFpr": metrics["devOverallNegativeFpr"]["rate"] <= 0.10,
            "benignTransformFpr": metrics["devBenignTransformFpr"]["rate"] <= 0.15,
            "nonCameraConfounding": audit["nonCameraConfounding"]["classification"] != "HIGH",
            "sourceShortcut": audit["sourceDatasetShortcutRisk"] != "HIGH",
            "overallShortcut": audit["overallShortcutRisk"] != "HIGH",
            "generatorInstability": instability != "HIGH",
            "flux1PixelAccess": True,
            "flux2PixelAccess": True,
        }
        metrics["stageAPass"] = all(metrics["stageAGates"].values())
        results.append(metrics)
    report = {
        "schemaVersion": "lythaus-wp007e-candidate-stage-a-results-v1",
        "dataRoleFreezeSha256": roles["dataRoleFreezeSha256"],
        "pairSplitFreezeSha256": pair_split["pairSplitFreezeSha256"],
        "pairedCorpusFreezeSha256": load_json(repo_root / "research" / "wp007e" / "paired-decoder-corpus-freeze.json")["pairedCorpusFreezeSha256"],
        "featureManifestSha256": load_json(repo_root / "research" / "wp007e" / "feature-manifest.json")["featureManifestSha256"],
        "eligibleDecoderLineages": sorted(all_lineages),
        "candidates": results,
        "flux1PixelAccess": False,
        "flux2PixelAccess": False,
        "cloudflareGenerationCalls": 0,
    }
    report["candidateStageAResultsSha256"] = stable_hash(report)
    write_json(repo_root / "research" / "wp007e" / "candidate-stage-a-results.json", report)
    nuisance = {
        "schemaVersion": "lythaus-wp007e-nuisance-audit-v1",
        "candidateAudits": audit_results,
        "dataRole": "NEGATIVE_DEV_CONTROL_canonical_and_benign_only",
        "detectorInputsExcludeAuditValues": True,
        "flux1PixelAccess": False,
        "flux2PixelAccess": False,
    }
    nuisance["nuisanceAuditSha256"] = stable_hash(nuisance)
    write_json(repo_root / "research" / "wp007e" / "nuisance-audit.json", nuisance)
    print(json.dumps({"status": "PASS", "candidateStageAResultsSha256": report["candidateStageAResultsSha256"], "nuisanceAuditSha256": nuisance["nuisanceAuditSha256"], "candidates": [{"id": item["id"], "stageAPass": item["stageAPass"], "minRecall": item["minHeldoutLineageRecall"], "ddbDevRecall": item["ddbDevRecall"]["rate"], "cameraFpr": item["devCameraFpr"]["rate"], "digitalFpr": item["devDigitalFpr"]["rate"], "overallFpr": item["devOverallNegativeFpr"]["rate"], "benignFpr": item["devBenignTransformFpr"]["rate"], "confounding": audit_results[item["id"]]["nonCameraConfounding"]["classification"], "shortcut": audit_results[item["id"]]["overallShortcutRisk"]} for item in results]}, sort_keys=True))


if __name__ == "__main__":
    main()
