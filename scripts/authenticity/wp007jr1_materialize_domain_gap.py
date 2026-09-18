"""Materialize a bounded, score-blind JPEG ladder for Seedream and Imagen."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

from PIL import Image


QUALITY_REQUESTS = [95, 85, 75]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cohort", type=Path, required=True)
    parser.add_argument("--media-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--manifest-output", type=Path, required=True)
    args = parser.parse_args()
    cohort = json.loads(args.cohort.read_text(encoding="utf-8"))
    if not cohort.get("scoreBlind") or cohort.get("flux2PixelAccess") or cohort.get("flux2ProviderCalls") != 0:
        raise RuntimeError("DOMAIN_GAP_COHORT_NOT_SCORE_BLIND_OR_SEALED")
    args.output_root.mkdir(parents=True, exist_ok=True)
    rows = []
    for parent in cohort["records"]:
        source = args.media_root / parent["relativePath"]
        if not source.is_file() or sha256_file(source) != parent["sha256"]:
            raise RuntimeError(f"DOMAIN_GAP_INPUT_HASH_MISMATCH:{parent['sampleId']}")
        name = parent["sampleId"].replace("/", "_").replace("\\", "_")
        with Image.open(source) as image:
            rgb = image.convert("RGB")
            for quality in QUALITY_REQUESTS:
                target = args.output_root / f"q{quality}" / f"{name}.jpg"
                target.parent.mkdir(parents=True, exist_ok=True)
                rgb.save(target, format="JPEG", quality=quality, subsampling=2, optimize=False, progressive=False)
                rows.append(
                    {
                        "derivedId": f"{parent['sampleId']}__JPEG{quality}_PILLOW_420__PILLOW_LIBJPEG__jpg",
                        "parentSampleId": parent["sampleId"],
                        "sourceFamilyId": parent["sourceFamilyId"],
                        "generatorFamily": parent["generatorFamily"],
                        "truthLabel": parent["label"],
                        "sourceSubtype": parent["sourceSubtype"],
                        "operation": f"JPEG{quality}_PILLOW_420",
                        "encoder": "PILLOW_LIBJPEG",
                        "encoderRole": "PILLOW_LIBJPEG",
                        "requestedQuality": quality,
                        "requestedSubsampling": "4:2:0",
                        "relativeOutputPath": target.relative_to(args.output_root).as_posix(),
                        "bytes": target.stat().st_size,
                        "sha256": sha256_file(target),
                        "sourceSha256": parent["sha256"],
                    }
                )
    rows.sort(key=lambda row: row["derivedId"])
    payload = {
        "schemaVersion": "lythaus-wp007jr1-domain-gap-generated-v1",
        "sourceCohortFreezeSha256": cohort["freezeSha256"],
        "scoreBlind": True,
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
        "encoder": "PILLOW_LIBJPEG",
        "records": rows,
    }
    payload["generatedManifestSha256"] = hashlib.sha256(canonical_bytes(payload)).hexdigest()
    args.manifest_output.parent.mkdir(parents=True, exist_ok=True)
    args.manifest_output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"parents": len(cohort["records"]), "generated": len(rows), "manifestSha256": payload["generatedManifestSha256"]}))


if __name__ == "__main__":
    main()
