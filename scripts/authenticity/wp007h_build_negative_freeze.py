"""Build the WP007H negative roles from provenance, never detector scores."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


ROOT_KEYS = {"CSAFE_WP006E_CACHE", "WP007E_CONTROLLED_DIGITAL_CACHE"}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_json(path: Path) -> object:
    return json.loads(path.read_text(encoding="utf-8"))


def collect_used(root: Path) -> set[tuple[str, str]]:
    used: set[tuple[str, str]] = set()
    for path in sorted((root / "research").glob("wp007[defg]*/*.json")):
        try:
            value = load_json(path)
        except (OSError, json.JSONDecodeError):
            continue

        def walk(node: object) -> None:
            if isinstance(node, dict):
                if node.get("sourceRootKey") in ROOT_KEYS and isinstance(node.get("sourceRelativePath"), str):
                    used.add((str(node["sourceRootKey"]), str(node["sourceRelativePath"])))
                for child in node.values():
                    walk(child)
            elif isinstance(node, list):
                for child in node:
                    walk(child)

        walk(value)
    return used


def path_key(path: str) -> str:
    return path.replace("\\", "/").lstrip("./")


def fresh_camera_rows(csafe_root: Path, used: set[tuple[str, str]], replication: dict) -> list[dict]:
    rows = []
    for path in sorted(csafe_root.rglob("*.jpg")) + sorted(csafe_root.rglob("*.JPG")):
        relative = path_key(str(path.relative_to(csafe_root)))
        key = ("CSAFE_WP006E_CACHE", relative)
        if key in used:
            continue
        digest = sha256_file(path)
        parts = relative.split("/")
        device = parts[-2] if len(parts) >= 2 else "UNKNOWN_DEVICE"
        rows.append({
            "sampleId": f"WP007H_FRESH_CAMERA_{digest[:12]}",
            "sourceFamilyId": f"WP007H-FRESH-CAMERA-{digest[:24]}",
            "sourceRootKey": "CSAFE_WP006E_CACHE",
            "sourceRelativePath": relative,
            "sourceSha256": digest,
            "bytes": path.stat().st_size,
            "format": "JPG",
            "sourceSubtype": "CAMERA",
            "cameraDeviceFamily": device,
            "rights": "CC_BY_4.0_WITH_ATTRIBUTION",
            "provenanceClass": "NEW_UNUSED_SOURCE",
            "trainingEligibility": "TRAINING_ALLOWED_WITH_CONSTRAINTS",
            "finalSealedControl": False,
        })
    return rows


def fresh_digital_rows(digital_root: Path, used: set[tuple[str, str]]) -> list[dict]:
    rows = []
    for path in sorted(digital_root.iterdir()):
        if not path.is_file() or path.name == "manifest.json" or path.suffix.lower() not in {".svg", ".png", ".jpg", ".jpeg"}:
            continue
        relative = path_key(path.name)
        key = ("WP007E_CONTROLLED_DIGITAL_CACHE", relative)
        if key in used:
            continue
        digest = sha256_file(path)
        prefix = path.stem.split("_")
        subtype = "DIGITAL_NON_AI"
        if len(prefix) >= 2:
            subtype = prefix[1].upper()
        rows.append({
            "sampleId": f"WP007H_FRESH_DIGITAL_{digest[:12]}",
            "sourceFamilyId": f"WP007H-FRESH-DIGITAL-{digest[:24]}",
            "sourceRootKey": "WP007E_CONTROLLED_DIGITAL_CACHE",
            "sourceRelativePath": relative,
            "sourceSha256": digest,
            "bytes": path.stat().st_size,
            "format": path.suffix.lstrip(".").upper(),
            "sourceSubtype": subtype if subtype != "SVG" else "DIGITAL_NON_AI",
            "cameraDeviceFamily": None,
            "rights": "LYTHAUS_CONTROLLED",
            "provenanceClass": "NEW_UNUSED_SOURCE",
            "trainingEligibility": "TRAINING_ALLOWED_EXPLICIT",
            "finalSealedControl": False,
        })
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", type=Path, required=True)
    parser.add_argument("--r1-negative-freeze", type=Path, required=True)
    parser.add_argument("--csafe-root", type=Path, required=True)
    parser.add_argument("--digital-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    r1 = load_json(args.r1_negative_freeze)
    used = collect_used(args.repo_root)
    r1_confirm = list(r1["roles"].get("NEGATIVE_CONFIRM_G", []))
    r1_reserve = list(r1["roles"].get("NEGATIVE_RESERVE_G", []))
    fresh = fresh_camera_rows(args.csafe_root, used, {}) + fresh_digital_rows(args.digital_root, used)
    fresh.sort(key=lambda row: hashlib.sha256(f"WP007H-NEGATIVE{row['sourceFamilyId']}{row['sourceRelativePath']}".encode()).hexdigest())
    confirm = []
    for row in r1_confirm + r1_reserve + fresh:
        row = dict(row)
        row["role"] = "NEGATIVE_CONFIRM_H"
        row["hIndependence"] = "UNSEEN_TO_R1_SAFE_THRESHOLD" if row.get("provenanceClass") in {"UNTOUCHED_CONFIRM_ELIGIBLE", "UNTOUCHED_RESERVE_ELIGIBLE"} else "NEW_UNUSED_SOURCE"
        confirm.append(row)
    auxiliary = []
    for role in ("NEGATIVE_CALIBRATION_G", "NEGATIVE_DEV_G"):
        for source in r1["roles"].get(role, []):
            row = dict(source)
            row["role"] = "NEGATIVE_AUXILIARY_REUSED"
            row["hIndependence"] = "REUSED_PRIOR_CALIBRATION_OR_DEVELOPMENT"
            auxiliary.append(row)
    if len(confirm) < 100:
        raise RuntimeError(f"NEGATIVE_CONFIRM_H_BELOW_MINIMUM:{len(confirm)}")
    keys = [(row["sourceRootKey"], row["sourceRelativePath"]) for row in confirm + auxiliary]
    if len(keys) != len(set(keys)):
        raise RuntimeError("NEGATIVE_ROLE_DUPLICATE_PATH")
    output = {
        "schemaVersion": "lythaus-wp007h-negative-data-freeze-v1",
        "parentSha": "fc9c1a65528a39da008fed12c1a601e32c226e09",
        "selectionBeforeScore": True,
        "selectionUsesDetectorScores": False,
        "roles": {
            "NEGATIVE_CONFIRM_H": confirm,
            "NEGATIVE_AUXILIARY_REUSED": auxiliary,
        },
        "counts": {
            "NEGATIVE_CONFIRM_H": len(confirm),
            "NEGATIVE_CONFIRM_H_CAMERA": sum(row["sourceSubtype"] == "CAMERA" for row in confirm),
            "NEGATIVE_CONFIRM_H_DIGITAL": sum(row["sourceSubtype"] != "CAMERA" for row in confirm),
            "NEGATIVE_AUXILIARY_REUSED": len(auxiliary),
            "freshUnusedInventory": len(fresh),
        },
        "independenceLimitations": [
            "NEGATIVE_CONFIRM_H is unseen to the R1 SAFE threshold but includes prior R1 confirmation/reserve families; it is not a new untouched benchmark.",
            "NEGATIVE_AUXILIARY_REUSED includes prior R1 calibration/development paths and is descriptive only.",
            "No duplicated image is added to inflate N.",
            "No final sealed controls or FLUX pixels are included.",
        ],
        "rights": "CSAFE CC BY 4.0 attribution-bound; Lythaus-controlled digital research rights; no redistribution.",
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(output["counts"]))


if __name__ == "__main__":
    main()
