"""Analyze real-media phase/DCT measurements without fitting a classifier."""

from __future__ import annotations

import argparse
import json
import math
import statistics
from collections import defaultdict
from pathlib import Path
from typing import Any

import numpy as np
from sklearn.metrics import roc_auc_score


FEATURES = [
    "fftLogMagnitudeMean",
    "fftHighFrequencyEnergyRatio",
    "fftPhaseCircularCoherence",
    "fftPhaseMeanAbsolute",
    "dctDcMean",
    "dctDcStd",
    "dctAcL1Mean",
    "dctAcEnergy",
    "dctLowFrequencyEnergy",
    "dctHighFrequencyEnergy",
    "dctHighToLowEnergyRatio",
    "dctAcZeroRate",
    "blockBoundaryRatio",
    "pixelStd",
]


def median(values: list[float]) -> float | None:
    return statistics.median(values) if values else None


def quartiles(values: list[float]) -> dict[str, float | None]:
    if not values:
        return {"q25": None, "q50": None, "q75": None}
    ordered = sorted(values)
    return {"q25": float(np.percentile(ordered, 25)), "q50": float(np.percentile(ordered, 50)), "q75": float(np.percentile(ordered, 75))}


def auc_summary(values: list[float], labels: list[int]) -> dict[str, float | None]:
    if len(set(labels)) < 2:
        return {"auc": None, "orientedAuc": None}
    auc = float(roc_auc_score(labels, values))
    return {"auc": auc, "orientedAuc": max(auc, 1.0 - auc)}


def safe_json_number(value: float) -> float | None:
    return float(value) if math.isfinite(value) else None


def feature_summary(rows: list[dict[str, Any]], feature: str) -> dict[str, Any]:
    values = [float(row["features"][feature]) for row in rows]
    labels = [int(row["truthLabel"]) for row in rows]
    synthetic = [value for value, label in zip(values, labels) if label == 1]
    genuine = [value for value, label in zip(values, labels) if label == 0]
    return {
        "n": len(values),
        "all": quartiles(values),
        "synthetic": quartiles(synthetic),
        "genuine": quartiles(genuine),
        "separation": auc_summary(values, labels),
        "medianDifferenceSyntheticMinusGenuine": safe_json_number((median(synthetic) or 0.0) - (median(genuine) or 0.0)) if synthetic and genuine else None,
    }


