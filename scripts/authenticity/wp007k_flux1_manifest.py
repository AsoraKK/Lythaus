"""Freeze already-consumed FLUX.1 files for post-hoc CES-S diagnostics."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--public-root", type=Path, required=True)
    parser.add_argument("--cloudflare-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    records = []
    for file_path in sorted(args.public_root.rglob("*")):
        if file_path.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
            continue
        if "flux.2" in str(file_path).lower() or "flux2" in str(file_path).lower():
            raise RuntimeError("FORBIDDEN_FLUX2_PATH")
        operation = file_path.parent.name
        sample = file_path.stem
        records.append({
            "recordId": f"PUBLIC_{operation}_{sample}",
            "relativePath": file_path.relative_to(args.public_root).as_posix(),
            "rootKey": "PUBLIC_FLUX1_DIAGNOSTIC",
            "sourceFamilyId": "PUBLIC_FLUX1_DIAGNOSTIC",
            "generatorFamily": "FLUX.1_PUBLIC_PROCESSED",
            "sourceSubtype": "POST_HOC_SYNTHETIC_DIAGNOSTIC",
            "truthLabel": 1,
            "operation": operation,
            "encoder": "POST_HOC_PUBLIC_PROCESSING",
            "parentSampleId": sample,
            "role": "POST_HOC_DIAGNOSTIC_ONLY",
        })
    for file_path in sorted(args.cloudflare_root.rglob("*")):
        if file_path.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
            continue
        if "flux.2" in str(file_path).lower() or "flux2" in str(file_path).lower():
            raise RuntimeError("FORBIDDEN_FLUX2_PATH")
        sample = file_path.stem
        records.append({
            "recordId": f"CLOUDFLARE_{sample}",
            "relativePath": file_path.relative_to(args.cloudflare_root).as_posix(),
            "rootKey": "CLOUDFLARE_FLUX1_DIAGNOSTIC",
            "sourceFamilyId": "CLOUDFLARE_FLUX1_DIAGNOSTIC",
            "generatorFamily": "FLUX.1_CLOUDFLARE",
            "sourceSubtype": "POST_HOC_SYNTHETIC_DIAGNOSTIC",
            "truthLabel": 1,
            "operation": "CLOUDFLARE_BASELINE",
            "encoder": "CLOUDFLARE_CONSUMED_OUTPUT",
            "parentSampleId": sample,
            "role": "POST_HOC_DIAGNOSTIC_ONLY",
        })
    records.sort(key=lambda row: row["recordId"])
    payload = {
        "schemaVersion": "lythaus-wp007k-flux1-diagnostic-manifest-v1",
        "role": "POST_HOC_DIAGNOSTIC_ONLY",
        "publicRootSha256": "FILESYSTEM_CACHE_NOT_A_GIT_ARTIFACT",
        "cloudflareRootSha256": "FILESYSTEM_CACHE_NOT_A_GIT_ARTIFACT",
        "recordCount": len(records),
        "publicCount": sum(row["generatorFamily"] == "FLUX.1_PUBLIC_PROCESSED" for row in records),
        "cloudflareCount": sum(row["generatorFamily"] == "FLUX.1_CLOUDFLARE" for row in records),
        "records": records,
        "usesForFit": False,
        "usesForThreshold": False,
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    }
    payload["manifestSha256"] = hashlib.sha256(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    args.output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"records": len(records), "public": payload["publicCount"], "cloudflare": payload["cloudflareCount"], "flux2PixelAccess": False}))


if __name__ == "__main__":
    main()
