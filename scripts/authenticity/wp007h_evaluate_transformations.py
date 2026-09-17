"""Evaluate frozen SAFE transformation descendants and applicability regimes."""

from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from pathlib import Path

from PIL import Image


THRESHOLD = 0.5864923000335693
TRANSFORM_APPLICABILITY = {
    "JPEG95": "MODERATE",
    "JPEG85": "MODERATE",
    "JPEG75": "LOW",
    "RESIZE75": "MODERATE",
    "RESIZE50": "LOW",
    "SCREENSHOT_STYLE_RESAMPLING": "LOW",
    "METADATA_STRIP": "HIGH",
    "MILD_CROP": "MODERATE",
    "MILD_BLUR": "MODERATE",
    "MILD_SHARPEN": "MODERATE",
}


def wilson(successes: int, total: int) -> list[float] | None:
    if total == 0:
        return None
    z = 1.959963984540054
    p = successes / total
    denominator = 1 + z * z / total
    centre = (p + z * z / (2 * total)) / denominator
    margin = z * math.sqrt((p * (1 - p) / total) + (z * z / (4 * total * total))) / denominator
    return [max(0.0, centre - margin), min(1.0, centre + margin)]


def binary(count: int, total: int) -> dict:
    return {"count": count, "n": total, "rate": count / total if total else None, "wilson95": wilson(count, total)}


