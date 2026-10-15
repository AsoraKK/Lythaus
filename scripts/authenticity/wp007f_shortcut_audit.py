"""Audit source, subgroup, and low-level nuisance associations on dev data."""

from __future__ import annotations

import argparse
import json
import math
import re
import statistics
from pathlib import Path

import numpy as np
from PIL import Image
from sklearn.metrics import roc_auc_score


def symmetric_auc(left: list[float], right: list[float]) -> float | None:
    if not left or not right:
        return None
    values = np.asarray(left + right, dtype=float)
    labels = np.asarray([0] * len(left) + [1] * len(right), dtype=int)
    auc = float(roc_auc_score(labels, values))
    return round(max(auc, 1 - auc), 6)


def ranks(values: list[float]) -> np.ndarray:
    order = np.argsort(np.asarray(values, dtype=float), kind="mergesort")
    output = np.empty(len(values), dtype=float)
    sorted_values = np.asarray(values, dtype=float)[order]
    start = 0
    while start < len(values):
        end = start + 1
        while end < len(values) and sorted_values[end] == sorted_values[start]:
            end += 1
        output[order[start:end]] = (start + end - 1) / 2 + 1
        start = end
    return output


def spearman(left: list[float], right: list[float]) -> float | None:
    if len(left) < 3 or len(right) != len(left):
        return None
    a = ranks(left)
    b = ranks(right)
    if np.std(a) == 0 or np.std(b) == 0:
        return 0.0
    return round(float(np.corrcoef(a, b)[0, 1]), 6)


def parse_groups(record: dict) -> tuple[str, str, str]:
    source = record["sourceRelativePath"]
    camera = "UNKNOWN_CAMERA"
    if record["role"] == "CAMERA_DEV":
        parts = Path(source).parts
        camera = parts[1] if len(parts) > 1 else "UNKNOWN_CAMERA"
    subtype = "UNKNOWN_DIGITAL"
    match = re.search(r"HN-([A-Z0-9_]+)-\d+$", record["sourceFamilyId"])
    if match:
        subtype = match.group(1)
    return record["sourceRootKey"], camera, subtype


def image_features(path: Path) -> dict[str, float]:
    with Image.open(path) as image:
        array = np.asarray(image.convert("RGB"), dtype=np.float32) / 255.0
        width, height = image.width, image.height
    luminance = 0.2126 * array[..., 0] + 0.7152 * array[..., 1] + 0.0722 * array[..., 2]
    dx = np.diff(luminance, axis=1)
    dy = np.diff(luminance, axis=0)
    gradient = np.sqrt(dx[:-1, :] ** 2 + dy[:, :-1] ** 2)
    histogram, _ = np.histogram(luminance, bins=64, range=(0, 1), density=False)
    probabilities = histogram[histogram > 0] / histogram.sum()
    entropy = float(-(probabilities * np.log2(probabilities)).sum())
    reduced = np.asarray(Image.fromarray((luminance * 255).astype(np.uint8)).resize((64, 64), Image.Resampling.BILINEAR), dtype=np.float32)
    spectrum = np.abs(np.fft.fftshift(np.fft.fft2(reduced))) ** 2
    yy, xx = np.indices(spectrum.shape)
    radius = np.sqrt((xx - 32) ** 2 + (yy - 32) ** 2)
    high_frequency = float(spectrum[radius >= 12].sum() / max(spectrum.sum(), 1e-12))
    return {
        "luminanceMean": float(luminance.mean()),
        "luminanceStd": float(luminance.std()),
        "edgeDensity": float((gradient > 0.08).mean()),
        "pixelEntropy": entropy,
        "highFrequencyEnergy": high_frequency,
        "aspectRatio": width / height,
        "nativePixelCount": float(width * height),
    }


def load_scores(path: Path) -> dict[str, float]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if "records" in payload:
        return {item["sampleId"]: float(item["score"]) for item in payload["records"]}
    detectors = payload.get("detectors", [])
    if len(detectors) != 1:
        raise RuntimeError(f"EXPECTED_SINGLE_DETECTOR:{path}")
    return {item["sampleId"]: float(item["rawScore"]) for item in detectors[0]["records"]}


def load_thresholds(path: Path) -> dict[str, float]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    return {
        item["detectorId"]: next(point for point in item["curves"] if point["targetOverallNegativeFpr"] == 0.01)["threshold"]
        for item in payload["detectors"]
    }


