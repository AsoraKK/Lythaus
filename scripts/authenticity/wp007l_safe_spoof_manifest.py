"""Build an external, score-blind SAFE-A manifest for WP007L spoof diagnostics."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runtime-manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    runtime = json.loads(args.runtime_manifest.read_text(encoding="utf-8"))
    if not runtime.get("scoreBlind") or runtime.get("flux2PixelAccess") or runtime.get("flux2ProviderCalls") != 0:
        raise RuntimeError("SPOOF_MANIFEST_SOURCE_NOT_SCORE_BLIND_OR_SEALED")
    rows = []
    for record in runtime["records"]:
        if record.get("kind") != "SPOOF":
            continue
        path = Path(record["runtimePath"])
        rows.append(
            {
                "rowKey": record["sampleId"],
                "baseRowKey": record.get("parentSampleId"),
                "transform": record.get("operation"),
                "sampleId": record["sampleId"],
                "sourceFamilyId": record["sourceFamilyId"],
                "sourceRootKey": record.get("parentSampleId"),
                "generatorFamily": "SPOOF_SYNTHETIC_PROFILE",
                "role": "WP007L_PROFILE_SPOOF_DIAGNOSTIC",
                "label": 1,
                "sourceSubtype": "SYNTHETIC_PROFILE_SPOOF",
                "inputPath": str(path),
                "sourceSha256": sha256_file(path),
                "format": "JPEG",
                "inputRegime": "CAMERA_PROFILE_SPOOF_DIAGNOSTIC",
            }
        )
    output = {
        "schemaVersion": "lythaus-wp007l-safe-spoof-manifest-v1",
        "scoreBlind": True,
        "flux1PixelAccess": False,
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
        "diagnosticRole": "SAFE_CAMERA_PROFILE_SPOOF_POST_MATERIALIZATION",
        "selectionFrozenBeforeToolScoring": True,
        "records": sorted(rows, key=lambda row: row["rowKey"]),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"records": len(rows), "manifestSha256": sha256_file(args.output)}))


if __name__ == "__main__":
    main()
