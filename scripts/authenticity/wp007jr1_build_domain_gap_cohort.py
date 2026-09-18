"""Freeze the supplemental Seedream-4 and Imagen-4 JPEG diagnostic cohort."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--representation-cohort", type=Path, required=True)
    parser.add_argument("--media-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    source = json.loads(args.representation_cohort.read_text(encoding="utf-8"))
    if not source.get("scoreBlind") or source.get("flux2PixelAccess") or source.get("flux2ProviderCalls") != 0:
        raise RuntimeError("DOMAIN_GAP_SOURCE_NOT_SCORE_BLIND_OR_SEALED")
    records = [row for row in source["records"] if row.get("generatorFamily") in {"Seedream-4", "imagen-4"}]
    records.sort(key=lambda row: (row["generatorFamily"], row["sampleId"]))
    if len(records) != 40 or {row["generatorFamily"] for row in records} != {"Seedream-4", "imagen-4"}:
        raise RuntimeError(f"DOMAIN_GAP_COHORT_UNEXPECTED:{len(records)}")
    frozen = []
    for row in records:
        path = args.media_root / row["relativePath"]
        if not path.is_file() or sha256_file(path) != row["sha256"]:
            raise RuntimeError(f"DOMAIN_GAP_PARENT_HASH_MISMATCH:{row['sampleId']}")
        frozen.append(
            {
                "sampleId": row["sampleId"],
                "sourceFamilyId": row["sourceFamilyId"],
                "generatorFamily": row["generatorFamily"],
                "label": row["label"],
                "sourceSubtype": row["sourceSubtype"],
                "relativePath": row["relativePath"],
                "sha256": row["sha256"],
                "bytes": row["bytes"],
                "sourceDataset": row["sourceDataset"],
                "role": "JPEG_DOMAIN_GAP_SYNTHETIC",
            }
        )
    payload = {
        "schemaVersion": "lythaus-wp007jr1-domain-gap-cohort-v1",
        "scoreBlind": True,
        "sourceRepresentationCohortFreezeSha256": source["freezeSha256"],
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
        "families": ["Seedream-4", "imagen-4"],
        "records": frozen,
    }
    payload["freezeSha256"] = hashlib.sha256(canonical_bytes(payload)).hexdigest()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"records": len(frozen), "freezeSha256": payload["freezeSha256"]}))


if __name__ == "__main__":
    main()
