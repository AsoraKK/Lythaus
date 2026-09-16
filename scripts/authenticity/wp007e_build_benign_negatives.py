"""Build deterministic non-generative hard negatives from canonical reals."""

from __future__ import annotations

import argparse
import io
import json
from pathlib import Path

from PIL import Image

from wp007e_common import load_json, save_png, sha256_bytes, sha256_file, write_json


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
    pair_families = {item["sourceFamilyId"] for item in roles["roles"]["PAIR_BASE"]["records"]}
    sources = [item for item in canonical["records"] if item["role"] == "PAIR_BASE" and item["sourceFamilyId"] in pair_families]
    if len(sources) != 60:
        raise RuntimeError(f"pair_canonical_count:{len(sources)}")
    output_root = media_root / "benign-negatives"
    records = []
    for source in sorted(sources, key=lambda item: item["sourceFamilyId"]):
        input_path = media_root / source["canonicalRelativePath"]
        if sha256_file(input_path) != source["canonicalSha256"]:
            raise RuntimeError(f"canonical_hash_changed:{source['sourceFamilyId']}")
        with Image.open(input_path) as opened:
            image = opened.convert("RGB")
        transforms = [
            ("JPEG95", "jpeg", 95),
            ("JPEG85", "jpeg", 85),
            ("RESIZE75_ROUNDTRIP", "resize", None),
        ]
        for transform, extension, quality in transforms:
            if transform.startswith("JPEG"):
                data = jpeg_bytes(image, quality)
                target = output_root / transform / f"{source['sampleId']}.jpg"
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(data)
                output_hash = sha256_bytes(data)
                output_format = "JPEG"
            else:
                resized = image.resize((384, 384), resample=Image.Resampling.LANCZOS).resize((512, 512), resample=Image.Resampling.LANCZOS)
                target = output_root / transform / f"{source['sampleId']}.png"
                output_hash = save_png(resized, target)
                output_format = "PNG"
            records.append(
                {
                    "sampleId": f"WP007E_BENIGN_{transform}_{source['sampleId']}",
                    "sourceFamilyId": source["sourceFamilyId"],
                    "sourceSampleId": source["sampleId"],
                    "role": "BENIGN_HARD_NEGATIVE",
                    "transform": transform,
                    "inputCanonicalSha256": source["canonicalSha256"],
                    "outputSha256": output_hash,
                    "outputRelativePath": f"benign-negatives/{transform}/{target.name}",
                    "width": 512,
                    "height": 512,
                    "format": output_format,
                    "metadataInput": False,
                    "truth": "NON_GENERATIVE_DETERMINISTIC_PERTURBATION",
                }
            )
    records.sort(key=lambda item: (item["transform"], item["sourceFamilyId"]))
    manifest = {
        "schemaVersion": "lythaus-wp007e-benign-negative-manifest-v1",
        "dataRoleFreezeSha256": roles["dataRoleFreezeSha256"],
        "canonicalizerSha256": canonical["canonicalizerSha256"],
        "pairBaseFamilies": 60,
        "transforms": ["JPEG95", "JPEG85", "RESIZE75_ROUNDTRIP"],
        "requested": 180,
        "valid": len(records),
        "failed": 0,
        "records": records,
    }
    from wp007e_common import stable_hash

    manifest["benignManifestSha256"] = stable_hash(manifest)
    write_json(output_root / "benign-manifest.json", manifest)
    print(json.dumps({"status": "PASS", "requested": 180, "valid": len(records), "manifestSha256": manifest["benignManifestSha256"]}, sort_keys=True))


if __name__ == "__main__":
    main()
