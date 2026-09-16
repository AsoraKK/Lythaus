"""Build deterministic benign transforms for independent negative controls."""

from __future__ import annotations

import argparse
import io
import json
from pathlib import Path

from PIL import Image

from wp007e_common import load_json, save_png, sha256_bytes, sha256_file, stable_hash, write_json


def jpeg_bytes(image: Image.Image, quality: int) -> bytes:
    output = io.BytesIO()
    image.convert("RGB").save(output, format="JPEG", quality=quality, optimize=False, progressive=False, exif=b"")
    return output.getvalue()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--media-root", required=True)
    args = parser.parse_args()
    repo_root = Path(__file__).resolve().parents[2]
    media_root = Path(args.media_root)
    canonical = load_json(repo_root / "research" / "wp007e" / "canonicalizer-spec.json")
    roles = load_json(repo_root / "research" / "wp007e" / "data-role-freeze.json")
    selected_roles = {"NEGATIVE_CALIBRATION", "NEGATIVE_DEV_CONTROL", "NEGATIVE_CONFIRM"}
    sources = [item for item in canonical["records"] if item["role"] in selected_roles]
    if len(sources) != 96:
        raise RuntimeError(f"negative_canonical_count:{len(sources)}")
    output_root = media_root / "negative-benign"
    records = []
    for source in sorted(sources, key=lambda item: (item["role"], item["sourceFamilyId"])):
        input_path = media_root / source["canonicalRelativePath"]
        if sha256_file(input_path) != source["canonicalSha256"]:
            raise RuntimeError(f"canonical_hash_changed:{source['sourceFamilyId']}")
        with Image.open(input_path) as opened:
            image = opened.convert("RGB")
        for transform, quality in (("JPEG95", 95), ("JPEG85", 85)):
            data = jpeg_bytes(image, quality)
            target = output_root / source["role"] / transform / f"{source['sampleId']}.jpg"
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
            records.append({
                "sampleId": f"WP007E_NEGATIVE_BENIGN_{transform}_{source['sampleId']}",
                "sourceFamilyId": source["sourceFamilyId"],
                "sourceRole": source["role"],
                "transform": transform,
                "inputCanonicalSha256": source["canonicalSha256"],
                "outputSha256": sha256_bytes(data),
                "outputRelativePath": f"negative-benign/{source['role']}/{transform}/{target.name}",
                "width": 512,
                "height": 512,
                "format": "JPEG",
                "truth": "NON_GENERATIVE_DETERMINISTIC_PERTURBATION",
            })
        resized = image.resize((384, 384), resample=Image.Resampling.LANCZOS).resize((512, 512), resample=Image.Resampling.LANCZOS)
        target = output_root / source["role"] / "RESIZE75_ROUNDTRIP" / f"{source['sampleId']}.png"
        output_hash = save_png(resized, target)
        records.append({
            "sampleId": f"WP007E_NEGATIVE_BENIGN_RESIZE75_{source['sampleId']}",
            "sourceFamilyId": source["sourceFamilyId"],
            "sourceRole": source["role"],
            "transform": "RESIZE75_ROUNDTRIP",
            "inputCanonicalSha256": source["canonicalSha256"],
            "outputSha256": output_hash,
            "outputRelativePath": f"negative-benign/{source['role']}/RESIZE75_ROUNDTRIP/{target.name}",
            "width": 512,
            "height": 512,
            "format": "PNG",
            "truth": "NON_GENERATIVE_DETERMINISTIC_PERTURBATION",
        })
    manifest = {
        "schemaVersion": "lythaus-wp007e-negative-benign-manifest-v1",
        "dataRoleFreezeSha256": roles["dataRoleFreezeSha256"],
        "canonicalizerSha256": canonical["canonicalizerSha256"],
        "sourceRoles": sorted(selected_roles),
        "sourceCanonicalCount": len(sources),
        "requested": len(sources) * 3,
        "valid": len(records),
        "failed": 0,
        "records": sorted(records, key=lambda item: (item["sourceRole"], item["transform"], item["sourceFamilyId"])),
    }
    manifest["negativeBenignManifestSha256"] = stable_hash(manifest)
    write_json(repo_root / "research" / "wp007e" / "negative-benign-manifest.json", manifest)
    print(json.dumps({"status": "PASS", "requested": manifest["requested"], "valid": manifest["valid"], "manifestSha256": manifest["negativeBenignManifestSha256"]}, sort_keys=True))


if __name__ == "__main__":
    main()
