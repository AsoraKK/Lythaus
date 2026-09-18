"""Independent aggregate check for the frozen WP007J-R1 SAFE embeddings."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np


def cosine_distance(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    a_norm = np.linalg.norm(a, axis=1)
    b_norm = np.linalg.norm(b)
    return 1.0 - (a @ b) / (a_norm * b_norm)


def median_group(vectors: np.ndarray, families: np.ndarray, family: str) -> np.ndarray:
    return vectors[families == family]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--npz", required=True)
    parser.add_argument("--results", required=True)
    parser.add_argument("--analysis", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    with np.load(args.npz) as data:
        vectors = np.asarray(data["vectors"], dtype=np.float64)
        sample_ids = np.asarray(data["sample_ids"])
        families = np.asarray(data["source_families"])

    results = json.loads(Path(args.results).read_text(encoding="utf-8"))
    result_rows = results["records"]
    result_ids = np.asarray([row["sampleId"] for row in result_rows])
    if not np.array_equal(sample_ids.astype(str), result_ids.astype(str)):
        raise SystemExit("embedding sample order does not match score result order")

    roles = np.asarray([row["role"] for row in result_rows])
    labels = np.asarray([row["label"] for row in result_rows])
    generator_names = np.asarray([row.get("generatorFamily") or "" for row in result_rows])

    real = vectors[labels == 0]
    easy = vectors[(roles == "REPRESENTATION_SYNTHETIC") & ~np.isin(generator_names, ["Seedream-4", "imagen-4"])]
    real_centroid = real.mean(axis=0)
    easy_centroid = easy.mean(axis=0)

    summaries = {}
    group_masks = {
        "FLUX1_PUBLIC": roles == "FLUX1_PUBLIC_DIAGNOSTIC",
        "FLUX1_CLOUDFLARE": roles == "FLUX1_CLOUDFLARE_DIAGNOSTIC",
    }
    for group, mask in group_masks.items():
        rows = vectors[mask]
        summaries[group] = {
            "n": int(len(rows)),
            "medianCosineToRealCentroid": float(np.median(cosine_distance(rows, real_centroid))),
            "medianCosineToEasySyntheticCentroid": float(np.median(cosine_distance(rows, easy_centroid))),
        }

    prior = json.loads(Path(args.analysis).read_text(encoding="utf-8"))
    expected = {
        "FLUX1_PUBLIC": {
            "medianCosineToRealCentroid": prior["familySummary"]["FLUX1_PUBLIC"]["cosineToRealCentroid"]["median"],
            "medianCosineToEasySyntheticCentroid": prior["familySummary"]["FLUX1_PUBLIC"]["cosineToEasySyntheticCentroid"]["median"],
        },
        "FLUX1_CLOUDFLARE": {
            "medianCosineToRealCentroid": prior["familySummary"]["FLUX1_CLOUDFLARE"]["cosineToRealCentroid"]["median"],
            "medianCosineToEasySyntheticCentroid": prior["familySummary"]["FLUX1_CLOUDFLARE"]["cosineToEasySyntheticCentroid"]["median"],
        },
    }
    deltas = {
        group: {
            key: summaries[group][key] - expected[group][key]
            for key in expected[group]
        }
        for group in expected
    }
    max_delta = max(abs(value) for group in deltas.values() for value in group.values())
    output = {
        "schemaVersion": "WP007J_R1_FLUX1_REPRESENTATION_INDEPENDENT_CHECK_V1",
        "method": "Independent NumPy recomputation from frozen vectors and sample order.",
        "summaries": summaries,
        "expectedFromPrimaryAnalysis": expected,
        "deltas": deltas,
        "maxAbsoluteDelta": float(max_delta),
        "pass": bool(max_delta <= 1e-10),
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    }
    Path(args.output).write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
