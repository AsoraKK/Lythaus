"""Repair a pre-score manifest omission by adding deterministic sample families."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write(path: Path, value: dict) -> None:
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def family(row: dict) -> str:
    return f"T2I_FAMILY_{row['generatorFamily']}_{row['sampleId']}"


def main() -> None:
    root = Path(__file__).resolve().parents[2] / "research" / "wp007i"
    synthetic_path = root / "fresh-synthetic-freeze.json"
    synthetic = json.loads(synthetic_path.read_text(encoding="utf-8"))
    for row in synthetic["records"]:
        row["sourceFamilyId"] = family(row)
    write(synthetic_path, synthetic)
    for name in ("applicability-development-manifest.json", "applicability-confirmation-manifest.json"):
        path = root / name
        manifest = json.loads(path.read_text(encoding="utf-8"))
        for row in manifest["records"]:
            if row.get("label") == 1 and not row.get("sourceFamilyId"):
                row["sourceFamilyId"] = family(row)
        write(path, manifest)
    data_path = root / "data-role-freeze.json"
    data = json.loads(data_path.read_text(encoding="utf-8"))
    data["syntheticFreezeSha256"] = digest(synthetic_path)
    write(data_path, data)
    print(json.dumps({"syntheticFreezeSha256": data["syntheticFreezeSha256"], "records": len(synthetic["records"])}, sort_keys=True))


if __name__ == "__main__":
    main()
