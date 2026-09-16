"""Build the immutable, score-blind WP007E data-role freeze.

The script reads only previously authorized development manifests and writes
the role manifest into the repository. Pixel bytes are never read for the
FLUX records; their IDs and recorded hashes are carried forward only.
"""

from __future__ import annotations

import hashlib
import json
import os
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable


BASE_SHA = "9b7c375bd030475e25c0058c58909a3a56dcdcc6"
HOLDOUT_SHA = "b1be6115a6ed3cb5d72c5ad3e90575ededbb4c969bd2bb248ec2806da32885c4"
FLUX2_SHA = "56ae0bd15b8bc21d77b28c9e6faea8149440aab8a9d101db523a43aedb98e054"
BENCHMARK_FINGERPRINT = "210000b7b0d93960b23e090e396d60f97bb46d2816ee9ee7d345aae364ade3c5"


def stable_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, ensure_ascii=True, sort_keys=True, indent=2)
        handle.write("\n")


def rr_select(records: Iterable[dict[str, Any]], count: int, group_key: str) -> list[dict[str, Any]]:
    """Select in stable round-robin order across groups."""
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in sorted(records, key=lambda item: (str(item.get(group_key, "")), item["sourceFamilyId"])):
        groups[str(record.get(group_key, ""))].append(record)
    keys = sorted(groups)
    selected: list[dict[str, Any]] = []
    offset = 0
    while len(selected) < count and keys:
        progressed = False
        for key in keys:
            if offset < len(groups[key]) and len(selected) < count:
                selected.append(groups[key][offset])
                progressed = True
        if not progressed:
            break
        offset += 1
    if len(selected) != count:
        raise RuntimeError(f"insufficient_records:{group_key}:{count}:{len(selected)}")
    return selected


def camera_records(data_root: Path, final_ids: set[str]) -> list[dict[str, Any]]:
    cache_root = data_root / "wp006e-csafe-cache-4e8c0d40f2c7"
    records: list[dict[str, Any]] = []
    for group in ("historical", "new"):
        manifest = load_json(cache_root / group / "extraction-manifest.json")
        for item in manifest["records"]:
            relative = Path(item["cacheRelativePath"])
            device = item["deviceFamilyId"]
            index = int(relative.stem) + 1
            source_family = f"CSAFE-WP006E-FAMILY-{device}-{index:02d}"
            source_path = cache_root / group / relative
            if not source_path.is_file():
                raise RuntimeError(f"camera_source_missing:{group}/{relative.as_posix()}")
            actual = sha256_file(source_path)
            if actual != item["contentSha256"]:
                raise RuntimeError(f"camera_source_hash_mismatch:{source_family}")
            records.append(
                {
                    "sampleId": f"CSAFE_WP006E_{device}_{index:02d}",
                    "sourceFamilyId": source_family,
                    "sourceType": "CAMERA_NEGATIVE",
                    "sourceSubtype": "CAMERA",
                    "cameraDeviceFamily": device,
                    "sourceRootKey": "CSAFE_WP006E_CACHE",
                    "sourceRelativePath": f"{group}/{relative.as_posix()}",
                    "sourceSha256": actual,
                    "declaredSourceSha256": item["contentSha256"],
                    "width": item.get("width", None),
                    "height": item.get("height", None),
                    "format": "JPEG",
                    "rights": "CC_BY_4.0_WITH_ATTRIBUTION",
                    "trainingEligibility": "TRAINING_ALLOWED_WITH_CONSTRAINTS",
                    "externalProcessing": "NOT_APPLICABLE_LOCAL_ONLY",
                    "finalSealedControl": source_family in final_ids,
                }
            )
    return records


