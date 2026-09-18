"""WP007K bounded CES-E/CES-S empirical runner.

This module deliberately keeps codec facts and content-derived features separate.
It never changes SAFE-A and refuses FLUX.2-looking paths.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Iterable

import numpy as np
from PIL import Image, ImageOps
from scipy.fft import dctn
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, roc_auc_score

SAFE_THRESHOLD = 0.5864923000335693
SAFE_CHECKPOINT_SHA256 = "b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e"
SAFE_COMMIT = "4e998724651b227def64f5be0cd60c0aa1552c35"
FLUX2_MARKERS = ("flux.2", "flux2", "flux-2")
CONTENT_FEATURES = [
    "fftLogMagnitudeMean",
    "fftHighFrequencyEnergyRatio",
    "fftPhaseCircularCoherence",
    "fftPhaseMeanAbsolute",
    "dctDcMean",
    "dctDcStd",
    "dctAcL1Mean",
    "dctAcEnergy",
    "dctLowFrequencyEnergy",
    "dctHighFrequencyEnergy",
    "dctHighToLowEnergyRatio",
    "dctAcZeroRate",
    "blockBoundaryRatio",
    "pixelStd",
]
CODEC_FEATURES = [
    "codecEstimatedQuality",
    "codecQualityMatchError",
    "codecSamplingCode",
    "codecProgressive",
    "codecHasQuantization",
    "codecDqtMean",
    "codecDqtStd",
    "codecDqtMax",
]
FEATURE_SETS = {
    "content": CONTENT_FEATURES,
    "dct": [name for name in CONTENT_FEATURES if name.startswith("dct") or name == "blockBoundaryRatio"],
    "fft": [name for name in CONTENT_FEATURES if name.startswith("fft")],
    "pixel": ["pixelStd", "dctDcMean", "dctDcStd"],
    "dct-fft": [name for name in CONTENT_FEATURES if name.startswith("dct") or name.startswith("fft") or name == "blockBoundaryRatio"],
    "no-phase": [name for name in CONTENT_FEATURES if not name.startswith("fftPhase")],
    "codec-augmented": CONTENT_FEATURES + CODEC_FEATURES,
}
LUMA_QTABLE = [
    16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55,
    14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
    18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92,
    49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99,
]
CHROMA_QTABLE = [
    17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99,
    24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99,
    99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
    99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
]


def canonical_bytes(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def freeze(payload: dict[str, Any], key: str = "freezeSha256") -> dict[str, Any]:
    copy = dict(payload)
    copy.pop(key, None)
    copy[key] = sha256_bytes(canonical_bytes(copy))
    return copy


def read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def reject_flux2(*values: Any) -> None:
    text = " ".join(str(value or "") for value in values).lower()
    if any(marker in text for marker in FLUX2_MARKERS):
        raise RuntimeError(f"FLUX2_ACCESS_DENIED:{text}")


def source_split(source_family: str, label: int, generator: str | None) -> str:
    if label == 1:
        if generator in {"Gemini-2.0-Flash", "GoT-R1-7B"}:
            return "TRAIN"
        if generator in {"Nano-Banana", "SD-3.5-Large"}:
            return "DEV"
        return "DEV"
    digest = int(hashlib.sha256(source_family.encode("utf-8")).hexdigest()[:8], 16)
    return "TRAIN" if digest % 5 else "DEV"


def phase_record_to_dev(row: dict[str, Any]) -> dict[str, Any]:
    reject_flux2(row.get("generatorFamily"), row.get("relativePath"))
    return {
        "recordId": row["derivedId"],
        "parentSampleId": row["parentSampleId"],
        "sourceFamilyId": row["sourceFamilyId"],
        "generatorFamily": row.get("generatorFamily"),
        "sourceSubtype": row.get("sourceSubtype"),
        "truthLabel": int(row["truthLabel"]),
        "split": source_split(row["sourceFamilyId"], int(row["truthLabel"]), row.get("generatorFamily")),
        "operation": row.get("operation"),
        "encoderRole": row.get("encoderRole"),
        "requestedQuality": row.get("requestedQuality"),
        "requestedSubsampling": row.get("requestedSubsampling"),
        "safeRawScore": row.get("safeRawScore"),
        "safeThresholdPass": row.get("safeThresholdPass"),
        "features": row["features"],
        "codecFacts": {
            "format": (row.get("imageMetadata") or {}).get("format"),
            "hasQuantization": bool((row.get("imageMetadata") or {}).get("hasQuantization")),
            "quantizationTableCount": (row.get("imageMetadata") or {}).get("quantizationTableCount", 0),
        },
        "origin": "WP007J_R1_PHASE_DCT_REAL_RESULTS_DEVELOPMENT_ONLY",
    }


def build_cohorts(args: argparse.Namespace) -> None:
    repo = args.repo_root
    out = args.output
    h = read_json(repo / "research/wp007h/qualification-corpus-freeze.json")
    neg = read_json(repo / "research/wp007i/negative-data-freeze.json")
    r1_cohort = read_json(repo / "research/wp007j-r1/jpeg-lab-cohort-freeze.json")
    r1_dev_sample_ids = {row["sampleId"] for row in r1_cohort["records"]}
    records: list[dict[str, Any]] = []
    for row in h["roles"]["QUALIFICATION_CONFIRM"]:
        family = row["generatorFamily"]
        reject_flux2(family, row["path"])
        if family == "FLUX.1-Krea-dev":
            continue
        records.append(
            {
                "sampleId": row["localRelativePath"].replace("/", "__"),
                "sourceFamilyId": f"T2I_FAMILY_{family}",
                "generatorFamily": family,
                "label": 1,
                "role": "CONFIRM_SYNTHETIC",
                "split": "CONFIRM",
                "sourceSubtype": "MODERN_GENERATED",
                "rootKey": "WP007H_MODERN",
                "relativePath": row["localRelativePath"],
                "sourceDataset": h["sourceDataset"],
                "rightsClass": h["rightsClassification"],
                "expectedSha256": row["downloadedSha256"],
                "officialRevision": row["officialRevision"],
                "sourcePath": row["path"],
            }
        )
    digital = read_json(Path(args.controlled_manifest))
    for row in digital["records"]:
        reject_flux2(row.get("sampleId"), row.get("file", {}).get("format"))
        records.append(
            {
                "sampleId": row["sampleId"],
                "sourceFamilyId": row["sourceFamilyId"],
                "generatorFamily": None,
                "label": 0,
                "role": "CONFIRM_NEGATIVE_CONTROLLED_DIGITAL",
                "split": "CONFIRM",
                "sourceSubtype": row["benchmark"]["hardNegativeSubtype"],
                "rootKey": "WP007E_CONTROLLED_DIGITAL",
                "relativePath": row["sampleId"] + ".svg",
                "sourceDataset": "LYTHAUS_PROGRAMMATIC_DIGITAL_NEGATIVE_FIXTURE",
                "rightsClass": row["rights"]["trainingEligibility"],
                "expectedSha256": row["file"]["sha256"],
                "sourceFormat": row["file"]["format"],
            }
        )
    for row in neg["records"]:
        if row["sampleId"] in r1_dev_sample_ids:
            continue
        reject_flux2(row.get("sampleId"), row.get("localRelativePath"))
        records.append(
            {
                "sampleId": row["sampleId"],
                "sourceFamilyId": row["sourceFamilyId"],
                "generatorFamily": None,
                "label": 0,
                "role": "CONFIRM_NEGATIVE_HISTORICAL_REUSE",
                "split": "CONFIRM",
                "sourceSubtype": row.get("sourceSubtype"),
                "rootKey": "WP007I_MEDIA",
                "relativePath": row["localRelativePath"],
                "sourceDataset": row.get("sourceDataset"),
                "rightsClass": row.get("sourceRights", "EVALUATION_ONLY"),
                "cameraDeviceFamily": row.get("cameraDeviceFamily"),
            }
        )
    records.sort(key=lambda row: (row["role"], row["sourceFamilyId"], row["sampleId"]))
    if len({row["sampleId"] for row in records}) != len(records):
        raise RuntimeError("CONFIRM_DUPLICATE_SAMPLE_ID")
    families = {row["sourceFamilyId"] for row in records}
    synthetic_families = {row["generatorFamily"] for row in records if row["label"] == 1}
    payload = {
        "schemaVersion": "lythaus-wp007k-confirmation-cohort-v1",
        "scoreBlind": True,
        "frozenBeforeFeatureExtraction": True,
        "selectionRule": "Inherited score-blind H membership, all non-FLUX families; deterministic Lythaus-controlled digital manifest membership; WP007I negative records excluding R1 development parents.",
        "records": records,
        "counts": {
            "total": len(records),
            "synthetic": sum(row["label"] == 1 for row in records),
            "negative": sum(row["label"] == 0 for row in records),
            "sourceFamilies": len(families),
            "syntheticGeneratorFamilies": sorted(synthetic_families),
        },
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    }
    write_json(out / "confirmation-cohort-freeze.json", freeze(payload))
    phase = read_json(repo / "research/wp007j-r1/phase-dct-real-results.json")
    dev_rows = [phase_record_to_dev(row) for row in phase["records"]]
    dev_payload = {
        "schemaVersion": "lythaus-wp007k-development-cohort-v1",
        "role": "DEVELOPMENT_ONLY",
        "source": "research/wp007j-r1/phase-dct-real-results.json",
        "sourceSha256": sha256_file(repo / "research/wp007j-r1/phase-dct-real-results.json"),
        "scoreBlindAtOriginalCuration": True,
        "rows": dev_rows,
        "counts": {"total": len(dev_rows), "sourceFamilies": len({row["sourceFamilyId"] for row in dev_rows})},
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    }
    write_json(out / "development-cohort-freeze.json", freeze(dev_payload))
    print(json.dumps({"confirmation": payload["counts"], "development": dev_payload["counts"]}))


def image_array(path: Path) -> tuple[np.ndarray, int, int, dict[str, Any]]:
    with Image.open(path) as image:
        image.load()
        width, height = image.size
        fmt = image.format
        quant = getattr(image, "quantization", {}) or {}
        progressive = bool(image.info.get("progressive") or image.info.get("progression"))
        layer = getattr(image, "layer", []) or []
        gray = ImageOps.grayscale(image)
        if gray.width < 256 or gray.height < 256:
            gray = ImageOps.pad(gray, (256, 256), method=Image.Resampling.BICUBIC, color=128, centering=(0.5, 0.5))
        else:
            left = (gray.width - 256) // 2
            top = (gray.height - 256) // 2
            gray = gray.crop((left, top, left + 256, top + 256))
        array = np.asarray(gray, dtype=np.float64) / 255.0
    sampling = "UNKNOWN"
    if layer:
        try:
            first = layer[0]
            chroma = layer[1:]
            if first[1] == 1 and first[2] == 1 and all(item[1] == 1 and item[2] == 1 for item in chroma):
                sampling = "4:4:4"
            elif first[1] == 2 and first[2] == 1 and all(item[1] == 1 and item[2] == 1 for item in chroma):
                sampling = "4:2:2"
            elif first[1] == 2 and first[2] == 2 and all(item[1] == 1 and item[2] == 1 for item in chroma):
                sampling = "4:2:0"
            else:
                sampling = "OTHER_OR_NONSTANDARD"
        except (IndexError, TypeError):
            sampling = "UNKNOWN"
    qvalues = [float(v) for values in quant.values() for v in values]
    best_quality = None
    best_error = None
    if quant:
        best_quality = 1
        best_error = float("inf")
        for quality in range(1, 101):
            scale = math.floor(5000 / quality) if quality < 50 else 200 - quality * 2
            expected_tables = {
                0: [min(255, max(1, math.floor((value * scale + 50) / 100))) for value in LUMA_QTABLE],
                1: [min(255, max(1, math.floor((value * scale + 50) / 100))) for value in CHROMA_QTABLE],
            }
            errors = []
            for table_id, actual in quant.items():
                expected = expected_tables.get(int(table_id), expected_tables[0])
                errors.extend(abs(float(a) - float(b)) / max(1.0, float(b)) for a, b in zip(actual, expected, strict=False))
            error = float(np.mean(errors)) if errors else float("inf")
            if error < best_error:
                best_quality, best_error = quality, error
    codec = {
        "format": fmt,
        "width": width,
        "height": height,
        "progressive": progressive,
        "sampling": sampling,
        "quantizationTableCount": len(quant),
        "quantizationTableHash": sha256_bytes(canonical_bytes({str(k): list(v) for k, v in sorted(quant.items())})) if quant else None,
        "dqtMean": float(np.mean(qvalues)) if qvalues else None,
        "dqtStd": float(np.std(qvalues)) if qvalues else None,
        "dqtMax": float(np.max(qvalues)) if qvalues else None,
        "metadataMarkers": sorted(str(k) for k in image.info.keys()),
        "estimatedQuality": best_quality,
        "qualityMatchError": best_error,
    }
    return array, width, height, codec


def measure(array: np.ndarray) -> dict[str, float]:
    centered = array - float(np.mean(array))
    fft = np.fft.fftshift(np.fft.fft2(centered))
    magnitude = np.abs(fft)
    phase = np.angle(fft)
    yy, xx = np.mgrid[-128:128, -128:128]
    radius = np.sqrt(xx * xx + yy * yy) / 128.0
    non_dc = radius > 0.0
    high = radius >= 0.5
    weights = magnitude[non_dc] + 1e-12
    phase_values = phase[non_dc]
    phase_coherence = float(abs(np.sum(weights * np.exp(1j * phase_values)) / np.sum(weights))) if np.sum(weights) else 0.0
    total_energy = float(np.sum(magnitude[non_dc] ** 2))
    high_energy = float(np.sum(magnitude[high] ** 2))
    blocks = array.reshape(32, 8, 32, 8).transpose(0, 2, 1, 3).reshape(-1, 8, 8)
    coefficients = dctn(blocks, type=2, norm="ortho", axes=(-2, -1))
    absolute = np.abs(coefficients)
    frequencies = np.add.outer(np.arange(8), np.arange(8))
    low_mask = (frequencies >= 1) & (frequencies <= 3)
    high_mask = frequencies >= 8
    ac_mask = frequencies >= 1
    ac_energy = float(np.mean(coefficients[:, ac_mask] ** 2))
    low_energy = float(np.mean(coefficients[:, low_mask] ** 2))
    high_dct_energy = float(np.mean(coefficients[:, high_mask] ** 2))
    dc = coefficients[:, 0, 0]
    ac_l1 = np.mean(absolute[:, ac_mask], axis=1)
    h_boundary = np.abs(array[:, 8::8] - array[:, 7:-1:8]).mean()
    v_boundary = np.abs(array[8::8, :] - array[7:-1:8, :]).mean()
    h_interior = np.abs(array[:, 1:] - array[:, :-1]).mean()
    v_interior = np.abs(array[1:, :] - array[:-1, :]).mean()
    return {
        "fftLogMagnitudeMean": float(np.mean(np.log1p(magnitude))),
        "fftHighFrequencyEnergyRatio": high_energy / (total_energy + 1e-12),
        "fftPhaseCircularCoherence": phase_coherence,
        "fftPhaseMeanAbsolute": float(np.mean(np.abs(phase[non_dc]))),
        "dctDcMean": float(np.mean(dc)),
        "dctDcStd": float(np.std(dc)),
        "dctAcL1Mean": float(np.mean(ac_l1)),
        "dctAcEnergy": ac_energy,
        "dctLowFrequencyEnergy": low_energy,
        "dctHighFrequencyEnergy": high_dct_energy,
        "dctHighToLowEnergyRatio": high_dct_energy / (low_energy + 1e-12),
        "dctAcZeroRate": float(np.mean(absolute[:, ac_mask] < 1e-3)),
        "blockBoundaryRatio": float((h_boundary + v_boundary) / (h_interior + v_interior + 1e-12)),
        "pixelStd": float(np.std(array)),
    }


def codec_vector(codec: dict[str, Any]) -> dict[str, float]:
    sampling = str(codec.get("sampling") or "UNKNOWN")
    sampling_code = {"4:4:4": 0.0, "4:2:2": 1.0, "4:2:0": 2.0}.get(sampling, -1.0)
    return {
        "codecEstimatedQuality": float(codec.get("estimatedQuality")) if codec.get("estimatedQuality") is not None else -1.0,
        "codecQualityMatchError": float(codec.get("qualityMatchError")) if codec.get("qualityMatchError") is not None else -1.0,
        "codecSamplingCode": sampling_code,
        "codecProgressive": 1.0 if codec.get("progressive") else 0.0,
        "codecHasQuantization": 1.0 if codec.get("quantizationTableCount", 0) else 0.0,
        "codecDqtMean": float(codec.get("dqtMean")) if codec.get("dqtMean") is not None else -1.0,
        "codecDqtStd": float(codec.get("dqtStd")) if codec.get("dqtStd") is not None else -1.0,
        "codecDqtMax": float(codec.get("dqtMax")) if codec.get("dqtMax") is not None else -1.0,
    }


def load_safe_model(safe_root: Path, checkpoint: Path):
    import torch

    if sha256_file(checkpoint) != SAFE_CHECKPOINT_SHA256:
        raise RuntimeError("SAFE_CHECKPOINT_HASH_MISMATCH")
    sys.path.insert(0, str(safe_root))
    from models.resnet import resnet50

    model = resnet50(num_classes=2)
    data = torch.load(checkpoint, map_location="cpu", weights_only=False)
    model.load_state_dict(data.get("model", data), strict=True)
    model.eval()
    for parameter in model.parameters():
        parameter.requires_grad_(False)
    return model


def safe_scores(model, paths: list[Path], batch_size: int = 8) -> list[float]:
    import torch

    rows: list[float] = []
    torch.set_num_threads(4)
    torch.set_num_interop_threads(1)
    for start in range(0, len(paths), batch_size):
        tensors = []
        for path in paths[start : start + batch_size]:
            with Image.open(path) as image:
                image.load()
                rgb = image.convert("RGB")
                if rgb.width < 256 or rgb.height < 256:
                    crop = ImageOps.pad(rgb, (256, 256), method=Image.Resampling.BICUBIC, color=(128, 128, 128), centering=(0.5, 0.5))
                else:
                    left = (rgb.width - 256) // 2
                    top = (rgb.height - 256) // 2
                    crop = rgb.crop((left, top, left + 256, top + 256))
                tensors.append(torch.from_numpy(np.asarray(crop, dtype=np.float32).transpose(2, 0, 1) / 255.0))
        with torch.inference_mode():
            logits = model(torch.stack(tensors))
            scores = torch.softmax(logits, dim=1)[:, 1].tolist()
        rows.extend(float(value) for value in scores)
    return rows


def resolve_root(root_args: list[str]) -> dict[str, Path]:
    roots: dict[str, Path] = {}
    for item in root_args:
        key, value = item.split("=", 1)
        roots[key] = Path(value)
    return roots


def materialized_record_path(record: dict[str, Any], roots: dict[str, Path]) -> Path:
    root = roots.get(record["rootKey"])
    if root is None:
        raise RuntimeError(f"ROOT_NOT_PROVIDED:{record['rootKey']}")
    path = root / record["relativePath"]
    if not path.is_file():
        raise FileNotFoundError(path)
    return path


def extract_features(args: argparse.Namespace) -> None:
    manifest = read_json(args.manifest)
    if manifest.get("flux2PixelAccess") or manifest.get("flux2ProviderCalls") != 0:
        raise RuntimeError("MATERIALIZATION_NOT_SEALED")
    roots = resolve_root(args.root)
    rows = list(manifest["records"])
    for row in rows:
        reject_flux2(row.get("generatorFamily"), row.get("relativePath"))
    model = None
    reused_safe: dict[str, float | None] = {}
    if args.reuse_safe:
        old = read_json(args.reuse_safe)
        reused_safe = {row["recordId"]: row.get("safeRawScore") for row in old.get("records", [])}
    if args.safe_root and args.checkpoint:
        model = load_safe_model(args.safe_root, args.checkpoint)
    paths = [materialized_record_path(row, roots) for row in rows]
    safe = safe_scores(model, paths) if model is not None else [reused_safe.get(row["recordId"]) for row in rows]
    output_rows = []
    started = time.perf_counter()
    for index, (row, path, safe_score_value) in enumerate(zip(rows, paths, safe, strict=True)):
        array, width, height, codec = image_array(path)
        content = measure(array)
        codec["sha256"] = sha256_file(path)
        output_rows.append(
            {
                "recordId": row["recordId"],
                "parentSampleId": row["parentSampleId"],
                "sourceFamilyId": row["sourceFamilyId"],
                "generatorFamily": row.get("generatorFamily"),
                "truthLabel": row["truthLabel"],
                "role": row["role"],
                "sourceSubtype": row.get("sourceSubtype"),
                "operation": row["operation"],
                "encoder": row.get("encoder"),
                "requestedQuality": row.get("requestedQuality"),
                "requestedSubsampling": row.get("requestedSubsampling"),
                "split": row.get("split", "CONFIRM"),
                "rootKey": row["rootKey"],
                "relativePath": row["relativePath"],
                "sha256": codec.pop("sha256"),
                "decodedWidth": width,
                "decodedHeight": height,
                "safeRawScore": safe_score_value,
                "safeThresholdPass": safe_score_value is not None and safe_score_value >= SAFE_THRESHOLD,
                "features": content,
                "codecFacts": codec,
            }
        )
        if (index + 1) % 100 == 0 or index + 1 == len(rows):
            print(f"CES_FEATURE_RECORDS={index + 1}", flush=True)
    output = {
        "schemaVersion": "lythaus-wp007k-feature-results-v1",
        "featureDefinition": "Lythaus-owned pixel/DCT/FFT/phase statistics; codec facts are separate CES-E context.",
        "recordCount": len(output_rows),
        "safeReference": {
            "checkpointSha256": SAFE_CHECKPOINT_SHA256 if model is not None else None,
            "threshold": SAFE_THRESHOLD if model is not None else None,
            "upstreamCommit": SAFE_COMMIT if model is not None else None,
        },
        "runtimeSeconds": time.perf_counter() - started,
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
        "records": output_rows,
    }
    write_json(args.output, output)
    print(json.dumps({"records": len(output_rows), "runtimeSeconds": output["runtimeSeconds"]}))


def materialize_pillow(args: argparse.Namespace) -> None:
    base = read_json(args.base_manifest)
    if base.get("flux2PixelAccess") or base.get("flux2ProviderCalls") != 0:
        raise RuntimeError("BASE_MATERIALIZATION_NOT_SEALED")
    root = args.output
    by_parent = {}
    for row in base["records"]:
        if row["operation"] == "ORIGINAL":
            by_parent[row["parentSampleId"]] = row
    records = list(base["records"])
    jobs = [("Q95_420", 95, 2, "4:2:0"), ("Q85_420", 85, 2, "4:2:0"), ("Q75_420", 75, 2, "4:2:0"), ("Q95_444", 95, 0, "4:4:4")]
    transformed_parents = {row["parentSampleId"] for row in base["records"] if row.get("encoder") == "SHARP_LIBVIPS"}
    for parent_id, original in sorted(by_parent.items()):
        if parent_id not in transformed_parents:
            continue
        source = root / original["relativePath"]
        with Image.open(source) as image:
            image.load()
            rgb = image.convert("RGB")
            for operation, quality, subsampling, subsampling_label in jobs:
                relative = Path("pillow") / operation / f"{parent_id}.jpg"
                target = root / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                rgb.save(target, format="JPEG", quality=quality, subsampling=subsampling, optimize=False, progressive=False)
                records.append({
                    "recordId": f"{parent_id}__{operation}__PILLOW",
                    "parentSampleId": parent_id,
                    "sourceFamilyId": original["sourceFamilyId"],
                    "generatorFamily": original.get("generatorFamily"),
                    "truthLabel": original["truthLabel"],
                    "role": original["role"],
                    "sourceSubtype": original.get("sourceSubtype"),
                    "operation": operation,
                    "encoder": "PILLOW_LIBJPEG",
                    "requestedQuality": quality,
                    "requestedSubsampling": subsampling_label,
                    "rootKey": "MATERIALIZED",
                    "relativePath": relative.as_posix(),
                    "sha256": sha256_file(target),
                    "split": original.get("split", "CONFIRM"),
                })
            if original["truthLabel"] == 1:
                first = Image.open(source).convert("RGB")
                intermediate = args.output / "pillow" / "DOUBLE_Q95_Q85" / f"{parent_id}.intermediate.jpg"
                final = args.output / "pillow" / "DOUBLE_Q95_Q85" / f"{parent_id}.jpg"
                intermediate.parent.mkdir(parents=True, exist_ok=True)
                first.save(intermediate, format="JPEG", quality=95, subsampling=2, optimize=False, progressive=False)
                with Image.open(intermediate) as second:
                    second.convert("RGB").save(final, format="JPEG", quality=85, subsampling=2, optimize=False, progressive=False)
                intermediate.unlink(missing_ok=True)
                records.append({
                    "recordId": f"{parent_id}__DOUBLE_Q95_Q85__PILLOW",
                    "parentSampleId": parent_id,
                    "sourceFamilyId": original["sourceFamilyId"],
                    "generatorFamily": original.get("generatorFamily"),
                    "truthLabel": original["truthLabel"],
                    "role": original["role"],
                    "sourceSubtype": original.get("sourceSubtype"),
                    "operation": "DOUBLE_Q95_Q85",
                    "encoder": "PILLOW_LIBJPEG",
                    "requestedQuality": 85,
                    "requestedSubsampling": "4:2:0",
                    "rootKey": "MATERIALIZED",
                    "relativePath": (Path("pillow") / "DOUBLE_Q95_Q85" / f"{parent_id}.jpg").as_posix(),
                    "sha256": sha256_file(final),
                    "split": original.get("split", "CONFIRM"),
                })
    payload = {
        "schemaVersion": "lythaus-wp007k-materialization-v1",
        "sourceCohortFreezeSha256": base["sourceCohortFreezeSha256"],
        "baseMaterializationSha256": base.get("baseMaterializationSha256"),
        "scoreBlind": True,
        "records": sorted(records, key=lambda row: row["recordId"]),
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    }
    payload["materializationSha256"] = sha256_bytes(canonical_bytes({key: value for key, value in payload.items() if key != "materializationSha256"}))
    write_json(args.output / "materialization-manifest.json", payload)
    print(json.dumps({"records": len(records), "parents": len(by_parent), "materializationSha256": payload["materializationSha256"]}))


def prepare_development(args: argparse.Namespace) -> None:
    phase = read_json(args.phase_results)
    rows = [phase_record_to_dev(row) for row in phase["records"]]
    output = {
        "schemaVersion": "lythaus-wp007k-development-features-v1",
        "sourceResultsSha256": sha256_file(args.phase_results),
        "rows": rows,
        "featureNames": CONTENT_FEATURES,
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    }
    write_json(args.output, freeze(output))
    print(json.dumps({"records": len(rows), "train": sum(row["split"] == "TRAIN" for row in rows), "dev": sum(row["split"] == "DEV" for row in rows)}))


def row_features(row: dict[str, Any], names: list[str]) -> np.ndarray:
    values = []
    for name in names:
        source = row.get("features", {}) if name in CONTENT_FEATURES else codec_vector(row.get("codecFacts", {}))
        value = source.get(name, 0.0)
        values.append(float(value) if math.isfinite(float(value)) else 0.0)
    return np.asarray(values, dtype=np.float64)


def fit_model(rows: list[dict[str, Any]], names: list[str], encoder: str | None) -> dict[str, Any]:
    selected = [row for row in rows if row.get("split") in {"TRAIN", "DEV"} and (encoder is None or row.get("encoderRole") == encoder or row.get("encoder") == encoder)]
    if not selected or len({row["truthLabel"] for row in selected}) < 2:
        raise RuntimeError(f"CES_S_INSUFFICIENT_CLASSES:{encoder}")
    train = [row for row in selected if row["split"] == "TRAIN"]
    dev = [row for row in selected if row["split"] == "DEV"]
    if len({row["truthLabel"] for row in train}) < 2 or not dev:
        raise RuntimeError(f"CES_S_SPLIT_INSUFFICIENT:{encoder}")
    x_train = np.vstack([row_features(row, names) for row in train])
    x_dev = np.vstack([row_features(row, names) for row in dev])
    mean = np.mean(x_train, axis=0)
    scale = np.std(x_train, axis=0)
    scale[scale < 1e-12] = 1.0
    x_train = (x_train - mean) / scale
    x_dev = (x_dev - mean) / scale
    family_counts = Counter(row["sourceFamilyId"] for row in train)
    weights = np.asarray([1.0 / family_counts[row["sourceFamilyId"]] for row in train], dtype=np.float64)
    model = LogisticRegression(C=0.1, max_iter=2000, solver="lbfgs", random_state=20260916)
    model.fit(x_train, [row["truthLabel"] for row in train], sample_weight=weights)
    dev_scores = model.predict_proba(x_dev)[:, 1]
    dev_neg = [float(score) for score, row in zip(dev_scores, dev, strict=True) if row["truthLabel"] == 0]
    threshold = max(0.5, max(dev_neg, default=0.5) + 1e-9)
    return {
        "schemaVersion": "lythaus-wp007k-ces-s-linear-model-v1",
        "modelId": "CES_S_LINEAR_CONTENT_ONLY" if names == CONTENT_FEATURES else "CES_S_LINEAR_CODEC_AUGMENTED",
        "encoderTrainingRole": encoder or "MIXED_DEVELOPMENT",
        "featureNames": names,
        "coefficients": [float(value) for value in model.coef_[0]],
        "intercept": float(model.intercept_[0]),
        "mean": [float(value) for value in mean],
        "scale": [float(value) for value in scale],
        "threshold": float(threshold),
        "thresholdRule": "max(0.5, maximum TRAIN/DEV development-negative probability + epsilon); no confirmation exposure",
        "trainRecordCount": len(train),
        "devRecordCount": len(dev),
        "trainSourceFamilyCount": len({row["sourceFamilyId"] for row in train}),
        "devSourceFamilyCount": len({row["sourceFamilyId"] for row in dev}),
        "rightsClass": "RESEARCH_ONLY_NOT_DEPLOYABLE",
        "safeAUnchanged": True,
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    }


def predict(model: dict[str, Any], row: dict[str, Any]) -> float:
    values = row_features(row, model["featureNames"])
    x = (values - np.asarray(model["mean"])) / np.asarray(model["scale"])
    logit = float(np.dot(x, np.asarray(model["coefficients"])) + model["intercept"])
    return 1.0 / (1.0 + math.exp(-max(-700.0, min(700.0, logit))))


def fit(args: argparse.Namespace) -> None:
    dev = read_json(args.development)["rows"]
    names = FEATURE_SETS[args.feature_set]
    model = fit_model(dev, names, args.encoder or None)
    model["developmentSourceSha256"] = sha256_file(args.development)
    write_json(args.output, model)
    print(json.dumps({"modelId": model["modelId"], "threshold": model["threshold"], "train": model["trainRecordCount"], "dev": model["devRecordCount"]}))


def wilson(success: int, total: int) -> dict[str, Any]:
    if total == 0:
        return {"numerator": success, "denominator": total, "rate": None, "lower": None, "upper": None}
    z = 1.959963984540054
    p = success / total
    denominator = 1 + z * z / total
    centre = (p + z * z / (2 * total)) / denominator
    half = z * math.sqrt((p * (1 - p) + z * z / (4 * total)) / total) / denominator
    return {"numerator": success, "denominator": total, "rate": p, "lower": max(0.0, centre - half), "upper": min(1.0, centre + half)}


def summarize(rows: list[dict[str, Any]], score_key: str, threshold: float) -> dict[str, Any]:
    valid = [row for row in rows if row.get(score_key) is not None]
    positives = [row for row in valid if row["truthLabel"] == 1]
    negatives = [row for row in valid if row["truthLabel"] == 0]
    tp = sum(row[score_key] >= threshold for row in positives)
    fp = sum(row[score_key] >= threshold for row in negatives)
    labels = [row["truthLabel"] for row in valid]
    scores = [row[score_key] for row in valid]
    source_groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in valid:
        source_groups[row.get("parentSampleId") or row["sourceFamilyId"]].append(row)
    source_negative = [group for group in source_groups.values() if group[0]["truthLabel"] == 0]
    source_fp = sum(any(row[score_key] >= threshold for row in group) for group in source_negative)
    return {
        "recordCount": len(valid),
        "tp": tp,
        "fn": len(positives) - tp,
        "fp": fp,
        "tn": len(negatives) - fp,
        "recall": wilson(tp, len(positives)),
        "fpr": wilson(fp, len(negatives)),
        "sourceLevelWorstCaseFpr": wilson(source_fp, len(source_negative)),
        "auroc": float(roc_auc_score(labels, scores)) if len(set(labels)) == 2 else None,
        "auprc": float(average_precision_score(labels, scores)) if len(set(labels)) == 2 else None,
    }


def evaluate(args: argparse.Namespace) -> None:
    model = read_json(args.model)
    payload = read_json(args.features)
    rows = payload.get("records", payload.get("rows", []))
    scored = []
    for row in rows:
        reject_flux2(row.get("generatorFamily"), row.get("relativePath"))
        score = predict(model, row)
        scored.append({**row, "cesSScore": score, "cesSHigh": score >= model["threshold"]})
    overall = summarize(scored, "cesSScore", model["threshold"])
    groups: dict[str, Any] = {}
    grouped_rows = sorted(scored, key=lambda r: str(r.get(args.group_by) or "UNKNOWN"))
    for key, grouped in __import__("itertools").groupby(grouped_rows, key=lambda r: str(r.get(args.group_by) or "UNKNOWN")):
        groups[key] = summarize(list(grouped), "cesSScore", model["threshold"])
    rescue = {
        "safeCorrectCesSWrong": 0,
        "cesSUniqueCorrect": 0,
        "bothCorrect": 0,
        "bothWrong": 0,
        "safeFalsePositiveCesSNegative": 0,
        "cesSFalsePositiveSafeNegative": 0,
    }
    for row in scored:
        safe = row.get("safeRawScore") is not None
        if not safe:
            continue
        safe_high = bool(row["safeRawScore"] >= SAFE_THRESHOLD)
        ces_high = bool(row["cesSHigh"])
        if row["truthLabel"] == 1:
            if safe_high and not ces_high:
                rescue["safeCorrectCesSWrong"] += 1
            elif not safe_high and ces_high:
                rescue["cesSUniqueCorrect"] += 1
            elif safe_high and ces_high:
                rescue["bothCorrect"] += 1
            else:
                rescue["bothWrong"] += 1
        else:
            if safe_high and not ces_high:
                rescue["safeFalsePositiveCesSNegative"] += 1
            elif not safe_high and ces_high:
                rescue["cesSFalsePositiveSafeNegative"] += 1
    output = {
        "schemaVersion": "lythaus-wp007k-ces-s-evaluation-v1",
        "modelSha256": sha256_file(args.model),
        "featureSha256": sha256_file(args.features),
        "model": model,
        "overall": overall,
        "groups": groups,
        "uniqueRescue": rescue,
        "recordCount": len(scored),
        "confirmationUntuned": True,
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
        "records": scored if args.include_records else [],
    }
    write_json(args.output, output)
    print(json.dumps({"overall": overall, "uniqueRescue": rescue, "records": len(scored)}))


def shortcut_audit(args: argparse.Namespace) -> None:
    payload = read_json(args.development)
    rows = payload.get("rows", payload.get("records", []))
    output: dict[str, Any] = {"schemaVersion": "lythaus-wp007k-feature-shortcut-audit-v1", "features": {}, "categoricalAssociations": {}, "flux2PixelAccess": False, "flux2ProviderCalls": 0}
    labels = np.asarray([row["truthLabel"] for row in rows], dtype=float)
    for feature in CONTENT_FEATURES:
        values = np.asarray([float(row["features"].get(feature, 0.0)) for row in rows], dtype=float)
        output["features"][feature] = {
            "truthPearson": float(np.corrcoef(values, labels)[0, 1]) if np.std(values) and np.std(labels) else 0.0,
            "meanByLabel": {str(label): float(np.mean(values[labels == label])) for label in [0, 1] if np.any(labels == label)},
            "stdByLabel": {str(label): float(np.std(values[labels == label])) for label in [0, 1] if np.any(labels == label)},
        }
    for field in ["encoderRole", "encoder", "operation", "requestedQuality", "requestedSubsampling", "generatorFamily", "sourceSubtype"]:
        groups: dict[str, list[int]] = defaultdict(list)
        for row in rows:
            groups[str(row.get(field))].append(row["truthLabel"])
        output["categoricalAssociations"][field] = {key: {"count": len(values), "positiveRate": float(np.mean(values))} for key, values in sorted(groups.items())}
    write_json(args.output, output)
    print(json.dumps({"features": len(CONTENT_FEATURES), "categoricals": len(output["categoricalAssociations"])}))


def applicability(codec: dict[str, Any], known_lineage: bool = False) -> dict[str, Any]:
    fmt = str(codec.get("format") or "UNKNOWN").upper()
    if not fmt:
        return {"state": "UNKNOWN", "reasons": ["FORMAT_UNKNOWN"]}
    if fmt == "JPEG":
        quality = codec.get("estimatedQuality")
        sampling = codec.get("sampling")
        if quality is not None and quality <= 97:
            return {"state": "UNSUPPORTED", "reasons": ["JPEG_DQT_SEVERITY_BELOW_FROZEN_BOUNDARY"]}
        if sampling in {"4:2:0", "4:2:2"}:
            return {"state": "LIMITED", "reasons": ["CHROMA_SUBSAMPLING_REDUCES_PIXEL_FORENSIC_AUTHORITY"]}
        return {"state": "LIMITED", "reasons": ["JPEG_HISTORY_NOT_PROVABLE"]}
    if fmt == "PNG":
        return {"state": "LIMITED", "reasons": ["PNG_CURRENT_BYTES_LOSSLESS_BUT_PRIOR_JPEG_HISTORY_UNPROVABLE"]}
    return {"state": "UNKNOWN", "reasons": ["FORMAT_NOT_VALIDATED"]}


def ces_e(args: argparse.Namespace) -> None:
    payload = read_json(args.features)
    rows = payload.get("records", payload.get("rows", []))
    output_rows = []
    for row in rows:
        state = applicability(row.get("codecFacts", {}))
        output_rows.append({"recordId": row["recordId"], "format": row.get("codecFacts", {}).get("format"), "codecFacts": row.get("codecFacts", {}), "safeApplicability": state["state"], "reasons": state["reasons"], "truthLabel": row["truthLabel"], "operation": row["operation"], "encoder": row.get("encoder"), "sourceFamilyId": row["sourceFamilyId"]})
    output = {"schemaVersion": "lythaus-wp007k-ces-e-results-v1", "role": "EF1_EF4_INPUT_REGIME_CONTEXT", "cannotEmitAuthenticity": True, "records": output_rows, "stateCounts": dict(Counter(row["safeApplicability"] for row in output_rows)), "flux2PixelAccess": False, "flux2ProviderCalls": 0}
    write_json(args.output, output)
    print(json.dumps({"records": len(output_rows), "states": output["stateCounts"]}))


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("build-cohorts")
    p.add_argument("--repo-root", type=Path, required=True)
    p.add_argument("--controlled-manifest", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    p.set_defaults(func=build_cohorts)
    p = sub.add_parser("prepare-development")
    p.add_argument("--phase-results", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    p.set_defaults(func=prepare_development)
    p = sub.add_parser("materialize-pillow")
    p.add_argument("--base-manifest", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    p.set_defaults(func=materialize_pillow)
    p = sub.add_parser("extract-features")
    p.add_argument("--manifest", type=Path, required=True)
    p.add_argument("--root", action="append", default=[])
    p.add_argument("--safe-root", type=Path)
    p.add_argument("--checkpoint", type=Path)
    p.add_argument("--reuse-safe", type=Path)
    p.add_argument("--output", type=Path, required=True)
    p.set_defaults(func=extract_features)
    p = sub.add_parser("fit")
    p.add_argument("--development", type=Path, required=True)
    p.add_argument("--feature-set", choices=sorted(FEATURE_SETS), default="content")
    p.add_argument("--encoder")
    p.add_argument("--output", type=Path, required=True)
    p.set_defaults(func=fit)
    p = sub.add_parser("evaluate")
    p.add_argument("--model", type=Path, required=True)
    p.add_argument("--features", type=Path, required=True)
    p.add_argument("--group-by", default="generatorFamily")
    p.add_argument("--include-records", action="store_true")
    p.add_argument("--output", type=Path, required=True)
    p.set_defaults(func=evaluate)
    p = sub.add_parser("shortcut-audit")
    p.add_argument("--development", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    p.set_defaults(func=shortcut_audit)
    p = sub.add_parser("ces-e")
    p.add_argument("--features", type=Path, required=True)
    p.add_argument("--output", type=Path, required=True)
    p.set_defaults(func=ces_e)
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
