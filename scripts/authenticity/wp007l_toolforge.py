"""WP007L bounded forensic-tool forge.

This runner materializes only approved, already-local research media outside
Git, records source-family lineage, and emits sanitized aggregate artifacts.
It never emits an authorship or AI classification from codec facts.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import shutil
import struct
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageOps
from scipy.ndimage import gaussian_filter
from scipy.fft import dctn


QUALITY_REQUESTS = [100, 99, 98, 97, 96, 95, 92, 90, 85, 80, 75, 65, 50]
SUBSAMPLING = {"4:4:4": 0, "4:2:2": 1, "4:2:0": 2}
SAFE_THRESHOLD = 0.5864923000335693
SAFE_CHECKPOINT_SHA256 = "b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e"
FLUX2_MARKERS = ("flux.2", "flux2", "flux-2")


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def canonical_sha(value: Any) -> str:
    return sha256_bytes(json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8"))


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def u16(data: bytes, offset: int) -> int | None:
    return int.from_bytes(data[offset : offset + 2], "big") if offset + 2 <= len(data) else None


def marker_name(marker: int) -> str:
    names = {
        0xC0: "SOF0",
        0xC1: "SOF1",
        0xC2: "SOF2",
        0xC3: "SOF3",
        0xC4: "DHT",
        0xC5: "SOF5",
        0xC6: "SOF6",
        0xC7: "SOF7",
        0xC8: "JPG",
        0xC9: "SOF9",
        0xCA: "SOF10",
        0xCB: "SOF11",
        0xCC: "DAC",
        0xCD: "SOF13",
        0xCE: "SOF14",
        0xCF: "SOF15",
        0xD8: "SOI",
        0xD9: "EOI",
        0xDA: "SOS",
        0xDB: "DQT",
        0xDD: "DRI",
        0xE0: "APP0",
        0xE1: "APP1",
        0xE2: "APP2",
        0xEE: "APP14",
        0xFE: "COM",
    }
    return names.get(marker, f"0x{marker:02x}")


def _tiff_u(data: bytes, offset: int, endian: str, size: int) -> int | None:
    if offset + size > len(data):
        return None
    return int.from_bytes(data[offset : offset + size], endian)


def exif_thumbnail_presence(app_data: bytes) -> dict[str, Any]:
    """Read only thumbnail offsets/lengths; never persist raw metadata values."""
    result: dict[str, Any] = {
        "exifPresent": app_data.startswith(b"Exif\x00\x00"),
        "thumbnailPresent": False,
        "thumbnailOffset": None,
        "thumbnailLength": None,
        "parserStatus": "NOT_EXIF",
    }
    if not result["exifPresent"] or len(app_data) < 14:
        return result
    tiff = 6
    endian_tag = app_data[tiff : tiff + 2]
    if endian_tag == b"II":
        endian = "little"
    elif endian_tag == b"MM":
        endian = "big"
    else:
        result["parserStatus"] = "INVALID_ENDIAN"
        return result
    if _tiff_u(app_data, tiff + 2, endian, 2) != 42:
        result["parserStatus"] = "INVALID_MAGIC"
        return result
    first_ifd_rel = _tiff_u(app_data, tiff + 4, endian, 4)
    if first_ifd_rel is None:
        result["parserStatus"] = "INVALID_IFD_OFFSET"
        return result
    first_ifd = tiff + first_ifd_rel
    count = _tiff_u(app_data, first_ifd, endian, 2)
    if count is None:
        result["parserStatus"] = "INVALID_IFD"
        return result
    next_offset_position = first_ifd + 2 + count * 12
    second_ifd_rel = _tiff_u(app_data, next_offset_position, endian, 4)
    if second_ifd_rel is None or second_ifd_rel == 0:
        result["parserStatus"] = "NO_THUMBNAIL_IFD"
        return result
    second_ifd = tiff + second_ifd_rel
    second_count = _tiff_u(app_data, second_ifd, endian, 2)
    if second_count is None:
        result["parserStatus"] = "INVALID_THUMBNAIL_IFD"
        return result
    values: dict[int, int] = {}
    for index in range(second_count):
        entry = second_ifd + 2 + index * 12
        tag = _tiff_u(app_data, entry, endian, 2)
        type_id = _tiff_u(app_data, entry + 2, endian, 2)
        count_value = _tiff_u(app_data, entry + 4, endian, 4)
        if tag not in (0x0201, 0x0202) or type_id != 4 or count_value != 1:
            continue
        value = _tiff_u(app_data, entry + 8, endian, 4)
        if value is not None:
            values[tag] = value
    if 0x0201 in values and 0x0202 in values and values[0x0202] > 0:
        result.update(
            {
                "thumbnailPresent": True,
                "thumbnailOffset": values[0x0201],
                "thumbnailLength": values[0x0202],
                "parserStatus": "THUMBNAIL_OFFSETS_FOUND",
            }
        )
    else:
        result["parserStatus"] = "THUMBNAIL_OFFSETS_NOT_FOUND"
    return result


def parse_jpeg(data: bytes) -> dict[str, Any]:
    result: dict[str, Any] = {
        "format": "JPEG" if data[:2] == b"\xff\xd8" else "UNKNOWN",
        "valid": False,
        "dimensions": None,
        "sampling": "UNKNOWN",
        "components": [],
        "progressive": None,
        "markers": [],
        "markerSequenceSha256": None,
        "quantizationTables": [],
        "quantizationTableSha256": None,
        "huffmanTableSha256": None,
        "metadata": [],
        "appMarkers": [],
        "restartInterval": None,
        "thumbnail": {
            "exifPresent": False,
            "thumbnailPresent": False,
            "thumbnailOffset": None,
            "thumbnailLength": None,
            "parserStatus": "NOT_EXIF",
        },
        "trailingBytes": 0,
        "currentByteFactsOnly": True,
        "previousJpegHistory": "UNDETERMINED_FROM_FINAL_BYTES",
        "authorshipInference": "FORBIDDEN",
    }
    if data[:2] != b"\xff\xd8":
        return result
    pos = 2
    dqt: dict[int, list[int]] = {}
    dht_chunks: list[str] = []
    components: list[dict[str, int]] = []
    app1_exif: bytes | None = None
    saw_eoi = False
    while pos < len(data):
        while pos < len(data) and data[pos] == 0xFF:
            pos += 1
        if pos >= len(data):
            break
        marker = data[pos]
        pos += 1
        if marker == 0x00 or 0xD0 <= marker <= 0xD7:
            continue
        name = marker_name(marker)
        result["markers"].append(name)
        if marker == 0xD9:
            saw_eoi = True
            break
        if marker == 0xD8:
            continue
        if pos + 2 > len(data):
            break
        length = u16(data, pos)
        if length is None or length < 2 or pos + length > len(data):
            break
        payload_start = pos + 2
        payload_end = pos + length
        payload = data[payload_start:payload_end]
        if marker == 0xDB:
            cursor = 0
            while cursor < len(payload):
                info = payload[cursor]
                cursor += 1
                precision = info >> 4
                table_id = info & 0x0F
                width = 2 if precision else 1
                count = 64 * width
                if cursor + count > len(payload):
                    break
                values = []
                for index in range(64):
                    if width == 1:
                        values.append(payload[cursor + index])
                    else:
                        values.append(int.from_bytes(payload[cursor + index * 2 : cursor + index * 2 + 2], "big"))
                dqt[table_id] = values
                cursor += count
        elif marker == 0xC4:
            dht_chunks.append(payload.hex())
        elif 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC) and len(payload) >= 6:
            precision = payload[0]
            height = int.from_bytes(payload[1:3], "big")
            width = int.from_bytes(payload[3:5], "big")
            count = payload[5]
            cursor = 6
            for _ in range(count):
                if cursor + 3 > len(payload):
                    break
                component_id = payload[cursor]
                sampling = payload[cursor + 1]
                components.append(
                    {
                        "id": component_id,
                        "h": sampling >> 4,
                        "v": sampling & 0x0F,
                        "quantTable": payload[cursor + 2],
                    }
                )
                cursor += 3
            result["dimensions"] = {"width": width, "height": height, "pixelCount": width * height, "precision": precision}
            result["progressive"] = marker in (0xC2, 0xCA)
        elif marker == 0xDD and len(payload) >= 2:
            result["restartInterval"] = int.from_bytes(payload[:2], "big")
        elif 0xE0 <= marker <= 0xEF:
            result["appMarkers"].append(name)
            if marker == 0xE0 and payload.startswith(b"JFIF"):
                result["metadata"].append("JFIF")
            if marker == 0xE1:
                if payload.startswith(b"Exif\x00\x00"):
                    result["metadata"].append("EXIF")
                    app1_exif = payload
                if b"http://ns.adobe.com/xap/1.0/" in payload or b"<x:xmpmeta" in payload:
                    result["metadata"].append("XMP")
            if marker == 0xE2:
                if b"ICC_PROFILE" in payload:
                    result["metadata"].append("ICC_PROFILE")
                if b"c2pa" in payload.lower():
                    result["metadata"].append("C2PA_INTERFACE")
            if marker == 0xEE:
                result["metadata"].append("APP14")
        elif marker == 0xFE:
            result["metadata"].append("COM")
        if marker == 0xDA:
            pos = payload_end
            while pos + 1 < len(data):
                if data[pos] != 0xFF:
                    pos += 1
                    continue
                next_byte = data[pos + 1]
                if next_byte == 0x00:
                    pos += 2
                    continue
                if 0xD0 <= next_byte <= 0xD7:
                    pos += 2
                    continue
                if next_byte == 0xD9:
                    saw_eoi = True
                    pos += 2
                    break
                pos += 1
            break
        pos = payload_end
    if saw_eoi:
        eoi = data.find(b"\xff\xd9", pos)
        result["trailingBytes"] = max(0, len(data) - (eoi + 2 if eoi >= 0 else len(data)))
    result["components"] = components
    if components:
        luma = components[0]
        chroma = components[1:]
        if not chroma:
            result["sampling"] = "GRAYSCALE"
        elif luma["h"] == 1 and luma["v"] == 1 and all(c["h"] == 1 and c["v"] == 1 for c in chroma):
            result["sampling"] = "4:4:4"
        elif luma["h"] == 2 and luma["v"] == 1 and all(c["h"] == 1 and c["v"] == 1 for c in chroma):
            result["sampling"] = "4:2:2"
        elif luma["h"] == 2 and luma["v"] == 2 and all(c["h"] == 1 and c["v"] == 1 for c in chroma):
            result["sampling"] = "4:2:0"
        else:
            result["sampling"] = "OTHER"
    result["quantizationTables"] = [{"id": key, "values": values} for key, values in sorted(dqt.items())]
    result["quantizationTableSha256"] = canonical_sha(dqt) if dqt else None
    result["huffmanTableSha256"] = canonical_sha(dht_chunks) if dht_chunks else None
    result["markerSequenceSha256"] = canonical_sha(result["markers"])
    result["metadata"] = sorted(set(result["metadata"]))
    if app1_exif is not None:
        result["thumbnail"] = exif_thumbnail_presence(app1_exif)
    result["valid"] = bool(result["dimensions"] and saw_eoi and dqt)
    return result


def parse_file(path: Path) -> dict[str, Any]:
    data = path.read_bytes()
    parsed = parse_jpeg(data)
    if parsed["format"] == "UNKNOWN" and data.startswith(b"\x89PNG\r\n\x1a\n"):
        try:
            with Image.open(path) as image:
                parsed = {
                    "format": "PNG",
                    "valid": True,
                    "dimensions": {"width": image.width, "height": image.height, "pixelCount": image.width * image.height},
                    "sampling": "NOT_APPLICABLE",
                    "components": [],
                    "progressive": None,
                    "markers": [],
                    "markerSequenceSha256": None,
                    "quantizationTables": [],
                    "quantizationTableSha256": None,
                    "huffmanTableSha256": None,
                    "metadata": sorted(k for k in image.info if k.lower() in {"icc_profile", "exif", "xmp"}),
                    "appMarkers": [],
                    "restartInterval": None,
                    "thumbnail": {"exifPresent": False, "thumbnailPresent": False, "parserStatus": "PNG_NOT_APPLICABLE"},
                    "trailingBytes": 0,
                    "currentByteFactsOnly": True,
                    "previousJpegHistory": "UNDETERMINED_FROM_FINAL_BYTES",
                    "authorshipInference": "FORBIDDEN",
                }
        except Exception as error:
            parsed["error"] = f"PNG_DECODE:{type(error).__name__}"
    parsed["sha256"] = sha256_bytes(data)
    parsed["byteLength"] = len(data)
    return parsed


def normalized_image(path: Path, size: int = 256) -> np.ndarray:
    with Image.open(path) as image:
        image.load()
        image = ImageOps.exif_transpose(image).convert("RGB")
        image = ImageOps.fit(image, (size, size), method=Image.Resampling.BICUBIC, centering=(0.5, 0.5))
        return np.asarray(image, dtype=np.float64) / 255.0


def scalar_features(path: Path) -> dict[str, float]:
    rgb = normalized_image(path)
    gray = 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]
    centered = gray - float(gray.mean())
    spectrum = np.fft.fftshift(np.fft.fft2(centered))
    magnitude = np.abs(spectrum)
    phase = np.angle(spectrum)
    yy, xx = np.mgrid[-128:128, -128:128]
    radius = np.sqrt(xx * xx + yy * yy)
    non_dc = radius > 0
    high = radius >= 64
    total = float(np.sum(magnitude[non_dc] ** 2))
    high_energy = float(np.sum(magnitude[high] ** 2))
    phase_weights = magnitude[non_dc] + 1e-12
    phase_coherence = float(abs(np.sum(phase_weights * np.exp(1j * phase[non_dc])) / np.sum(phase_weights)))
    blocks = gray.reshape(32, 8, 32, 8).transpose(0, 2, 1, 3).reshape(-1, 8, 8)
    coefficients = dctn(blocks, type=2, norm="ortho", axes=(-2, -1))
    frequencies = np.add.outer(np.arange(8), np.arange(8))
    ac_mask = frequencies >= 1
    low_mask = (frequencies >= 1) & (frequencies <= 3)
    high_mask = frequencies >= 8
    abs_coefficients = np.abs(coefficients)
    ac = coefficients[:, ac_mask]
    low = coefficients[:, low_mask]
    high_dct = coefficients[:, high_mask]
    dct_dc = coefficients[:, 0, 0]
    boundary = np.concatenate(
        [np.abs(gray[:, 8::8] - gray[:, 7:-1:8]).ravel(), np.abs(gray[8::8, :] - gray[7:-1:8, :]).ravel()]
    )
    interior = np.concatenate([np.abs(gray[:, 1:] - gray[:, :-1]).ravel(), np.abs(gray[1:, :] - gray[:-1, :]).ravel()])
    blur = gaussian_filter(gray, sigma=1.0)
    residual = gray - blur
    channel_corr = np.corrcoef(rgb.reshape(-1, 3).T)
    parity = np.mean(np.abs(rgb[::2, ::2] - rgb[1::2, 1::2]))
    return {
        "pixelMean": float(gray.mean()),
        "pixelStd": float(gray.std()),
        "rgbChannelCorrelation": float(np.nanmean(channel_corr[np.triu_indices(3, 1)])),
        "dctDcStd": float(dct_dc.std()),
        "dctAcL1Mean": float(np.mean(np.abs(ac))),
        "dctAcEnergy": float(np.mean(ac * ac)),
        "dctLowFrequencyEnergy": float(np.mean(low * low)),
        "dctHighFrequencyEnergy": float(np.mean(high_dct * high_dct)),
        "dctHighToLowEnergyRatio": float(np.mean(high_dct * high_dct) / (np.mean(low * low) + 1e-12)),
        "dctAcZeroRate": float(np.mean(abs_coefficients[:, ac_mask] < 1e-3)),
        "fftLogMagnitudeMean": float(np.mean(np.log1p(magnitude))),
        "fftHighFrequencyEnergyRatio": high_energy / (total + 1e-12),
        "fftPhaseCircularCoherence": phase_coherence,
        "fftPhaseMeanAbsolute": float(np.mean(np.abs(phase[non_dc]))),
        "blockBoundaryRatio": float(boundary.mean() / (interior.mean() + 1e-12)),
        "residualStd": float(residual.std()),
        "residualParity": float(parity),
        "gradientStd": float(np.std(np.gradient(gray)[0]) + np.std(np.gradient(gray)[1])),
    }


def grid_features(path: Path) -> dict[str, float]:
    image = normalized_image(path, 256)
    gray = 0.299 * image[:, :, 0] + 0.587 * image[:, :, 1] + 0.114 * image[:, :, 2]
    scores = []
    for offset in range(8):
        boundary_indices = np.arange(offset + 8, 256, 8)
        horizontal = np.abs(gray[:, boundary_indices] - gray[:, boundary_indices - 1]).mean() if boundary_indices.size else 0.0
        vertical = np.abs(gray[boundary_indices, :] - gray[boundary_indices - 1, :]).mean() if boundary_indices.size else 0.0
        scores.append(float(horizontal + vertical))
    arr = np.asarray(scores)
    order = np.argsort(arr)[::-1]
    return {
        "gridPeakOffset": int(order[0]),
        "gridPeakScore": float(arr[order[0]]),
        "gridSecondScore": float(arr[order[1]]),
        "gridPeakContrast": float(arr[order[0]] / (arr[order[1]] + 1e-12)),
        "gridScoreStd": float(arr.std()),
    }


def dct_oracle(path: Path) -> dict[str, Any]:
    result: dict[str, Any] = {"jpegio": "UNAVAILABLE", "jpeglib": "UNAVAILABLE"}
    try:
        import jpegio

        jpeg = jpegio.read(str(path))
        result["jpegio"] = {
            "status": "OK",
            "components": len(jpeg.coef_arrays),
            "shapes": [list(array.shape) for array in jpeg.coef_arrays],
            "quantTables": len(jpeg.quant_tables),
            "lumaZeroRate": float(np.mean(jpeg.coef_arrays[0] == 0)),
            "lumaAcMeanAbs": float(np.mean(np.abs(jpeg.coef_arrays[0][:, :, 1:]))) if jpeg.coef_arrays[0].ndim == 3 else float(np.mean(np.abs(jpeg.coef_arrays[0]))),
        }
    except Exception as error:
        result["jpegio"] = {"status": "ERROR", "error": f"{type(error).__name__}:{str(error)[:120]}"}
    try:
        import jpeglib

        jpeg = jpeglib.read_dct(str(path))
        result["jpeglib"] = {
            "status": "OK",
            "yShape": list(jpeg.Y.shape),
            "qtShape": list(jpeg.qt.shape),
            "lumaZeroRate": float(np.mean(jpeg.Y == 0)),
            "lumaMeanAbs": float(np.mean(np.abs(jpeg.Y))),
        }
    except Exception as error:
        result["jpeglib"] = {"status": "ERROR", "error": f"{type(error).__name__}:{str(error)[:120]}"}
    return result


def metadata_summary(parsed: dict[str, Any], path: Path) -> dict[str, Any]:
    with Image.open(path) as image:
        exif = image.getexif()
        tags = sorted(str(key) for key in exif.keys())
        return {
            "format": image.format,
            "metadataMarkers": parsed.get("metadata", []),
            "exifTagCount": len(tags),
            "exifTagIdsSha256": canonical_sha(tags),
            "thumbnailPresent": bool(parsed.get("thumbnail", {}).get("thumbnailPresent")),
            "thumbnailParserStatus": parsed.get("thumbnail", {}).get("parserStatus"),
            "iccPresent": "icc_profile" in image.info,
            "xmpPresent": any("xmp" in str(key).lower() for key in image.info),
            "privacySafe": True,
        }


def save_jpeg(image: Image.Image, path: Path, quality: int, subsampling: str, *, exif: bytes | None = None, qtables: Any = None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    kwargs: dict[str, Any] = {
        "format": "JPEG",
        "quality": quality,
        "subsampling": SUBSAMPLING[subsampling],
        "optimize": False,
        "progressive": False,
    }
    if exif is not None:
        kwargs["exif"] = exif
    if qtables is not None:
        kwargs["qtables"] = qtables
        kwargs.pop("quality", None)
    image.convert("RGB").save(path, **kwargs)


def save_png(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.convert("RGB").save(path, format="PNG", optimize=False)


def device_from_dev_name(name: str) -> tuple[str, str]:
    stem = Path(name).stem
    value = stem.replace("CSAFE_WP006E_", "")
    match = re.match(r"(.+)_([0-9]+)$", value)
    device = match.group(1) if match else value
    model = re.match(r"(iPhone11|iPhone12|iPhone14|note10)", device)
    return device, model.group(1) if model else device


def select_parents(args: argparse.Namespace) -> list[dict[str, Any]]:
    dev_files = sorted(args.dev_dir.glob("*.jpg"))
    if not dev_files:
        raise RuntimeError("NO_APPROVED_CAMERA_DEVELOPMENT_FILES")
    parents: list[dict[str, Any]] = []
    for path in dev_files:
        device, model = device_from_dev_name(path.name)
        parents.append(
            {
                "sampleId": f"CAMERA_DEV__{path.stem}",
                "sourceFamilyId": f"CSAFE_DEVICE__{device}",
                "deviceFamilyId": device,
                "cameraModel": model,
                "role": "DEVELOPMENT_NATIVE_CAMERA",
                "truth": 0,
                "sourceSubtype": "CAMERA_NATIVE_CONTROLLED",
                "logicalPath": f"approved://wp006e-development/{path.name}",
                "runtimePath": str(path),
                "sourceSha256": sha256_file(path),
            }
        )
    manifest = json.loads(args.confirm_manifest.read_text(encoding="utf-8"))
    confirm_rows = [
        row
        for row in manifest["records"]
        if row.get("sourceSubtype") == "CAMERA_NATIVE"
        and row.get("inputPath")
        and Path(row["inputPath"]).is_file()
        and not any(marker in str(row.get("sourceFamilyId", "")).lower() for marker in FLUX2_MARKERS)
    ]
    confirm_rows.sort(key=lambda row: (row.get("sourceSha256", ""), row.get("sampleId", "")))
    seen: set[str] = set()
    selected = []
    for row in confirm_rows:
        family = str(row.get("sourceFamilyId"))
        if family in seen:
            continue
        seen.add(family)
        selected.append(row)
        if len(selected) >= args.confirm_count:
            break
    for row in selected:
        path = Path(row["inputPath"])
        parents.append(
            {
                "sampleId": f"CAMERA_CONFIRM__{row['sampleId']}",
                "sourceFamilyId": f"UNSPLASH_SOURCE__{row['sourceFamilyId']}",
                "deviceFamilyId": row.get("cameraDeviceFamily"),
                "cameraModel": row.get("cameraDeviceFamily"),
                "role": "CONFIRMATION_INDEPENDENT_CAMERA_SOURCE",
                "truth": 0,
                "sourceSubtype": "CAMERA_NATIVE_CLAIMED_HISTORICAL",
                "logicalPath": f"approved://wp007i-camera/{path.name}",
                "runtimePath": str(path),
                "sourceSha256": sha256_file(path),
                "historicalUse": "PREVIOUSLY_CONSUMED_NOT_USED_TO_FIT_WP007L_PROFILE",
            }
        )
    if len(selected) < args.confirm_count:
        raise RuntimeError(f"INSUFFICIENT_INDEPENDENT_CAMERA_SOURCES:{len(selected)}")
    return parents


def copy_originals(parents: list[dict[str, Any]], bulk_root: Path) -> list[dict[str, Any]]:
    output: list[dict[str, Any]] = []
    for parent in parents:
        source = Path(parent["runtimePath"])
        relative = Path("originals") / ("development" if parent["role"].startswith("DEVELOPMENT") else "confirmation") / f"{parent['sampleId']}{source.suffix.lower()}"
        target = bulk_root / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.is_file() or sha256_file(target) != parent["sourceSha256"]:
            shutil.copy2(source, target)
        output.append({**parent, "runtimePath": str(target), "relativePath": relative.as_posix(), "kind": "ORIGINAL", "operation": "DIRECT_COPY"})
    return output


def add_derived(rows: list[dict[str, Any]], parent: dict[str, Any], path: Path, bulk_root: Path, operation: str, encoder: str, quality: int | None, subsampling: str | None) -> None:
    variant = f"__{subsampling.replace(':', '')}" if operation == "JPEG95_PILLOW_SUBSAMPLING" and subsampling else ""
    rows.append(
        {
            "sampleId": f"{parent['sampleId']}__{operation}__{encoder}{variant}",
            "parentSampleId": parent["sampleId"],
            "sourceFamilyId": parent["sourceFamilyId"],
            "deviceFamilyId": parent.get("deviceFamilyId"),
            "cameraModel": parent.get("cameraModel"),
            "role": parent["role"],
            "truth": parent["truth"],
            "sourceSubtype": parent["sourceSubtype"],
            "kind": "DESCENDANT",
            "operation": operation,
            "encoder": encoder,
            "requestedQuality": quality,
            "requestedSubsampling": subsampling,
            "logicalPath": f"bulk://wp007l-media/{path.relative_to(bulk_root).as_posix()}",
            "runtimePath": str(path),
            "relativePath": path.relative_to(bulk_root).as_posix(),
            "parentSha256": parent["sourceSha256"],
            "sha256": sha256_file(path),
        }
    )


def materialize_parent(parent: dict[str, Any], bulk_root: Path, rows: list[dict[str, Any]], full_matrix: bool) -> None:
    source = Path(parent["runtimePath"])
    with Image.open(source) as opened:
        image = ImageOps.exif_transpose(opened).convert("RGB")
        source_exif = opened.info.get("exif")
        source_qtables = getattr(opened, "quantization", None)
        for quality in QUALITY_REQUESTS if full_matrix else [95, 85, 75]:
            target = bulk_root / "pillow" / f"q{quality}" / f"{parent['sampleId']}.jpg"
            save_jpeg(image, target, quality, "4:2:0")
            add_derived(rows, parent, target, bulk_root, f"JPEG{quality}_PILLOW_420", "PILLOW_LIBJPEG", quality, "4:2:0")
        for sampling in ("4:4:4", "4:2:2", "4:2:0"):
            target = bulk_root / "pillow-subsampling" / sampling.replace(":", "") / f"{parent['sampleId']}.jpg"
            save_jpeg(image, target, 95, sampling)
            add_derived(rows, parent, target, bulk_root, "JPEG95_PILLOW_SUBSAMPLING", "PILLOW_LIBJPEG", 95, sampling)
        source_for_compound = bulk_root / "pillow" / "q95" / f"{parent['sampleId']}.jpg"
        with Image.open(source_for_compound) as q95:
            q95_rgb = q95.convert("RGB")
        for first, second in ((95, 85), (85, 95), (75, 95)):
            first_path = bulk_root / "pillow" / f"q{first}" / f"{parent['sampleId']}.jpg"
            with Image.open(first_path) as first_image:
                target = bulk_root / "compound" / f"JPEG{first}_TO_JPEG{second}" / f"{parent['sampleId']}.jpg"
                save_jpeg(first_image.convert("RGB"), target, second, "4:2:0")
            add_derived(rows, parent, target, bulk_root, f"JPEG{first}_TO_JPEG{second}", "PILLOW_LIBJPEG", second, "4:2:0")
        operations: list[tuple[str, Image.Image, int, str]] = []
        aligned = image.crop((8, 8, image.width - 8, image.height - 8))
        non_aligned = image.crop((3, 3, image.width - 3, image.height - 3))
        operations.append(("ALIGNED8_CROP_TO_JPEG95", aligned, 95, "4:2:0"))
        operations.append(("NON8_CROP_TO_JPEG95", non_aligned, 95, "4:2:0"))
        for fraction, label in ((0.75, "RESIZE75_TO_JPEG95"), (0.5, "RESIZE50_TO_JPEG95")):
            resized = image.resize((max(256, round(image.width * fraction)), max(256, round(image.height * fraction))), Image.Resampling.LANCZOS)
            operations.append((label, resized, 95, "4:2:0"))
        screenshot_side = max(image.width, image.height)
        canvas = Image.new("RGB", (screenshot_side, screenshot_side), (245, 245, 245))
        screenshot = image.copy()
        screenshot.thumbnail((max(256, int(screenshot_side * 0.82)), max(256, int(screenshot_side * 0.82))), Image.Resampling.BICUBIC)
        canvas.paste(screenshot, ((screenshot_side - screenshot.width) // 2, (screenshot_side - screenshot.height) // 2))
        operations.append(("SCREENSHOT_STYLE_TO_JPEG95", canvas.resize((max(256, round(screenshot_side * 0.75)), max(256, round(screenshot_side * 0.75))), Image.Resampling.BICUBIC), 95, "4:2:0"))
        for operation, transformed, quality, sampling in operations:
            target = bulk_root / "compound" / operation / f"{parent['sampleId']}.jpg"
            save_jpeg(transformed, target, quality, sampling)
            add_derived(rows, parent, target, bulk_root, operation, "PILLOW_LIBJPEG", quality, sampling)
        png_target = bulk_root / "compound" / "JPEG_TO_PNG" / f"{parent['sampleId']}.png"
        save_png(q95_rgb, png_target)
        add_derived(rows, parent, png_target, bulk_root, "JPEG_TO_PNG", "PILLOW_DECODE_PNG", None, None)
        strip_target = bulk_root / "compound" / "METADATA_STRIP_REENCODE95" / f"{parent['sampleId']}.jpg"
        save_jpeg(image, strip_target, 95, "4:2:0", exif=b"")
        add_derived(rows, parent, strip_target, bulk_root, "METADATA_STRIP_REENCODE95", "PILLOW_LIBJPEG", 95, "4:2:0")
        if source_qtables:
            spoof_target = bulk_root / "spoof" / f"{parent['sampleId']}.jpg"
            save_jpeg(image, spoof_target, 95, "4:2:0", exif=source_exif, qtables=source_qtables)
            add_derived(rows, parent, spoof_target, bulk_root, "CAMERA_PROFILE_SELF_REENCODE", "PILLOW_LIBJPEG_QTABLE_COPY", None, None)


def materialize_spoofs(args: argparse.Namespace, camera_reference: dict[str, Any], bulk_root: Path, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    synthetic_paths = sorted(args.synthetic_dir.rglob("*"))
    synthetic_paths = [path for path in synthetic_paths if path.is_file() and path.suffix.lower() in {".bin", ".jpg", ".jpeg", ".png"}][: args.spoof_count]
    if len(synthetic_paths) < args.spoof_count:
        raise RuntimeError(f"INSUFFICIENT_SYNTHETIC_SPOOF_INPUTS:{len(synthetic_paths)}")
    ref = Path(camera_reference["runtimePath"])
    with Image.open(ref) as ref_image:
        qtables = getattr(ref_image, "quantization", None)
        exif = ref_image.info.get("exif")
        if not qtables:
            raise RuntimeError("CAMERA_REFERENCE_HAS_NO_QTABLES")
        reference_profile = parse_file(ref)
        reference_parent = {**camera_reference, "role": "SPOOF_REFERENCE_CAMERA"}
        for index, source in enumerate(synthetic_paths):
            with Image.open(source) as opened:
                image = ImageOps.exif_transpose(opened).convert("RGB")
            target = bulk_root / "spoof" / "synthetic" / f"SYNTHETIC_SPOOF_{index:03d}.jpg"
            save_jpeg(image, target, 95, "4:2:0", exif=exif, qtables=qtables)
            row = {
                "sampleId": f"SYNTHETIC_SPOOF__{index:03d}",
                "parentSampleId": f"SYNTHETIC_SOURCE__{index:03d}",
                "sourceFamilyId": f"SYNTHETIC_SPOOF_FAMILY__{index:03d}",
                "role": "SPOOF_SYNTHETIC",
                "truth": 1,
                "sourceSubtype": "SYNTHETIC_PROFILE_SPOOF",
                "kind": "SPOOF",
                "operation": "SYNTHETIC_TO_CAMERA_PROFILE",
                "encoder": "PILLOW_LIBJPEG_QTABLE_COPY",
                "requestedQuality": None,
                "requestedSubsampling": None,
                "logicalPath": f"bulk://wp007l-media/{target.relative_to(bulk_root).as_posix()}",
                "runtimePath": str(target),
                "relativePath": target.relative_to(bulk_root).as_posix(),
                "parentSha256": sha256_file(source),
                "sha256": sha256_file(target),
                "cameraReferenceSampleId": camera_reference["sampleId"],
                "cameraReferenceProfile": {
                    "quantizationTableSha256": reference_profile.get("quantizationTableSha256"),
                    "sampling": reference_profile.get("sampling"),
                    "markerSequenceSha256": reference_profile.get("markerSequenceSha256"),
                    "huffmanTableSha256": reference_profile.get("huffmanTableSha256"),
                    "metadata": reference_profile.get("metadata"),
                },
            }
            rows.append(row)
    return rows


def freeze(args: argparse.Namespace) -> None:
    args.bulk_root.mkdir(parents=True, exist_ok=True)
    parents = select_parents(args)
    originals = copy_originals(parents, args.bulk_root)
    rows: list[dict[str, Any]] = list(originals)
    for parent in originals:
        materialize_parent(parent, args.bulk_root, rows, full_matrix=parent["role"].startswith("DEVELOPMENT"))
    reference = originals[0]
    materialize_spoofs(args, reference, args.bulk_root, rows)
    rows.sort(key=lambda row: row["sampleId"])
    runtime_manifest = {
        "schemaVersion": "lythaus-wp007l-runtime-manifest-v1",
        "scoreBlind": True,
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
        "parentCount": len(originals),
        "recordCount": len(rows),
        "records": rows,
    }
    runtime_manifest["manifestSha256"] = canonical_sha({key: value for key, value in runtime_manifest.items() if key != "manifestSha256"})
    runtime_path = args.bulk_root / "runtime-manifest.json"
    write_json(runtime_path, runtime_manifest)
    committed = {
        "schemaVersion": "lythaus-wp007l-controlled-descendant-manifest-v1",
        "scoreBlind": True,
        "selectionFrozenBeforeToolScoring": True,
        "parentCount": len(originals),
        "recordCount": len(rows),
        "sourceRoles": dict(Counter(row["role"] for row in rows if row["kind"] == "ORIGINAL")),
        "operationCounts": dict(Counter(row["operation"] for row in rows)),
        "records": [
            {key: value for key, value in row.items() if key not in {"runtimePath"}}
            for row in rows
        ],
        "runtimeManifestLogicalKey": "WP007L_EXTERNAL_RUNTIME_MANIFEST",
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    }
    committed["manifestSha256"] = canonical_sha(committed)
    write_json(args.output_dir / "controlled-descendant-manifest.json", committed)
    write_json(args.output_dir / "toolforge-freeze-summary.json", {
        "runtimeManifestSha256": runtime_manifest["manifestSha256"],
        "committedManifestSha256": committed["manifestSha256"],
        "parentCount": len(originals),
        "recordCount": len(rows),
        "operationCounts": committed["operationCounts"],
        "sourceFamilyCount": len({row["sourceFamilyId"] for row in originals}),
        "spoofCount": sum(row["kind"] == "SPOOF" for row in rows),
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    })
    print(json.dumps({"parents": len(originals), "records": len(rows), "manifestSha256": committed["manifestSha256"]}))


def summarize_distribution(values: list[float]) -> dict[str, float | None]:
    if not values:
        return {"n": 0, "mean": None, "median": None, "min": None, "max": None}
    array = np.asarray(values, dtype=float)
    return {
        "n": int(array.size),
        "mean": float(array.mean()),
        "median": float(np.median(array)),
        "min": float(array.min()),
        "max": float(array.max()),
    }


def analyze(args: argparse.Namespace) -> None:
    runtime_manifest = json.loads((args.bulk_root / "runtime-manifest.json").read_text(encoding="utf-8"))
    records = runtime_manifest["records"]
    if not runtime_manifest.get("scoreBlind") or runtime_manifest.get("flux2PixelAccess") or runtime_manifest.get("flux2ProviderCalls") != 0:
        raise RuntimeError("WP007L_RUNTIME_MANIFEST_NOT_SCORE_BLIND_OR_SEALED")
    feature_path = args.bulk_root / "feature-records.jsonl"
    started = time.perf_counter()
    parsed_by_id: dict[str, dict[str, Any]] = {}
    feature_by_id: dict[str, dict[str, Any]] = {}
    original_by_id: dict[str, dict[str, Any]] = {}
    oracle_used = 0
    with feature_path.open("w", encoding="utf-8") as feature_file:
        for index, record in enumerate(records, start=1):
            if any(marker in str(record.get("sourceFamilyId", "")).lower() for marker in FLUX2_MARKERS):
                raise RuntimeError("FLUX2_FAMILY_DENIED")
            path = Path(record["runtimePath"])
            parsed = parse_file(path)
            parsed_by_id[record["sampleId"]] = parsed
            features = scalar_features(path) if parsed["format"] in ("JPEG", "PNG") and parsed["valid"] else {}
            grid = grid_features(path) if parsed["format"] in ("JPEG", "PNG") and parsed["valid"] else {}
            use_oracle = (
                parsed["format"] == "JPEG"
                and parsed["valid"]
                and (oracle_used < args.oracle_limit or record["kind"] == "ORIGINAL")
            )
            oracle = dct_oracle(path) if use_oracle else {"jpegio": "SKIPPED_BOUNDED_CROSSCHECK", "jpeglib": "SKIPPED_BOUNDED_CROSSCHECK"}
            if use_oracle:
                oracle_used += 1
            metadata = metadata_summary(parsed, path) if parsed["valid"] else {}
            row = {
                "sampleId": record["sampleId"],
                "parentSampleId": record.get("parentSampleId"),
                "sourceFamilyId": record["sourceFamilyId"],
                "deviceFamilyId": record.get("deviceFamilyId"),
                "cameraModel": record.get("cameraModel"),
                "role": record["role"],
                "truth": record["truth"],
                "kind": record["kind"],
                "operation": record["operation"],
                "encoder": record.get("encoder"),
                "requestedQuality": record.get("requestedQuality"),
                "requestedSubsampling": record.get("requestedSubsampling"),
                "parentSha256": record.get("parentSha256"),
                "runtimePath": str(path),
                "sha256": parsed.get("sha256"),
                "format": parsed.get("format"),
                "valid": parsed.get("valid"),
                "dimensions": parsed.get("dimensions"),
                "sampling": parsed.get("sampling"),
                "progressive": parsed.get("progressive"),
                "quantizationTableSha256": parsed.get("quantizationTableSha256"),
                "huffmanTableSha256": parsed.get("huffmanTableSha256"),
                "markerSequenceSha256": parsed.get("markerSequenceSha256"),
                "metadata": metadata,
                "thumbnail": parsed.get("thumbnail"),
                "features": features,
                "grid": grid,
                "dctOracle": oracle,
            }
            if record.get("cameraReferenceProfile"):
                row["cameraReferenceSampleId"] = record.get("cameraReferenceSampleId")
                row["cameraReferenceProfile"] = record.get("cameraReferenceProfile")
            feature_by_id[row["sampleId"]] = row
            if row["kind"] == "ORIGINAL":
                original_by_id[row["sampleId"]] = row
            feature_file.write(json.dumps(row, sort_keys=True) + "\n")
            if index % 100 == 0 or index == len(records):
                print(f"WP007L_ANALYZED={index}", flush=True)
    feature_file_hash = sha256_file(feature_path)
    valid_rows = [row for row in feature_by_id.values() if row["valid"]]
    originals = [row for row in valid_rows if row["kind"] == "ORIGINAL"]
    descendants = [row for row in valid_rows if row["kind"] == "DESCENDANT"]
    spoofs = [row for row in valid_rows if row["kind"] == "SPOOF"]
    dev_originals = [row for row in originals if row["role"].startswith("DEVELOPMENT")]
    confirm_originals = [row for row in originals if row["role"].startswith("CONFIRMATION")]
    profile_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in dev_originals:
        profile_groups[row["deviceFamilyId"]].append(row)
    profile_stability = {}
    for device, group in sorted(profile_groups.items()):
        profile_stability[device] = {
            "cameraModel": group[0].get("cameraModel"),
            "n": len(group),
            "dqtUnique": len({row["quantizationTableSha256"] for row in group}),
            "dhtUnique": len({row["huffmanTableSha256"] for row in group}),
            "markerSequenceUnique": len({row["markerSequenceSha256"] for row in group}),
            "samplingUnique": len({row["sampling"] for row in group}),
            "dimensionsUnique": len({json.dumps(row["dimensions"], sort_keys=True) for row in group}),
            "metadataTagSetUnique": len({row["metadata"]["exifTagIdsSha256"] for row in group}),
        }
    model_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in dev_originals:
        model_groups[row["cameraModel"]].append(row)
    model_stability = {
        model: {
            "n": len(group),
            "devices": len({row["deviceFamilyId"] for row in group}),
            "dqtUnique": len({row["quantizationTableSha256"] for row in group}),
            "dhtUnique": len({row["huffmanTableSha256"] for row in group}),
            "markerSequenceUnique": len({row["markerSequenceSha256"] for row in group}),
            "samplingUnique": len({row["sampling"] for row in group}),
        }
        for model, group in sorted(model_groups.items())
    }
    parent_feature = {row["sampleId"]: row for row in originals}
    operation_rows: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in descendants:
        operation_rows[row["operation"]].append(row)
    recompression_rows = []
    for operation, group in sorted(operation_rows.items()):
        changed_dqt = 0
        changed_marker = 0
        changed_dimensions = 0
        changed_sampling = 0
        png_rows = 0
        for row in group:
            parent = parent_feature.get(row["parentSampleId"])
            if not parent:
                continue
            changed_dqt += row["quantizationTableSha256"] != parent["quantizationTableSha256"]
            changed_marker += row["markerSequenceSha256"] != parent["markerSequenceSha256"]
            changed_dimensions += row["dimensions"] != parent["dimensions"]
            changed_sampling += row["sampling"] != parent["sampling"]
            png_rows += row["format"] == "PNG"
        n = len(group)
        recompression_rows.append(
            {
                "operation": operation,
                "nDescendants": n,
                "sourceFamilies": len({row["sourceFamilyId"] for row in group}),
                "dqtChangedRate": changed_dqt / n if n else None,
                "markerSequenceChangedRate": changed_marker / n if n else None,
                "dimensionChangedRate": changed_dimensions / n if n else None,
                "samplingChangedRate": changed_sampling / n if n else None,
                "pngOutputRate": png_rows / n if n else None,
                "deterministicInterpretation": "MEASUREMENT_ONLY; differences are evidence of changed current bytes, not complete history",
            }
        )
    transform_by_parent: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)
    for row in descendants:
        transform_by_parent[(row["parentSampleId"], row["operation"])].append(row)
    resampling_rows = []
    grid_rows = []
    for (parent_id, operation), group in sorted(transform_by_parent.items()):
        parent = parent_feature.get(parent_id)
        if not parent:
            continue
        grid_delta = [row["grid"]["gridPeakContrast"] - parent["grid"]["gridPeakContrast"] for row in group if row["grid"]]
        boundary_delta = [row["features"]["blockBoundaryRatio"] - parent["features"]["blockBoundaryRatio"] for row in group if row["features"]]
        resampling_rows.append(
            {
                "operation": operation,
                "n": len(group),
                "dimensionsChangedRate": sum(row["dimensions"] != parent["dimensions"] for row in group) / len(group),
                "gridContrastDelta": summarize_distribution(grid_delta),
                "boundaryRatioDelta": summarize_distribution(boundary_delta),
                "interpretation": "KNOWN_CONTROLLED_OPERATION; current-byte cues do not prove resampling history",
            }
        )
        if operation in {"ALIGNED8_CROP_TO_JPEG95", "NON8_CROP_TO_JPEG95", "RESIZE75_TO_JPEG95", "RESIZE50_TO_JPEG95", "SCREENSHOT_STYLE_TO_JPEG95"}:
            grid_rows.append(
                {
                    "operation": operation,
                    "n": len(group),
                    "parentGridContrast": summarize_distribution([parent["grid"]["gridPeakContrast"]]),
                    "descendantGridContrast": summarize_distribution([row["grid"]["gridPeakContrast"] for row in group]),
                    "descendantPeakOffsets": dict(Counter(str(row["grid"]["gridPeakOffset"]) for row in group)),
                    "knownAnswer": operation,
                    "interpretation": "ORACLE_LABEL_FROM_CONTROLLED_LINEAGE; detector is not an origin classifier",
                }
            )
    metadata_rows = []
    thumbnail_rows = []
    for (parent_id, operation), group in sorted(transform_by_parent.items()):
        parent = parent_feature.get(parent_id)
        if not parent:
            continue
        metadata_rows.append(
            {
                "operation": operation,
                "n": len(group),
                "parentExifPresent": parent["metadata"].get("exifTagCount", 0) > 0,
                "descendantExifPresentRate": sum(row["metadata"].get("exifTagCount", 0) > 0 for row in group) / len(group),
                "markerChangeRate": sum(row["markerSequenceSha256"] != parent["markerSequenceSha256"] for row in group) / len(group),
                "privacySafe": True,
                "interpretation": "CONSISTENCY_CONTEXT_ONLY",
            }
        )
        thumbnail_rows.append(
            {
                "operation": operation,
                "n": len(group),
                "parentThumbnailRate": sum(parent["thumbnail"].get("thumbnailPresent", False) for _ in group) / len(group),
                "descendantThumbnailRate": sum(row["thumbnail"].get("thumbnailPresent", False) for row in group) / len(group),
                "parserStatuses": dict(Counter(row["thumbnail"].get("parserStatus") for row in group)),
                "interpretation": "THUMBNAIL_OFFSET_PRESENCE_ONLY; pixel correspondence not asserted",
            }
        )
    dct_oracle_status = Counter()
    for row in valid_rows:
        for tool in ("jpegio", "jpeglib"):
            value = row["dctOracle"].get(tool, {})
            dct_oracle_status[f"{tool}:{value.get('status') if isinstance(value, dict) else value}"] += 1
    profile_spoof_rows = []
    for row in spoofs:
        reference = row.get("cameraReferenceProfile", {})
        observed = parsed_by_id.get(row["sampleId"], {})
        profile_spoof_rows.append(
            {
                "sampleId": row["sampleId"],
                "profileMatch": {
                    "dqt": observed.get("quantizationTableSha256") == reference.get("quantizationTableSha256"),
                    "sampling": observed.get("sampling") == reference.get("sampling"),
                    "markerSequence": observed.get("markerSequenceSha256") == reference.get("markerSequenceSha256"),
                    "huffman": observed.get("huffmanTableSha256") == reference.get("huffmanTableSha256"),
                    "metadataOverlap": sorted(set(observed.get("metadata", [])) & set(reference.get("metadata", []))),
                },
                "syntheticTruthPreserved": True,
                "originInferenceForbidden": True,
            }
        )
    prnu = run_prnu(dev_originals, feature_by_id)
    cfa = {
        "status": "EXPLORATORY_MEASUREMENT",
        "deviceCount": len({row["deviceFamilyId"] for row in dev_originals}),
        "rows": len(dev_originals),
        "features": ["rgbChannelCorrelation", "residualParity"],
        "interpretation": "No CFA classifier fitted; these are sensor/ISP context candidates only.",
        "limitations": ["JPEG and ISP processing can erase or reshape CFA evidence", "no RAW ground truth", "no production camera identity"],
    }
    artifact = {
        "schemaVersion": "lythaus-wp007l-analysis-v1",
        "recordCount": len(records),
        "validCount": len(valid_rows),
        "originalCount": len(originals),
        "descendantCount": len(descendants),
        "spoofCount": len(spoofs),
        "featureRecordsLogicalKey": "WP007L_EXTERNAL_FEATURE_RECORDS",
        "featureRecordsSha256": feature_file_hash,
        "dctOracleRecordCount": oracle_used,
        "runtimeSeconds": time.perf_counter() - started,
        "profileStability": {"byDevice": profile_stability, "byModel": model_stability},
        "dctOracleStatus": dict(dct_oracle_status),
        "prnu": prnu,
        "cfa": cfa,
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    }
    write_json(args.output_dir / "camera-profile-development-results.json", {
        **artifact,
        "role": "DEVELOPMENT",
        "records": len(dev_originals),
        "profileStability": {"byDevice": profile_stability, "byModel": model_stability},
    })
    write_json(args.output_dir / "camera-profile-confirmation-results.json", {
        **artifact,
        "role": "INDEPENDENT_SOURCE_FAMILY_CONFIRMATION",
        "records": len(confirm_originals),
        "caveat": "Previously consumed project media, not a fresh project acquisition; independent from WP007L profile fitting and not device-instance ground truth.",
        "cameraModels": dict(Counter(row.get("cameraModel") for row in confirm_originals)),
    })
    write_json(args.output_dir / "recompression-results.json", {
        "schemaVersion": "lythaus-wp007l-recompression-results-v1",
        "rows": recompression_rows,
        "sourceLevelPrimaryUnit": "sourceFamilyId",
        "historyClaim": "FINAL_BYTES_DO_NOT_PROVE_COMPLETE_EDIT_HISTORY",
        "flux2PixelAccess": False,
    })
    write_json(args.output_dir / "resampling-results.json", {
        "schemaVersion": "lythaus-wp007l-resampling-results-v1",
        "rows": resampling_rows,
        "classification": "MEASUREMENT_CONTEXT_ONLY",
        "flux2PixelAccess": False,
    })
    write_json(args.output_dir / "jpeg-grid-results.json", {
        "schemaVersion": "lythaus-wp007l-jpeg-grid-results-v1",
        "rows": grid_rows,
        "oracleStatus": "LITHAUS_GRID_PROXY_EXECUTED; ZERO_EXTERNAL_ORACLE_PENDING_OR_UNAVAILABLE",
        "flux2PixelAccess": False,
    })
    write_json(args.output_dir / "metadata-consistency-results.json", {
        "schemaVersion": "lythaus-wp007l-metadata-consistency-results-v1",
        "rows": metadata_rows,
        "valuePrivacy": "tag names and hashes only; no GPS, serial, owner or timestamp values persisted",
        "interpretation": "CONSISTENCY_CONTEXT_ONLY",
        "flux2PixelAccess": False,
    })
    write_json(args.output_dir / "thumbnail-consistency-results.json", {
        "schemaVersion": "lythaus-wp007l-thumbnail-consistency-results-v1",
        "rows": thumbnail_rows,
        "interpretation": "thumbnail offsets/presence only; no visual correspondence claim",
        "flux2PixelAccess": False,
    })
    write_json(args.output_dir / "spoof-challenge-results.json", {
        "schemaVersion": "lythaus-wp007l-spoof-challenge-results-v1",
        "rows": profile_spoof_rows,
        "syntheticProfileSpoofCount": len(profile_spoof_rows),
        "profileOnlyCanBeCopied": any(all(value is True for key, value in row["profileMatch"].items() if key in {"dqt", "sampling"}) for row in profile_spoof_rows),
        "conclusion": "Static profile consistency is contextual and spoofable; it cannot earn SUPPORTED alone.",
        "flux2PixelAccess": False,
    })
    write_json(args.output_dir / "safe-camera-profile-spoof-results.json", {
        "schemaVersion": "lythaus-wp007l-safe-camera-profile-spoof-v1",
        "safeA": {
            "checkpointSha256": SAFE_CHECKPOINT_SHA256,
            "threshold": SAFE_THRESHOLD,
            "weightsModified": False,
            "scoring": "See separately generated SAFE score artifact; this forge does not alter SAFE-A.",
        },
        "spoofRows": len(profile_spoof_rows),
        "requiredNextCommand": "scripts/authenticity/wp007h_score_safe.py over frozen spoof manifest",
        "conclusion": "Profile spoof challenge is complete; SAFE-A score comparison is a separate frozen diagnostic.",
        "flux2PixelAccess": False,
    })
    write_json(args.output_dir / "prnu-feasibility.json", {
        "schemaVersion": "lythaus-wp007l-prnu-feasibility-v1",
        "status": "EXPLORATORY_CPU_RESIDUAL_EXECUTED",
        "referenceImages": len(dev_originals),
        "deviceFamilies": len({row["deviceFamilyId"] for row in dev_originals}),
        "groundTruth": "JPEG device-controlled development subset; not RAW",
        "productionIdentity": False,
        "privacy": "no device fingerprint persisted; aggregate correlations only",
        "limitations": ["small per-device counts", "JPEG/ISP dependence", "no independent sealed device confirmation opened"],
        "flux2PixelAccess": False,
    })
    write_json(args.output_dir / "prnu-results.json", prnu)
    write_json(args.output_dir / "cfa-feasibility.json", cfa)
    write_json(args.output_dir / "jpegio-crosscheck.json", {
        "schemaVersion": "lythaus-wp007l-jpegio-crosscheck-v1",
        "dctOracleStatus": dict(dct_oracle_status),
        "crossCheck": "Lythaus byte parser versus jpegio/jpeglib where import and decode succeeded",
        "knownAnswerRequirement": "DQT/sampling/dimensions compared in follow-up summary",
        "flux2PixelAccess": False,
    })
    write_json(args.output_dir / "runtime-benchmark.json", {
        "schemaVersion": "lythaus-wp007l-runtime-benchmark-v1",
        "records": len(records),
        "featureRuntimeSeconds": artifact["runtimeSeconds"],
        "perRecordMs": artifact["runtimeSeconds"] * 1000 / max(1, len(records)),
        "hardwarePolicy": "CPU bounded; no GPU; no paid service",
        "bulkFeatureRecordsSha256": feature_file_hash,
        "flux2PixelAccess": False,
    })
    print(json.dumps({"records": len(records), "valid": len(valid_rows), "featureRecordsSha256": feature_file_hash, "runtimeSeconds": artifact["runtimeSeconds"]}))


def run_prnu(originals: list[dict[str, Any]], feature_by_id: dict[str, dict[str, Any]]) -> dict[str, Any]:
    residuals: dict[str, np.ndarray] = {}
    for row in originals:
        try:
            rgb = normalized_image(Path(row["runtimePath"]))
            gray = 0.299 * rgb[:, :, 0] + 0.587 * rgb[:, :, 1] + 0.114 * rgb[:, :, 2]
            residual = gray - gaussian_filter(gray, sigma=1.0)
            residuals[row["sampleId"]] = (residual - residual.mean()) / (residual.std() + 1e-12)
        except Exception:
            continue
    same: list[float] = []
    different: list[float] = []
    rows = list(originals)
    for index, left in enumerate(rows):
        for right in rows[index + 1 :]:
            if left["sampleId"] not in residuals or right["sampleId"] not in residuals:
                continue
            score = float(np.corrcoef(residuals[left["sampleId"]].ravel(), residuals[right["sampleId"]].ravel())[0, 1])
            (same if left["deviceFamilyId"] == right["deviceFamilyId"] else different).append(score)
    return {
        "schemaVersion": "lythaus-wp007l-prnu-results-v1",
        "sameDevice": summarize_distribution(same),
        "differentDevice": summarize_distribution(different),
        "sameDevicePairs": len(same),
        "differentDevicePairs": len(different),
        "interpretation": "EXPLORATORY_SENSOR_RESIDUAL_CORRELATION; not a device identity claim",
        "knownLimitations": ["content residual leakage", "JPEG compression", "small within-device sample counts", "no RAW reference"],
        "flux2PixelAccess": False,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["freeze", "analyze"])
    parser.add_argument("--dev-dir", type=Path, required=True)
    parser.add_argument("--confirm-manifest", type=Path, required=True)
    parser.add_argument("--synthetic-dir", type=Path, required=True)
    parser.add_argument("--confirm-count", type=int, default=120)
    parser.add_argument("--spoof-count", type=int, default=20)
    parser.add_argument("--bulk-root", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--oracle-limit", type=int, default=120)
    args = parser.parse_args()
    if args.command == "freeze":
        freeze(args)
    else:
        analyze(args)


if __name__ == "__main__":
    main()
