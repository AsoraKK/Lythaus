"""Write the deterministic WP007I applicability-policy freeze."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path


def canonical_hash(value: dict) -> str:
    raw = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    out = root / "research" / "wp007i" / "applicability-policy.json"
    policy = {
        "schemaVersion": "lythaus-wp007i-applicability-policy-v1",
        "policyVersion": "WP007I_APPLICABILITY_RULE_V1",
        "frozenBeforeConfirmationScoring": True,
        "usesSafeScore": False,
        "usesGroundTruth": False,
        "usesSupporterScores": False,
        "features": {
            "decodeStatus": "Pillow decode success/failure",
            "containerFormat": "decoded image format",
            "width": "decoded pixel width",
            "height": "decoded pixel height",
            "minimumDimension": "min(width,height)",
            "metadataPresent": "EXIF/XMP/ICC/JFIF metadata presence only",
            "jpegQuantizationTableCount": "number of readable JPEG quantization tables",
            "jpegQualityEstimate": "nearest standard JPEG quality estimate from quantization tables; diagnostic only when residual is low",
            "jpegProgressive": "JPEG progressive marker when readable",
            "fileBytes": "encoded byte size",
        },
        "states": ["HIGH", "MODERATE", "DEGRADED", "UNSUPPORTED", "UNKNOWN"],
        "reasonCodes": [
            "DECODE_FAILURE",
            "DIMENSION_TOO_SMALL",
            "JPEG_RECOMPRESSION_EVIDENCE",
            "JPEG_METADATA_ABSENT",
            "COMMON_SCREEN_DIMENSION",
            "NO_DESTRUCTIVE_BYTE_SIGNAL",
            "ENCODING_STATE_UNKNOWN",
        ],
        "logic": [
            "If decode fails, return UNKNOWN with DECODE_FAILURE.",
            "If min(width,height) < 256, return UNSUPPORTED with DIMENSION_TOO_SMALL.",
            "If JPEG has no metadata and a readable estimated quality <= 98, return DEGRADED with JPEG_RECOMPRESSION_EVIDENCE and JPEG_METADATA_ABSENT.",
            "If JPEG has no metadata and quality is unreadable or > 98, return MODERATE with JPEG_METADATA_ABSENT.",
            "If JPEG has metadata and no low-quality signal, return HIGH with NO_DESTRUCTIVE_BYTE_SIGNAL.",
            "If a PNG has a common screen dimension and no metadata, return MODERATE with COMMON_SCREEN_DIMENSION; this is applicability only, never synthetic evidence.",
            "Otherwise return HIGH with NO_DESTRUCTIVE_BYTE_SIGNAL.",
        ],
        "limitations": [
            "The rule intentionally does not infer resize, screenshot, or JPEG provenance from an unavailable parent file.",
            "Metadata absence is not authenticity evidence.",
            "A DEGRADED or UNSUPPORTED state withdraws authority from a low SAFE score; it does not imply AI or human origin.",
        ],
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    }
    policy["policySha256"] = canonical_hash(policy)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(policy, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"policySha256": policy["policySha256"], "path": "research/wp007i/applicability-policy.json"}, sort_keys=True))


if __name__ == "__main__":
    main()
