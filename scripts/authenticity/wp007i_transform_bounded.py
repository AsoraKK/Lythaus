"""Build the bounded, score-blind WP007I transformation matrix."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from typing import Any

from PIL import Image

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from wp007i_materialize import TRANSFORMS, sha256_file, transform_image  # noqa: E402


MAX_BASES_PER_GROUP = 4
MAX_SOURCE_BYTES = 8_000_000


def load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def selection_key(row: dict[str, Any]) -> str:
    token = f"WP007I-TRANSFORM-BASE|{row['role']}|{row['label']}|{row['sourceFamilyId']}|{row['sampleId']}"
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def choose_bases(root: Path, media_root: Path) -> list[dict[str, Any]]:
    research = root / "research" / "wp007i"
    app_records = []
    for name in ("applicability-development-manifest.json", "applicability-confirmation-manifest.json"):
        app_records.extend(load(research / name)["records"])
    verification = load(media_root / "media-verification.json")["records"]
    by_family = {row["sourceFamilyId"]: row for row in verification}
    enriched = []
    for row in app_records:
        media = by_family[row["sourceFamilyId"]]
        enriched.append({**row, "downloadedBytes": media["downloadedBytes"], "sourceSha256": media["downloadedSha256"]})
    selected: list[dict[str, Any]] = []
    for role in ("APPLICABILITY_DEV", "APPLICABILITY_CONFIRM"):
        for label in (0, 1):
            group = [row for row in enriched if row["applicabilityRole"] == role and row["label"] == label]
            small = [row for row in group if row["downloadedBytes"] <= MAX_SOURCE_BYTES]
            pool = small if len(small) >= MAX_BASES_PER_GROUP else group
            selected.extend(sorted(pool, key=selection_key)[:MAX_BASES_PER_GROUP])
    if len(selected) != MAX_BASES_PER_GROUP * 4:
        raise RuntimeError(f"TRANSFORM_BASE_SELECTION_INCOMPLETE:{len(selected)}")
    return sorted(selected, key=selection_key)


def transform_media(root: Path, media_root: Path) -> None:
    research = root / "research" / "wp007i"
    verification = load(media_root / "media-verification.json")["records"]
    by_family = {row["sourceFamilyId"]: row for row in verification}
    base_records = choose_bases(root, media_root)
    base_manifest = {
        "schemaVersion": "lythaus-wp007i-bounded-transform-base-v1",
        "scoreBlind": True,
        "selectionRule": "four-role-label-groups; deterministic SHA-256 key; max 8 MB preferred",
        "maxBasesPerRoleLabel": MAX_BASES_PER_GROUP,
        "maxPreferredSourceBytes": MAX_SOURCE_BYTES,
        "flux1PixelAccess": False,
        "flux2PixelAccess": False,
        "records": base_records,
    }
    write_json(research / "applicability-transformation-base-selection.json", base_manifest)
    output_root = media_root / "transforms"
    rows: list[dict[str, Any]] = []
    for index, base in enumerate(base_records):
        source_record = by_family[base["sourceFamilyId"]]
        source_path = media_root / source_record["localRelativePath"]
        with Image.open(source_path) as original:
            original.load()
            source = original.convert("RGB")
        try:
            for name in TRANSFORMS:
                transformed, extension = transform_image(source, name)
                destination = output_root / name / f"{index:04d}-{hashlib.sha256(base['sourceFamilyId'].encode()).hexdigest()[:12]}.{extension}"
                destination.parent.mkdir(parents=True, exist_ok=True)
                if name.startswith("JPEG"):
                    transformed.save(destination, format="JPEG", quality=int(name[4:]), subsampling=0, optimize=False, progressive=False)
                else:
                    transformed.save(destination, format="PNG", optimize=False, compress_level=6)
                rows.append({
                    "rowKey": f"{base['role']}__{base['sourceFamilyId']}__{base['sampleId']}__{name}",
                    "baseRowKey": f"{base['role']}__{base['sourceFamilyId']}__{base['sampleId']}",
                    "sampleId": base["sampleId"],
                    "sourceFamilyId": base["sourceFamilyId"],
                    "role": base["role"],
                    "label": base["label"],
                    "sourceSubtype": base.get("sourceSubtype"),
                    "cameraDeviceFamily": base.get("cameraDeviceFamily"),
                    "generatorFamily": base.get("generatorFamily"),
                    "applicabilityRole": base["applicabilityRole"],
                    "transform": name,
                    "transformation": name,
                    "inputRegime": "UNKNOWN_TRANSFORMATION_STATE",
                    "sourceSha256": source_record["downloadedSha256"],
                    "outputSha256": sha256_file(destination),
                    "outputBytes": destination.stat().st_size,
                    "inputPath": str(destination.resolve()),
                    "format": extension.upper(),
                    "flux2PixelAccess": False,
                })
        finally:
            source.close()
        print(f"BOUNDED_TRANSFORM_BASES={index + 1}/{len(base_records)}", flush=True)
    write_json(media_root / "manifests" / "transformation-score-inputs.json", {
        "schemaVersion": "lythaus-wp007i-transformation-score-inputs-v2-bounded",
        "scoreBlind": True,
        "flux1PixelAccess": False,
        "flux2PixelAccess": False,
        "baseCount": len(base_records),
        "transformationCount": len(rows),
        "baseSelectionArtifact": "research/wp007i/applicability-transformation-base-selection.json",
        "records": rows,
    })
    print(json.dumps({"baseCount": len(base_records), "transformationCount": len(rows)}, sort_keys=True))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--media-root", type=Path, required=True)
    args = parser.parse_args()
    transform_media(args.root, args.media_root)


if __name__ == "__main__":
    main()
