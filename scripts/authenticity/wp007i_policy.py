"""Frozen WP007I SAFE applicability and positive-only evidence policy."""

from __future__ import annotations

import hashlib
import json
import math
from pathlib import Path
from typing import Any

from PIL import Image

SAFE_THRESHOLD = 0.5864923000335693
POLICY_VERSION = "WP007I_APPLICABILITY_RULE_V1"
SUPPORTED_STATES = {"HIGH", "MODERATE"}
DEGRADED_STATES = {"DEGRADED", "UNSUPPORTED", "UNKNOWN"}


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _meaningful_metadata(image: Image.Image) -> list[str]:
    keys = []
    for key in ("exif", "icc_profile", "photoshop", "xmp", "iptc", "comment"):
        if image.info.get(key):
            keys.append(key)
    return keys


def _jpeg_quality(image: Image.Image) -> int | None:
    quantization = getattr(image, "quantization", None)
    if not quantization or 0 not in quantization:
        return None
    actual = list(quantization[0])
    base = [
        16, 11, 10, 16, 24, 40, 51, 61,
        12, 12, 14, 19, 26, 58, 60, 55,
        14, 13, 16, 24, 40, 57, 69, 56,
        14, 17, 22, 29, 51, 87, 80, 62,
        18, 22, 37, 56, 68, 109, 103, 77,
        24, 35, 55, 64, 81, 104, 113, 92,
        49, 64, 78, 87, 103, 121, 120, 101,
        72, 92, 95, 98, 112, 100, 103, 99,
    ]
    best_quality = None
    best_error = None
    for quality in range(1, 101):
        scale = 5000 // quality if quality < 50 else 200 - quality * 2
        expected = [max(1, min(255, (value * scale + 50) // 100)) for value in base]
        error = sum(abs(left - right) for left, right in zip(actual, expected))
        if best_error is None or error < best_error:
            best_quality, best_error = quality, error
    return best_quality


def input_facts(path: Path) -> dict[str, Any]:
    try:
        with Image.open(path) as image:
            image.load()
            metadata = _meaningful_metadata(image)
            quality = _jpeg_quality(image) if image.format == "JPEG" else None
            return {
                "status": "OK",
                "format": image.format,
                "mime": Image.MIME.get(image.format),
                "width": image.width,
                "height": image.height,
                "pixelCount": image.width * image.height,
                "metadataKeys": metadata,
                "metadataPresent": bool(metadata),
                "jpegQualityEstimate": quality,
                "fileBytes": path.stat().st_size,
                "fileSha256": sha256_file(path),
            }
    except Exception as exc:  # deterministic missingness, not synthetic evidence
        return {"status": "DECODE_ERROR", "errorType": type(exc).__name__}


def classify_applicability(facts: dict[str, Any]) -> dict[str, Any]:
    if facts.get("status") != "OK":
        return {"state": "UNKNOWN", "reasons": ["DECODER_FAILURE"], "version": POLICY_VERSION}
    width = int(facts.get("width", 0))
    height = int(facts.get("height", 0))
    if min(width, height) < 256:
        return {"state": "UNSUPPORTED", "reasons": ["MIN_DIMENSION_BELOW_256"], "version": POLICY_VERSION}
    if facts.get("format") == "JPEG":
        quality = facts.get("jpegQualityEstimate")
        if not facts.get("metadataPresent") and quality is not None and quality <= 98:
            return {"state": "DEGRADED", "reasons": ["JPEG_RECOMPRESSION_EVIDENCE", "METADATA_ABSENT"], "version": POLICY_VERSION}
        if not facts.get("metadataPresent") and quality is None:
            return {"state": "MODERATE", "reasons": ["JPEG_QUALITY_UNREADABLE", "METADATA_ABSENT"], "version": POLICY_VERSION}
        return {"state": "HIGH", "reasons": [], "version": POLICY_VERSION}
    common_screen = {(1920, 1080), (1366, 768), (1536, 864), (1280, 720), (2560, 1440)}
    if facts.get("format") == "PNG" and (width, height) in common_screen and not facts.get("metadataPresent"):
        return {"state": "MODERATE", "reasons": ["SCREENSHOT_LIKELY", "METADATA_ABSENT"], "version": POLICY_VERSION}
    return {"state": "HIGH", "reasons": [], "version": POLICY_VERSION}


def evidence_band(score: float | None) -> str:
    if score is None or not math.isfinite(float(score)):
        return "MODEL_UNAVAILABLE"
    return "HIGH_SYNTHETIC_EVIDENCE" if float(score) >= SAFE_THRESHOLD else "LOW_SYNTHETIC_EVIDENCE"


def selective_evidence(score: float | None, applicability: dict[str, Any], policy: str) -> dict[str, Any]:
    band = evidence_band(score)
    state = applicability.get("state", "UNKNOWN")
    if band == "MODEL_UNAVAILABLE":
        return {"interpretation": "MODEL_UNAVAILABLE", "authoritativePositive": False, "inconclusive": True}
    high_score = band == "HIGH_SYNTHETIC_EVIDENCE"
    if policy in {"P0_SAFE_RAW_REFERENCE", "P1_SAFE_POSITIVE_ONLY"}:
        return {"interpretation": band, "authoritativePositive": high_score, "inconclusive": False}
    if high_score and state in SUPPORTED_STATES:
        return {"interpretation": "HIGH_SYNTHETIC_EVIDENCE", "authoritativePositive": True, "inconclusive": False}
    if high_score:
        return {"interpretation": "LIMITED_SYNTHETIC_EVIDENCE", "authoritativePositive": False, "inconclusive": True}
    if state in DEGRADED_STATES:
        return {"interpretation": "INCONCLUSIVE_DUE_TO_INPUT_REGIME", "authoritativePositive": False, "inconclusive": True}
    return {"interpretation": "LOW_SYNTHETIC_EVIDENCE", "authoritativePositive": False, "inconclusive": False}


def wilson(successes: int, total: int, z: float = 1.959963984540054) -> dict[str, Any]:
    if total <= 0:
        return {"numerator": successes, "denominator": total, "rate": None, "lower": None, "upper": None}
    p = successes / total
    denominator = 1 + z * z / total
    centre = (p + z * z / (2 * total)) / denominator
    margin = z * math.sqrt((p * (1 - p) + z * z / (4 * total)) / total) / denominator
    return {"numerator": successes, "denominator": total, "rate": p, "lower": max(0.0, centre - margin), "upper": min(1.0, centre + margin)}


def canonical_json_hash(payload: dict[str, Any]) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(canonical).hexdigest()
