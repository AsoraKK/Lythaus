"""Summarise frozen post-hoc SAFE FLUX.1 score trajectories."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from collections import defaultdict
from pathlib import Path


THRESHOLD = 0.5864923000335693


def percentile(values: list[float], q: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    position = (len(ordered) - 1) * q
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def summary(values: list[float]) -> dict:
    return {
        "count": len(values),
        "median": percentile(values, 0.5),
        "iqr": (percentile(values, 0.75) - percentile(values, 0.25)) if values else None,
        "min": min(values) if values else None,
        "max": max(values) if values else None,
        "thresholdHits": sum(value >= THRESHOLD for value in values),
        "thresholdRate": (sum(value >= THRESHOLD for value in values) / len(values)) if values else None,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--scores", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    plan = json.loads(args.plan.read_text(encoding="utf-8"))
    manifest = json.loads(args.manifest.read_text(encoding="utf-8"))
    scores = json.loads(args.scores.read_text(encoding="utf-8"))
    if not scores.get("flux1PixelAccess") or scores.get("flux2PixelAccess"):
        raise RuntimeError("FLUX1_DIAGNOSTIC_SCORE_FLAGS_INVALID")
    if scores.get("diagnosticRole") != "POST_HOC_PUBLIC_TO_CLOUDFLARE_DOMAIN_SHIFT":
        raise RuntimeError("FLUX1_DIAGNOSTIC_ROLE_INVALID")
    if not manifest.get("noFitUse") or not manifest.get("noThresholdUse"):
        raise RuntimeError("FLUX1_DIAGNOSTIC_FIT_OR_THRESHOLD_USE")
    grouped: dict[str, list[dict]] = defaultdict(list)
    for row in scores["records"]:
        grouped[row["transformation"]].append(row)
    stages = {}
    for stage, rows in sorted(grouped.items()):
        stages[stage] = {
            "records": len(rows),
            "score": summary([row["rawScore"] for row in rows]),
            "families": {
                family: summary([row["rawScore"] for row in rows if row.get("generatorFamily") == family])
                for family in sorted({row.get("generatorFamily") for row in rows})
            },
        }
    public_original = [row["rawScore"] for row in grouped.get("ORIGINAL", [])]
    cloudflare = [row["rawScore"] for row in grouped.get("CLOUDFLARE_BASELINE", [])]
    public_median = percentile(public_original, 0.5)
    cloudflare_median = percentile(cloudflare, 0.5)
    gap = abs(public_median - cloudflare_median) if public_median is not None and cloudflare_median is not None else None
    trajectories = defaultdict(dict)
    for row in scores["records"]:
        if row["sourceRootKey"] != "PUBLIC_FLUX1":
            continue
        trajectories[row["sampleId"]][row["transformation"]] = row["rawScore"]
    trajectory_rows = []
    for sample_id, values in sorted(trajectories.items()):
        original = values.get("ORIGINAL")
        trajectory_rows.append({
            "sampleId": sample_id,
            "generatorFamily": next(row.get("generatorFamily") for row in scores["records"] if row["sampleId"] == sample_id),
            "scores": dict(sorted(values.items())),
            "originalToCombinedDelta": (values.get("COMBINED_MEASURABLE_APPROXIMATION") - original) if original is not None and values.get("COMBINED_MEASURABLE_APPROXIMATION") is not None else None,
        })
    output = {
        "schemaVersion": "lythaus-wp007h-flux1-diagnostic-results-v1",
        "diagnosticRole": "POST_HOC_FAILURE_MODE_DIAGNOSTIC",
        "planSha256": hashlib.sha256(args.plan.read_bytes()).hexdigest(),
        "manifestSha256": hashlib.sha256(args.manifest.read_bytes()).hexdigest(),
        "scoreSha256": hashlib.sha256(args.scores.read_bytes()).hexdigest(),
        "safeThreshold": THRESHOLD,
        "fitUse": False,
        "thresholdUse": False,
        "flux1PixelAccess": True,
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
        "stages": stages,
        "baselineComparison": {
            "publicOriginalMedian": public_median,
            "cloudflareMedian": cloudflare_median,
            "absoluteMedianGap": gap,
            "publicOriginal": summary(public_original),
            "cloudflare": summary(cloudflare),
            "interpretation": "A stage trajectory that moves toward the Cloudflare distribution is evidence that the measured operation may contribute; it is not proof of provider-internal equivalence.",
        },
        "notApplicableStages": manifest["notApplicableStages"],
        "sampleTrajectories": trajectory_rows,
        "noSafeRetuning": True,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"stages": sorted(stages), "publicMedian": public_median, "cloudflareMedian": cloudflare_median, "gap": gap}))


if __name__ == "__main__":
    main()
