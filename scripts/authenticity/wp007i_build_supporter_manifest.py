"""Combine frozen WP007I image manifests for descriptive supporter scoring."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any


FLUX2 = re.compile(r"flux[._-]?2", re.IGNORECASE)


def load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--original", type=Path, required=True)
    parser.add_argument("--transforms", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    original = load(args.original)
    transforms = load(args.transforms)
    if not original.get("scoreBlind") or not transforms.get("scoreBlind"):
        raise RuntimeError("SCORE_BLIND_MANIFEST_REQUIRED")
    records = original["records"] + transforms["records"]
    if any(FLUX2.search(str(row.get("generatorFamily") or "")) for row in records):
        raise RuntimeError("FLUX2_FAMILY_DENIED")
    if any(row.get("flux2PixelAccess") for row in records):
        raise RuntimeError("FLUX2_PIXEL_ACCESS_FLAGGED")
    if len({row["rowKey"] for row in records}) != len(records):
        raise RuntimeError("SUPPORTER_MANIFEST_DUPLICATE_ROW")
    payload = {
        "schemaVersion": "lythaus-wp007i-supporter-score-inputs-v1",
        "scoreBlind": True,
        "flux1PixelAccess": False,
        "flux2PixelAccess": False,
        "role": "SHADOW_SUPPORTER_ONLY",
        "records": records,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"records": len(records), "flux2PixelAccess": False}, sort_keys=True))


if __name__ == "__main__":
    main()
