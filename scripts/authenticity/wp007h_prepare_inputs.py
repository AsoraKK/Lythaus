"""Freeze and selectively retrieve WP007H independent modern families.

This script enumerates historical Git-LFS pointer files only, selects samples
by a deterministic hash before SAFE is run, and retrieves only the frozen
confirmation role. Reserve files remain metadata-only until explicitly opened
after the confirmation gate.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import tempfile
from pathlib import Path

from PIL import Image


FLUX2_PATTERNS = (re.compile(r"flux\.2", re.I), re.compile(r"flux2", re.I), re.compile(r"flux-2", re.I))
DATASET_BASE = "https://huggingface.co/datasets/lioooox/T2I-CoReBench-Images/resolve"


def sha256_bytes(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def run_git(repo: Path, *args: str) -> str:
    result = subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True, text=True)
    return result.stdout


def deny_family(family: str, deny_patterns: list[str]) -> bool:
    return family in deny_patterns or any(pattern.search(family) for pattern in FLUX2_PATTERNS)


def pointer_for(repo: Path, revision: str, path: str) -> tuple[str, int]:
    pointer = run_git(repo, "show", f"{revision}:{path}")
    oid_match = re.search(r"^oid sha256:([0-9a-f]{64})$", pointer, flags=re.M)
    size_match = re.search(r"^size (\d+)$", pointer, flags=re.M)
    if not oid_match or not size_match:
        raise RuntimeError(f"LFS_POINTER_INVALID:{revision}:{path}")
    return oid_match.group(1), int(size_match.group(1))


def enumerate_family(repo: Path, family: str, revision: str, selection_count: int, selection_prefix: str) -> tuple[list[dict], int]:
    paths = [line.strip() for line in run_git(repo, "ls-tree", "-r", "--name-only", revision, "--", f"data/{family}").splitlines() if line.strip()]
    if not paths:
        raise RuntimeError(f"FAMILY_NOT_FOUND:{family}:{revision}")
    catalog_count = len(paths)
    paths = sorted(paths, key=lambda path: hashlib.sha256(f"{selection_prefix}{family}{path.removeprefix(f'data/{family}/')}".encode()).hexdigest())[:selection_count]
    rows = []
    for path in paths:
        oid, size = pointer_for(repo, revision, path)
        rows.append({
            "generatorFamily": family,
            "officialRevision": revision,
            "path": path,
            "relativePath": path.removeprefix(f"data/{family}/"),
            "lfsSha256": oid,
            "bytes": size,
            "retrievalStatus": "INDEXED_METADATA_ONLY",
        })
    return rows, catalog_count


def select_rows(rows: list[dict], family: str, count: int, prefix: str) -> list[dict]:
    ordered = sorted(rows, key=lambda row: hashlib.sha256(f"{prefix}{family}{row['relativePath']}".encode()).hexdigest())
    selected = ordered[:count]
    for row in selected:
        row["selectionHash"] = hashlib.sha256(f"{prefix}{family}{row['relativePath']}".encode()).hexdigest()
        row["retrievalStatus"] = "SELECTED_SCORE_BLIND"
    return selected


def decode_metadata(path: Path) -> dict:
    with Image.open(path) as image:
        image.load()
        return {"width": image.width, "height": image.height, "format": image.format, "mode": image.mode}


def retrieve(row: dict, root: Path) -> dict:
    family_dir = root / row["generatorFamily"] / Path(row["relativePath"])
    family_dir.parent.mkdir(parents=True, exist_ok=True)
    url = f"{DATASET_BASE}/{row['officialRevision']}/{row['path']}?download=true"
    # Windows curl follows the Hugging Face Xet redirect reliably in the
    # existing environment; urllib can hang before receiving the same body.
    with tempfile.NamedTemporaryFile(prefix="wp007h-download-", suffix=".bin", delete=False) as handle:
        temporary = Path(handle.name)
    try:
        subprocess.run(
            ["curl.exe", "--fail", "--location", "--silent", "--show-error", "--max-time", "120", "--output", str(temporary), url],
            check=True,
        )
        raw = temporary.read_bytes()
    finally:
        temporary.unlink(missing_ok=True)
    actual_sha = sha256_bytes(raw)
    if actual_sha != row["lfsSha256"]:
        raise RuntimeError(f"LFS_HASH_MISMATCH:{row['path']}:{actual_sha}:{row['lfsSha256']}")
    if len(raw) != row["bytes"]:
        raise RuntimeError(f"LFS_SIZE_MISMATCH:{row['path']}:{len(raw)}:{row['bytes']}")
    family_dir.write_bytes(raw)
    metadata = decode_metadata(family_dir)
    row.update({
        "retrievalStatus": "RETRIEVED_VERIFIED",
        "downloadedSha256": actual_sha,
        "downloadedBytes": len(raw),
        "localRelativePath": f"{row['generatorFamily']}/{row['relativePath']}",
        "decode": metadata,
        "sourceUrlIdentity": url.split("?", 1)[0],
    })
    return row


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--history-repo", type=Path, required=True)
    parser.add_argument("--modern-root", type=Path, required=True)
    parser.add_argument("--history-index", type=Path, required=True)
    parser.add_argument("--freeze", type=Path, required=True)
    parser.add_argument("--open-reserve", action="store_true")
    args = parser.parse_args()

    plan = json.loads(args.plan.read_text(encoding="utf-8"))
    forbidden = set(plan["modernGeneratorRoles"]["excludedFamilies"])
    families = plan["modernGeneratorRoles"]["qualificationConfirm"]["families"] + plan["modernGeneratorRoles"]["futureReserve"]["families"]
    selected_confirm: list[dict] = []
    selected_reserve: list[dict] = []
    catalog_counts: dict[str, int] = {}
    for family_spec in families:
        family = family_spec["family"]
        if family in forbidden or deny_family(family, list(plan["modernGeneratorRoles"]["excludedFamilies"])):
            raise RuntimeError(f"FORBIDDEN_GENERATOR_FAMILY:{family}")
        rows, catalog_count = enumerate_family(args.history_repo, family, family_spec["historicalRevision"], int(plan["modernGeneratorRoles"]["qualificationConfirm"]["samplesPerFamily"]), "WP007H")
        catalog_counts[family] = catalog_count
        print(f"INDEXED {family} catalog={catalog_count} selected={len(rows)}", flush=True)
        selected = select_rows(rows, family, int(plan["modernGeneratorRoles"]["qualificationConfirm"]["samplesPerFamily"]), "WP007H")
        if family in {item["family"] for item in plan["modernGeneratorRoles"]["qualificationConfirm"]["families"]}:
            selected_confirm.extend(selected)
        else:
            selected_reserve.extend(selected)

    if len(selected_confirm) != 160 or len(selected_reserve) != 40:
        raise RuntimeError(f"UNEXPECTED_SELECTION_COUNTS:{len(selected_confirm)}:{len(selected_reserve)}")
    if not args.open_reserve:
        for row in selected_reserve:
            row["retrievalStatus"] = "RESERVE_NOT_OPENED"
    else:
        for row in selected_reserve:
            retrieve(row, args.modern_root)
    for row in selected_confirm:
        print(f"RETRIEVE {row['generatorFamily']} {row['relativePath']}", flush=True)
        retrieve(row, args.modern_root)

    args.history_index.parent.mkdir(parents=True, exist_ok=True)
    index = {
        "schemaVersion": "lythaus-wp007h-historical-file-index-v1",
        "sourceRepository": "lioooox/T2I-CoReBench-Images",
        "officialHistoryOnly": True,
        "metadataOnlyEnumerationBeforeRetrieval": True,
        "flux2ExcludedBeforeObjectDownload": True,
        "catalogCountsForSelectedFamilies": catalog_counts,
        "selectedConfirmationCount": len(selected_confirm),
        "selectedReserveCount": len(selected_reserve),
        "files": selected_confirm + selected_reserve,
    }
    args.history_index.write_text(json.dumps(index, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    freeze = {
        "schemaVersion": "lythaus-wp007h-qualification-corpus-freeze-v1",
        "parentSha": plan["parentSha"],
        "sourceDataset": "T2I-CoReBench-Images",
        "sourceRepository": "https://huggingface.co/datasets/lioooox/T2I-CoReBench-Images",
        "rightsClassification": "RESEARCH_ONLY_UNLESS_SEPARATE_PER_FAMILY_OUTPUT_RIGHTS_ARE_ESTABLISHED",
        "selectionRule": "SHA256(WP007H + generatorFamily + relativePath), first 20 per family",
        "scoreBlind": True,
        "flux1Role": "NOT_IN_H_QUALIFICATION_MEMBERSHIP",
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
        "roles": {
            "QUALIFICATION_CONFIRM": selected_confirm,
            "FUTURE_RESERVE": selected_reserve,
        },
        "openedReserve": args.open_reserve,
    }
    args.freeze.write_text(json.dumps(freeze, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"confirmation": len(selected_confirm), "reserve": len(selected_reserve), "reserveOpened": args.open_reserve, "index": str(args.history_index), "freeze": str(args.freeze)}))


if __name__ == "__main__":
    main()
