"""Build a score-blind SPAI C512 CSV from the frozen WP007H runtime manifest."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runtime-manifest", type=Path, required=True)
    parser.add_argument("--output-csv", type=Path, required=True)
    args = parser.parse_args()
    manifest = json.loads(args.runtime_manifest.read_text(encoding="utf-8"))
    allowed = {"QUALIFICATION_CONFIRM", "NEGATIVE_CONFIRM_H"}
    records = [row for row in manifest["records"] if row.get("role") in allowed]
    records.sort(key=lambda row: row["rowKey"])
    if len(records) != 272:
        raise RuntimeError(f"SPAI_SHADOW_RECORD_COUNT:{len(records)}")
    args.output_csv.parent.mkdir(parents=True, exist_ok=True)
    with args.output_csv.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=["image", "split", "class"])
        writer.writeheader()
        for record in records:
            path = Path(record["inputPath"])
            if not path.is_file():
                raise FileNotFoundError(path)
            writer.writerow({"image": str(path.resolve()), "split": "test", "class": record["label"]})
    print(json.dumps({"records": len(records), "output": str(args.output_csv.resolve())}))


if __name__ == "__main__":
    main()
