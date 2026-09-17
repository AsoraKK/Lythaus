"""Resolve frozen WP007H records to local bytes for bounded inference."""

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


def resolve(record: dict, modern_root: Path, csafe_root: Path, digital_root: Path) -> Path:
    root_key = record.get("sourceRootKey")
    if root_key == "T2I_COREBENCH_WP007H_CACHE":
        return modern_root / record["localRelativePath"]
    if root_key == "CSAFE_WP006E_CACHE":
        return csafe_root / record["sourceRelativePath"]
    if root_key == "WP007E_CONTROLLED_DIGITAL_CACHE":
        return digital_root / record["sourceRelativePath"]
    raise RuntimeError(f"UNKNOWN_SOURCE_ROOT:{root_key}")


def modern_records(freeze: dict) -> list[dict]:
    rows = []
    for source in freeze["roles"].get("QUALIFICATION_CONFIRM", []):
        row = dict(source)
        row.update({
            "sourceRootKey": "T2I_COREBENCH_WP007H_CACHE",
            "role": "QUALIFICATION_CONFIRM",
            "label": 1,
            "sourceSubtype": "SYNTHETIC_ACTUAL_GENERATED",
            "sampleId": f"WP007H_{source['generatorFamily']}_{source['lfsSha256'][:12]}",
            "sourceFamilyId": f"T2I-COREBENCH-WP007H-{source['generatorFamily']}",
            "sourceSha256": source["lfsSha256"],
            "bytes": source["bytes"],
        })
        rows.append(row)
    return rows


def negative_records(freeze: dict) -> list[dict]:
    rows = []
    for role in ("NEGATIVE_CONFIRM_H", "NEGATIVE_AUXILIARY_REUSED"):
        for source in freeze["roles"].get(role, []):
            row = dict(source)
            row.update({"role": role, "label": 0})
            rows.append(row)
    return rows


def public_record(record: dict, path: Path) -> dict:
    return {
        "rowKey": f"{record['role']}__{record['sourceFamilyId']}__{record['sampleId']}",
        "sampleId": record["sampleId"],
        "sourceFamilyId": record["sourceFamilyId"],
        "role": record["role"],
        "label": record["label"],
        "sourceSubtype": record.get("sourceSubtype"),
        "cameraDeviceFamily": record.get("cameraDeviceFamily"),
        "generatorFamily": record.get("generatorFamily"),
        "sourceRootKey": record["sourceRootKey"],
        "sourceRelativePath": record.get("sourceRelativePath") or record.get("localRelativePath"),
        "sourceSha256": record["sourceSha256"] if "sourceSha256" in record else record["lfsSha256"],
        "sourceBytes": record.get("bytes") or record.get("downloadedBytes"),
        "format": record.get("format") or record.get("decode", {}).get("format"),
        "inputRegime": "ORIGINAL_OR_HIGH_QUALITY",
        "transformation": "ORIGINAL",
        "flux2PixelAccess": False,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--modern-freeze", type=Path, required=True)
    parser.add_argument("--negative-freeze", type=Path, required=True)
    parser.add_argument("--modern-root", type=Path, required=True)
    parser.add_argument("--csafe-root", type=Path, required=True)
    parser.add_argument("--digital-root", type=Path, required=True)
    parser.add_argument("--runtime-manifest", type=Path, required=True)
    parser.add_argument("--public-manifest", type=Path, required=True)
    args = parser.parse_args()

    modern = json.loads(args.modern_freeze.read_text(encoding="utf-8"))
    negative = json.loads(args.negative_freeze.read_text(encoding="utf-8"))
    records = modern_records(modern) + negative_records(negative)
    runtime = []
    public = []
    seen = set()
    for record in records:
        row = public_record(record, Path("."))
        if row["rowKey"] in seen:
            raise RuntimeError(f"DUPLICATE_ROW:{row['rowKey']}")
        seen.add(row["rowKey"])
        path = resolve(record, args.modern_root, args.csafe_root, args.digital_root)
        if not path.is_file():
            raise FileNotFoundError(path)
        actual = sha256_file(path)
        if actual != row["sourceSha256"]:
            raise RuntimeError(f"SOURCE_HASH_MISMATCH:{row['rowKey']}:{actual}:{row['sourceSha256']}")
        runtime_row = dict(row)
        runtime_row["inputPath"] = str(path.resolve())
        runtime.append(runtime_row)
        public.append(row)
    runtime.sort(key=lambda row: row["rowKey"])
    public.sort(key=lambda row: row["rowKey"])
    runtime_output = {"schemaVersion": "lythaus-wp007h-safe-runtime-inputs-v1", "scoreBlind": True, "flux1PixelAccess": False, "flux2PixelAccess": False, "records": runtime}
    public_output = {
        "schemaVersion": "lythaus-wp007h-safe-score-input-freeze-v1",
        "scoreBlind": True,
        "flux1PixelAccess": False,
        "flux2PixelAccess": False,
        "counts": {"qualificationConfirm": sum(row["role"] == "QUALIFICATION_CONFIRM" for row in public), "negativeConfirm": sum(row["role"] == "NEGATIVE_CONFIRM_H" for row in public), "negativeAuxiliary": sum(row["role"] == "NEGATIVE_AUXILIARY_REUSED" for row in public)},
        "records": public,
    }
    args.runtime_manifest.parent.mkdir(parents=True, exist_ok=True)
    args.public_manifest.parent.mkdir(parents=True, exist_ok=True)
    args.runtime_manifest.write_text(json.dumps(runtime_output, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    args.public_manifest.write_text(json.dumps(public_output, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"records": len(public), "runtimeManifestSha256": sha256_file(args.runtime_manifest), "publicManifestSha256": sha256_file(args.public_manifest), "counts": public_output["counts"]}))


if __name__ == "__main__":
    main()
