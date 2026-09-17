"""Write the self-hash for the pre-score WP007H protocol."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def canonical(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def sha256_path(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--forbidden", type=Path, required=True)
    parser.add_argument("--transforms", type=Path, required=True)
    parser.add_argument("--rights", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    plan = json.loads(args.plan.read_text(encoding="utf-8"))
    plan["planSha256"] = "PENDING_FREEZE_HASH"
    digest = hashlib.sha256(canonical(plan)).hexdigest()
    plan["planSha256"] = digest
    args.plan.write_text(json.dumps(plan, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    output = {
        "schemaVersion": "lythaus-wp007h-protocol-hashes-v1",
        "planSha256": digest,
        "forbiddenGeneratorFamiliesSha256": sha256_path(args.forbidden),
        "transformationPlanSha256": sha256_path(args.transforms),
        "safeArtifactRightsSha256": sha256_path(args.rights),
        "frozenBefore": "WP007H new media retrieval and all SAFE scoring",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps(output))


if __name__ == "__main__":
    main()
