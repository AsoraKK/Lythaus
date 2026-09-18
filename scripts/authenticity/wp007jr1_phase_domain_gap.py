"""Measure phase/DCT features on the supplemental Seedream/Imagen JPEG cohort."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import wp007jr1_phase_dct_real as phase


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cohort", type=Path, required=True)
    parser.add_argument("--scores", type=Path, required=True)
    parser.add_argument("--parent-results", type=Path, required=True)
    parser.add_argument("--original-media-root", type=Path, required=True)
    parser.add_argument("--media-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    cohort = json.loads(args.cohort.read_text(encoding="utf-8"))
    scores = json.loads(args.scores.read_text(encoding="utf-8"))
    parent_results = json.loads(args.parent_results.read_text(encoding="utf-8"))
    if not cohort.get("scoreBlind") or cohort.get("flux2PixelAccess") or cohort.get("flux2ProviderCalls") != 0:
        raise RuntimeError("DOMAIN_GAP_PHASE_COHORT_NOT_SEALED")
    if scores.get("flux2PixelAccess") or scores.get("flux2ProviderCalls") != 0:
        raise RuntimeError("DOMAIN_GAP_PHASE_SCORES_NOT_SEALED")
    parent_scores = {row["sampleId"]: float(row["rawScore"]) for row in parent_results["records"]}
    score_by_id = {row["derivedId"]: row for row in scores["records"]}
    rows = []
    for parent in cohort["records"]:
        path = args.original_media_root / parent["relativePath"]
        if not path.is_file() or phase.sha256_file(path) != parent["sha256"]:
            raise RuntimeError(f"DOMAIN_GAP_ORIGINAL_HASH_MISMATCH:{parent['sampleId']}")
        array, width, height, metadata = phase.image_array(path)
        rows.append({
            "derivedId": f"ORIGINAL__{parent['sampleId']}",
            "kind": "ORIGINAL",
            "parentSampleId": parent["sampleId"],
            "generatorFamily": parent["generatorFamily"],
            "truthLabel": parent["label"],
            "sourceSubtype": parent["sourceSubtype"],
            "operation": "ORIGINAL",
            "safeRawScore": parent_scores[parent["sampleId"]],
            "safeThresholdPass": parent_scores[parent["sampleId"]] >= scores["threshold"],
            "features": phase.measure(array),
            "sha256": phase.sha256_file(path),
            "decodedWidth": width,
            "decodedHeight": height,
            "imageMetadata": metadata,
        })
    for record in scores["records"]:
        path = args.media_root / record["relativeOutputPath"]
        if not path.is_file() or phase.sha256_file(path) != record["inputSha256"]:
            raise RuntimeError(f"DOMAIN_GAP_DESCENDANT_HASH_MISMATCH:{record['derivedId']}")
        array, width, height, metadata = phase.image_array(path)
        rows.append({
            "derivedId": record["derivedId"],
            "kind": "DESCENDANT",
            "parentSampleId": record["parentSampleId"],
            "generatorFamily": record["generatorFamily"],
            "truthLabel": record["truthLabel"],
            "sourceSubtype": record["sourceSubtype"],
            "operation": record["operation"],
            "safeRawScore": record["rawScore"],
            "safeThresholdPass": record["thresholdPass"],
            "originalRawScore": record["originalRawScore"],
            "features": phase.measure(array),
            "sha256": phase.sha256_file(path),
            "decodedWidth": width,
            "decodedHeight": height,
            "imageMetadata": metadata,
        })
    payload = {
        "schemaVersion": "lythaus-wp007jr1-domain-gap-phase-dct-v1",
        "measurementOnly": True,
        "classifierInvoked": False,
        "sourceCohortFreezeSha256": cohort["freezeSha256"],
        "safeScoreArtifact": "research/wp007j-r1/safe-domain-gap-results.json",
        "knownAnswerFixtures": phase.fixture_checks(),
        "records": rows,
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
        "evidenceRole": "EF4_MEASUREMENT_CANDIDATE_ONLY",
        "productAuthority": "NONE",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"records": len(rows), "fixturesPassed": payload["knownAnswerFixtures"]["passed"]}))


if __name__ == "__main__":
    main()
