"""Build a post-freeze WP007I challenge manifest for CES-S diagnostics."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--wp007i-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    synthetic = read(args.wp007i_root / "fresh-synthetic-freeze.json")["records"]
    negatives = read(args.wp007i_root / "negative-data-freeze.json")["records"]
    selected = [row for row in synthetic if row.get("role") in {"FRESH_SYNTHETIC_DEV", "FRESH_SYNTHETIC_CONFIRM"}]
    selected += [row for row in negatives if row.get("role") == "NEGATIVE_CONFIRM_I"]
    records = []
    for row in selected:
        path = str(row["localRelativePath"])
        if "flux.2" in path.lower() or "flux2" in path.lower():
            raise RuntimeError("FORBIDDEN_FLUX2_DIAGNOSTIC_PATH")
        records.append({
            "recordId": f"{row['sampleId']}__ORIGINAL",
            "sampleId": row["sampleId"],
            "parentSampleId": row["sampleId"],
            "relativePath": path,
            "rootKey": "WP007I_MEDIA",
            "sourceFamilyId": row["sourceFamilyId"],
            "generatorFamily": row.get("generatorFamily"),
            "sourceSubtype": row.get("sourceSubtype", "MODERN_GENERATED"),
            "truthLabel": int(row["label"]),
            "operation": "ORIGINAL",
            "encoder": "ORIGINAL_SOURCE",
            "requestedQuality": None,
            "requestedSubsampling": None,
            "role": "POST_HOC_CES_S_DIAGNOSTIC",
            "rightsClass": row.get("rightsClass") or row.get("sourceRights") or "RESEARCH_EVALUATION_ONLY",
            "historicalRole": row.get("role"),
        })
    records.sort(key=lambda row: row["recordId"])
    payload = {
        "schemaVersion": "lythaus-wp007k-posthoc-challenge-manifest-v1",
        "role": "POST_HOC_DIAGNOSTIC_ONLY",
        "selectionRule": "All WP007I fresh synthetic records plus NEGATIVE_CONFIRM_I records; no SAFE/CES-S score selection.",
        "recordCount": len(records),
        "counts": {
            "synthetic": sum(row["truthLabel"] == 1 for row in records),
            "negative": sum(row["truthLabel"] == 0 for row in records),
            "generatorFamilies": sorted({row["generatorFamily"] for row in records if row["generatorFamily"]}),
            "negativeSubtypes": sorted({row["sourceSubtype"] for row in records if row["truthLabel"] == 0}),
        },
        "sourceFreezeSha256": hashlib.sha256((args.wp007i_root / "fresh-synthetic-freeze.json").read_bytes()).hexdigest(),
        "negativeFreezeSha256": hashlib.sha256((args.wp007i_root / "negative-data-freeze.json").read_bytes()).hexdigest(),
        "records": records,
        "confirmationUsedForFit": False,
        "flux1Tuning": False,
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    }
    payload["manifestSha256"] = hashlib.sha256(json.dumps({k: v for k, v in payload.items() if k != "manifestSha256"}, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    args.output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"records": len(records), "synthetic": payload["counts"]["synthetic"], "negative": payload["counts"]["negative"], "flux2PixelAccess": False}))


if __name__ == "__main__":
    main()