def grouped(rows: list[dict[str, Any]], key_fn) -> dict[str, list[dict[str, Any]]]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups[str(key_fn(row))].append(row)
    return dict(sorted(groups.items()))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--measurements", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--markdown", type=Path, required=True)
    args = parser.parse_args()
    payload = json.loads(args.measurements.read_text(encoding="utf-8"))
    rows = payload["records"]
    if not payload["knownAnswerFixtures"]["passed"] or payload["flux2PixelAccess"] or payload["flux2ProviderCalls"] != 0:
        raise RuntimeError("PHASE_DCT_FIXTURE_OR_SEAL_FAILURE")
    originals = {row["parentSampleId"]: row for row in rows if row["kind"] == "ORIGINAL"}
    descendants = [row for row in rows if row["kind"] == "DESCENDANT"]
    if len(originals) != 100 or len(descendants) != 2140:
        raise RuntimeError(f"PHASE_DCT_ROW_COUNT_UNEXPECTED:{len(originals)}:{len(descendants)}")
    for row in descendants:
        if row["parentSampleId"] not in originals:
            raise RuntimeError(f"PHASE_DCT_PARENT_MISSING:{row['derivedId']}")

    operations = grouped(descendants, lambda row: row["operation"])
    stability: dict[str, dict[str, Any]] = {}
    discrimination: dict[str, dict[str, Any]] = {}
    miss_effects: dict[str, dict[str, Any]] = {}
    for operation, operation_rows in operations.items():
        stability[operation] = {}
        discrimination[operation] = {}
        for feature in FEATURES:
            deltas = [float(row["features"][feature]) - float(originals[row["parentSampleId"]]["features"][feature]) for row in operation_rows]
            absolute = [abs(value) for value in deltas]
            real_rows = [row for row in operation_rows if row["truthLabel"] == 0]
            synthetic_rows = [row for row in operation_rows if row["truthLabel"] == 1]
            real_deltas = [float(row["features"][feature]) - float(originals[row["parentSampleId"]]["features"][feature]) for row in real_rows]
            synthetic_deltas = [float(row["features"][feature]) - float(originals[row["parentSampleId"]]["features"][feature]) for row in synthetic_rows]
            stability[operation][feature] = {
                "allAbsoluteDelta": quartiles(absolute),
                "syntheticAbsoluteDelta": quartiles([abs(value) for value in synthetic_deltas]),
                "genuineAbsoluteDelta": quartiles([abs(value) for value in real_deltas]),
                "medianAbsoluteDeltaRatioSyntheticToGenuine": ((median([abs(value) for value in synthetic_deltas]) or 0.0) / (median([abs(value) for value in real_deltas]) or 1e-12)) if real_deltas and synthetic_deltas else None,
            }
            discrimination[operation][feature] = feature_summary(operation_rows, feature)

        safe_misses = [row for row in operation_rows if row["truthLabel"] == 1 and not row["safeThresholdPass"]]
        genuine = [row for row in operation_rows if row["truthLabel"] == 0]
        miss_effects[operation] = {
            "safeMissCount": len(safe_misses),
            "genuineCount": len(genuine),
            "features": {
                feature: {
                    "safeMiss": quartiles([float(row["features"][feature]) for row in safe_misses]),
                    "genuine": quartiles([float(row["features"][feature]) for row in genuine]),
                    "orientedAucMissVsGenuine": auc_summary(
                        [float(row["features"][feature]) for row in safe_misses + genuine],
                        [1] * len(safe_misses) + [0] * len(genuine),
                    ),
                }
                for feature in FEATURES
            },
        }

    q95 = [row for row in descendants if row["operation"] == "JPEG95_PILLOW_420"]
    top_stable = []
    for feature in FEATURES:
        item = stability["JPEG95_PILLOW_420"][feature]
        top_stable.append((item["allAbsoluteDelta"]["q50"] if item["allAbsoluteDelta"]["q50"] is not None else float("inf"), feature))
    top_stable.sort()
    output = {
        "schemaVersion": "lythaus-wp007jr1-phase-dct-analysis-v1",
        "measurementArtifact": "research/wp007j-r1/phase-dct-real-results.json",
        "features": FEATURES,
        "recordCount": len(rows),
        "descendantCount": len(descendants),
        "operationCount": len(operations),
        "knownAnswerFixtures": payload["knownAnswerFixtures"],
        "stabilityByOperation": stability,
        "discriminationByOperation": discrimination,
        "safeMissEffectsByOperation": miss_effects,
        "q95MostStableFeaturesByMedianAbsoluteDelta": [feature for _, feature in top_stable],
        "q95SyntheticVsGenuineFeatureSummaries": {feature: feature_summary(q95, feature) for feature in FEATURES},
        "seedreamImagenTransformedRows": 0,
        "seedreamImagenNote": "The frozen JPEG laboratory intentionally used SAFE-easy synthetic parents; Seedream-4 and Imagen-4 transformed descendants require a separately frozen supplemental cohort and are not inferred here.",
        "classifierFitted": False,
        "thresholdsFitted": False,
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    lines = [
        "# Phase/DCT real-media analysis",
        "",
        "The measurements are descriptive EF4 candidates only; no classifier or threshold was fitted.",
        "",
        f"Rows: `{len(rows)}` (`{len(originals)}` originals and `{len(descendants)}` descendants). Known-answer fixtures passed: `{payload['knownAnswerFixtures']['passed']}`.",
        "",
        "## JPEG95 feature separation",
        "",
        "| Feature | Oriented AUC | Synthetic median | Genuine median | Median difference |",
        "| --- | ---: | ---: | ---: | ---: |",
    ]
    for feature in FEATURES:
        item = output["q95SyntheticVsGenuineFeatureSummaries"][feature]
        lines.append(f"| {feature} | {item['separation']['orientedAuc']} | {item['synthetic']['q50']} | {item['genuine']['q50']} | {item['medianDifferenceSyntheticMinusGenuine']} |")
    lines.extend([
        "",
        "## Interpretation boundary",
        "",
        "This run measures the SAFE-easy JPEG laboratory and the corresponding camera/digital controls. Seedream-4 and Imagen-4 transformed descendants were not silently substituted; they require a separately frozen supplemental cohort before claims about phase/DCT rescue of those misses.",
        "",
        "Phase/DCT stability is not authenticity evidence by itself; separation and unique-rescue analyses are required before promotion.",
    ])
    args.markdown.parent.mkdir(parents=True, exist_ok=True)
    args.markdown.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({"rows": len(rows), "operations": len(operations), "q95Rows": len(q95), "fixturesPassed": payload["knownAnswerFixtures"]["passed"]}))


if __name__ == "__main__":
    main()