def group_pair_audits(rows: list[dict], key: str) -> dict:
    groups: dict[str, list[float]] = {}
    for row in rows:
        if row["role"] not in {"CAMERA_DEV", "DIGITAL_DEV"}:
            continue
        groups.setdefault(row[key], []).append(row["score"])
    pairs = {}
    names = sorted(groups)
    for index, left in enumerate(names):
        for right in names[index + 1:]:
            if min(len(groups[left]), len(groups[right])) < 3:
                continue
            pairs[f"{left}__vs__{right}"] = {"leftCount": len(groups[left]), "rightCount": len(groups[right]), "symmetricAuc": symmetric_auc(groups[left], groups[right])}
    return {"groups": {name: len(values) for name, values in groups.items()}, "pairs": pairs, "maximumSymmetricAuc": max((item["symmetricAuc"] for item in pairs.values()), default=None)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--inputs", type=Path, required=True)
    parser.add_argument("--input-root", type=Path, required=True)
    parser.add_argument("--curves", type=Path, required=True)
    parser.add_argument("--scores", type=Path, nargs="+", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    inputs = json.loads(args.inputs.read_text(encoding="utf-8"))
    records = [item for item in inputs["records"] if item["role"].endswith("_DEV")]
    thresholds = load_thresholds(args.curves)
    score_maps = {}
    for path in args.scores:
        detector_id = "SPAI_C512" if "spai" in path.name else "UNIVERSAL_FAKE_DETECT" if "ufd" in path.name else "RINE"
        score_maps[detector_id] = load_scores(path)
    features = {}
    for record in records:
        image_path = args.input_root / record["c512File"]
        source, camera, subtype = parse_groups(record)
        features[record["sampleId"]] = {"sourceDataset": source, "cameraDeviceFamily": camera, "digitalSubtype": subtype, **image_features(image_path)}

    detector_results = []
    for detector_id, scores in sorted(score_maps.items()):
        rows = []
        for record in records:
            if record["sampleId"] not in scores:
                raise RuntimeError(f"AUDIT_SCORE_MISSING:{detector_id}:{record['sampleId']}")
            rows.append({"sampleId": record["sampleId"], "role": record["role"], "score": scores[record["sampleId"]], **features[record["sampleId"]]})
        camera = [row["score"] for row in rows if row["role"] == "CAMERA_DEV"]
        digital = [row["score"] for row in rows if row["role"] == "DIGITAL_DEV"]
        negative = [row for row in rows if row["role"] in {"CAMERA_DEV", "DIGITAL_DEV"}]
        nuisance = {}
        for key in ("luminanceMean", "luminanceStd", "edgeDensity", "pixelEntropy", "highFrequencyEnergy", "aspectRatio", "nativePixelCount"):
            value = spearman([row["score"] for row in negative], [row[key] for row in negative])
            nuisance[key] = {"spearmanRho": value, "classification": "HIGH" if value is not None and abs(value) > 0.5 else "MODERATE" if value is not None and abs(value) >= 0.3 else "LOW"}
        source_audit = group_pair_audits(rows, "sourceDataset")
        subtype_audit = group_pair_audits(rows, "digitalSubtype")
        camera_audit = group_pair_audits(rows, "cameraDeviceFamily")
        confounding = symmetric_auc(camera, digital)
        high_source = source_audit["maximumSymmetricAuc"] is not None and source_audit["maximumSymmetricAuc"] > 0.85
        high_subtype = (subtype_audit["maximumSymmetricAuc"] is not None and subtype_audit["maximumSymmetricAuc"] > 0.85) or (camera_audit["maximumSymmetricAuc"] is not None and camera_audit["maximumSymmetricAuc"] > 0.85)
        high_nuisance = any(item["classification"] == "HIGH" for item in nuisance.values())
        detector_results.append({
            "detectorId": detector_id,
            "threshold": thresholds[detector_id],
            "cameraDigitalSymmetricAuc": confounding,
            "nonCameraConfounding": "HIGH" if confounding is not None and confounding > 0.80 else "MODERATE" if confounding is not None and confounding > 0.65 else "LOW",
            "sourceDatasetAudit": source_audit,
            "digitalSubtypeAudit": subtype_audit,
            "cameraDeviceAudit": camera_audit,
            "nuisanceAssociations": nuisance,
            "sourceDatasetShortcutRisk": "HIGH" if high_source else "MODERATE" if source_audit["maximumSymmetricAuc"] is not None and source_audit["maximumSymmetricAuc"] > 0.65 else "LOW",
            "negativeSubtypeShortcutRisk": "HIGH" if high_subtype else "MODERATE" if (subtype_audit["maximumSymmetricAuc"] or 0) > 0.65 or (camera_audit["maximumSymmetricAuc"] or 0) > 0.65 else "LOW",
            "lowLevelNuisanceRisk": "HIGH" if high_nuisance else "MODERATE" if any(item["classification"] == "MODERATE" for item in nuisance.values()) else "LOW",
            "overallShortcutRisk": "HIGH" if high_source or high_subtype or high_nuisance else "MODERATE" if confounding is not None and confounding > 0.65 else "LOW",
        })

    result = {
        "schemaVersion": "lythaus-wp007f-nuisance-audit-v1",
        "scoreBlind": True,
        "flux1PixelAccess": False,
        "flux2PixelAccess": False,
        "inputManifestSha256": inputs["rolesFreezeSha256"],
        "thresholdSource": "development pooled camera and digital negatives at target 1%",
        "detectors": detector_results,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"detectors": [item["detectorId"] for item in detector_results]}))


if __name__ == "__main__":
    main()
