"""Write hash-bound WP007I protocol and evidence-contract artifacts."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any


def load(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--spai-scores", type=Path)
    args = parser.parse_args()
    research = args.root / "research" / "wp007i"

    named = [
        "experiment-plan.json",
        "forbidden-generator-families.json",
        "negative-data-freeze.json",
        "fresh-synthetic-freeze.json",
        "data-role-freeze.json",
        "applicability-policy.json",
        "safe-freeze-reference.json",
        "applicability-confirmation-result.json",
        "safe-original-scores.json",
        "safe-transformation-scores.json",
        "safe-qualification-result.json",
        "fresh-synthetic-result.json",
        "negative-qualification-result.json",
        "safe-input-regime-report.json",
        "safe-transformation-result.json",
        "selective-policy-comparison.json",
        "false-positive-analysis.json",
        "false-negative-analysis.json",
        "shadow-supporter-scores.json",
        "shadow-supporter-analysis.json",
        "safe-selective-evidence-contract.json",
        "flux1-posthoc-risk.json",
        "applicability-policy-freeze.json",
        "qualification-gate-assessment.json",
        "storage-delta.json",
    ]
    if args.spai_scores is not None:
        named.append(args.spai_scores.name)
    files = {name: sha256_file(research / name) for name in named if (research / name).exists()}
    plan = load(research / "experiment-plan.json")
    policy = load(research / "applicability-policy.json")
    write_json(research / "applicability-policy-freeze.json", {
        "schemaVersion": "lythaus-wp007i-applicability-policy-freeze-v1",
        "policyVersion": policy["policyVersion"],
        "policySha256": policy["policySha256"],
        "policyFileSha256": files["applicability-policy.json"],
        "frozenBeforeConfirmationScoring": True,
        "usesSafeScore": False,
        "usesGroundTruth": False,
        "states": policy["states"],
        "logic": policy["logic"],
        "limitations": policy["limitations"],
    })
    write_json(research / "safe-selective-evidence-contract.json", {
        "schemaVersion": "lythaus-wp007i-safe-selective-evidence-v1",
        "policyVersion": "WP007I_SAFE_POSITIVE_ONLY_APPLICABILITY_V1",
        "detectorId": "SAFE",
        "checkpointSha256": "b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e",
        "preprocessingVersion": "SAFE_OFFICIAL_RGB_CENTER_CROP_256_DWT_CLASS1_V1",
        "frozenThreshold": 0.5864923000335693,
        "fields": [
            "contentSha256", "detectorId", "artifactHash", "preprocessingVersion", "rawScore",
            "frozenThreshold", "resolution", "evidenceLevel", "applicability", "applicabilityReasons",
            "inputRegime", "encodingFacts", "modelStatus", "runtimeMs", "transformationContext",
            "evidenceSchemaVersion", "policyVersion", "timestamp",
        ],
        "semantics": {
            "highScore": "positive synthetic-origin EF3 evidence only",
            "lowScoreSupportedRegime": "low synthetic evidence; never human authorship",
            "lowScoreDegradedRegime": "inconclusive due to input regime",
            "missingOrTimeout": "model unavailable; never negative evidence",
            "cameraConflict": "preserve EF2 and EF3 as independent axes",
        },
        "publicViewOmits": ["rawScore", "internalArtifactDiagnostics"],
        "productionAuthorization": "NO",
    })
    write_json(research / "flux1-posthoc-risk.json", {
        "schemaVersion": "lythaus-wp007i-flux1-posthoc-risk-v1",
        "status": "CONSUMED_POSTHOC_DIAGNOSTIC_ONLY",
        "newPixelAccess": False,
        "newInference": False,
        "tuningPermitted": False,
        "publicFluxMedianSafeScore": 0.9487,
        "cloudflareConsumedMedianSafeScore": 0.0466,
        "publicHighCount": 39,
        "cloudflareHighCount": 0,
        "dimensionMatchingExplainedOnlyPartOfGap": True,
        "interpretation": "UNRESOLVED_DOMAIN_OR_PIPELINE_SHIFT",
        "source": "WP007H preserved diagnostic; not a WP007I confirmation set.",
    })
    qualification = load(research / "safe-qualification-result.json")
    applicability = load(research / "safe-input-regime-report.json")["applicability"]
    transformations = load(research / "safe-transformation-result.json")["results"]
    negative = qualification["original"]["overall"]
    synthetic = qualification["original"]["byGeneratorFamily"]
    destructive = ["JPEG95", "JPEG85", "JPEG75", "RESIZE50"]
    destructive_numerator = sum(transformations[name]["count"] * 0 + sum(transformations[name]["applicabilityStates"].get(state, 0) for state in ("DEGRADED", "UNSUPPORTED", "UNKNOWN")) for name in destructive)
    destructive_denominator = sum(transformations[name]["count"] for name in destructive)
    write_json(research / "qualification-gate-assessment.json", {
        "schemaVersion": "lythaus-wp007i-qualification-gate-assessment-v1",
        "safePositiveSpecialistSignal": True,
        "syntheticOriginalCount": sum(item["denominator"] for item in (value["recall"] for value in synthetic.values())),
        "syntheticFamilyRecall": {name: value["recall"] for name, value in synthetic.items()},
        "negativeOverallFpr": negative["fpr"],
        "negativeFprTargetUpperBoundOnePercentDemonstrated": negative["fpr"]["upper"] <= 0.01,
        "populationFprClaim": "FPR_TARGET_NOT_YET_DEMONSTRATED",
        "applicabilityOriginalSupportedCoverage": applicability["originalSupportedCoverage"],
        "applicabilityOriginalFalseDowngrade": applicability["originalFalseDowngrade"],
        "applicabilityDestructiveDetection": {
            "numerator": destructive_numerator,
            "denominator": destructive_denominator,
            "rate": destructive_numerator / destructive_denominator if destructive_denominator else None,
            "resize50Detected": transformations["RESIZE50"]["applicabilityStates"].get("DEGRADED", 0) > 0,
        },
        "p2SemanticBenefit": "P2 converts low SAFE scores on detected JPEG degradation to inconclusive; original-byte metrics are unchanged.",
        "safeThresholdImmutable": True,
        "supportersCanChangeQualification": False,
        "flux1Role": "POSTHOC_DIAGNOSTIC_ONLY",
        "flux2PixelAccess": False,
        "primaryDisposition": "SAFE_POSITIVE_SPECIALIST_QUALIFIED_APPLICABILITY_GATE_UNPROVEN",
        "productionAuthorization": "NO",
    })
    files = {name: sha256_file(research / name) for name in named if (research / name).exists()}
    write_json(research / "protocol-hashes.json", {
        "schemaVersion": "lythaus-wp007i-protocol-hashes-v1",
        "parentSha": plan["parentSha"],
        "planSha256": plan["planSha256"],
        "files": files,
        "applicabilityPolicyFreezeSha256": sha256_file(research / "applicability-policy-freeze.json"),
        "negativeMembershipFrozenBeforeScoring": True,
        "syntheticMembershipFrozenBeforeScoring": True,
        "confirmationCannotFitThreshold": True,
        "confirmationCannotFitApplicability": True,
        "flux1PosthocOnly": True,
        "flux2PublicBenchmarkPixelsAccessed": False,
        "flux2ProviderCalls": 0,
        "flux2PixelAccess": False,
    })
    print(json.dumps({"files": files, "planSha256": plan["planSha256"]}, sort_keys=True))


if __name__ == "__main__":
    main()
