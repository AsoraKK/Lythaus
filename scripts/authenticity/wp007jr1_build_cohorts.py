"""Freeze score-blind WP007J-R1 cohorts from already approved media.

The generated research manifests contain logical roots and relative paths only.
Absolute roots are supplied to runtime scripts through an external root map.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


FLUX2_MARKERS = ("flux.2", "flux2", "flux-2")
SAFE_FAMILIES = ("SD-3.5-Large", "Gemini-2.0-Flash", "GoT-R1-7B", "Nano-Banana")
WP007H_FAMILIES = ("FLUX.1-Krea-dev", "BLIP3o-8B", "PixArt-Alpha", "Qwen-Image-2512")


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def ensure_not_flux2(family: str | None, relative_path: str) -> None:
    text = f"{family or ''} {relative_path}".lower()
    if any(marker in text for marker in FLUX2_MARKERS):
        raise RuntimeError(f"FLUX2_ACCESS_DENIED:{family}:{relative_path}")


def add_record(
    records: list[dict[str, Any]],
    *,
    root_key: str,
    relative_path: str,
    path: Path,
    sample_id: str,
    source_family_id: str,
    family: str | None,
    role: str,
    label: int,
    source_subtype: str | None,
    source_dataset: str,
    diagnostic_role: str | None = None,
) -> None:
    ensure_not_flux2(family, relative_path)
    if not path.is_file():
        raise FileNotFoundError(path)
    records.append(
        {
            "sampleId": sample_id,
            "sourceFamilyId": source_family_id,
            "generatorFamily": family,
            "role": role,
            "label": label,
            "sourceSubtype": source_subtype,
            "rootKey": root_key,
            "relativePath": relative_path.replace("\\", "/"),
            "bytes": path.stat().st_size,
            "sha256": sha256_file(path),
            "sourceDataset": source_dataset,
            "diagnosticRole": diagnostic_role,
        }
    )


def sort_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(records, key=lambda row: (row["sourceFamilyId"], row["sampleId"], row["relativePath"]))


def freeze_payload(payload: dict[str, Any]) -> dict[str, Any]:
    copy = dict(payload)
    copy.pop("freezeSha256", None)
    copy["freezeSha256"] = hashlib.sha256(canonical_bytes(copy)).hexdigest()
    return copy


def load_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def add_wp007i_records(
    records: list[dict[str, Any]],
    *,
    repo_root: Path,
    media_root: Path,
    representation: bool,
) -> None:
    negative = load_json(repo_root / "research/wp007i/negative-data-freeze.json")
    for row in negative["records"]:
        relative = row["localRelativePath"]
        add_record(
            records,
            root_key="WP007I_MEDIA",
            relative_path=relative,
            path=media_root / relative,
            sample_id=row["sampleId"],
            source_family_id=row["sourceFamilyId"],
            family=None,
            role="REPRESENTATION_NEGATIVE" if representation else "JPEG_LAB_NEGATIVE",
            label=0,
            source_subtype=row.get("sourceSubtype"),
            source_dataset=row.get("sourceDataset", "WP007I_NEGATIVE_FREEZE"),
        )
    synthetic = load_json(repo_root / "research/wp007i/fresh-synthetic-freeze.json")
    for row in synthetic["records"]:
        relative = row["localRelativePath"]
        add_record(
            records,
            root_key="WP007I_MEDIA",
            relative_path=relative,
            path=media_root / relative,
            sample_id=row["sampleId"],
            source_family_id=row["sourceFamilyId"],
            family=row["generatorFamily"],
            role="REPRESENTATION_SYNTHETIC",
            label=1,
            source_subtype="MODERN_GENERATED",
            source_dataset=row.get("sourceDataset", "WP007I_SYNTHETIC_FREEZE"),
        )


def add_wp007i_jpeg_synthetic(records: list[dict[str, Any]], *, repo_root: Path, media_root: Path) -> None:
    synthetic = load_json(repo_root / "research/wp007i/fresh-synthetic-freeze.json")
    for family in SAFE_FAMILIES:
        candidates = [row for row in synthetic["records"] if row["generatorFamily"] == family]
        candidates.sort(key=lambda row: row["selectionHash"])
        for row in candidates[:10]:
            relative = row["localRelativePath"]
            add_record(
                records,
                root_key="WP007I_MEDIA",
                relative_path=relative,
                path=media_root / relative,
                sample_id=row["sampleId"],
                source_family_id=row["sourceFamilyId"],
                family=family,
                role="JPEG_LAB_SYNTHETIC",
                label=1,
                source_subtype="MODERN_GENERATED",
                source_dataset="WP007I_SYNTHETIC_FROZEN_SAFE_EASY_FAMILY_ROLE",
            )


def add_external_families(records: list[dict[str, Any]], *, root: Path, root_key: str, families: tuple[str, ...]) -> None:
    for family in families:
        family_root = root / family
        if not family_root.is_dir():
            continue
        candidates = sorted(path for path in family_root.rglob("*") if path.is_file())
        for path in candidates[:20]:
            relative = path.relative_to(root).as_posix()
            add_record(
                records,
                root_key=root_key,
                relative_path=relative,
                path=path,
                sample_id=f"{family}__{path.stem}",
                source_family_id=f"{root_key}__{family}",
                family=family,
                role="REPRESENTATION_SYNTHETIC",
                label=1,
                source_subtype="MODERN_GENERATED",
                source_dataset="WP007H_APPROVED_MODERN_CORPUS",
            )


def add_flux(records: list[dict[str, Any]], *, root: Path, root_key: str, count: int, role: str, diagnostic_role: str) -> None:
    candidates = sorted(path for path in root.rglob("*") if path.is_file())
    for path in candidates[:count]:
        relative = path.relative_to(root).as_posix()
        add_record(
            records,
            root_key=root_key,
            relative_path=relative,
            path=path,
            sample_id=path.stem,
            source_family_id=f"{root_key}_FLUX1",
            family="FLUX.1",
            role=role,
            label=1,
            source_subtype="POST_HOC_SYNTHETIC_DIAGNOSTIC",
            source_dataset="WP007H_FLUX1_CONSUMED_DIAGNOSTIC",
            diagnostic_role=diagnostic_role,
        )


def build_representation(args: argparse.Namespace) -> dict[str, Any]:
    records: list[dict[str, Any]] = []
    add_wp007i_records(records, repo_root=args.repo_root, media_root=args.media_root, representation=True)
    add_external_families(records, root=args.wp007h_root, root_key="WP007H_MODERN", families=WP007H_FAMILIES)
    add_flux(records, root=args.public_flux_root, root_key="PUBLIC_FLUX1", count=40, role="FLUX1_PUBLIC_DIAGNOSTIC", diagnostic_role="PUBLIC_FLUX1_BASELINE")
    add_flux(records, root=args.cloudflare_root, root_key="CLOUDFLARE_FLUX1", count=40, role="FLUX1_CLOUDFLARE_DIAGNOSTIC", diagnostic_role="CLOUDFLARE_FLUX1_BASELINE")
    records = sort_records(records)
    if len({row["sampleId"] for row in records}) != len(records):
        raise RuntimeError("DUPLICATE_SAMPLE_ID")
    return freeze_payload(
        {
            "schemaVersion": "lythaus-wp007jr1-representation-cohort-v1",
            "scoreBlind": True,
            "flux1PixelAccess": True,
            "flux2PixelAccess": False,
            "flux2ProviderCalls": 0,
            "selectionRule": "Existing approved family roles; deterministic relative-path ordering; no SAFE scores used for membership; all bytes hash-verified before scoring.",
            "roots": ["WP007I_MEDIA", "WP007H_MODERN", "PUBLIC_FLUX1", "CLOUDFLARE_FLUX1"],
            "records": records,
        }
    )


def build_jpeg(args: argparse.Namespace) -> dict[str, Any]:
    records: list[dict[str, Any]] = []
    negative = load_json(args.repo_root / "research/wp007i/negative-data-freeze.json")["records"]
    camera = sorted((row for row in negative if row.get("sourceSubtype") == "CAMERA_NATIVE"), key=lambda row: row["selectionHash"])
    digital = sorted((row for row in negative if row.get("sourceSubtype") != "CAMERA_NATIVE"), key=lambda row: row["selectionHash"])
    for row in camera[:40] + digital[:20]:
        relative = row["localRelativePath"]
        add_record(
            records,
            root_key="WP007I_MEDIA",
            relative_path=relative,
            path=args.media_root / relative,
            sample_id=row["sampleId"],
            source_family_id=row["sourceFamilyId"],
            family=None,
            role="JPEG_LAB_NEGATIVE",
            label=0,
            source_subtype=row.get("sourceSubtype"),
            source_dataset="WP007I_NEGATIVE_FROZEN_SCORE_BLIND_SUBSET",
        )
    add_wp007i_jpeg_synthetic(records, repo_root=args.repo_root, media_root=args.media_root)
    records = sort_records(records)
    if len({row["sampleId"] for row in records}) != len(records):
        raise RuntimeError("DUPLICATE_JPEG_SAMPLE_ID")
    return freeze_payload(
        {
            "schemaVersion": "lythaus-wp007jr1-jpeg-lab-cohort-v1",
            "scoreBlind": True,
            "flux1PixelAccess": False,
            "flux2PixelAccess": False,
            "flux2ProviderCalls": 0,
            "selectionRule": "40 camera + 20 digital hard negatives by frozen selectionHash; 10 samples from each of four predeclared SAFE-easy generator families; no new SAFE scores used.",
            "qualityRequests": [100, 99, 98, 97, 96, 95, 92, 90, 85, 80, 75, 65, 50],
            "subsamplingRequests": ["4:4:4", "4:2:2", "4:2:0"],
            "compoundTransforms": ["JPEG95_TO_JPEG85", "JPEG85_TO_JPEG95", "JPEG75_TO_JPEG95", "NON8_CROP_TO_JPEG95", "RESIZE75_TO_JPEG95", "RESIZE50_TO_JPEG95", "JPEG95_TO_RESIZE75", "SCREENSHOT_STYLE_TO_JPEG95", "JPEG_TO_PNG"],
            "roots": ["WP007I_MEDIA"],
            "records": records,
        }
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", type=Path, required=True)
    parser.add_argument("--media-root", type=Path, required=True)
    parser.add_argument("--wp007h-root", type=Path, required=True)
    parser.add_argument("--public-flux-root", type=Path, required=True)
    parser.add_argument("--cloudflare-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    representation = build_representation(args)
    jpeg = build_jpeg(args)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    (args.output_dir / "representation-cohort-freeze.json").write_text(json.dumps(representation, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    (args.output_dir / "jpeg-lab-cohort-freeze.json").write_text(json.dumps(jpeg, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"representationRecords": len(representation["records"]), "jpegLabRecords": len(jpeg["records"]), "representationFreezeSha256": representation["freezeSha256"], "jpegLabFreezeSha256": jpeg["freezeSha256"]}, sort_keys=True))


if __name__ == "__main__":
    main()
