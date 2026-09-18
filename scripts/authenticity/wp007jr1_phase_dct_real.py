"""Measure phase, FFT and block-DCT features on the frozen real-media lab."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import time
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageOps
from scipy.fft import dctn


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")


def fixture_checks() -> dict[str, Any]:
    constant = np.ones((8, 8), dtype=np.float64)
    constant_dct = dctn(constant, type=2, norm="ortho")
    impulse = np.zeros((8, 8), dtype=np.float64)
    impulse[0, 0] = 1.0
    impulse_fft = np.abs(np.fft.fft2(impulse))
    return {
        "constantDctDcExpected": 8.0,
        "constantDctDcActual": float(constant_dct[0, 0]),
        "constantDctNonDcMaxAbs": float(np.max(np.abs(constant_dct[1:, :]))),
        "impulseFftMagnitudeExpected": 1.0,
        "impulseFftMagnitudeMaxError": float(np.max(np.abs(impulse_fft - 1.0))),
        "passed": bool(abs(constant_dct[0, 0] - 8.0) < 1e-10 and np.max(np.abs(constant_dct[1:, :])) < 1e-10 and np.max(np.abs(impulse_fft - 1.0)) < 1e-10),
    }


def image_array(path: Path) -> tuple[np.ndarray, int, int, dict[str, Any]]:
    with Image.open(path) as image:
        image.load()
        width, height = image.size
        metadata: dict[str, Any] = {
            "format": image.format,
            "mode": image.mode,
            "hasQuantization": bool(getattr(image, "quantization", None)),
            "quantizationTableCount": len(getattr(image, "quantization", {}) or {}),
            "layer": [list(item) for item in (getattr(image, "layer", []) or [])],
        }
        gray = ImageOps.grayscale(image)
        if gray.width < 256 or gray.height < 256:
            gray = ImageOps.pad(gray, (256, 256), method=Image.Resampling.BICUBIC, color=128.0, centering=(0.5, 0.5))
        else:
            left = (gray.width - 256) // 2
            top = (gray.height - 256) // 2
            gray = gray.crop((left, top, left + 256, top + 256))
        array = np.asarray(gray, dtype=np.float64) / 255.0
    return array, width, height, metadata


def measure(array: np.ndarray) -> dict[str, float]:
    if array.shape != (256, 256):
        raise ValueError(f"MEASUREMENT_SHAPE:{array.shape}")
    centered = array - float(np.mean(array))
    fft = np.fft.fftshift(np.fft.fft2(centered))
    magnitude = np.abs(fft)
    phase = np.angle(fft)
    yy, xx = np.mgrid[-128:128, -128:128]
    radius = np.sqrt(xx * xx + yy * yy) / 128.0
    non_dc = radius > 0.0
    high = radius >= 0.5
    safe_magnitude = magnitude + 1e-12
    phase_weights = safe_magnitude[non_dc]
    phase_values = phase[non_dc]
    phase_coherence = float(abs(np.sum(phase_weights * np.exp(1j * phase_values)) / np.sum(phase_weights))) if np.sum(phase_weights) else 0.0
    total_frequency_energy = float(np.sum(magnitude[non_dc] ** 2))
    high_frequency_energy = float(np.sum(magnitude[high] ** 2))

    blocks = array.reshape(32, 8, 32, 8).transpose(0, 2, 1, 3).reshape(-1, 8, 8)
    coefficients = dctn(blocks, type=2, norm="ortho", axes=(-2, -1))
    abs_coefficients = np.abs(coefficients)
    frequencies = np.add.outer(np.arange(8), np.arange(8))
    low_mask = (frequencies >= 1) & (frequencies <= 3)
    high_mask = frequencies >= 8
    ac_mask = frequencies >= 1
    ac_energy = float(np.mean(coefficients[:, ac_mask] ** 2))
    low_energy = float(np.mean(coefficients[:, low_mask] ** 2))
    high_dct_energy = float(np.mean(coefficients[:, high_mask] ** 2))
    dct_zero_rate = float(np.mean(abs_coefficients[:, ac_mask] < 1e-3))
    dct_dc = coefficients[:, 0, 0]
    dct_ac_l1 = np.mean(abs_coefficients[:, ac_mask], axis=1)

    horizontal_boundary = np.abs(array[:, 8::8] - array[:, 7:-1:8]).mean()
    vertical_boundary = np.abs(array[8::8, :] - array[7:-1:8, :]).mean()
    horizontal_interior = np.abs(array[:, 1:] - array[:, :-1]).mean()
    vertical_interior = np.abs(array[1:, :] - array[:-1, :]).mean()
    boundary_ratio = float((horizontal_boundary + vertical_boundary) / (horizontal_interior + vertical_interior + 1e-12))

    return {
        "fftLogMagnitudeMean": float(np.mean(np.log1p(magnitude))),
        "fftHighFrequencyEnergyRatio": high_frequency_energy / (total_frequency_energy + 1e-12),
        "fftPhaseCircularCoherence": phase_coherence,
        "fftPhaseMeanAbsolute": float(np.mean(np.abs(phase[non_dc]))),
        "dctDcMean": float(np.mean(dct_dc)),
        "dctDcStd": float(np.std(dct_dc)),
        "dctAcL1Mean": float(np.mean(dct_ac_l1)),
        "dctAcEnergy": ac_energy,
        "dctLowFrequencyEnergy": low_energy,
        "dctHighFrequencyEnergy": high_dct_energy,
        "dctHighToLowEnergyRatio": high_dct_energy / (low_energy + 1e-12),
        "dctAcZeroRate": dct_zero_rate,
        "blockBoundaryRatio": boundary_ratio,
        "pixelStd": float(np.std(array)),
    }


def resolve_record_path(record: dict[str, Any], *, media_root: Path, pillow_root: Path, sharp_root: Path) -> Path:
    if record.get("kind") == "ORIGINAL":
        return media_root / record["relativePath"]
    if record["encoderRole"] == "PILLOW_LIBJPEG":
        return pillow_root / record["relativeOutputPath"]
    if record["encoderRole"] == "SHARP_LIBVIPS":
        return sharp_root / record["relativeOutputPath"]
    raise RuntimeError(f"UNKNOWN_ENCODER_ROLE:{record.get('encoderRole')}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--cohort", type=Path, required=True)
    parser.add_argument("--scores", type=Path, required=True)
    parser.add_argument("--parent-results", type=Path, required=True)
    parser.add_argument("--media-root", type=Path, required=True)
    parser.add_argument("--pillow-root", type=Path, required=True)
    parser.add_argument("--sharp-root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    cohort = json.loads(args.cohort.read_text(encoding="utf-8"))
    score_payload = json.loads(args.scores.read_text(encoding="utf-8"))
    parent_payload = json.loads(args.parent_results.read_text(encoding="utf-8"))
    if not cohort.get("scoreBlind") or cohort.get("flux2PixelAccess") or cohort.get("flux2ProviderCalls") != 0:
        raise RuntimeError("PHASE_DCT_COHORT_NOT_FROZEN_OR_SEALED")
    if score_payload.get("flux2PixelAccess") or score_payload.get("flux2ProviderCalls") != 0:
        raise RuntimeError("PHASE_DCT_SCORE_PAYLOAD_NOT_SEALED")
    score_by_derived = {row["derivedId"]: row for row in score_payload["records"]}
    parent_score_by_id = {row["sampleId"]: float(row["rawScore"]) for row in parent_payload["records"]}
    originals = []
    for parent in cohort["records"]:
        originals.append(
            {
                "kind": "ORIGINAL",
                "derivedId": f"ORIGINAL__{parent['sampleId']}",
                "parentSampleId": parent["sampleId"],
                "sourceFamilyId": parent["sourceFamilyId"],
                "generatorFamily": parent.get("generatorFamily"),
                "truthLabel": parent["label"],
                "sourceSubtype": parent.get("sourceSubtype"),
                "operation": "ORIGINAL",
                "encoderRole": "ORIGINAL_SOURCE",
                "relativePath": parent["relativePath"],
                "expectedSha256": parent["sha256"],
                "safeRawScore": parent_score_by_id.get(parent["sampleId"]),
                "safeThresholdPass": parent_score_by_id.get(parent["sampleId"]) is not None and parent_score_by_id[parent["sampleId"]] >= score_payload["threshold"],
            }
        )
    descendants = []
    for row in score_payload["records"]:
        descendants.append(
            {
                **row,
                "kind": "DESCENDANT",
                "expectedSha256": row["inputSha256"],
                "relativePath": row["relativeOutputPath"],
                "safeRawScore": row["rawScore"],
                "safeThresholdPass": row["thresholdPass"],
            }
        )
    records = originals + descendants
    rows: list[dict[str, Any]] = []
    started = time.perf_counter()
    for index, record in enumerate(records):
        path = resolve_record_path(record, media_root=args.media_root, pillow_root=args.pillow_root, sharp_root=args.sharp_root)
        if not path.is_file():
            raise FileNotFoundError(path)
        actual_sha = sha256_file(path)
        if actual_sha != record["expectedSha256"]:
            raise RuntimeError(f"PHASE_DCT_INPUT_HASH_MISMATCH:{record['derivedId']}")
        array, width, height, image_meta = image_array(path)
        features = measure(array)
        parent_score = record.get("originalRawScore") if record["kind"] == "DESCENDANT" else record.get("safeRawScore")
        rows.append(
            {
                "derivedId": record["derivedId"],
                "kind": record["kind"],
                "parentSampleId": record["parentSampleId"],
                "sourceFamilyId": record["sourceFamilyId"],
                "generatorFamily": record.get("generatorFamily"),
                "truthLabel": record["truthLabel"],
                "sourceSubtype": record.get("sourceSubtype"),
                "operation": record["operation"],
                "encoderRole": record["encoderRole"],
                "requestedQuality": record.get("requestedQuality"),
                "requestedSubsampling": record.get("requestedSubsampling"),
                "relativePath": record["relativePath"],
                "sha256": actual_sha,
                "decodedWidth": width,
                "decodedHeight": height,
                "safeRawScore": record.get("safeRawScore") if record["kind"] == "DESCENDANT" else parent_score,
                "safeThresholdPass": record.get("safeThresholdPass") if record["kind"] == "DESCENDANT" else (parent_score is not None and parent_score >= score_payload["threshold"]),
                "imageMetadata": image_meta,
                "features": features,
            }
        )
        if (index + 1) % 100 == 0 or index + 1 == len(records):
            print(f"PHASE_DCT_RECORDS={index + 1}", flush=True)

    output = {
        "schemaVersion": "lythaus-wp007jr1-phase-dct-real-v1",
        "measurementOnly": True,
        "classifierInvoked": False,
        "preprocessing": "decode to grayscale; center crop or deterministic 256x256 pad; float64 [0,1]; block DCT on 8x8 tiles",
        "sourceCohortFreezeSha256": cohort["freezeSha256"],
        "safeScoreArtifact": "research/wp007j-r1/jpeg-safe-lab-results.json",
        "recordCount": len(rows),
        "originalCount": len(originals),
        "descendantCount": len(descendants),
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
        "knownAnswerFixtures": fixture_checks(),
        "runtimeSeconds": time.perf_counter() - started,
        "records": rows,
        "evidenceRole": "EF4_MEASUREMENT_CANDIDATE_ONLY",
        "productAuthority": "NONE",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"records": len(rows), "fixturesPassed": output["knownAnswerFixtures"]["passed"], "runtimeSeconds": output["runtimeSeconds"]}))


if __name__ == "__main__":
    main()
