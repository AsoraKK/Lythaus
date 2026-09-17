"""Create the immutable R1 research calibration freeze."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


PARENT_SHA = "5a6231c6f8ede3de5e117ed3692bcf493f0c1a1c"
HOLDOUT_SHA = "56ae0bd15b8bc21d77b28c9e6faea8149440aab8a9d101db523a43aedb98e054"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    root = args.root
    selection = json.loads((root / "calibrator-selection.json").read_text(encoding="utf-8"))
    folds = json.loads((root / "calibrator-fold-results.json").read_text(encoding="utf-8"))
    confirmation = json.loads((root / "modern-confirmation.json").read_text(encoding="utf-8"))
    transformations = json.loads((root / "transformation-results.json").read_text(encoding="utf-8"))
    selected = selection.get("selectedCalibrator")
    if selected != "G2_TWO_TAIL_GROUPED_V0":
        raise RuntimeError("R1_EXPECTED_G2_SELECTION")
    if folds.get("candidateResults", {}).get(selected, {}).get("stageGate", {}).get("passes") is not True:
        raise RuntimeError("R1_DEV_STAGE_GATE_NOT_PASSED")
    model = selection["refit"]
    freeze = {
        "schemaVersion": "lythaus-wp007g-r1-modern-calibration-freeze-v1",
        "freezeStatus": "RESEARCH_ONLY_CONFIRMATION_GATE_FAILED",
        "parentSha": PARENT_SHA,
        "wp007gHistoricalReportPreserved": True,
        "modernDataFreezeSha256": sha256_file(root / "modern-generator-data-freeze.json"),
        "forbiddenGeneratorFamiliesSha256": sha256_file(root / "forbidden-generator-families.json"),
        "negativeDataFreezeSha256": sha256_file(root / "negative-data-freeze.json"),
        "rawModernScoresSha256": sha256_file(root / "raw-modern-scores.json"),
        "foldResultsSha256": sha256_file(root / "calibrator-fold-results.json"),
        "selectionSha256": sha256_file(root / "calibrator-selection.json"),
        "ufdInversionAnalysisSha256": sha256_file(root / "ufd-inversion-analysis.json"),
        "confirmationSha256": sha256_file(root / "modern-confirmation.json"),
        "transformationResultsSha256": sha256_file(root / "transformation-results.json"),
        "holdoutProvenance": {
            "flux1": "CONSUMED_MODERN_GENERATOR_POSTHOC_ONLY",
            "flux2": "SEALED_FUTURE_RESERVE",
            "flux2FutureReserveFreezeSha256": HOLDOUT_SHA,
            "flux2PublicBenchmarkPixelsAccessed": False,
            "flux2ProviderCalls": 0,
        },
        "detectors": {
            "SPAI_C512": {"checkpointSha256": "24159f27d7c8c2cd0cb6c4019189eb89ad0874a0d9d15f8dc9afd39ca9648a55", "correlationGroup": "SPAI_SPECTRAL"},
            "RINE": {"checkpointSha256": "13986ffc86e1bd9d57fd640f891358c4f14c0f8aea8e590e52c598541f69fdc1", "correlationGroup": "CLIP_GENERATIVE"},
            "UFD": {"checkpointSha256": "477100745713bcc957beb2b40859536859b6483fd6301b3b9293151b194c7847", "correlationGroup": "CLIP_GENERATIVE", "status": "SHADOW_ONLY"},
            "SAFE": {"checkpointSha256": "b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e", "upstreamSha": "4e998724651b227def64f5be0cd60c0aa1552c35", "correlationGroup": "SAFE_TRANSFORMATION_RESNET"},
        },
        "selectedCalibrator": {
            "candidateId": selected,
            "features": model["featureNames"],
            "coefficients": model["coefficients"],
            "intercept": model["intercept"],
            "thresholds": model["thresholds"],
            "cdfNegativeRole": "NEGATIVE_CALIBRATION_G_ONLY",
            "trainingPositiveRole": "MODERN_SYNTH_DEV",
            "trainingNegativeRole": "NEGATIVE_DEV_G",
            "correlationDiscipline": "RINE_AND_UFD_GROUPED_BY_MAX_TAIL_WITH_BOUNDED_BOTH_CORROBORATION",
        },
        "modernFamilies": {
            "dev": ["BAGEL", "BLIP3o-4B", "FLUX.1-dev", "FLUX.1-schnell", "HiDream-I1", "Janus-Pro-1B", "PixArt-Sigma", "Qwen-Image"],
            "confirm": ["GPT-4o", "HunyuanImage-3.0", "SD-3.5-Medium", "Z-Image"],
            "reserve": ["Gemini-2.5-Flash", "GPT-Image-1.5"],
        },
        "confirmation": {
            "opened": True,
            "passed": False,
            "reason": "VERY_HIGH pooled negative FPR exceeded the predeclared 0.02 gate",
            "metrics": confirmation["metrics"]["bands"],
        },
        "reserve": {"opened": False, "reason": "confirmation gate failed; reserve remains unopened"},
        "transformationStress": {
            "classification": transformations["classification"],
            "rule": transformations["classificationRule"],
        },
        "posthocPolicy": "FLUX1 diagnostic permitted after this freeze; no fitting or tuning on FLUX1; FLUX2 remains sealed",
        "deployableModernFamilies": [],
        "deploymentStatus": "NO_DEPLOYABLE_MODERN_CALIBRATION_RIGHTS_ESTABLISHED",
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(freeze, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"sha256": sha256_file(args.output), "candidate": selected, "freezeStatus": freeze["freezeStatus"]}))


if __name__ == "__main__":
    main()
