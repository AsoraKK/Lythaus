"""Materialise the predeclared public-to-Cloudflare FLUX.1 diagnostic ladder."""

from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from pathlib import Path

from PIL import Image


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def save_png(source: Path, destination: Path, size: tuple[int, int] | None, strip_metadata: bool) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as image:
        image.load()
        rgb = image.convert("RGB")
        if size is not None:
            rgb = rgb.resize(size, Image.Resampling.LANCZOS)
        if strip_metadata:
            rgb.save(destination, format="PNG", optimize=False)
        else:
            rgb.save(destination, format="PNG", optimize=False)


def add_record(records: list[dict], plan_record: dict, path: Path, stage: str, source: str) -> None:
    records.append({
        "rowKey": f"{source}__{plan_record['sampleId']}__{stage}",
        "sampleId": plan_record["sampleId"],
        "sourceFamilyId": f"WP007H-FLUX1-{source}",
        "role": "POST_HOC_FLUX1_DIAGNOSTIC",
        "label": 1,
        "sourceSubtype": "POST_HOC_SYNTHETIC_DIAGNOSTIC",
        "generatorFamily": plan_record.get("generatorFamily", source),
        "sourceRootKey": source,
        "sourceRelativePath": plan_record.get("mediaRelativePath") or plan_record.get("sourcePath"),
        "sourceSha256": sha256_file(path),
        "sourceBytes": path.stat().st_size,
        "format": "PNG",
        "inputRegime": "POST_HOC_DIAGNOSTIC",
        "transformation": stage,
        "transform": stage,
        "flux2PixelAccess": False,
        "inputPath": str(path.resolve()),
    })


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", type=Path, required=True)
    parser.add_argument("--modern-root", type=Path, required=True)
    parser.add_argument("--cloudflare-root", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    plan = json.loads(args.plan.read_text(encoding="utf-8"))
    args.output_root.mkdir(parents=True, exist_ok=True)
    records: list[dict] = []
    public_stages = (
        "ORIGINAL",
        "DIMENSION_MATCH_ONLY",
        "FORMAT_MATCH_ONLY",
        "METADATA_STRIP_ONLY",
        "COMBINED_MEASURABLE_APPROXIMATION",
    )
    width = plan["targetCharacteristics"]["dimensions"]["width"]
    height = plan["targetCharacteristics"]["dimensions"]["height"]
    for item in plan["publicRecords"]:
        source = args.modern_root / item["mediaRelativePath"]
        if not source.is_file():
            raise FileNotFoundError(source)
        if item["generatorFamily"] not in {"FLUX.1-dev", "FLUX.1-schnell"}:
            raise RuntimeError("UNEXPECTED_PUBLIC_FLUX_FAMILY")
        add_record(records, item, source, "ORIGINAL", "PUBLIC_FLUX1")
        resized = args.output_root / "DIMENSION_MATCH_ONLY" / f"{item['sampleId']}.png"
        save_png(source, resized, (width, height), strip_metadata=True)
        add_record(records, item, resized, "DIMENSION_MATCH_ONLY", "PUBLIC_FLUX1")
        add_record(records, item, source, "FORMAT_MATCH_ONLY", "PUBLIC_FLUX1")
        metadata_stripped = args.output_root / "METADATA_STRIP_ONLY" / f"{item['sampleId']}.png"
        save_png(source, metadata_stripped, None, strip_metadata=True)
        add_record(records, item, metadata_stripped, "METADATA_STRIP_ONLY", "PUBLIC_FLUX1")
        combined = args.output_root / "COMBINED_MEASURABLE_APPROXIMATION" / f"{item['sampleId']}.png"
        save_png(source, combined, (width, height), strip_metadata=True)
        add_record(records, item, combined, "COMBINED_MEASURABLE_APPROXIMATION", "PUBLIC_FLUX1")
    for item in plan["cloudflareRecords"]:
        source = args.cloudflare_root / item["sourcePath"]
        if not source.is_file():
            raise FileNotFoundError(source)
        add_record(records, item, source, "CLOUDFLARE_BASELINE", "CLOUDFLARE_FLUX1")
    records.sort(key=lambda row: row["rowKey"])
    if any("flux.2" in row["generatorFamily"].lower() for row in records):
        raise RuntimeError("FLUX2_RECORD_DENIED")
    output = {
        "schemaVersion": "lythaus-wp007h-flux1-diagnostic-runtime-inputs-v1",
        "diagnosticRole": "POST_HOC_PUBLIC_TO_CLOUDFLARE_DOMAIN_SHIFT",
        "scoreBlind": False,
        "flux1PixelAccess": True,
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
        "planSha256": hashlib.sha256(args.plan.read_bytes()).hexdigest(),
        "noFitUse": True,
        "noThresholdUse": True,
        "records": records,
        "notApplicableStages": {
            "RESIZE_MATCH_ONLY": "No provider resize algorithm is inferable from the consumed Cloudflare PNGs; dimension match uses fixed LANCZOS and the limitation is recorded.",
            "QUALITY_RECOMPRESSION_MATCH_ONLY": "Cloudflare diagnostic files are PNG with no JPEG quantization metadata.",
            "CHROMA_SUBSAMPLING_MATCH_ONLY": "Cloudflare diagnostic files are PNG with no JPEG chroma subsampling.",
        },
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"records": len(records), "mediaRoot": str(args.output_root), "manifestSha256": hashlib.sha256(args.output.read_bytes()).hexdigest()}))


if __name__ == "__main__":
    main()
