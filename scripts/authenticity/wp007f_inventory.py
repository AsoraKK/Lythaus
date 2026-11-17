"""Inventory identified Lythaus research storage and execute an explicit plan."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
from pathlib import Path
from typing import Any


def file_sha(path: Path) -> str | None:
    if path.stat().st_size > 8 * 1024 * 1024:
        return None
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def scan(root_key: str, root: Path, work_package: str, action: str) -> dict[str, Any]:
    if not root.exists():
        return {"rootKey": root_key, "exists": False, "workPackage": work_package, "action": action, "files": [], "bytes": 0}
    summarize_only = root_key in {"WP007E_VENV", "WP007B_SPAI"}
    files: list[dict[str, Any]] = []
    for path in sorted((item for item in root.rglob("*") if item.is_file()), key=lambda item: item.as_posix()):
        relative = path.relative_to(root).as_posix()
        if not summarize_only:
            files.append({
                "assetKind": "FILE",
                "logicalPath": f"{root_key}/{relative}",
                "bytes": path.stat().st_size,
                "sha256": file_sha(path) if root_key in {"WP007E_MEDIA", "WP007E_DECODER_WEIGHTS"} else None,
            })
    total_bytes = sum(item.stat().st_size for item in root.rglob("*") if item.is_file())
    return {
        "rootKey": root_key,
        "exists": True,
        "workPackage": work_package,
        "action": action,
        "fileCount": sum(1 for item in root.rglob("*") if item.is_file()),
        "bytes": total_bytes,
        "files": files,
        "detail": "SUMMARY_ONLY_FOR_RUNTIME_ENVIRONMENT" if summarize_only else "FILE_LEVEL",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", type=Path, required=True)
    parser.add_argument("--inventory", type=Path, required=True)
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--result", type=Path, required=True)
    parser.add_argument("--execute-cleanup", action="store_true")
    args = parser.parse_args()

    data_root = Path(os.environ.get("LYTHAUS_WP007F_DATA_ROOT", "C:/Users/kylee/OneDrive/Desktop/Lythaus_AI_Datasets"))
    digital_root = Path(os.environ.get("LYTHAUS_WP007F_DIGITAL_ROOT", "C:/Users/kylee/AppData/Local/Temp/lythaus-wp007e-controlled-digital"))
    temp_root = Path(os.environ.get("LYTHAUS_WP007F_TEMP_ROOT", "C:/Users/kylee/AppData/Local/Temp"))
    roots = [
        ("WP007E_MEDIA", temp_root / "lythaus-wp007e-media", "WP007E disposable generated proxy media", "DELETE_APPROVED"),
        ("WP007E_DECODER_WEIGHTS", temp_root / "lythaus-wp007e-weights", "WP007E decoder weights no longer used by WP007F", "DELETE_APPROVED"),
        ("WP007E_BACKBONES", temp_root / "lythaus-wp007e-backbones", "WP007E backbone cache retained pending detector replacement inventory", "KEEP"),
        ("WP007E_VENV", temp_root / "lythaus-wp007e-venv", "Reusable isolated CPU research environment", "KEEP"),
        ("WP007E_CONTROLLED_DIGITAL", digital_root, "Rights-clean controlled digital negative source pool", "KEEP"),
        ("WP007A_DDB", data_root / "90_RESEARCH_ONLY" / "wp007a-diffusiondb-cache", "Rights-clean actual generated qualification corpus", "KEEP"),
        ("WP006E_CSAFE", data_root / "wp006e-csafe-cache-4e8c0d40f2c7", "Rights-clean camera negative source pool", "KEEP"),
        ("WP007A_HOLDOUT_FLUX1", temp_root / "lythaus-wp007ahr4-flux1-35000395251", "Sealed FLUX.1 holdout", "KEEP_SEALED"),
        ("WP007A_RESERVE_FLUX2", temp_root / "lythaus-wp007ahr3-artifact-34938983014", "Sealed FLUX.2 future reserve", "KEEP_SEALED"),
        ("WP007B_SPAI", temp_root / "spai-official-wp007b-20260915-01", "Qualified SPAI checkpoint and runtime source", "KEEP"),
    ]
    records = [scan(*item) for item in roots]
    inventory = {
        "schemaVersion": "lythaus-wp007f-storage-inventory-v1",
        "privacy": {"absolutePathsCommitted": False, "secretsInspected": False, "unrelatedPersonalRootsInspected": False},
        "identifiedRoots": records,
        "sealedAssets": [
            {"rootKey": "WP007A_HOLDOUT_FLUX1", "status": "SEALED", "pixelAccess": False},
            {"rootKey": "WP007A_RESERVE_FLUX2", "status": "SEALED_FUTURE_RESERVE", "pixelAccess": False},
        ],
    }
    args.inventory.parent.mkdir(parents=True, exist_ok=True)
    args.inventory.write_text(json.dumps(inventory, ensure_ascii=True, sort_keys=True, indent=2) + "\n", encoding="utf-8")

    delete_roots = [item for item in records if item.get("action") == "DELETE_APPROVED" and item.get("exists")]
    plan = {
        "schemaVersion": "lythaus-wp007f-storage-cleanup-plan-v1",
        "approval": "WP007F_USER_AUTHORIZED_EXPLICIT_DISPOSABLE_RESEARCH_CLEANUP",
        "deleteOnlyExplicitEntries": True,
        "entries": [
            {
                "rootKey": item["rootKey"],
                "bytes": item["bytes"],
                "reason": "Disposable WP007E media/weights are not required by WP007F and are regenerable from preserved manifests/source code.",
                "proof": "WP007E final record is committed; WP007F uses actual DiffusionDB, camera, digital pools, SPAI and new mature detector checkpoints.",
                "preservedScientificRecord": ["research/wp007e reports", "manifests", "hashes", "source scripts"],
                "action": "DELETE_APPROVED",
            }
            for item in delete_roots
        ],
        "preserved": [item["rootKey"] for item in records if item.get("action") != "DELETE_APPROVED"],
    }
    args.plan.write_text(json.dumps(plan, ensure_ascii=True, sort_keys=True, indent=2) + "\n", encoding="utf-8")

    if args.execute_cleanup:
        for item in plan["entries"]:
            root = next((root_path for key, root_path, _, _ in roots if key == item["rootKey"]), None)
            if root is None or not root.is_dir():
                raise RuntimeError(f"cleanup_target_not_known:{item['rootKey']}")
            resolved = root.resolve()
            if temp_root.resolve() not in resolved.parents:
                raise RuntimeError(f"cleanup_target_outside_temp_research_root:{item['rootKey']}")
            shutil.rmtree(resolved)

    after = [scan(*item) for item in roots]
    bytes_before = sum(item["bytes"] for item in records if item.get("exists"))
    deleted_bytes = sum(item["bytes"] for item in records if item.get("action") == "DELETE_APPROVED")
    result = {
        "schemaVersion": "lythaus-wp007f-storage-cleanup-result-v1",
        "executed": args.execute_cleanup,
        "bytesBeforeIdentifiedRoots": bytes_before,
        "bytesDeleted": deleted_bytes if args.execute_cleanup else 0,
        "bytesPreserved": bytes_before - deleted_bytes if args.execute_cleanup else bytes_before,
        "bytesUnresolved": sum(item["bytes"] for item in after if item.get("exists") and item.get("action") == "DELETE_APPROVED"),
        "rootsAfter": [{"rootKey": item["rootKey"], "exists": item.get("exists"), "bytes": item.get("bytes", 0)} for item in after],
        "sealedStatuses": {"FLUX1": "SEALED", "FLUX2": "SEALED_FUTURE_RESERVE", "flux2ProviderCalls": 0},
    }
    args.result.write_text(json.dumps(result, ensure_ascii=True, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    print(f"STORAGE_BYTES_BEFORE={bytes_before}")
    print(f"STORAGE_BYTES_DELETED={result['bytesDeleted']}")
    print(f"STORAGE_BYTES_PRESERVED={result['bytesPreserved']}")


if __name__ == "__main__":
    main()
