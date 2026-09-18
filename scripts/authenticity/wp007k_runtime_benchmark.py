"""Bounded CPU benchmark for the WP007K deterministic path."""

from __future__ import annotations

import argparse
import json
import statistics
import time
from pathlib import Path

from wp007k_codec_specialist import image_array, measure, predict, read_json


def percentile(values: list[float], p: float) -> float:
    values = sorted(values)
    if not values:
        return 0.0
    index = (len(values) - 1) * p
    low = int(index)
    high = min(low + 1, len(values) - 1)
    fraction = index - low
    return values[low] * (1 - fraction) + values[high] * fraction


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--limit", type=int, default=100)
    args = parser.parse_args()
    manifest = read_json(args.manifest)
    model = read_json(args.model)
    rows = sorted(manifest["records"], key=lambda row: row["recordId"])[: args.limit]
    feature_ms: list[float] = []
    ces_ms: list[float] = []
    combined_ms: list[float] = []
    failures = []
    for row in rows:
        path = args.root / row["relativePath"]
        start = time.perf_counter()
        try:
            array, _, _, _ = image_array(path)
            features = measure(array)
            feature_elapsed = (time.perf_counter() - start) * 1000
            feature_ms.append(feature_elapsed)
            start_ces = time.perf_counter()
            predict(model, {"features": features, "codecFacts": {}})
            ces_ms.append((time.perf_counter() - start_ces) * 1000)
            combined_ms.append(feature_elapsed + ces_ms[-1])
        except Exception as exc:  # pragma: no cover - benchmark reporting path
            failures.append({"recordId": row["recordId"], "error": f"{type(exc).__name__}:{exc}"})
    output = {
        "schemaVersion": "lythaus-wp007k-runtime-benchmark-v1",
        "sampleCountRequested": len(rows),
        "sampleCountMeasured": len(combined_ms),
        "failures": failures,
        "featureExtractionMs": {
            "p50": percentile(feature_ms, 0.5),
            "p95": percentile(feature_ms, 0.95),
            "max": max(feature_ms, default=0.0),
            "mean": statistics.fmean(feature_ms) if feature_ms else None,
        },
        "cesSLinearInferenceMs": {
            "p50": percentile(ces_ms, 0.5),
            "p95": percentile(ces_ms, 0.95),
            "max": max(ces_ms, default=0.0),
            "mean": statistics.fmean(ces_ms) if ces_ms else None,
        },
        "combinedFeatureAndCesSMs": {
            "p50": percentile(combined_ms, 0.5),
            "p95": percentile(combined_ms, 0.95),
            "max": max(combined_ms, default=0.0),
            "mean": statistics.fmean(combined_ms) if combined_ms else None,
        },
        "safeAReference": {
            "source": "WP007H frozen runtime evidence",
            "cpuP95Ms": 93.165,
            "notRerunInThisBenchmark": True,
        },
        "modelArtifactBytes": args.model.stat().st_size,
        "modelArtifactSha256": __import__("hashlib").sha256(args.model.read_bytes()).hexdigest(),
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    }
    args.output.write_text(json.dumps(output, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"sampleCountMeasured": len(combined_ms), "failures": len(failures), "combinedP95Ms": output["combinedFeatureAndCesSMs"]["p95"]}))


if __name__ == "__main__":
    main()
