"""Materialise WP007I media outside Git and build score manifests.

The script consumes only frozen metadata manifests.  It never chooses samples
from detector output and it refuses FLUX.2 family names before retrieval.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import re
import subprocess
import urllib.request
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFilter, ImageFont


FLUX2_PATTERNS = (re.compile(r"flux\.2", re.I), re.compile(r"flux2", re.I), re.compile(r"flux-2", re.I))
MAX_BYTES = 5_000_000_000
TRANSFORMS = ("JPEG95", "JPEG85", "JPEG75", "RESIZE75", "RESIZE50", "SCREENSHOT_STYLE_RESAMPLING", "METADATA_STRIP", "MILD_CROP", "MILD_BLUR", "MILD_SHARPEN")


def sha256_bytes(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")


def load(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def denied(name: str) -> bool:
    return any(pattern.search(name) for pattern in FLUX2_PATTERNS)


def decode_metadata(path: Path) -> dict[str, Any]:
    with Image.open(path) as image:
        image.load()
        return {"width": image.width, "height": image.height, "format": image.format, "mode": image.mode}


def fetch(url: str, destination: Path) -> None:
    request = urllib.request.Request(url, headers={"User-Agent": "Lythaus-WP007I-research/1"})
    with urllib.request.urlopen(request, timeout=120) as response:
        destination.write_bytes(response.read())


def draw_procedural(category: str, seed: int) -> Image.Image:
    rng = random.Random(20260917 + seed * 7919)
    width, height = 1024, 768
    background = tuple(rng.randrange(220, 256) for _ in range(3))
    image = Image.new("RGB", (width, height), background)
    draw = ImageDraw.Draw(image)
    font = ImageFont.load_default()
    accent = tuple(rng.randrange(20, 180) for _ in range(3))
    secondary = tuple(rng.randrange(40, 220) for _ in range(3))
    if category in {"CHART", "DIAGRAM"}:
        draw.rectangle((70, 80, 950, 680), outline=(40, 40, 40), width=3)
        for x in range(120, 920, 100):
            draw.line((x, 120, x, 640), fill=(205, 205, 205), width=1)
        for y in range(160, 640, 80):
            draw.line((100, y, 920, y), fill=(205, 205, 205), width=1)
        points = []
        for x in range(120, 901, 40):
            points.append((x, 610 - rng.randrange(20, 430)))
        draw.line(points, fill=accent, width=7)
        for i in range(6):
            draw.rectangle((120 + i * 120, 500 - rng.randrange(20, 250), 170 + i * 120, 610), fill=secondary)
        draw.text((90, 25), f"{category.lower()} report {seed:03d}", fill=(20, 20, 20), font=font)
    elif category in {"UI_SCREENSHOT", "GAME_SCREENSHOT", "MEME"}:
        draw.rectangle((40, 35, 984, 730), fill=(245, 245, 248), outline=(45, 45, 55), width=4)
        draw.rectangle((40, 35, 984, 105), fill=accent)
        for i in range(7):
            x = 80 + (i % 4) * 220
            y = 150 + (i // 4) * 230
            draw.rounded_rectangle((x, y, x + 180, y + 170), radius=12, fill=secondary, outline=(60, 60, 60), width=2)
            draw.line((x + 20, y + 125, x + 150, y + 35), fill=(250, 250, 250), width=5)
        draw.text((65, 55), f"{category.replace('_', ' ')} {seed:03d}", fill=(255, 255, 255), font=font)
    elif category in {"VECTOR_LIKE", "DIGITAL_ILLUSTRATION", "THREE_D_RENDER", "CGI", "COMPOSITE"}:
        draw.rectangle((0, 0, width, height), fill=tuple(rng.randrange(10, 60) for _ in range(3)))
        for i in range(18):
            x = rng.randrange(-100, width)
            y = rng.randrange(-100, height)
            w = rng.randrange(70, 350)
            h = rng.randrange(70, 300)
            color = tuple(rng.randrange(30, 240) for _ in range(3))
            if i % 3 == 0:
                draw.ellipse((x, y, x + w, y + h), fill=color, outline=(240, 240, 240), width=2)
            elif i % 3 == 1:
                draw.polygon([(x, y + h), (x + w // 2, y), (x + w, y + h)], fill=color)
            else:
                draw.rounded_rectangle((x, y, x + w, y + h), radius=18, fill=color)
        draw.text((35, 35), f"{category.replace('_', ' ')} / {seed:03d}", fill=(255, 255, 255), font=font)
    elif category == "TEXT_GRAPHIC":
        draw.rectangle((65, 60, 959, 708), fill=(255, 255, 255), outline=(15, 15, 15), width=3)
        for i in range(22):
            y = 105 + i * 25
            x = 100 + rng.randrange(0, 80)
            draw.line((x, y, 850 - rng.randrange(0, 180), y), fill=(30, 30, 30), width=rng.randrange(1, 4))
        draw.text((100, 75), f"ARCHIVE NOTE {seed:03d}", fill=accent, font=font)
    elif category == "PROCEDURAL_PATTERN":
        for y in range(0, height, 24):
            for x in range(0, width, 24):
                value = (x // 24 * 17 + y // 24 * 31 + seed * 13) % 255
                color = (value, (value * 3) % 255, (255 - value))
                if (x // 24 + y // 24 + seed) % 2:
                    draw.rectangle((x, y, x + 20, y + 20), fill=color)
                else:
                    draw.ellipse((x, y, x + 20, y + 20), fill=color)
    else:
        for i in range(30):
            x, y = rng.randrange(width), rng.randrange(height)
            draw.line((x, y, rng.randrange(width), rng.randrange(height)), fill=accent, width=2)
        draw.text((50, 50), f"NON-AI CONTROL {seed:03d}", fill=(20, 20, 20), font=font)
    return image


def generate_procedural(records: list[dict[str, Any]], root: Path, manifest: dict[str, Any]) -> int:
    total = 0
    for row in records:
        destination = root / row["localRelativePath"]
        if not destination.exists():
            destination.parent.mkdir(parents=True, exist_ok=True)
            image = draw_procedural(row["proceduralCategory"], int(row["proceduralSeed"]))
            image.save(destination, format="PNG", optimize=False, compress_level=6)
            image.close()
        metadata = decode_metadata(destination)
        actual = sha256_file(destination)
        row.update({"retrievalStatus": "GENERATED_VERIFIED", "downloadedSha256": actual, "downloadedBytes": destination.stat().st_size, "decode": metadata})
        manifest.append(row)
        total += destination.stat().st_size
    return total


def retrieve_url_records(records: list[dict[str, Any]], root: Path, manifest: list[dict[str, Any]], total: int) -> int:
    for index, row in enumerate(records, start=1):
        if denied(str(row.get("generatorFamily") or "")):
            raise RuntimeError("FLUX2_FAMILY_DENIED_BEFORE_RETRIEVAL")
        destination = root / row["localRelativePath"]
        if not destination.exists():
            destination.parent.mkdir(parents=True, exist_ok=True)
            fetch(row["sourceUrl"], destination)
        size = destination.stat().st_size
        total += size
        if total > MAX_BYTES:
            raise RuntimeError(f"MEDIA_CAP_EXCEEDED:{total}")
        metadata = decode_metadata(destination)
        actual = sha256_file(destination)
        row.update({"retrievalStatus": "RETRIEVED_DECODE_VERIFIED", "downloadedSha256": actual, "downloadedBytes": size, "decode": metadata})
        manifest.append(row)
        if index % 50 == 0 or index == len(records):
            print(f"RETRIEVED_EXTERNAL={index}/{len(records)}", flush=True)
    return total


def retrieve_synthetic(records: list[dict[str, Any]], root: Path, manifest: list[dict[str, Any]], total: int) -> int:
    for index, row in enumerate(records, start=1):
        family = row["generatorFamily"]
        if denied(family):
            raise RuntimeError(f"FLUX2_FAMILY_DENIED_BEFORE_RETRIEVAL:{family}")
        destination = root / row["localRelativePath"]
        if not destination.exists():
            destination.parent.mkdir(parents=True, exist_ok=True)
            url = f"https://huggingface.co/datasets/lioooox/T2I-CoReBench-Images/resolve/{row['officialRevision']}/{row['path']}?download=true"
            temporary = destination.with_suffix(destination.suffix + ".download")
            subprocess.run(["curl.exe", "--fail", "--location", "--silent", "--show-error", "--max-time", "120", "--output", str(temporary), url], check=True)
            temporary.replace(destination)
        size = destination.stat().st_size
        total += size
        if total > MAX_BYTES:
            raise RuntimeError(f"MEDIA_CAP_EXCEEDED:{total}")
        actual = sha256_file(destination)
        if actual != row["lfsSha256"] or size != row["bytes"]:
            raise RuntimeError(f"LFS_INTEGRITY_FAIL:{row['path']}:{actual}:{row['lfsSha256']}:{size}:{row['bytes']}")
        metadata = decode_metadata(destination)
        row.update({"retrievalStatus": "RETRIEVED_LFS_VERIFIED", "downloadedSha256": actual, "downloadedBytes": size, "decode": metadata, "sourceUrlIdentity": f"https://huggingface.co/datasets/lioooox/T2I-CoReBench-Images/resolve/{row['officialRevision']}/{row['path']}"})
        manifest.append(row)
        if index % 20 == 0 or index == len(records):
            print(f"RETRIEVED_SYNTHETIC={index}/{len(records)}", flush=True)
    return total


def materialize(root: Path, media_root: Path) -> None:
    research = root / "research" / "wp007i"
    negative = load(research / "negative-data-freeze.json")["records"]
    synthetic = load(research / "fresh-synthetic-freeze.json")["records"]
    media_root.mkdir(parents=True, exist_ok=True)
    verified: list[dict[str, Any]] = []
    total = 0
    external = [row for row in negative if row["sourceDataset"] == "Unsplash Lite Dataset 1.4.0"]
    procedural = [row for row in negative if row["sourceDataset"].startswith("Lythaus deterministic")]
    total += retrieve_url_records(external, media_root, verified, total)
    total += generate_procedural(procedural, media_root, verified)
    total = retrieve_synthetic(synthetic, media_root, verified, total)
    if len(verified) != len(negative) + len(synthetic):
        raise RuntimeError(f"MEDIA_RECORD_COUNT_MISMATCH:{len(verified)}")
    write_json(media_root / "media-verification.json", {"schemaVersion": "lythaus-wp007i-media-verification-v1", "flux2PixelAccess": False, "flux2ProviderCalls": 0, "totalBytes": total, "records": verified})
    build_score_manifests(root, media_root, verified)
    print(json.dumps({"mediaRecords": len(verified), "totalBytes": total, "mediaRootKey": "WP007I_EXTERNAL_MEDIA"}, sort_keys=True))


def build_score_manifests(root: Path, media_root: Path, verified: list[dict[str, Any]]) -> None:
    by_family = {row["sourceFamilyId"]: row for row in verified}
    research = root / "research" / "wp007i"
    original = []
    for row in verified:
        original.append({
            "rowKey": f"{row['role']}__{row['sourceFamilyId']}__{row['sampleId']}",
            "sampleId": row["sampleId"],
            "sourceFamilyId": row["sourceFamilyId"],
            "role": row["role"],
            "label": row["label"],
            "sourceSubtype": row.get("sourceSubtype"),
            "cameraDeviceFamily": row.get("cameraDeviceFamily"),
            "generatorFamily": row.get("generatorFamily"),
            "sourceSha256": row["downloadedSha256"],
            "inputPath": str((media_root / row["localRelativePath"]).resolve()),
            "inputRegime": "ORIGINAL_OR_HIGH_QUALITY",
            "transformation": "ORIGINAL",
            "format": row.get("decode", {}).get("format"),
            "flux2PixelAccess": False,
        })
    score_dir = media_root / "manifests"
    score_dir.mkdir(parents=True, exist_ok=True)
    write_json(score_dir / "original-score-inputs.json", {"schemaVersion": "lythaus-wp007i-safe-score-inputs-v1", "scoreBlind": True, "flux1PixelAccess": False, "flux2PixelAccess": False, "records": original})
    app_dev = load(research / "applicability-development-manifest.json")["records"]
    app_confirm = load(research / "applicability-confirmation-manifest.json")["records"]
    app_records = app_dev + app_confirm
    base = []
    for row in app_records:
        actual = by_family[row["sourceFamilyId"]]
        base.append({"rowKey": f"{row['role']}__{row['sourceFamilyId']}__{row['sampleId']}", "sampleId": row["sampleId"], "sourceFamilyId": row["sourceFamilyId"], "role": row["role"], "label": row["label"], "sourceSubtype": row.get("sourceSubtype"), "cameraDeviceFamily": row.get("cameraDeviceFamily"), "generatorFamily": row.get("generatorFamily"), "sourceSha256": actual["downloadedSha256"], "inputPath": str((media_root / actual["localRelativePath"]).resolve()), "inputRegime": "ORIGINAL_OR_HIGH_QUALITY", "transformation": "ORIGINAL", "format": actual.get("decode", {}).get("format"), "applicabilityRole": row["applicabilityRole"], "flux2PixelAccess": False})
    write_json(score_dir / "applicability-original-inputs.json", {"schemaVersion": "lythaus-wp007i-app-original-inputs-v1", "scoreBlind": True, "flux1PixelAccess": False, "flux2PixelAccess": False, "records": base})


def transform_image(source: Image.Image, name: str) -> tuple[Image.Image, str]:
    if name.startswith("JPEG"):
        return source.copy(), "jpg"
    if name == "RESIZE75":
        return source.resize((max(1, int(source.width * 0.75)), max(1, int(source.height * 0.75))), Image.Resampling.LANCZOS), "png"
    if name == "RESIZE50":
        return source.resize((max(1, int(source.width * 0.50)), max(1, int(source.height * 0.50))), Image.Resampling.LANCZOS), "png"
    if name == "SCREENSHOT_STYLE_RESAMPLING":
        return source.resize((max(1, int(source.width * 0.75)), max(1, int(source.height * 0.75))), Image.Resampling.BILINEAR), "png"
    if name == "METADATA_STRIP":
        return source.copy(), "png"
    if name == "MILD_CROP":
        mx, my = int(source.width * 0.05), int(source.height * 0.05)
        return source.crop((mx, my, source.width - mx, source.height - my)).resize(source.size, Image.Resampling.LANCZOS), "png"
    if name == "MILD_BLUR":
        return source.filter(ImageFilter.GaussianBlur(radius=0.6)), "png"
    if name == "MILD_SHARPEN":
        return source.filter(ImageFilter.UnsharpMask(radius=1, percent=150, threshold=3)), "png"
    raise RuntimeError(f"UNKNOWN_TRANSFORM:{name}")


def transform_media(root: Path, media_root: Path) -> None:
    research = root / "research" / "wp007i"
    app_dev = load(research / "applicability-development-manifest.json")["records"]
    app_confirm = load(research / "applicability-confirmation-manifest.json")["records"]
    verification = load(media_root / "media-verification.json")["records"]
    by_family = {row["sourceFamilyId"]: row for row in verification}
    base_records = app_dev + app_confirm
    output_root = media_root / "transforms"
    rows = []
    for index, base in enumerate(sorted(base_records, key=lambda row: row["selectionHash"])):
        source_record = by_family[base["sourceFamilyId"]]
        source_path = media_root / source_record["localRelativePath"]
        with Image.open(source_path) as original:
            original.load()
            source = original.convert("RGB")
        try:
            for name in TRANSFORMS:
                transformed, extension = transform_image(source, name)
                destination = output_root / name / f"{index:04d}-{sha256_bytes(base['sourceFamilyId'].encode())[:12]}.{extension}"
                destination.parent.mkdir(parents=True, exist_ok=True)
                if name.startswith("JPEG"):
                    transformed.save(destination, format="JPEG", quality=int(name[4:]), subsampling=0, optimize=False, progressive=False)
                else:
                    transformed.save(destination, format="PNG", optimize=False, compress_level=6)
                rows.append({"rowKey": f"{base['role']}__{base['sourceFamilyId']}__{base['sampleId']}__{name}", "baseRowKey": f"{base['role']}__{base['sourceFamilyId']}__{base['sampleId']}", "sampleId": base["sampleId"], "sourceFamilyId": base["sourceFamilyId"], "role": base["role"], "label": base["label"], "sourceSubtype": base.get("sourceSubtype"), "cameraDeviceFamily": base.get("cameraDeviceFamily"), "generatorFamily": base.get("generatorFamily"), "applicabilityRole": base["applicabilityRole"], "transform": name, "transformation": name, "inputRegime": "UNKNOWN_TRANSFORMATION_STATE", "sourceSha256": source_record["downloadedSha256"], "outputSha256": sha256_file(destination), "outputBytes": destination.stat().st_size, "inputPath": str(destination.resolve()), "format": extension.upper(), "flux2PixelAccess": False})
        finally:
            source.close()
        if (index + 1) % 25 == 0 or index + 1 == len(base_records):
            print(f"TRANSFORM_BASES={index + 1}/{len(base_records)}", flush=True)
    write_json(media_root / "manifests" / "transformation-score-inputs.json", {"schemaVersion": "lythaus-wp007i-transformation-score-inputs-v1", "scoreBlind": True, "flux1PixelAccess": False, "flux2PixelAccess": False, "baseCount": len(base_records), "transformationCount": len(rows), "records": rows})


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("materialize")
    p.add_argument("--root", type=Path, required=True)
    p.add_argument("--media-root", type=Path, required=True)
    t = sub.add_parser("transform")
    t.add_argument("--root", type=Path, required=True)
    t.add_argument("--media-root", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "materialize":
        materialize(args.root, args.media_root)
    else:
        transform_media(args.root, args.media_root)


if __name__ == "__main__":
    main()
