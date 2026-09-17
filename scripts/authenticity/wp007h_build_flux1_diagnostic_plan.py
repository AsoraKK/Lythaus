"""Freeze a metadata-only, post-hoc SAFE FLUX.1 domain-shift plan."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
from collections import Counter
from pathlib import Path

from PIL import Image


FLUX2_MARKERS = ("flux.2", "flux2", "flux-2")
PUBLIC_FAMILIES = ("FLUX.1-dev", "FLUX.1-schnell")
LADDER = (
    "ORIGINAL",
    "DIMENSION_MATCH_ONLY",
    "RESIZE_MATCH_ONLY",
    "FORMAT_MATCH_ONLY",
    "QUALITY_RECOMPRESSION_MATCH_ONLY",
    "CHROMA_SUBSAMPLING_MATCH_ONLY",
    "METADATA_STRIP_ONLY",
    "COMBINED_MEASURABLE_APPROXIMATION",
)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def quantization_summary(image: Image.Image) -> dict:
    quant = getattr(image, "quantization", None)
    if not quant:
        return {"present": False, "tables": {}}
    return {
        "present": True,
        "tables": {
            str(key): {
                "length": len(value),
                "sha256": hashlib.sha256(bytes(value)).hexdigest(),
            }
            for key, value in sorted(quant.items())
        },
    }


def inspect(path: Path, logical_id: str) -> dict:
    with Image.open(path) as image:
        image.load()
        info_keys = sorted(str(key) for key in image.info)
        icc = image.info.get("icc_profile")
        return {
            "sampleId": logical_id,
            "sha256": sha256_file(path),
            "bytes": path.stat().st_size,
            "format": image.format,
            "width": image.width,
            "height": image.height,
            "mode": image.mode,
            "infoKeys": info_keys,
            "iccProfileBytes": len(icc) if isinstance(icc, bytes) else 0,
            "quantization": quantization_summary(image),
            "hasExif": bool(image.getexif()),
        }


def stats(rows: list[dict]) -> dict:
    dimensions = Counter(f"{row['width']}x{row['height']}" for row in rows)
    formats = Counter(row["format"] for row in rows)
    modes = Counter(row["mode"] for row in rows)
    return {
        "count": len(rows),
        "dimensions": dict(sorted(dimensions.items())),
        "formats": dict(sorted(formats.items())),
        "modes": dict(sorted(modes.items())),
        "byteMin": min((row["bytes"] for row in rows), default=None),
        "byteMax": max((row["bytes"] for row in rows), default=None),
        "byteMedian": sorted(row["bytes"] for row in rows)[len(rows) // 2] if rows else None,
        "exifCount": sum(row["hasExif"] for row in rows),
        "iccCount": sum(row["iccProfileBytes"] > 0 for row in rows),
        "quantizedCount": sum(row["quantization"]["present"] for row in rows),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--modern-freeze", type=Path, required=True)
    parser.add_argument("--modern-root", type=Path, required=True)
    parser.add_argument("--cloudflare-root", type=Path, required=True)
    parser.add_argument("--cloudflare-csv", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    modern = json.loads(args.modern_freeze.read_text(encoding="utf-8"))
    public_rows = []
    for record in modern["records"]:
        if record.get("generatorFamily") not in PUBLIC_FAMILIES:
            continue
        path = args.modern_root / record["mediaRelativePath"]
        if not path.is_file():
            raise FileNotFoundError(path)
        if any(marker in record["generatorFamily"].lower() for marker in FLUX2_MARKERS):
            raise RuntimeError("FLUX2_PUBLIC_FAMILY_DENIED")
        actual = sha256_file(path)
        if actual != record["mediaSha256"]:
            raise RuntimeError(f"PUBLIC_HASH_MISMATCH:{record['sampleId']}:{actual}:{record['mediaSha256']}")
        metadata = inspect(path, record["sampleId"])
        metadata.update({
            "source": "PUBLIC_T2I_COREBENCH",
            "generatorFamily": record["generatorFamily"],
            "officialRevision": record["officialRevision"],
            "sourcePath": record["sourcePath"],
            "mediaRelativePath": record["mediaRelativePath"],
            "role": "POST_HOC_PUBLIC_FLUX1_DIAGNOSTIC",
        })
        public_rows.append(metadata)
    if len(public_rows) != 40:
        raise RuntimeError(f"PUBLIC_FLUX1_COUNT:{len(public_rows)}")

    cloudflare_rows = []
    with args.cloudflare_csv.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            if row.get("class") != "1":
                continue
            name = row["image"]
            path = args.cloudflare_root / name
            if not path.is_file():
                raise FileNotFoundError(path)
            metadata = inspect(path, Path(name).stem)
            metadata.update({
                "source": "CONSUMED_CLOUDFLARE_FLUX1",
                "generatorFamily": "CLOUDFLARE_FLUX.1_SCHNELL",
                "sourcePath": name,
                "role": "POST_HOC_CLOUDFLARE_FLUX1_DIAGNOSTIC",
            })
            cloudflare_rows.append(metadata)
    if len(cloudflare_rows) != 40:
        raise RuntimeError(f"CLOUDFLARE_FLUX1_COUNT:{len(cloudflare_rows)}")

    cloudflare_stats = stats(cloudflare_rows)
    public_stats = stats(public_rows)
    target_dimensions = sorted(cloudflare_stats["dimensions"].items(), key=lambda item: (-item[1], item[0]))[0][0]
    target_width, target_height = (int(part) for part in target_dimensions.split("x"))
    target_format = sorted(cloudflare_stats["formats"].items(), key=lambda item: (-item[1], item[0]))[0][0]

    output = {
        "schemaVersion": "lythaus-wp007h-flux1-diagnostic-plan-v1",
        "diagnosticRole": "POST_HOC_PUBLIC_TO_CLOUDFLARE_DOMAIN_SHIFT",
        "createdBeforeDiagnosticScoring": True,
        "safeCheckpointSha256": "b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e",
        "safeUpstreamCommit": "4e998724651b227def64f5be0cd60c0aa1552c35",
        "publicSourceFreeze": "research/wp007g-r1/modern-generator-data-freeze.json",
        "publicFamilies": list(PUBLIC_FAMILIES),
        "publicCount": len(public_rows),
        "cloudflareCount": len(cloudflare_rows),
        "cloudflareSource": "research/wp007f/final-exam-inputs.json plus consumed local diagnostic bytes",
        "metadataOnlyBeforeScoring": True,
        "targetCharacteristics": {
            "dimensions": {"width": target_width, "height": target_height},
            "format": target_format,
            "targetSelectionRule": "modal measurable Cloudflare characteristic; no SAFE scores used",
        },
        "ladder": [
            {"stage": "ORIGINAL", "operation": "score public bytes exactly as retrieved"},
            {"stage": "DIMENSION_MATCH_ONLY", "operation": "resize public pixels to modal Cloudflare dimensions; fixed high-quality resampler"},
            {"stage": "RESIZE_MATCH_ONLY", "operation": "resize public pixels to a representative Cloudflare dimension using the same declared resampler"},
            {"stage": "FORMAT_MATCH_ONLY", "operation": "encode public pixels in the modal Cloudflare format without other changes"},
            {"stage": "QUALITY_RECOMPRESSION_MATCH_ONLY", "operation": "where JPEG metadata supports it, use the deterministic quality ladder selected from metadata; otherwise NOT_APPLICABLE"},
            {"stage": "CHROMA_SUBSAMPLING_MATCH_ONLY", "operation": "where JPEG metadata supports it, match the modal subsampling; otherwise NOT_APPLICABLE"},
            {"stage": "METADATA_STRIP_ONLY", "operation": "remove non-pixel metadata and preserve decoded pixels"},
            {"stage": "COMBINED_MEASURABLE_APPROXIMATION", "operation": "apply only the above measurable factors; never claim provider-internal equivalence"},
        ],
        "diagnosticRules": {
            "fitUse": False,
            "thresholdUse": False,
            "safeThreshold": 0.5864923000335693,
            "noSafeTuning": True,
            "cloudflarePixelsAlreadyConsumed": True,
            "flux2PixelAccess": False,
            "flux2ProviderCalls": 0,
            "interpretation": "Compare score distributions and trajectories; do not infer exact provider internals from convergence alone.",
            "convergenceReporting": "Report median, IQR, ECDF separation and per-sample trajectories for every applicable ladder stage. Convergence is descriptive only; no stage is allowed to change SAFE preprocessing or qualification.",
        },
        "publicRecords": sorted(public_rows, key=lambda row: row["sampleId"]),
        "cloudflareRecords": sorted(cloudflare_rows, key=lambda row: row["sampleId"]),
        "summary": {"public": public_stats, "cloudflare": cloudflare_stats},
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    digest = hashlib.sha256(args.output.read_bytes()).hexdigest()
    print(json.dumps({"public": len(public_rows), "cloudflare": len(cloudflare_rows), "outputSha256": digest, "target": output["targetCharacteristics"]}))


if __name__ == "__main__":
    main()
