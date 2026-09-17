"""Safely remove only the verified, regenerable WP007I SPAI derivative tree."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import tempfile
from pathlib import Path
from typing import Any


def tree_bytes(path: Path) -> int:
    return sum(item.stat().st_size for item in path.rglob("*") if item.is_file())


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--research", type=Path, required=True)
    parser.add_argument("--media-root", type=Path, required=True)
    parser.add_argument("--spai-root", type=Path, required=True)
    args = parser.parse_args()

    score_file = args.research / "spai-shadow-scores.json"
    input_manifest = args.media_root / "manifests" / "spai-c512-inputs.json"
    if not score_file.is_file() or not input_manifest.is_file():
        raise RuntimeError("SPAI_OUTPUTS_NOT_VERIFIED")
    score_payload = json.loads(score_file.read_text(encoding="utf-8"))
    manifest_payload = json.loads(input_manifest.read_text(encoding="utf-8"))
    if score_payload.get("inputCount") != len(manifest_payload.get("records", [])):
        raise RuntimeError("SPAI_OUTPUT_MANIFEST_COUNT_MISMATCH")
    if score_payload.get("checkpointSha256") != "24159f27d7c8c2cd0cb6c4019189eb89ad0874a0d9d15f8dc9afd39ca9648a55":
        raise RuntimeError("SPAI_CHECKPOINT_IDENTITY_MISMATCH")
    target = args.spai_root.resolve()
    temp_root = Path(tempfile.gettempdir()).resolve()
    if target.name != "lythaus-wp007i-spai-c512" or target.parent != temp_root:
        raise RuntimeError("SPAI_DELETE_TARGET_NOT_EXACT")
    if not target.is_dir():
        raise RuntimeError("SPAI_DELETE_TARGET_MISSING")
    removed_bytes = tree_bytes(target)
    media_bytes = tree_bytes(args.media_root.resolve())
    before_bytes = removed_bytes + media_bytes
    shutil.rmtree(target)
    if target.exists():
        raise RuntimeError("SPAI_DELETE_VERIFICATION_FAILED")
    payload: dict[str, Any] = {
        "schemaVersion": "lythaus-wp007i-storage-delta-v1",
        "materializedBytesBeforeCleanup": before_bytes,
        "bytesAddedForExperiment": before_bytes,
        "bytesRemoved": removed_bytes,
        "bytesPreserved": media_bytes,
        "bytesUnresolved": 0,
        "deleted": [{
            "logicalAssetId": "WP007I_SPAI_C512_DERIVATIVES",
            "pathClass": "EXACT_TEMP_RESEARCH_ROOT",
            "bytes": removed_bytes,
            "regenerable": True,
            "reason": "SPAI shadow scores and input manifest verified; C512 PNG derivatives are reproducible and not needed for committed evidence.",
        }],
        "preserved": [{
            "logicalAssetId": "WP007I_SELECTED_MEDIA_AND_TRANSFORMS",
            "pathClass": "EXTERNAL_RESEARCH_MEDIA",
            "bytes": media_bytes,
            "reason": "Selected source media and transformation descendants remain available outside Git for audit/reproduction.",
        }],
        "spaiScoreSha256": sha256_file(score_file),
        "spaiInputManifestSha256": sha256_file(input_manifest),
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    }
    output = args.research / "storage-delta.json"
    output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(payload, sort_keys=True))


if __name__ == "__main__":
    main()