def digital_records(data_root: Path, final_ids: set[str]) -> list[dict[str, Any]]:
    fixture_root = Path(os.environ["LYTHAUS_WP007E_DIGITAL_ROOT"])
    manifest = load_json(fixture_root / "manifest.json")
    records: list[dict[str, Any]] = []
    for item in manifest["records"]:
        file_name = item["file"]["cacheId"].split("/")[-1]
        source_path = fixture_root / file_name
        if not source_path.is_file():
            raise RuntimeError(f"digital_source_missing:{file_name}")
        actual = sha256_file(source_path)
        if actual != item["file"]["sha256"]:
            raise RuntimeError(f"digital_source_hash_mismatch:{item['sourceFamilyId']}")
        records.append(
            {
                "sampleId": item["sampleId"],
                "sourceFamilyId": item["sourceFamilyId"],
                "sourceType": "DIGITAL_NON_AI_NEGATIVE",
                "sourceSubtype": item["benchmark"]["hardNegativeSubtype"],
                "cameraDeviceFamily": None,
                "sourceRootKey": "WP007E_CONTROLLED_DIGITAL_CACHE",
                "sourceRelativePath": file_name,
                "sourceSha256": actual,
                "declaredSourceSha256": item["file"]["sha256"],
                "width": item["file"]["width"],
                "height": item["file"]["height"],
                "format": item["file"]["format"],
                "rights": "LYTHAUS_CONTROLLED",
                "trainingEligibility": "TRAINING_ALLOWED_EXPLICIT",
                "externalProcessing": "NOT_APPLICABLE_LOCAL_ONLY",
                "finalSealedControl": item["sourceFamilyId"] in final_ids,
            }
        )
    return records


def ddb_records(data_root: Path, excluded_samples: set[str]) -> list[dict[str, Any]]:
    cache_root = data_root / "90_RESEARCH_ONLY" / "wp007a-diffusiondb-cache"
    materialisation = load_json(cache_root / "materialization-result.json")
    records: list[dict[str, Any]] = []
    for item in materialisation["records"]:
        if item["sampleId"] in excluded_samples:
            continue
        file_name = item["sampleId"] + ".png"
        source_path = cache_root / "selected" / file_name
        if not source_path.is_file():
            raise RuntimeError(f"ddb_source_missing:{file_name}")
        actual = sha256_file(source_path)
        if actual != item["contentSha256"]:
            raise RuntimeError(f"ddb_source_hash_mismatch:{item['sampleId']}")
        records.append(
            {
                "sampleId": item["sampleId"],
                "sourceFamilyId": item["sourceFamilyId"],
                "sourceType": "DIFFUSIONDB_FULL_GENERATION",
                "sourceSubtype": "DIFFUSIONDB",
                "cameraDeviceFamily": None,
                "sourceRootKey": "WP007A_DIFFUSIONDB_CACHE",
                "sourceRelativePath": f"selected/{file_name}",
                "sourceSha256": actual,
                "declaredSourceSha256": item["contentSha256"],
                "width": item.get("width"),
                "height": item.get("height"),
                "format": item.get("format", "PNG"),
                "rights": "DIFFUSIONDB_RIGHTS_CARRIED_FROM_WP007A",
                "trainingEligibility": "TRAINING_ALLOWED_WITH_CONSTRAINTS",
                "externalProcessing": "NOT_APPLICABLE_LOCAL_ONLY",
            }
        )
    return sorted(records, key=lambda item: item["sampleId"])


def minimal_prior_record(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "sampleId": item["sampleId"],
        "sourceFamilyId": item["sourceFamilyId"],
        "sourceKind": item["sourceKind"],
        "fileSha256": item["fileSha256"],
        "cameraDeviceFamily": item.get("cameraDeviceFamily"),
        "hardNegativeSubtype": item.get("hardNegativeSubtype"),
    }


