"""Summarize SAFE and phase/DCT behaviour for Seedream-4/Imagen-4 misses."""

from __future__ import annotations

import argparse
import json
import statistics
from collections import defaultdict
from pathlib import Path
from typing import Any

from sklearn.metrics import roc_auc_score


FEATURES = [
    "fftLogMagnitudeMean", "fftHighFrequencyEnergyRatio", "fftPhaseCircularCoherence", "fftPhaseMeanAbsolute",
    "dctDcMean", "dctDcStd", "dctAcL1Mean", "dctAcEnergy", "dctLowFrequencyEnergy", "dctHighFrequencyEnergy",
    "dctHighToLowEnergyRatio", "dctAcZeroRate", "blockBoundaryRatio", "pixelStd",
]


def quartiles(values: list[float]) -> dict[str, float | None]:
    if not values:
        return {"q25": None, "q50": None, "q75": None}
    import numpy as np
    return {"q25": float(np.percentile(values, 25)), "q50": float(np.percentile(values, 50)), "q75": float(np.percentile(values, 75))}


def summarize(values: list[float]) -> dict[str, float | None]:
    return {"n": len(values), **quartiles(values)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--measurements", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    payload = json.loads(args.measurements.read_text(encoding="utf-8"))
    if not payload["knownAnswerFixtures"]["passed"] or payload["flux2PixelAccess"] or payload["flux2ProviderCalls"] != 0:
        raise RuntimeError("DOMAIN_GAP_PHASE_FIXTURE_OR_SEAL_FAILURE")
    originals = {row["parentSampleId"]: row for row in payload["records"] if row["kind"] == "ORIGINAL"}
    descendants = [row for row in payload["records"] if row["kind"] == "DESCENDANT"]
    by_operation = defaultdict(list)
    for row in descendants:
        by_operation[row["operation"]].append(row)
    output: dict[str, Any] = {
        "schemaVersion": "lythaus-wp007jr1-domain-gap-analysis-v1",
        "measurementArtifact": "research/wp007j-r1/domain-gap-phase-dct-results.json",
        "groups": {},
        "fixtures": payload["knownAnswerFixtures"],
        "classifierFitted": False,
        "thresholdsFitted": False,
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    }
    for operation, rows in sorted(by_operation.items()):
        group: dict[str, Any] = {"n": len(rows), "families": {}, "features": {}}
        for family in sorted({row["generatorFamily"] for row in rows}):
            family_rows = [row for row in rows if row["generatorFamily"] == family]
            group["families"][family] = {
                "n": len(family_rows),
                "safeDetected": sum(row["safeThresholdPass"] for row in family_rows),
                "safeRecall": sum(row["safeThresholdPass"] for row in family_rows) / len(family_rows),
                "safeMedian": statistics.median(row["safeRawScore"] for row in family_rows),
            }
        for feature in FEATURES:
            safe_misses = [row for row in rows if not row["safeThresholdPass"]]
            values = [float(row["features"][feature]) for row in safe_misses]
            group["features"][feature] = {
                "safeMisses": summarize(values),
                "all": summarize([float(row["features"][feature]) for row in rows]),
            }
        output["groups"][operation] = group
    output["interpretation"] = "These Seedream-4 and Imagen-4 descendants are a separate diagnostic cohort. No feature threshold or rescue classifier was fit; results are descriptive only."
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"operations": len(by_operation), "records": len(payload["records"])}))


if __name__ == "__main__":
    main()
