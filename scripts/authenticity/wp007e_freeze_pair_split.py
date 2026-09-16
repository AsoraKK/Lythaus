"""Freeze a deterministic, score-blind 42/18 paired-family split."""

from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from pathlib import Path

from wp007e_common import load_json, stable_hash, write_json


def ranked(items: list[dict], context: str) -> list[dict]:
    return sorted(items, key=lambda item: hashlib.sha256(f"{context}|{item['sourceFamilyId']}".encode()).hexdigest())


def main() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    roles = load_json(repo_root / "research" / "wp007e" / "data-role-freeze.json")
    pair = roles["roles"]["PAIR_BASE"]["records"]
    camera = [item for item in pair if item["sourceType"] == "CAMERA_NEGATIVE"]
    digital = [item for item in pair if item["sourceType"] == "DIGITAL_NON_AI_NEGATIVE"]
    by_device: dict[str, list[dict]] = defaultdict(list)
    for item in camera:
        by_device[item["cameraDeviceFamily"]].append(item)
    validation: list[dict] = []
    for device in sorted(by_device):
        validation.append(ranked(by_device[device], "WP007E_PAIR_SPLIT_V1|CAMERA|" + device)[0])
    validation = ranked(validation, "WP007E_PAIR_SPLIT_V1|CAMERA_SELECTION")[:11]
    validation.extend(ranked(digital, "WP007E_PAIR_SPLIT_V1|DIGITAL_SELECTION")[:7])
    if len(validation) != 18:
        raise RuntimeError("pair_validation_count")
    validation_ids = {item["sourceFamilyId"] for item in validation}
    train = [item for item in pair if item["sourceFamilyId"] not in validation_ids]
    if len(train) != 42 or len([item for item in train if item["sourceType"] == "CAMERA_NEGATIVE"]) != 25 or len([item for item in train if item["sourceType"] == "DIGITAL_NON_AI_NEGATIVE"]) != 17:
        raise RuntimeError("pair_split_stratification_invalid")
    artifact = {
        "schemaVersion": "lythaus-wp007e-pair-family-split-freeze-v1",
        "dataRoleFreezeSha256": roles["dataRoleFreezeSha256"],
        "selectionAlgorithm": "SHA256_RANKED_GROUP_STRATIFIED_WP007E_PAIR_SPLIT_V1",
        "scoreBlind": True,
        "pairBaseCount": len(pair),
        "pairTrainCount": len(train),
        "pairValidationCount": len(validation),
        "pairTrainCameraCount": 25,
        "pairTrainDigitalCount": 17,
        "pairValidationCameraCount": 11,
        "pairValidationDigitalCount": 7,
        "pairTrainSourceFamilyIds": sorted(item["sourceFamilyId"] for item in train),
        "pairValidationSourceFamilyIds": sorted(item["sourceFamilyId"] for item in validation),
        "allDerivativesStayWithSourceFamily": True,
        "flux1PixelAccess": False,
        "flux2PixelAccess": False,
    }
    artifact["pairSplitFreezeSha256"] = stable_hash(artifact)
    write_json(repo_root / "research" / "wp007e" / "pair-family-split-freeze.json", artifact)
    print(json.dumps({"status": "PASS", "pairTrain": len(train), "pairValidation": len(validation), "freezeSha256": artifact["pairSplitFreezeSha256"]}, sort_keys=True))


if __name__ == "__main__":
    main()
