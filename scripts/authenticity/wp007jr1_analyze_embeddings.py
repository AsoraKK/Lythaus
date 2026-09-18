"""Descriptive, family-grouped analysis of the frozen SAFE-A representation."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

import numpy as np
from scipy.stats import pearsonr, spearmanr


def stats(values: np.ndarray) -> dict[str, float | int]:
    values = np.asarray(values, dtype=float)
    return {
        "n": int(values.size),
        "mean": float(np.mean(values)),
        "std": float(np.std(values)),
        "min": float(np.min(values)),
        "p05": float(np.quantile(values, 0.05)),
        "p25": float(np.quantile(values, 0.25)),
        "median": float(np.median(values)),
        "p75": float(np.quantile(values, 0.75)),
        "p95": float(np.quantile(values, 0.95)),
        "max": float(np.max(values)),
    }


def canonical_sha(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()


def cosine_distance(matrix: np.ndarray, centroid: np.ndarray) -> np.ndarray:
    matrix_norm = np.linalg.norm(matrix, axis=1)
    centroid_norm = np.linalg.norm(centroid)
    similarity = (matrix @ centroid) / np.maximum(matrix_norm * centroid_norm, 1e-12)
    return 1.0 - similarity


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--results", type=Path, required=True)
    parser.add_argument("--embeddings", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--pca-output", type=Path, required=True)
    args = parser.parse_args()

    result = json.loads(args.results.read_text(encoding="utf-8"))
    arrays = np.load(args.embeddings, allow_pickle=False)
    vectors = np.asarray(arrays["vectors"], dtype=np.float64)
    if vectors.ndim != 2 or vectors.shape[1] != 512 or not np.isfinite(vectors).all():
        raise RuntimeError("SAFE_EMBEDDINGS_SHAPE_OR_FINITE_FAILURE")
    rows = result["records"]
    if len(rows) != vectors.shape[0]:
        raise RuntimeError("SAFE_EMBEDDINGS_ROW_COUNT_MISMATCH")

    def group(row: dict[str, Any]) -> str:
        if row.get("label") == 0:
            return "REAL_CAMERA" if row.get("sourceSubtype") in {"CAMERA_NATIVE", "CAMERA"} else "REAL_DIGITAL_OR_HARD_NEGATIVE"
        family = row.get("generatorFamily") or "UNKNOWN_SYNTHETIC"
        if family == "Seedream-4":
            return "SYNTH_SEEDREAM_4"
        if family == "imagen-4":
            return "SYNTH_IMAGEN_4"
        if row.get("role") == "FLUX1_PUBLIC_DIAGNOSTIC":
            return "FLUX1_PUBLIC"
        if row.get("role") == "FLUX1_CLOUDFLARE_DIAGNOSTIC":
            return "FLUX1_CLOUDFLARE"
        return f"SYNTH_EASY_{family}"

    groups = np.asarray([group(row) for row in rows])
    group_names = sorted(set(groups.tolist()))
    real_mask = np.isin(groups, ["REAL_CAMERA", "REAL_DIGITAL_OR_HARD_NEGATIVE"])
    easy_mask = np.char.startswith(groups.astype(str), "SYNTH_EASY_")
    real_centroid = vectors[real_mask].mean(axis=0)
    easy_centroid = vectors[easy_mask].mean(axis=0)
    real_dist_euclidean = np.linalg.norm(vectors[real_mask] - real_centroid, axis=1)
    real_dist_cosine = cosine_distance(vectors[real_mask], real_centroid)
    family_summary: dict[str, Any] = {}
    centroid_matrix: dict[str, np.ndarray] = {}
    for name in group_names:
        mask = groups == name
        centroid = vectors[mask].mean(axis=0)
        centroid_matrix[name] = centroid
        euclidean = np.linalg.norm(vectors[mask] - real_centroid, axis=1)
        cosine = cosine_distance(vectors[mask], real_centroid)
        to_easy = cosine_distance(vectors[mask], easy_centroid)
        family_summary[name] = {
            "n": int(mask.sum()),
            "euclideanToRealCentroid": stats(euclidean),
            "cosineToRealCentroid": stats(cosine),
            "cosineToEasySyntheticCentroid": stats(to_easy),
            "withinCentroidEuclidean": stats(np.linalg.norm(vectors[mask] - centroid, axis=1)),
            "centroidL2Norm": float(np.linalg.norm(centroid)),
            "centroidSha256": hashlib.sha256(centroid.astype(np.float32).tobytes()).hexdigest(),
        }

    names = sorted(centroid_matrix)
    centroid_distance_matrix = {}
    for left in names:
        centroid_distance_matrix[left] = {}
        for right in names:
            centroid_distance_matrix[left][right] = {
                "euclidean": float(np.linalg.norm(centroid_matrix[left] - centroid_matrix[right])),
                "cosine": float(cosine_distance(centroid_matrix[left][None, :], centroid_matrix[right])[0]),
            }

    normalized = vectors / np.maximum(np.linalg.norm(vectors, axis=1, keepdims=True), 1e-12)
    nearest_composition: dict[str, Any] = {}
    for name in group_names:
        indices = np.flatnonzero(groups == name)
        compositions = []
        for index in indices:
            distances = 1.0 - normalized @ normalized[index]
            distances[index] = np.inf
            neighbours = np.argsort(distances)[:5]
            counts: dict[str, int] = {}
            for neighbour in neighbours:
                counts[str(groups[neighbour])] = counts.get(str(groups[neighbour]), 0) + 1
            compositions.append(counts)
        aggregate: dict[str, int] = {}
        for composition in compositions:
            for neighbour_group, count in composition.items():
                aggregate[neighbour_group] = aggregate.get(neighbour_group, 0) + count
        nearest_composition[name] = {
            "nQueries": len(compositions),
            "fiveNearestNeighbourGroupCounts": aggregate,
            "meanSyntheticNeighbourCount": float(np.mean([sum(value for key, value in c.items() if key.startswith("SYNTH_") or key.startswith("FLUX1_")) for c in compositions])) if compositions else 0.0,
        }

    centered = vectors - vectors.mean(axis=0, keepdims=True)
    _, singular_values, right_vectors = np.linalg.svd(centered, full_matrices=False)
    explained = (singular_values**2) / np.maximum(np.sum(singular_values**2), 1e-12)
    coordinates = centered @ right_vectors[:3].T
    pca_rows = [
        {"sampleId": row["sampleId"], "group": str(groups[index]), "pc1": float(coordinates[index, 0]), "pc2": float(coordinates[index, 1]), "pc3": float(coordinates[index, 2])}
        for index, row in enumerate(rows)
    ]
    pca_payload = {"dimension": 512, "n": int(vectors.shape[0]), "explainedVarianceRatioFirst10": explained[:10].tolist(), "rows": pca_rows}
    args.pca_output.parent.mkdir(parents=True, exist_ok=True)
    args.pca_output.write_text(json.dumps(pca_payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    scores = np.asarray([float(row["rawScore"]) for row in rows])
    real_distance_all = np.linalg.norm(vectors - real_centroid, axis=1)
    real_cosine_all = cosine_distance(vectors, real_centroid)
    score_distance = {}
    for label, values in [("euclideanToRealCentroid", real_distance_all), ("cosineToRealCentroid", real_cosine_all)]:
        score_distance[label] = {
            "pearson": float(pearsonr(scores, values).statistic),
            "spearman": float(spearmanr(scores, values).statistic),
        }

    cases = {}
    real_p95_cosine = float(np.quantile(real_dist_cosine, 0.95))
    for target, target_group in [("Seedream-4", "SYNTH_SEEDREAM_4"), ("Imagen-4", "SYNTH_IMAGEN_4")]:
        mask = groups == target_group
        target_cosine = real_cosine_all[mask]
        target_easy_distance = cosine_distance(vectors[mask], easy_centroid)
        median_real = float(np.median(target_cosine))
        median_easy = float(np.median(target_easy_distance))
        if median_real <= real_p95_cosine:
            case = "C_REAL_IMAGE_SPACE"
        elif median_easy < median_real:
            case = "A_CLOSER_TO_SAFE_EASY_SYNTHETICS"
        else:
            case = "B_DISTINCT_NON_REAL_CLUSTER"
        cases[target] = {
            "n": int(mask.sum()),
            "medianCosineToRealCentroid": median_real,
            "medianCosineToEasyCentroid": median_easy,
            "realControlCosineP95": real_p95_cosine,
            "case": case,
        }

    plausible = any(value["case"] in {"A_CLOSER_TO_SAFE_EASY_SYNTHETICS", "B_DISTINCT_NON_REAL_CLUSTER"} for value in cases.values())
    output = {
        "schemaVersion": "lythaus-wp007jr1-representation-analysis-v1",
        "inputResultsSha256": hashlib.sha256(args.results.read_bytes()).hexdigest(),
        "embeddingArtifactSha256": hashlib.sha256(args.embeddings.read_bytes()).hexdigest(),
        "n": int(vectors.shape[0]),
        "dimension": int(vectors.shape[1]),
        "finite": bool(np.isfinite(vectors).all()),
        "groups": {name: int((groups == name).sum()) for name in group_names},
        "realControlCentroid": {"n": int(real_mask.sum()), "l2Norm": float(np.linalg.norm(real_centroid)), "p95CosineRadius": real_p95_cosine},
        "easySyntheticCentroid": {"n": int(easy_mask.sum()), "l2Norm": float(np.linalg.norm(easy_centroid))},
        "familySummary": family_summary,
        "centroidDistanceMatrix": centroid_distance_matrix,
        "nearestNeighbourComposition": nearest_composition,
        "pca": {"explainedVarianceRatioFirst10": explained[:10].tolist(), "coordinateArtifact": "representation-pca.json"},
        "scoreDistanceRelationships": score_distance,
        "missedFamilyCases": cases,
        "linearProbeDecision": {
            "plausibleSeparationSignal": plausible,
            "rule": "Permit a predeclared family-held-out linear probe only if at least one missed family is outside the real-control cosine P95 and not closer to the real centroid than to the easy-synthetic centroid.",
            "nextStep": "PREDECLARE_LINEAR_PROBE" if plausible else "DO_NOT_FIT_SAFE_B; REPRESENTATION_DOMAIN_GAP_REMAINS",
        },
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"n": output["n"], "dimension": output["dimension"], "missedFamilyCases": cases, "plausibleSeparationSignal": plausible}, sort_keys=True))


if __name__ == "__main__":
    main()
