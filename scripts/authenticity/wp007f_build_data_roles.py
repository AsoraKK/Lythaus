"""Build the score-blind WP007F qualification roles.

The script reads only rights-cleared development manifests and ordinary
development pixels. FLUX records are copied as metadata only; their paths are
never resolved and their bytes are never read.
"""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any, Iterable


BENCHMARK_FINGERPRINT = "210000b7b0d93960b23e090e396d60f97bb46d2816ee9ee7d345aae364ade3c5"
HOLDOUT_FREEZE_SHA = "b1be6115a6ed3cb5d72c5ad3e90575ededbb4c969bd2bb248ec2806da32885c4"
FLUX2_FREEZE_SHA = "56ae0bd15b8bc21d77b28c9e6faea8149440aab8a9d101db523a43aedb98e054"
BASE_SHA = "611b0b006a5ea66ef1f7369255a6e3f19951a6e7"


def load_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def stable_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def choose_balanced(records: Iterable[dict[str, Any]], count: int, group_key: str, salt: str) -> list[dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = {}
    for item in records:
        groups.setdefault(str(item.get(group_key) or "UNSPECIFIED"), []).append(item)
    for key, values in groups.items():
        values.sort(key=lambda item: (hashlib.sha256(f"{salt}:{item['sourceFamilyId']}".encode()).hexdigest(), item["sourceFamilyId"]))
    selected: list[dict[str, Any]] = []
    keys = sorted(groups)
    index = 0
    while len(selected) < count:
        progressed = False
        for key in keys:
            if index < len(groups[key]) and len(selected) < count:
                selected.append(groups[key][index])
                progressed = True
        if not progressed:
            raise RuntimeError(f"insufficient_records:{group_key}:{count}:{len(selected)}")
        index += 1
    return selected


def camera_records(data_root: Path, final_ids: set[str]) -> list[dict[str, Any]]:
    cache_root = data_root / "wp006e-csafe-cache-4e8c0d40f2c7"
    records: list[dict[str, Any]] = []
    for group in ("historical", "internalValidation", "new", "sameModelHoldout"):
        manifest_path = cache_root / group / "extraction-manifest.json"
        if not manifest_path.is_file():
            continue
        manifest = load_json(manifest_path)
        for item in manifest["records"]:
            relative = Path(item["cacheRelativePath"])
            device = item["deviceFamilyId"]
            index = int(relative.stem) + 1
            family = f"CSAFE-WP006E-FAMILY-{device}-{index:02d}"
            source_path = cache_root / group / relative
            if family in final_ids:
                continue
            if not source_path.is_file():
                raise RuntimeError(f"camera_source_missing:{group}/{relative.as_posix()}")
            actual = sha256_file(source_path)
            if actual != item["contentSha256"]:
                raise RuntimeError(f"camera_source_hash_mismatch:{family}")
            records.append({
                "sampleId": f"CSAFE_WP006E_{device}_{index:02d}",
                "sourceFamilyId": family,
                "sourceType": "PHYSICAL_CAMERA_NEGATIVE",
                "sourceSubtype": "CAMERA",
                "cameraDeviceFamily": device,
                "sourceRootKey": "CSAFE_WP006E_CACHE",
                "sourceRelativePath": f"{group}/{relative.as_posix()}",
                "sourceSha256": actual,
                "bytes": source_path.stat().st_size,
                "width": None,
                "height": None,
                "format": "JPEG",
                "rights": "CC_BY_4.0_WITH_ATTRIBUTION",
                "trainingEligibility": "TRAINING_ALLOWED_WITH_CONSTRAINTS",
                "externalProcessing": "LOCAL_ONLY",
            })
    return records


def digital_records(data_root: Path, final_ids: set[str]) -> list[dict[str, Any]]:
    records: dict[str, dict[str, Any]] = {}
    roots = [
        ("WP007E_CONTROLLED_DIGITAL_CACHE", Path(__import__("os").environ["LYTHAUS_WP007F_DIGITAL_ROOT"]), "manifest.json"),
        ("WP007A_PROGRAMMATIC_DIGITAL_CACHE", data_root / "90_RESEARCH_ONLY" / "wp007a-hard-negative-cache", "manifest.json"),
    ]
    for root_key, root, manifest_name in roots:
        manifest_path = root / manifest_name
        if not manifest_path.is_file():
            continue
        manifest = load_json(manifest_path)
        for item in manifest["records"]:
            family = item["sourceFamilyId"]
            if family in final_ids or family in records:
                continue
            file_name = item["file"]["cacheId"].split("/")[-1]
            source_path = root / file_name
            if not source_path.is_file():
                raise RuntimeError(f"digital_source_missing:{source_path.name}")
            actual = sha256_file(source_path)
            if actual != item["file"]["sha256"]:
                raise RuntimeError(f"digital_source_hash_mismatch:{family}")
            records[family] = {
                "sampleId": item["sampleId"],
                "sourceFamilyId": family,
                "sourceType": "DIGITAL_NON_AI_NEGATIVE",
                "sourceSubtype": item["benchmark"].get("hardNegativeSubtype") or "OTHER_DIGITAL_NON_AI",
                "cameraDeviceFamily": None,
                "sourceRootKey": root_key,
                "sourceRelativePath": file_name,
                "sourceSha256": actual,
                "bytes": source_path.stat().st_size,
                "width": item["file"].get("width"),
                "height": item["file"].get("height"),
                "format": item["file"].get("format", source_path.suffix.lstrip(".")),
                "rights": item["rights"].get("sourceMediaRights", "LYTHAUS_CONTROLLED"),
                "trainingEligibility": item["rights"].get("trainingEligibility", "TRAINING_ALLOWED_EXPLICIT"),
                "externalProcessing": "LOCAL_ONLY",
            }
    return sorted(records.values(), key=lambda item: item["sourceFamilyId"])


def ddb_records(data_root: Path, excluded_ids: set[str]) -> list[dict[str, Any]]:
    cache_root = data_root / "90_RESEARCH_ONLY" / "wp007a-diffusiondb-cache"
    materialisation = load_json(cache_root / "materialization-result.json")
    records: list[dict[str, Any]] = []
    for item in materialisation["records"]:
        if item["sampleId"] in excluded_ids:
            continue
        source_path = cache_root / "selected" / f"{item['sampleId']}.png"
        if not source_path.is_file():
            raise RuntimeError(f"ddb_source_missing:{source_path.name}")
        actual = sha256_file(source_path)
        if actual != item["contentSha256"]:
            raise RuntimeError(f"ddb_source_hash_mismatch:{item['sampleId']}")
        records.append({
            "sampleId": item["sampleId"],
            "sourceFamilyId": item["sourceFamilyId"],
            "sourceType": "DIFFUSIONDB_FULL_GENERATION",
            "sourceSubtype": item.get("taxonomy", "DIFFUSIONDB"),
            "cameraDeviceFamily": None,
            "sourceRootKey": "WP007A_DIFFUSIONDB_CACHE",
            "sourceRelativePath": f"selected/{source_path.name}",
            "sourceSha256": actual,
            "bytes": source_path.stat().st_size,
            "width": item.get("width"),
            "height": item.get("height"),
            "format": item.get("format", "PNG"),
            "rights": "DIFFUSIONDB_CC0_1_0_CARRIED_FROM_WP007A",
            "trainingEligibility": "TRAINING_ALLOWED_WITH_CONSTRAINTS",
            "externalProcessing": "LOCAL_ONLY",
            "promptId": item.get("promptId"),
        })
    return sorted(records, key=lambda item: item["sampleId"])


def prior_family_ids(repo_root: Path) -> set[str]:
    used: set[str] = set()
    prior = load_json(repo_root / "research" / "wp007e" / "data-role-freeze.json")
    for role in prior.get("roles", {}).values():
        for record in role.get("records", []):
            if record.get("sourceRootKey") == "WP007A_DIFFUSIONDB_CACHE":
                used.add(record["sampleId"])
    split = load_json(repo_root / "research" / "wp007b" / "ef3-split-freeze.json")
    for record in split.get("developmentSynthetic", []):
        used.add(record["sampleId"])
    return used


def metadata_only_prior(repo_root: Path, key: str) -> list[dict[str, Any]]:
    split = load_json(repo_root / "research" / "wp007b" / "ef3-split-freeze.json")
    return [
        {
            "sampleId": item["sampleId"],
            "sourceFamilyId": item["sourceFamilyId"],
            "fileSha256": item.get("fileSha256"),
            "generatorModelId": item.get("generatorModelId"),
            "role": "SEALED",
        }
        for item in split.get(key, [])
    ]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", type=Path, required=True)
    parser.add_argument("--data-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    final_split = load_json(args.repo_root / "research" / "wp007b" / "ef3-split-freeze.json")
    final_ids = {item["sourceFamilyId"] for item in (*final_split.get("sealedFinalCamera", []), *final_split.get("sealedFinalDigital", []))}
    cameras = camera_records(args.data_root, final_ids)
    digitals = digital_records(args.data_root, final_ids)
    camera_dev = choose_balanced(cameras, min(100, len(cameras) - 50), "cameraDeviceFamily", "WP007F_CAMERA_DEV")
    camera_used = {item["sourceFamilyId"] for item in camera_dev}
    camera_remaining = [item for item in cameras if item["sourceFamilyId"] not in camera_used]
    camera_confirm = choose_balanced(camera_remaining, min(50, len(camera_remaining)), "cameraDeviceFamily", "WP007F_CAMERA_CONFIRM")

    digital_confirm_count = min(50, max(20, len(digitals) // 3))
    digital_dev_count = min(100, len(digitals) - digital_confirm_count)
    if digital_dev_count < 20:
        raise RuntimeError(f"insufficient_digital_development:{digital_dev_count}")
    digital_dev = choose_balanced(digitals, digital_dev_count, "sourceSubtype", "WP007F_DIGITAL_DEV")
    digital_used = {item["sourceFamilyId"] for item in digital_dev}
    digital_confirm = choose_balanced([item for item in digitals if item["sourceFamilyId"] not in digital_used], digital_confirm_count, "sourceSubtype", "WP007F_DIGITAL_CONFIRM")

    ddb = ddb_records(args.data_root, prior_family_ids(args.repo_root))
    ddb_dev = choose_balanced(ddb, min(200, len(ddb) - 100), "sourceSubtype", "WP007F_DDB_DEV")
    ddb_used = {item["sourceFamilyId"] for item in ddb_dev}
    ddb_confirm = choose_balanced([item for item in ddb if item["sourceFamilyId"] not in ddb_used], min(100, len(ddb) - len(ddb_used)), "sourceSubtype", "WP007F_DDB_CONFIRM")

    roles = {
        "DDB_DETECTOR_DEV": ddb_dev,
        "DDB_DETECTOR_CONFIRM": ddb_confirm,
        "CAMERA_DEV": camera_dev,
        "CAMERA_CONFIRM": camera_confirm,
        "DIGITAL_DEV": digital_dev,
        "DIGITAL_CONFIRM": digital_confirm,
    }
    family_to_role: dict[str, str] = {}
    for role_name, records in roles.items():
        for record in records:
            family = record["sourceFamilyId"]
            if family in family_to_role:
                raise RuntimeError(f"source_family_role_overlap:{family}")
            family_to_role[family] = role_name
            record["role"] = role_name

    result = {
        "schemaVersion": "lythaus-wp007f-qualification-data-freeze-v1",
        "wp007fBaseSha": BASE_SHA,
        "benchmarkFingerprint": BENCHMARK_FINGERPRINT,
        "wp007ahr4HoldoutFreezeSha256": HOLDOUT_FREEZE_SHA,
        "flux2ReserveFreezeSha256": FLUX2_FREEZE_SHA,
        "scoreBlind": True,
        "pixelAccess": {
            "flux1PixelsRead": False,
            "flux2PixelsRead": False,
            "holdoutPathsResolved": False,
            "holdoutImagesPassedToDetectors": False,
        },
        "selection": {
            "algorithm": "SHA256_GROUP_ROUND_ROBIN_V1",
            "noScoreInputs": True,
            "noOwnerChallengeInputs": True,
        },
        "roles": roles,
        "counts": {name: len(records) for name, records in roles.items()},
        "sourcePoolAvailability": {
            "cameraNonFinalAvailable": len(cameras),
            "digitalNonFinalAvailable": len(digitals),
            "ddbUnusedAfterPriorWp007Roles": len(ddb),
            "digitalTargetShortfall": max(0, 100 - len(digital_dev)) + max(0, 50 - len(digital_confirm)),
        },
        "knownFinalSealedControlsMetadataOnly": {
            "camera": metadata_only_prior(args.repo_root, "sealedFinalCamera"),
            "digital": metadata_only_prior(args.repo_root, "sealedFinalDigital"),
        },
        "ownerChallenge": {"status": "OWNER_CHALLENGE_PENDING_MORE_DATA", "usedForQualification": False},
        "invariants": [
            "No role contains a final sealed control family.",
            "No family crosses a qualification role.",
            "DDB confirm is not used for training, calibration, or development score selection.",
            "FLUX.1 and FLUX.2 are metadata-only and remain pixel sealed.",
        ],
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(result, ensure_ascii=True, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    digest = hashlib.sha256(args.output.read_bytes()).hexdigest()
    print(f"WP007F_DATA_ROLE_FREEZE_SHA256={digest}")
    print(json.dumps(result["counts"], sort_keys=True))


if __name__ == "__main__":
    main()
