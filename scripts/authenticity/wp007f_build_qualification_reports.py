"""Build deterministic calibration and detector-correlation records from dev scores."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path

import numpy as np


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def quantile(values: list[float], target_fpr: float) -> float:
    return float(np.quantile(np.asarray(values, dtype=float), 1 - target_fpr, method="linear"))


def rank(values: list[float]) -> np.ndarray:
    order = np.argsort(np.asarray(values, dtype=float), kind="mergesort")
    ranks = np.empty(len(values), dtype=float)
    ranks[order] = np.arange(len(values), dtype=float)
    return ranks


def correlation(left: list[float], right: list[float]) -> dict:
    if len(left) < 2 or len(left) != len(right):
        return {"pearson": None, "spearman": None, "sampleCount": len(left)}
    pearson = float(np.corrcoef(np.asarray(left), np.asarray(right))[0, 1])
    spearman = float(np.corrcoef(rank(left), rank(right))[0, 1])
    return {"pearson": round(pearson, 6), "spearman": round(spearman, 6), "sampleCount": len(left)}


def wilson(successes: int, total: int, z: float = 1.959963984540054) -> list[float | None]:
    if total == 0:
        return [None, None]
    p = successes / total
    denominator = 1 + z * z / total
    centre = (p + z * z / (2 * total)) / denominator
    margin = z * math.sqrt((p * (1 - p) / total) + (z * z / (4 * total * total))) / denominator
    return [round(max(0.0, centre - margin), 6), round(min(1.0, centre + margin), 6)]


def profile(detector: dict, curves: dict) -> dict:
    rows = {float(item["targetOverallNegativeFpr"]): item for item in curves["curves"]}
    selected = rows.get(0.01) or min(rows.items(), key=lambda item: abs(item[0] - 0.01))[1]
    return {
        "detectorId": detector["detectorId"],
        "profileVersion": f"wp007f-{detector['detectorId'].lower()}-calibration-v1",
        "scoreDirection": detector.get("scoreDirection", "HIGHER_SCORE_SYNTHETIC"),
        "rawScoreIsProbability": False,
        "operatingPoints": [
            {
                "targetOverallNegativeFpr": item["targetOverallNegativeFpr"],
                "threshold": item["threshold"],
                "camera": item["cameraFpr"],
                "digital": item["digitalFpr"],
                "overall": item["overallNegativeFpr"],
                "syntheticRecall": item["syntheticRecall"],
            }
            for item in curves["curves"]
        ],
        "actionProfile": {
            "target": 0.01,
            "threshold": selected["threshold"],
            "supportLevel": "STRONG_SUPPORT" if selected["syntheticRecall"]["rate"] is not None and selected["syntheticRecall"]["rate"] >= 0.5 and selected["overallNegativeFpr"]["rate"] <= 0.01 else "MODERATE_SUPPORT",
            "labelAuthority": "EVIDENCE_ONLY_NO_INDEPENDENT_AI_GENERATED_LABEL",
        },
        "thresholdSource": "DDB_DETECTOR_DEV positives excluded; CAMERA_DEV + DIGITAL_DEV pooled negatives only",
        "confirmationRequired": True,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-manifest", type=Path, required=True)
    parser.add_argument("--curves", type=Path, required=True)
    parser.add_argument("--spai", type=Path, required=True)
    parser.add_argument("--pretrained", type=Path, nargs="+", required=True)
    parser.add_argument("--profiles-output", type=Path, required=True)
    parser.add_argument("--correlation-output", type=Path, required=True)
    args = parser.parse_args()
    manifest = load(args.input_manifest)
    curves = load(args.curves)
    raw_sources = [load(args.spai), *(load(path) for path in args.pretrained)]
    detectors = [{
        "detectorId": "SPAI_C512",
        "scoreDirection": "HIGHER_SCORE_SYNTHETIC",
        "records": [{"sampleId": row["sampleId"], "rawScore": row["score"], "runtimeSeconds": row.get("runtimeSeconds")} for row in load(args.spai)["records"]],
        "checkpointSha256": load(args.spai).get("checkpointSha256"),
    }, *[detector for source in raw_sources[1:] for detector in source.get("detectors", [])]]
    curve_by_id = {item["detectorId"]: item for item in curves["detectors"]}
    profiles = [profile(detector, curve_by_id[detector["detectorId"]]) for detector in detectors]
    profiles_output = {
        "schemaVersion": "lythaus-wp007f-calibration-profiles-v1",
        "inputManifestSha256": hashlib.sha256(args.input_manifest.read_bytes()).hexdigest(),
        "scoreBlind": True,
        "flux1PixelAccess": False,
        "flux2PixelAccess": False,
        "profiles": profiles,
    }
    args.profiles_output.write_text(json.dumps(profiles_output, indent=2) + "\n", encoding="utf-8")

    manifest_rows = {item["sampleId"]: item for item in manifest["records"]}
    by_detector = {}
    for detector in detectors:
        by_detector[detector["detectorId"]] = {row["sampleId"]: row for row in detector["records"]}
    ids = sorted(set.intersection(*(set(rows) for rows in by_detector.values())))
    pairs = []
    for index, left_id in enumerate(sorted(by_detector)):
        for right_id in sorted(by_detector)[index + 1:]:
            shared = [sample_id for sample_id in ids if left_id in by_detector and right_id in by_detector]
            left = [float(by_detector[left_id][sample_id]["rawScore"]) for sample_id in shared]
            right = [float(by_detector[right_id][sample_id]["rawScore"]) for sample_id in shared]
            pairs.append({"leftDetectorId": left_id, "rightDetectorId": right_id, **correlation(left, right)})
    correlation_output = {
        "schemaVersion": "lythaus-wp007f-detector-correlation-v1",
        "inputManifestSha256": hashlib.sha256(args.input_manifest.read_bytes()).hexdigest(),
        "scoreBlind": True,
        "flux1PixelAccess": False,
        "flux2PixelAccess": False,
        "population": "DDB_DETECTOR_DEV + CAMERA_DEV + DIGITAL_DEV shared sample IDs",
        "pairs": pairs,
        "correlationGroups": {"CLIP_GENERATIVE": {"members": ["UNIVERSAL_FAKE_DETECT", "RINE"], "independence": "NOT_INDEPENDENT"}},
        "manifestRoleCounts": {role: sum(item["role"] == role for item in manifest_rows.values()) for role in sorted({item["role"] for item in manifest_rows.values()})},
    }
    args.correlation_output.write_text(json.dumps(correlation_output, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"profiles": [item["detectorId"] for item in profiles], "correlationPairs": len(pairs)}))


if __name__ == "__main__":
    main()