def main() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    data_root = Path(os.environ.get("LYTHAUS_WP007E_DATA_ROOT", "")).expanduser()
    if not data_root.is_dir():
        raise RuntimeError("LYTHAUS_WP007E_DATA_ROOT_must_be_existing_directory")

    prior_split = load_json(repo_root / "research" / "wp007b" / "ef3-split-freeze.json")
    final_camera = prior_split["sealedFinalCamera"]
    final_digital = prior_split["sealedFinalDigital"]
    final_ids = {item["sourceFamilyId"] for item in (*final_camera, *final_digital)}

    cameras = camera_records(data_root, final_ids)
    digitals = digital_records(data_root, final_ids)

    base_devices = [
        "iPhone11_1", "iPhone12_1", "iPhone14_1", "note10_1", "s20_1", "s21_1",
        "iPhone11_3", "iPhone12_3", "iPhone14_3", "note10_3", "s20_3", "s21_3",
    ]
    pair_camera: list[dict[str, Any]] = []
    for device in base_devices:
        candidates = [
            item for item in cameras
            if item["cameraDeviceFamily"] == device and item["sourceFamilyId"] not in final_ids
        ]
        pair_camera.extend(sorted(candidates, key=lambda item: item["sourceFamilyId"])[:3])
    if len(pair_camera) != 36:
        raise RuntimeError(f"pair_camera_count:{len(pair_camera)}")
    remaining_camera = [
        item for item in cameras
        if item["sourceFamilyId"] not in final_ids
        and item["sourceFamilyId"] not in {x["sourceFamilyId"] for x in pair_camera}
    ]
    neg_camera_calibration = rr_select(remaining_camera, 16, "cameraDeviceFamily")
    used_camera = {x["sourceFamilyId"] for x in (*pair_camera, *neg_camera_calibration)}
    neg_camera_dev = rr_select([x for x in remaining_camera if x["sourceFamilyId"] not in used_camera], 16, "cameraDeviceFamily")
    used_camera |= {x["sourceFamilyId"] for x in neg_camera_dev}
    neg_camera_confirm = rr_select([x for x in remaining_camera if x["sourceFamilyId"] not in used_camera], 24, "cameraDeviceFamily")

    available_digital = [item for item in digitals if item["sourceFamilyId"] not in final_ids]
    pair_digital: list[dict[str, Any]] = []
    for subtype in sorted({item["sourceSubtype"] for item in available_digital}):
        candidates = sorted(
            [item for item in available_digital if item["sourceSubtype"] == subtype],
            key=lambda item: item["sourceFamilyId"],
        )
        pair_digital.extend(candidates[:4])
    if len(pair_digital) != 24:
        raise RuntimeError(f"pair_digital_count:{len(pair_digital)}")
    remaining_digital = [
        item for item in available_digital
        if item["sourceFamilyId"] not in {x["sourceFamilyId"] for x in pair_digital}
    ]
    neg_digital_calibration = rr_select(remaining_digital, 12, "sourceSubtype")
    used_digital = {x["sourceFamilyId"] for x in (*pair_digital, *neg_digital_calibration)}
    neg_digital_dev = rr_select([x for x in remaining_digital if x["sourceFamilyId"] not in used_digital], 12, "sourceSubtype")
    used_digital |= {x["sourceFamilyId"] for x in neg_digital_dev}
    neg_digital_confirm = rr_select([x for x in remaining_digital if x["sourceFamilyId"] not in used_digital], 16, "sourceSubtype")

    prior_ddb_ids = {
        item["sampleId"]
        for key in ("developmentSynthetic", "developmentCamera", "developmentDigital", "sealedFinalCamera", "sealedFinalDigital")
        for item in prior_split.get(key, [])
        if item.get("sampleId", "").startswith("DDB_")
    }
    ddb = ddb_records(data_root, prior_ddb_ids)
    if len(ddb) < 128:
        raise RuntimeError(f"ddb_available_for_transfer:{len(ddb)}")
    ddb_dev = ddb[:64]
    ddb_confirm = ddb[64:128]

    role_names = {
        "PAIR_BASE": pair_camera + pair_digital,
        "NEGATIVE_CALIBRATION": neg_camera_calibration + neg_digital_calibration,
        "NEGATIVE_DEV_CONTROL": neg_camera_dev + neg_digital_dev,
        "NEGATIVE_CONFIRM": neg_camera_confirm + neg_digital_confirm,
        "DDB_TRANSFER_DEV": ddb_dev,
        "DDB_TRANSFER_CONFIRM": ddb_confirm,
    }
    for role, items in role_names.items():
        for item in items:
            item["role"] = role
    family_roles: dict[str, list[str]] = defaultdict(list)
    for role, items in role_names.items():
        for item in items:
            family_roles[item["sourceFamilyId"]].append(role)
    if any(len(roles) != 1 for roles in family_roles.values()):
        raise RuntimeError("source_family_role_overlap")

    holdout = load_json(repo_root / "research" / "wp007ahr4" / "holdout-freeze.json")
    flux1 = [
        {
            "sampleId": item["sampleId"],
            "sourceFamilyId": item["sourceFamilyId"],
            "promptId": item["promptId"],
            "generatorModelId": item["generatorModelId"],
            "generatorFamily": item["generatorFamily"],
            "imageSha256": item["file"]["sha256"],
            "benchmarkRole": item["benchmarkRole"],
        }
        for item in holdout["flux1"]["records"]
    ]

    sealed_controls = {
        "camera": [minimal_prior_record(item) for item in final_camera],
        "digital": [minimal_prior_record(item) for item in final_digital],
    }
    artifact = {
        "schemaVersion": "lythaus-wp007e-data-role-freeze-v1",
        "wp007eBaseSha": BASE_SHA,
        "benchmarkFingerprint": BENCHMARK_FINGERPRINT,
        "wp007ahr4HoldoutFreezeSha256": HOLDOUT_SHA,
        "flux2ReserveFreezeSha256": FLUX2_SHA,
        "scoreBlind": True,
        "pixelAccess": {
            "flux1": False,
            "flux2": False,
            "cloudflareGenerationCalls": 0,
        },
        "sourceRoots": {
            "CSAFE_WP006E_CACHE": "external_local_cache_wp006e_csafe",
            "WP007E_CONTROLLED_DIGITAL_CACHE": "external_local_cache_wp007e_controlled_digital",
            "WP007A_DIFFUSIONDB_CACHE": "external_local_cache_wp007a_diffusiondb",
        },
        "roles": {
            role: {
                "count": len(items),
                "sourceFamilyIds": [item["sourceFamilyId"] for item in items],
                "records": items,
            }
            for role, items in role_names.items()
        },
        "knownFinalSealedControls": sealed_controls,
        "flux1HoldoutMetadataOnly": flux1,
        "flux2ReserveMetadataOnly": {
            "status": "SEALED_FUTURE_RESERVE",
            "reserveFreezeSha256": FLUX2_SHA,
            "pixelAccess": False,
            "providerCallsInWp007e": 0,
        },
        "exclusions": {
            "finalSealedFamilyIdsNotReused": True,
            "ownerUnknownGeneratorDiagnosticUsed": False,
            "flux1UsedInDevelopment": False,
            "flux2UsedInDevelopment": False,
        },
        "selection": {
            "pairCamera": 36,
            "pairDigital": 24,
            "negativeCalibrationCamera": 16,
            "negativeCalibrationDigital": 12,
            "negativeDevCamera": 16,
            "negativeDevDigital": 12,
            "negativeConfirmCamera": 24,
            "negativeConfirmDigital": 16,
            "ddbTransferDev": 64,
            "ddbTransferConfirm": 64,
        },
    }
    artifact["dataRoleFreezeSha256"] = sha256_bytes(stable_bytes(artifact))
    write_json(repo_root / "research" / "wp007e" / "data-role-freeze.json", artifact)
    print(json.dumps({
        "status": "PASS",
        "dataRoleFreezeSha256": artifact["dataRoleFreezeSha256"],
        "pairBase": len(role_names["PAIR_BASE"]),
        "negativeCalibration": len(role_names["NEGATIVE_CALIBRATION"]),
        "negativeDev": len(role_names["NEGATIVE_DEV_CONTROL"]),
        "negativeConfirm": len(role_names["NEGATIVE_CONFIRM"]),
        "ddbDev": len(ddb_dev),
        "ddbConfirm": len(ddb_confirm),
        "flux1MetadataRecords": len(flux1),
        "flux2PixelAccess": False,
    }, sort_keys=True))


if __name__ == "__main__":
    main()
