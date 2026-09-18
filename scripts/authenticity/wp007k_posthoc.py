"""Post-freeze CES-S diagnostic over historical WP007I challenge media."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from wp007k_analyze import SAFE_THRESHOLD, independent_replay, summary


def read(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--features", type=Path, required=True)
    parser.add_argument("--scored", type=Path, required=True)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    features = read(args.features)["records"]
    scored = read(args.scored)
    scored_rows = scored["records"]
    model = read(args.model)
    threshold = float(model["threshold"])
    by_family = {}
    families = sorted({row.get("generatorFamily") for row in scored_rows if row.get("generatorFamily")})
    for family in families:
        group = [row for row in scored_rows if row.get("generatorFamily") == family]
        by_family[family] = {
            "count": len(group),
            "safeA": summary(group, "safeRawScore", SAFE_THRESHOLD),
            "cesS": summary(group, "cesSScore", threshold),
        }
    negatives = [row for row in scored_rows if row.get("truthLabel") == 0]
    synthetics = [row for row in scored_rows if row.get("truthLabel") == 1]
    output = {
        "schemaVersion": "lythaus-wp007k-posthoc-ces-s-diagnostic-v1",
        "role": "POST_HOC_DIAGNOSTIC_ONLY",
        "manifestSha256": __import__("hashlib").sha256(args.manifest.read_bytes()).hexdigest(),
        "modelSha256": __import__("hashlib").sha256(args.model.read_bytes()).hexdigest(),
        "modelThreshold": threshold,
        "recordCount": len(scored_rows),
        "syntheticCount": len(synthetics),
        "negativeCount": len(negatives),
        "overall": {
            "safeA": summary(scored_rows, "safeRawScore", SAFE_THRESHOLD),
            "cesS": summary(scored_rows, "cesSScore", threshold),
        },
        "byGeneratorFamily": by_family,
        "syntheticByOperation": {
            operation: {
                "safeA": summary(group, "safeRawScore", SAFE_THRESHOLD),
                "cesS": summary(group, "cesSScore", threshold),
            }
            for operation in sorted({str(row.get("operation")) for row in synthetics})
            for group in [[row for row in synthetics if str(row.get("operation")) == operation]]
        },
        "independentReplay": independent_replay(model, features, scored_rows),
        "usesForFit": False,
        "usesForThreshold": False,
        "cloudflareFlux1Tuning": False,
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    }
    args.output.write_text(json.dumps(output, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"recordCount": len(scored_rows), "families": families, "flux2PixelAccess": False}))


if __name__ == "__main__":
    main()
