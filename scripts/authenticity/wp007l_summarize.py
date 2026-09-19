"""Reduce WP007L runtime records to sanitized, source-level research artifacts."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import statistics
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


SAFE_CHECKPOINT = "b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e"
SAFE_THRESHOLD = 0.5864923000335693


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def wilson(x: int, n: int) -> dict[str, Any]:
    if n == 0:
        return {"numerator": x, "denominator": n, "observed": None, "lower95": None, "upper95": None}
    z = 1.959963984540054
    p = x / n
    d = 1 + z * z / n
    centre = (p + z * z / (2 * n)) / d
    half = z * math.sqrt((p * (1 - p) / n) + (z * z / (4 * n * n))) / d
    return {"numerator": x, "denominator": n, "observed": p, "lower95": max(0.0, centre - half), "upper95": min(1.0, centre + half)}


def load_jsonl(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def dist(values: list[float]) -> dict[str, Any]:
    if not values:
        return {"n": 0, "min": None, "median": None, "mean": None, "max": None}
    return {"n": len(values), "min": min(values), "median": statistics.median(values), "mean": statistics.fmean(values), "max": max(values)}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--feature-records", type=Path, required=True)
    parser.add_argument("--safe-scores", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--zero-output", type=Path, default=None)
    args = parser.parse_args()
    rows = load_jsonl(args.feature_records)
    scores = json.loads(args.safe_scores.read_text(encoding="utf-8"))
    score_rows = {row["sampleId"]: row for row in scores["records"]}
    out = args.output_dir
    out.mkdir(parents=True, exist_ok=True)

    spoofs = [row for row in rows if row.get("kind") == "SPOOF"]
    row_by_id = {row.get("sampleId"): row for row in rows}
    spoof_matches = []
    for row in spoofs:
        reference = row.get("cameraReferenceProfile", {})
        metadata = row.get("metadata", {})
        reference_row = row_by_id.get(row.get("cameraReferenceSampleId"), {})
        reference_metadata = reference_row.get("metadata", {})
        profile = {
            "dqt": row.get("quantizationTableSha256") == reference.get("quantizationTableSha256"),
            "sampling": row.get("sampling") == reference.get("sampling"),
            "markerSequence": row.get("markerSequenceSha256") == reference.get("markerSequenceSha256"),
            "huffman": row.get("huffmanTableSha256") == reference.get("huffmanTableSha256"),
            "exifTagSet": metadata.get("exifTagIdsSha256") == reference_metadata.get("exifTagIdsSha256"),
            "metadataMarkers": metadata.get("metadataMarkers", []) == reference.get("metadata", []),
            "icc": metadata.get("iccPresent") == reference_metadata.get("iccPresent"),
        }
        score = score_rows.get(row["sampleId"], {})
        spoof_matches.append({"sampleId": row["sampleId"], "profileMatch": profile, "safeHigh": bool(score.get("rawScore", 0) >= SAFE_THRESHOLD), "originInferenceForbidden": True})
    match_rates = {key: wilson(sum(item["profileMatch"][key] for item in spoof_matches), len(spoof_matches)) for key in ["dqt", "sampling", "markerSequence", "huffman", "exifTagSet", "metadataMarkers", "icc"]}
    high = sum(item["safeHigh"] for item in spoof_matches)
    safe_scores = [score_rows[item["sampleId"]].get("rawScore") for item in spoof_matches if score_rows.get(item["sampleId"], {}).get("rawScore") is not None]
    safe_artifact = {
        "schemaVersion": "lythaus-wp007l-safe-camera-profile-spoof-v2",
        "safeA": {"checkpointSha256": SAFE_CHECKPOINT, "threshold": SAFE_THRESHOLD, "weightsModified": False, "scoreManifestSha256": sha256_file(args.safe_scores)},
        "spoofCount": len(spoof_matches),
        "profileMatchRates": match_rates,
        "safeHighRate": wilson(high, len(spoof_matches)),
        "safeScoreDistribution": dist(safe_scores),
        "rows": spoof_matches,
        "conclusion": "A synthetic image can copy the observed DQT, sampling and selected metadata tag profile in this controlled attempt while remaining synthetic. The copied-profile files were not high SAFE-A at the frozen threshold; this does not make profile consistency evidence of human or camera origin.",
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    }
    (out / "safe-camera-profile-spoof-results.json").write_text(json.dumps(safe_artifact, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    originals = {row["sampleId"]: row for row in rows if row.get("kind") == "ORIGINAL"}
    descendants = [row for row in rows if row.get("kind") == "DESCENDANT"]
    op = defaultdict(list)
    for row in descendants:
        op[row.get("operation")].append(row)
    source_level = []
    for operation, group in sorted(op.items()):
        parents = defaultdict(list)
        for row in group:
            parents[row.get("parentSampleId")].append(row)
        changed = sum(any(child.get("quantizationTableSha256") != originals.get(parent, {}).get("quantizationTableSha256") or child.get("markerSequenceSha256") != originals.get(parent, {}).get("markerSequenceSha256") for child in children) for parent, children in parents.items())
        source_level.append({"operation": operation, "sourceParents": len(parents), "sourceParentsWithCurrentByteChange": changed, "currentByteChangeRate": changed / len(parents) if parents else None, "descendants": len(group), "interpretation": "current-byte evidence only; not complete edit-history proof"})
    (out / "source-level-operation-summary.json").write_text(json.dumps({"schemaVersion": "lythaus-wp007l-source-level-operation-summary-v1", "rows": source_level, "primaryUnit": "source parent", "flux2PixelAccess": False}, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    original_rows = [row for row in rows if row.get("kind") == "ORIGINAL"]
    dev_rows = [row for row in original_rows if str(row.get("role", "")).startswith("DEVELOPMENT")]
    confirm_rows = [row for row in original_rows if str(row.get("role", "")).startswith("CONFIRMATION")]
    qtable_matches = sum(item["profileMatch"]["dqt"] for item in spoof_matches)
    sampling_matches = sum(item["profileMatch"]["sampling"] for item in spoof_matches)
    eligibility = {
        "schemaVersion": "lythaus-wp007l-eligibility-boundary-analysis-v1",
        "currentByteMeasurements": {"developmentOriginals": len(dev_rows), "confirmationSourceFamilies": len(confirm_rows), "knownOperationSummary": "source-level-operation-summary.json"},
        "profileSpoof": {"syntheticSpoofs": len(spoof_matches), "dqtMatch": wilson(qtable_matches, len(spoof_matches)), "samplingMatch": wilson(sampling_matches, len(spoof_matches)), "safeHigh": wilson(high, len(spoof_matches))},
        "researchStates": {
            "EVIDENCE_GRADE": "NOT_DEMONSTRATED",
            "ACQUISITION_CONSISTENT": "CONTEXT_ONLY_WHEN_CURRENT_BYTE_FACTS_AND_KNOWN_LINEAGE_AGREE",
            "LIMITED_FORENSIC_QUALITY": "AVAILABLE_FOR_KNOWN_CONTROLLED_DESCENDANTS",
            "UNSUPPORTED_FOR_CERTIFICATION": "REQUIRED_WHEN_HISTORY_OR_APPLICABILITY_IS_UNKNOWN_OR_DESTRUCTIVE_EVIDENCE_IS_PRESENT",
            "UNKNOWN": "REQUIRED_WHEN_PARSER_OR_PROVENANCE_EVIDENCE_IS_MISSING",
        },
        "whyBroadSupportedNotEarned": ["confirmation is historical camera-claimed media, not a fresh physical-device panel", "static DQT/sampling/metadata profile can be copied in the controlled synthetic spoof", "no validated PRNU/device-level route exists", "C2PA signed-fixture validation was not executed"],
        "notAuthenticity": ["camera-looking profile is not human", "JPEG is not AI", "PNG is not a lossless-history proof", "metadata presence/absence is not authorship"],
        "boundedResearchEstimate": "Not a customer-traffic estimate; no broad SUPPORTED percentage is reported.",
        "disposition": "NATIVE_CAMERA_SUPPORTED_ROUTE_NOT_DEMONSTRATED",
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    }
    (out / "eligibility-boundary-analysis.json").write_text(json.dumps(eligibility, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    unique_ops = Counter(row.get("operation") for row in rows)
    (out / "toolforge-sanitized-run-summary.json").write_text(json.dumps({
        "schemaVersion": "lythaus-wp007l-toolforge-sanitized-run-summary-v1",
        "featureRecordsSha256": sha256_file(args.feature_records),
        "featureRecordCount": len(rows),
        "validCount": sum(bool(row.get("valid")) for row in rows),
        "originalCount": sum(row.get("kind") == "ORIGINAL" for row in rows),
        "descendantCount": sum(row.get("kind") == "DESCENDANT" for row in rows),
        "spoofCount": len(spoofs),
        "operations": dict(sorted(unique_ops.items())),
        "safeCheckpointSha256": SAFE_CHECKPOINT,
        "safeAThreshold": SAFE_THRESHOLD,
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    }, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    if args.zero_output is not None:
        (out / "zero-oracle-results.json").write_text(json.dumps({
            "schemaVersion": "lythaus-wp007l-zero-oracle-results-v1",
            "repo": "tinankh/ZERO",
            "commit": "f0fd24d58e51f69297f9981b6aa7d584e0d8ddcf",
            "license": "AGPL-3.0",
            "execution": "compiled under existing WSL Ubuntu GCC/libjpeg/libpng/libtiff toolchain; one controlled native camera source and Q95 descendant",
            "capturedOutput": args.zero_output.read_text(encoding="utf-8", errors="replace"),
            "decision": "RESEARCH_ORACLE_ONLY",
            "copiedSource": False,
            "flux2PixelAccess": False,
        }, indent=2, sort_keys=True) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