def median_iqr(values: list[float]) -> dict:
    if not values:
        return {"median": None, "iqr": None}
    ordered = sorted(values)
    def percentile(q: float) -> float:
        position = (len(ordered) - 1) * q
        lower = math.floor(position)
        upper = math.ceil(position)
        if lower == upper:
            return ordered[lower]
        return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)
    return {"median": percentile(0.5), "iqr": percentile(0.75) - percentile(0.25)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--original", type=Path, required=True)
    parser.add_argument("--transforms", type=Path, required=True)
    parser.add_argument("--transform-manifest", type=Path, required=True)
    parser.add_argument("--gates", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--applicability-output", type=Path, required=True)
    args = parser.parse_args()
    original = json.loads(args.original.read_text(encoding="utf-8"))
    transformed = json.loads(args.transforms.read_text(encoding="utf-8"))
    manifest = json.loads(args.transform_manifest.read_text(encoding="utf-8"))
    gates = json.loads(args.gates.read_text(encoding="utf-8"))
    if transformed.get("flux2PixelAccess") or not transformed.get("scoreBlind"):
        raise RuntimeError("TRANSFORMATION_SCORE_INTEGRITY_INVALID")
    base = {row["rowKey"]: row for row in original["records"]}
    rows_by_transform: dict[str, list[dict]] = defaultdict(list)
    for row in transformed["records"]:
        rows_by_transform[row["transformation"]].append(row)
    results = {}
    applicability = {}
    for name in sorted(rows_by_transform):
        rows = rows_by_transform[name]
        joined = [(row, base[row["baseRowKey"]]) for row in rows]
        positives = [(row, original_row) for row, original_row in joined if row["label"] == 1]
        negatives = [(row, original_row) for row, original_row in joined if row["label"] == 0]
        current_positive_hits = sum(row["rawScore"] >= THRESHOLD for row, _ in positives)
        baseline_positive_hits = sum(original_row["rawScore"] >= THRESHOLD for _, original_row in positives)
        current_negative_hits = sum(row["rawScore"] >= THRESHOLD for row, _ in negatives)
        baseline_negative_hits = sum(original_row["rawScore"] >= THRESHOLD for _, original_row in negatives)
        current_camera = [(row, original_row) for row, original_row in negatives if row.get("sourceSubtype") == "CAMERA" or row.get("cameraDeviceFamily")]
        current_digital = [(row, original_row) for row, original_row in negatives if not (row.get("sourceSubtype") == "CAMERA" or row.get("cameraDeviceFamily"))]
        deltas = [row["rawScore"] - original_row["rawScore"] for row, original_row in joined]
        positive_deltas = [row["rawScore"] - original_row["rawScore"] for row, original_row in positives]
        negative_deltas = [row["rawScore"] - original_row["rawScore"] for row, original_row in negatives]
        flips = sum((row["rawScore"] >= THRESHOLD) != (original_row["rawScore"] >= THRESHOLD) for row, original_row in joined)
        severe = sum((original_row["rawScore"] >= THRESHOLD) and (row["rawScore"] < THRESHOLD) for row, original_row in positives)
        fpr_delta = (current_negative_hits - baseline_negative_hits) / len(negatives) if negatives else None
        retention = current_positive_hits / baseline_positive_hits if baseline_positive_hits else None
        result = {
            "recordCount": len(rows),
            "syntheticCount": len(positives),
            "negativeCount": len(negatives),
            "syntheticRecall": binary(current_positive_hits, len(positives)),
            "baselineSyntheticRecall": binary(baseline_positive_hits, len(positives)),
            "syntheticRecallRetention": retention,
            "negativeFpr": binary(current_negative_hits, len(negatives)),
            "baselineNegativeFpr": binary(baseline_negative_hits, len(negatives)),
            "negativeFprDelta": fpr_delta,
            "cameraFpr": binary(sum(row["rawScore"] >= THRESHOLD for row, _ in current_camera), len(current_camera)),
            "digitalFpr": binary(sum(row["rawScore"] >= THRESHOLD for row, _ in current_digital), len(current_digital)),
            "scoreShiftAll": median_iqr(deltas),
            "scoreShiftSynthetic": median_iqr(positive_deltas),
            "scoreShiftNegative": median_iqr(negative_deltas),
            "decisionFlip": binary(flips, len(joined)),
            "severeCollapseCount": binary(severe, len(positives)),
            "applicability": TRANSFORM_APPLICABILITY[name],
        }
        results[name] = result
        metadata = []
        for record in manifest["records"]:
            if record["transform"] != name:
                continue
            try:
                with Image.open(record["inputPath"]) as image:
                    metadata.append({"format": image.format, "width": image.width, "height": image.height, "bytes": record["outputBytes"]})
            except Exception:
                metadata.append({"format": None, "width": None, "height": None, "bytes": record["outputBytes"]})
        applicability[name] = {
            "classification": TRANSFORM_APPLICABILITY[name],
            "deterministicInputEvidence": {
                "transformationLineage": name,
                "formatCounts": {fmt: sum(item["format"] == fmt for item in metadata) for fmt in sorted({item["format"] for item in metadata})},
                "dimensions": {f"{item['width']}x{item['height']}": sum(other["width"] == item["width"] and other["height"] == item["height"] for other in metadata) for item in metadata},
                "byteMedian": median_iqr([float(item["bytes"]) for item in metadata])["median"],
            },
            "syntheticEvidenceAuthority": "REDUCED_OR_PRESERVED_BY_APPLICABILITY_ONLY; NOT_AUTHENTICITY_TRUTH",
        }
    fragile = any((item["syntheticRecallRetention"] is not None and item["syntheticRecallRetention"] < 0.70) or (item["negativeFprDelta"] is not None and item["negativeFprDelta"] > 0.05) for item in results.values())
    mixed = any((item["syntheticRecallRetention"] is not None and item["syntheticRecallRetention"] < 0.90) or (item["negativeFprDelta"] is not None and item["negativeFprDelta"] > 0.02) for item in results.values())
    output = {
        "schemaVersion": "lythaus-wp007h-safe-transformation-results-v1",
        "detectorId": "SAFE",
        "threshold": THRESHOLD,
        "noThresholdRetuning": True,
        "sampleCount": 80,
        "transformationCount": len(transformed["records"]),
        "classificationRule": gates["classificationRule"],
        "transforms": results,
        "classification": "FRAGILE" if fragile else ("MIXED" if mixed else "ROBUST"),
        "flux1PixelAccess": False,
        "flux2PixelAccess": False,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.applicability_output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    args.applicability_output.write_text(json.dumps({"schemaVersion": "lythaus-wp007h-input-regime-applicability-v1", "detectorId": "SAFE", "rule": gates["applicabilityRule"], "regimes": applicability, "metadataIsNotSyntheticEvidence": True, "flux2PixelAccess": False}, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"classification": output["classification"], "transforms": sorted(results), "output": str(args.output)}))


if __name__ == "__main__":
    main()
