"""Score the frozen Seedream-4/Imagen-4 JPEG diagnostic cohort with SAFE-A."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import torch
from torchvision import transforms

import wp007jr1_score_jpeg_lab as base


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--safe-root", type=Path, required=True)
    parser.add_argument("--checkpoint", type=Path, required=True)
    parser.add_argument("--cohort", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--media-root", type=Path, required=True)
    parser.add_argument("--parent-results", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--threads", type=int, default=4)
    args = parser.parse_args()
    cohort = json.loads(args.cohort.read_text(encoding="utf-8"))
    if not cohort.get("scoreBlind") or cohort.get("flux2PixelAccess") or cohort.get("flux2ProviderCalls") != 0:
        raise RuntimeError("DOMAIN_GAP_COHORT_NOT_SCORE_BLIND_OR_SEALED")
    manifest = base.verify_generated_manifest(args.manifest)
    parent = json.loads(args.parent_results.read_text(encoding="utf-8"))
    if parent.get("checkpointSha256") != base.SAFE_CHECKPOINT_SHA256 or parent.get("threshold") != base.SAFE_THRESHOLD:
        raise RuntimeError("DOMAIN_GAP_PARENT_SAFE_REFERENCE_MISMATCH")
    parent_scores = {row["sampleId"]: float(row["rawScore"]) for row in parent["records"]}
    torch.set_num_threads(args.threads)
    torch.set_num_interop_threads(1)
    model = base.load_model(args.safe_root, args.checkpoint)
    rows = []
    for record in manifest["records"]:
        path = args.media_root / record["relativeOutputPath"]
        if not path.is_file() or base.sha256_file(path) != record["sha256"]:
            raise RuntimeError(f"DOMAIN_GAP_OUTPUT_HASH_MISMATCH:{record['derivedId']}")
        score, width, height, preprocess_ms, runtime_ms = base.safe_score(model, path, transforms.CenterCrop((256, 256)), transforms.ToTensor())
        original = parent_scores[record["parentSampleId"]]
        rows.append({
            "derivedId": record["derivedId"],
            "parentSampleId": record["parentSampleId"],
            "generatorFamily": record["generatorFamily"],
            "sourceFamilyId": record["sourceFamilyId"],
            "truthLabel": record["truthLabel"],
            "sourceSubtype": record["sourceSubtype"],
            "operation": record["operation"],
            "encoder": record["encoder"],
            "requestedQuality": record["requestedQuality"],
            "requestedSubsampling": record["requestedSubsampling"],
            "relativeOutputPath": record["relativeOutputPath"],
            "inputSha256": record["sha256"],
            "decodedWidth": width,
            "decodedHeight": height,
            "rawScore": score,
            "originalRawScore": original,
            "scoreDeltaFromOriginal": score - original,
            "threshold": base.SAFE_THRESHOLD,
            "thresholdPass": score >= base.SAFE_THRESHOLD,
            "originalThresholdPass": original >= base.SAFE_THRESHOLD,
            "preprocessMs": preprocess_ms,
            "runtimeMs": runtime_ms,
            "status": "OK",
        })
    payload = {
        "schemaVersion": "lythaus-wp007jr1-safe-domain-gap-results-v1",
        "detectorId": "SAFE",
        "detectorVersion": f"SAFE_OFFICIAL_{base.SAFE_COMMIT}",
        "checkpointSha256": base.SAFE_CHECKPOINT_SHA256,
        "threshold": base.SAFE_THRESHOLD,
        "sourceCohortFreezeSha256": cohort["freezeSha256"],
        "generatedManifestSha256": manifest["generatedManifestSha256"],
        "scoreBlindCuration": True,
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
        "records": sorted(rows, key=lambda row: row["derivedId"]),
        "runtimeP50Ms": base.percentile([row["runtimeMs"] for row in rows], 0.50),
        "runtimeP95Ms": base.percentile([row["runtimeMs"] for row in rows], 0.95),
        "note": "Post-hoc diagnostic on a separately frozen supplemental cohort; no SAFE-A threshold or weight change.",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"records": len(rows), "runtimeP95Ms": payload["runtimeP95Ms"]}))


if __name__ == "__main__":
    main()
