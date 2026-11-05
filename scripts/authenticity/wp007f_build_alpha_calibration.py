"""Build the immutable WP007F research calibration/policy record."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


BASE_SHA = "611b0b006a5ea66ef1f7369255a6e3f19951a6e7"
HOLDOUT_SHA = "b1be6115a6ed3cb5d72c5ad3e90575ededbb4c969bd2bb248ec2806da32885c4"
FLUX2_FREEZE_SHA = "56ae0bd15b8bc21d77b28c9e6faea8149440aab8a9d101db523a43aedb98e054"
SPAI_SHA = "24159f27d7c8c2cd0cb6c4019189eb89ad0874a0d9d15f8dc9afd39ca9648a55"
UFD_SHA = "477100745713bcc957beb2b40859536859b6483fd6301b3b9293151b194c7847"
RINE_SHA = "13986ffc86e1bd9d57fd640f891358c4f14c0f8aea8e590e52c598541f69fdc1"


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def compact_metric(item: dict, prefix: str) -> dict:
    return {
        "count": item[f"{prefix}Count"],
        "total": item[f"{prefix}Total"],
        "rate": item[f"{prefix}Rate"],
        "wilson95": item[f"{prefix}Wilson95"],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--curves", type=Path, required=True)
    parser.add_argument("--profiles", type=Path, required=True)
    parser.add_argument("--confirmation", type=Path, required=True)
    parser.add_argument("--transforms", type=Path, required=True)
    parser.add_argument("--fusion", type=Path, required=True)
    parser.add_argument("--nuisance", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    curves = load(args.curves)
    profiles = load(args.profiles)
    confirmation = load(args.confirmation)
    transforms = load(args.transforms)
    fusion = load(args.fusion)
    nuisance = load(args.nuisance)
    profile_by_id = {item["detectorId"]: item for item in profiles["profiles"]}
    confirmation_by_id = {item["detectorId"]: item for item in confirmation["results"]}
    curve_by_id = {item["detectorId"]: item for item in curves["detectors"]}
    nuisance_by_id = {item["detectorId"]: item for item in nuisance["detectors"]}
    detector_ids = ["SPAI_C512", "UNIVERSAL_FAKE_DETECT", "RINE"]
    detector_records = []
    for detector_id in detector_ids:
        curve = curve_by_id[detector_id]
        action = next(item for item in curve["curves"] if item["targetOverallNegativeFpr"] == 0.01)
        confirm = confirmation_by_id[detector_id]
        detector_records.append({
            "detectorId": detector_id,
            "checkpointSha256": {"SPAI_C512": SPAI_SHA, "UNIVERSAL_FAKE_DETECT": UFD_SHA, "RINE": RINE_SHA}[detector_id],
            "profileVersion": profile_by_id[detector_id]["profileVersion"],
            "scoreDirection": profile_by_id[detector_id]["scoreDirection"],
            "developmentActionPointTargetOverallFpr": action["targetOverallNegativeFpr"],
            "developmentActionThreshold": action["threshold"],
            "developmentActionMetrics": {
                "cameraFpr": action["cameraFpr"],
                "digitalFpr": action["digitalFpr"],
                "overallNegativeFpr": action["overallNegativeFpr"],
                "syntheticRecall": action["syntheticRecall"],
            },
            "confirmationMetricsAtFrozenDevelopmentThreshold": {
                "cameraFpr": confirm["cameraConfirmFpr"],
                "digitalFpr": confirm["digitalConfirmFpr"],
                "overallNegativeFpr": confirm["overallConfirmFpr"],
                "syntheticRecall": confirm["syntheticConfirmRecall"],
            },
            "runtimeSeconds": confirm["runtimeSeconds"],
            "qualificationClass": "QUALIFIED_SUPPORT_ONLY" if detector_id in {"SPAI_C512", "RINE"} else "SHADOW_ONLY",
            "shortcutAudit": {
                "nonCameraConfounding": nuisance_by_id[detector_id]["nonCameraConfounding"],
                "sourceDatasetShortcutRisk": nuisance_by_id[detector_id]["sourceDatasetShortcutRisk"],
                "overallShortcutRisk": nuisance_by_id[detector_id]["overallShortcutRisk"],
            },
            "deploymentRights": "NOT_CONFIRMED_FOR_PRODUCT_DEPLOYMENT",
        })

    output = {
        "schemaVersion": "lythaus-wp007f-alpha-calibration-freeze-v1",
        "workPackage": "WP007F",
        "baseSha": BASE_SHA,
        "scoreBlindBeforeFinalExam": True,
        "flux1PixelAccessBeforeFinalExam": False,
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
        "holdoutFreezeSha256": HOLDOUT_SHA,
        "flux2ReserveFreezeSha256": FLUX2_FREEZE_SHA,
        "compilerVersion": "lythaus-synthetic-evidence-compiler-v1",
        "detectorContractVersion": "lythaus-authenticity-detectors-v1",
        "alphaPolicyVersion": "lythaus-authenticity-alpha-policy-v1",
        "defaultMode": "SHADOW",
        "detectors": detector_records,
        "correlationGroups": {
            "SPAI_SPECTRAL": {"members": ["SPAI_C512"], "capPoints": 35},
            "CLIP_GENERATIVE": {"members": ["UNIVERSAL_FAKE_DETECT", "RINE"], "capPoints": 35, "independence": "CORRELATED_NOT_TWO_INDEPENDENT_FAMILIES"},
        },
        "fusionRule": {
            "numericScore": "sum of capped correlation-group contributions; lead calibrated strength plus 0.15 bounded corroboration within each group",
            "moderationExcluded": True,
            "moondreamAdvisoryOnly": True,
            "gptOssAdvisoryOnly": True,
            "cameraSyntheticAxesIndependent": True,
            "aiGeneratedRule": "VERY_HIGH synthetic evidence from at least two distinct evidence families, or reliable explicit synthetic provenance plus corroborating detector evidence",
            "singleDetectorRule": "single detector evidence cannot independently trigger AI-generated; route to Under review",
        },
        "operatingCurveArtifact": str(args.curves.name),
        "transformationArtifact": str(args.transforms.name),
        "transformationResult": "MIXED_SMALL_N_FIXED_AUDIT",
        "fusionMetrics": [item for item in fusion["results"] if item["stage"] == "dev" or item["rule"] == "SPAI_AND_ANY_CLIP"],
        "nuisanceAuditArtifact": str(args.nuisance.name),
        "rightsBoundary": "Research evaluation completed; product deployment requires separate checkpoint/underlying CLIP terms review and authenticated infrastructure pricing/access.",
        "finalExamGate": {
            "requiresThisFreeze": True,
            "oneTimeFlux1Only": True,
            "flux1GeneratorFamily": "FLUX.1",
            "flux2RemainsSealed": True,
            "noPostExamTuning": True,
        },
        "security": {
            "secretsStored": False,
            "rawImageBytesStored": False,
            "absolutePrivatePathsStored": False,
            "enforcementAuthority": "NONE",
        },
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"sha256": hashlib.sha256(args.output.read_bytes()).hexdigest(), "detectors": detector_ids}))


if __name__ == "__main__":
    main()
