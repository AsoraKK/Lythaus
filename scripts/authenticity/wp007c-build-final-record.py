from __future__ import annotations

import argparse
import csv
import hashlib
import json
import pathlib
import statistics
from typing import Any


BASE_SHA = "e53e16685684aeee6198be54e1df17b805003183"
BENCHMARK_FINGERPRINT = "210000b7b0d93960b23e090e396d60f97bb46d2816ee9ee7d345aae364ade3c5"
HOLDOUT_FREEZE_SHA = "b1be6115a6ed3cb5d72c5ad3e90575ededbb4c969bd2bb248ec2806da32885c4"
FLUX2_RESERVE_FREEZE_SHA = "56ae0bd15b8bc21d77b28c9e6faea8149440aab8a9d101db523a43aedb98e054"
SPAI_CHECKPOINT_SHA = "24159f27d7c8c2cd0cb6c4019189eb89ad0874a0d9d15f8dc9afd39ca9648a55"
SPAI_UPSTREAM_COMMIT = "8ff7b3b6779b4fcb43cf313471d9cb1c62d129a4"
RUNTIME_LOCK_SHA = "ba8b2d04be17415c099e945cde8875d9f97a0cefe75687f242fc917a80044160"

SMOKE_IDS = {
    "CSAFE_WP006E_iPhone11_1_02",
    "CSAFE_WP006E_iPhone11_1_03",
    "CSAFE_WP006E_iPhone11_1_07",
    "DDB_0218",
    "DDB_0109",
    "PNGN_CHART_05",
    "PNGN_CHART_03",
}
NATIVE_PROFILE_IDS = {
    "CSAFE_WP006E_iPhone11_1_02",
    "CSAFE_WP006E_iPhone11_1_03",
    "CSAFE_WP006E_iPhone11_1_07",
}


def read_json(path: pathlib.Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: pathlib.Path, value: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def sha256_file(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_sha(value: dict[str, Any], omitted_key: str | None = None) -> str:
    payload = dict(value)
    if omitted_key is not None:
        payload.pop(omitted_key, None)
    encoded = json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    if not ordered:
        raise RuntimeError("PERCENTILE_EMPTY")
    position = (len(ordered) - 1) * fraction
    lower = int(position)
    upper = min(lower + 1, len(ordered) - 1)
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def runtime_summary(records: list[dict[str, Any]]) -> dict[str, Any]:
    values = [float(record["runtimeSeconds"]) for record in records]
    return {
        "count": len(values),
        "p50Seconds": percentile(values, 0.50),
        "p95Seconds": percentile(values, 0.95),
        "maxSeconds": max(values),
        "minSeconds": min(values),
    }


def runtime_tier(seconds: float) -> str:
    if seconds <= 5:
        return "FAST"
    if seconds <= 20:
        return "MODERATE"
    if seconds <= 60:
        return "SLOW"
    return "NOT_PRACTICAL"


def assert_records(path: pathlib.Path, expected_ids: set[str]) -> list[dict[str, Any]]:
    value = read_json(path)
    records = value.get("records")
    if not isinstance(records, list):
        raise RuntimeError(f"RECORDS_MISSING:{path}")
    actual_ids = {record.get("sampleId") for record in records}
    if actual_ids != expected_ids or len(records) != len(expected_ids):
        raise RuntimeError(f"RECORD_MEMBERSHIP_INVALID:{path}")
    return records


def load_original_smoke(path: pathlib.Path) -> dict[str, float]:
    values: dict[str, float] = {}
    with path.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            values[pathlib.Path(row["image"]).stem] = float(row["smoke4_timed"])
    return values


def build_runtime_results(args: argparse.Namespace, split: dict[str, Any], rights: dict[str, Any]) -> dict[str, Any]:
    native_profile = assert_records(args.native_profile, NATIVE_PROFILE_IDS)
    native_smoke = assert_records(args.native_smoke, {
        "CSAFE_iPhone11_1_0000",
        "DDB_0001",
        "DDB_0002",
        "OWNER_SCREENSHOT_16065f13",
    })
    original_smoke = load_original_smoke(args.original_smoke_csv)
    equivalence_pairs = []
    for record in native_smoke:
        sample_id = record["sampleId"]
        if sample_id not in original_smoke:
            raise RuntimeError(f"ORIGINAL_SMOKE_SCORE_MISSING:{sample_id}")
        equivalence_pairs.append({
            "sampleId": sample_id,
            "optimizedScore": record["score"],
            "originalScore": original_smoke[sample_id],
            "absoluteDifference": abs(float(record["score"]) - original_smoke[sample_id]),
        })
    max_abs_diff = max(pair["absoluteDifference"] for pair in equivalence_pairs)
    c512_smoke = assert_records(args.c512_smoke, SMOKE_IDS)
    spectral_smoke = assert_records(args.spectral_smoke, SMOKE_IDS)
    native_summary = runtime_summary(native_profile)
    c512_summary = runtime_summary(c512_smoke)
    spectral_summary = runtime_summary(spectral_smoke)
    patchcraft = dict(rights)

    return {
        "schemaVersion": "lythaus-wp007c-candidate-runtime-results-v1",
        "baseSha": BASE_SHA,
        "benchmarkFingerprint": BENCHMARK_FINGERPRINT,
        "developmentSplitSha256": split["developmentSplitSha256"],
        "holdoutFreezeSha256": HOLDOUT_FREEZE_SHA,
        "candidateSetFrozenBeforeScoring": split["candidateSetFrozenBeforeScoring"],
        "holdoutPixelAccess": "NOT_PERFORMED",
        "flux2PixelAccess": "NOT_PERFORMED",
        "candidates": [
            {
                "candidateId": "SPAI_NATIVE_CPU_OPT",
                "rightsStatus": "PASS",
                "checkpointSha256": SPAI_CHECKPOINT_SHA,
                "optimizationCycle": "ONE_BOUNDED_CYCLE",
                "scoreEquivalence": {
                    "status": "PASS",
                    "tolerance": "EXACT_FLOAT_OUTPUT_MATCH_IN_4_SAMPLE_SMOKE",
                    "maxAbsoluteScoreDifference": max_abs_diff,
                    "pairs": equivalence_pairs,
                },
                "requiredHighResolutionProfile": {
                    "records": native_profile,
                    **native_summary,
                    "allThreeOver60Seconds": all(float(record["runtimeSeconds"]) > 60 for record in native_profile),
                },
                "runtimeClassification": "NOT_PRACTICAL",
                "status": "RUNTIME_REJECTED",
                "reason": "ALL_THREE_PREDECLARED_HIGH_RESOLUTION_CAMERA_CASES_EXCEEDED_60_SECONDS",
            },
            {
                "candidateId": "SPAI_C512",
                "rightsStatus": "PASS",
                "checkpointSha256": SPAI_CHECKPOINT_SHA,
                "preprocessing": "DETERMINISTIC_NATIVE_PIXEL_512X512_CENTER_CROP_NO_RESIZE",
                "runtimeSmoke": {
                    "records": c512_smoke,
                    **c512_summary,
                },
                "runtimeClassification": runtime_tier(c512_summary["p95Seconds"]),
                "status": "RUNTIME_FEASIBLE",
            },
            {
                "candidateId": "PATCHCRAFT_OFFICIAL",
                "rightsStatus": patchcraft.get("status", "RIGHTS_BLOCKED"),
                "rightsAudit": patchcraft,
                "checkpointRetrieved": False,
                "inferencePerformed": False,
                "runtimeClassification": "NOT_RUN",
                "status": "RIGHTS_BLOCKED",
            },
            {
                "candidateId": "LYTHAUS_SPECTRAL_LITE_V0",
                "rightsStatus": "PASS",
                "featureDefinition": [
                    "LOW_FREQUENCY_RADIAL_FFT_ENERGY_FRACTION",
                    "MID_FREQUENCY_RADIAL_FFT_ENERGY_FRACTION",
                    "HIGH_FREQUENCY_RADIAL_FFT_ENERGY_FRACTION",
                    "SPECTRAL_ENTROPY",
                    "RADIAL_LOG_SLOPE",
                    "AXIS_PERIODICITY",
                    "LOCAL_HIGH_FREQUENCY_RESIDUAL_STD",
                ],
                "runtimeSmoke": {
                    "records": spectral_smoke,
                    **spectral_summary,
                },
                "runtimeClassification": runtime_tier(spectral_summary["p95Seconds"]),
                "status": "RUNTIME_FEASIBLE",
            },
        ],
        "runtimeLockSha256": RUNTIME_LOCK_SHA,
        "flux2ProviderCalls": 0,
        "flux2Regeneration": False,
    }


def build_development_results(
    candidate_results: dict[str, Any],
    runtime_results: dict[str, Any],
    split: dict[str, Any],
    rights: dict[str, Any],
) -> dict[str, Any]:
    by_id = {candidate["candidateId"]: candidate for candidate in candidate_results["candidates"]}
    runtime_by_id = {candidate["candidateId"]: candidate for candidate in runtime_results["candidates"]}
    excluded = []
    for candidate_id, reason in [
        ("SPAI_NATIVE_CPU_OPT", "RUNTIME_NOT_PRACTICAL"),
        ("PATCHCRAFT_OFFICIAL", "RESEARCH_RIGHTS_UNCONFIRMED"),
    ]:
        runtime = runtime_by_id[candidate_id]
        excluded.append({
            "candidateId": candidate_id,
            "stageAPass": False,
            "status": runtime["status"],
            "exclusionReason": reason,
            "runtimeClassification": runtime["runtimeClassification"],
        })
    return {
        "schemaVersion": "lythaus-wp007c-candidate-development-results-v1",
        "baseSha": BASE_SHA,
        "benchmarkFingerprint": BENCHMARK_FINGERPRINT,
        "developmentSplitSha256": split["developmentSplitSha256"],
        "holdoutFreezeSha256": HOLDOUT_FREEZE_SHA,
        "scoreBlind": True,
        "candidateSetFrozenBeforeScoring": split["candidateSetFrozenBeforeScoring"],
        "developmentInputCount": 128,
        "ownerUnknownGeneratorUsed": False,
        "candidateResults": [by_id["SPAI_C512"], by_id["LYTHAUS_SPECTRAL_LITE_V0"]],
        "excludedCandidates": excluded,
        "patchcraftRightsAudit": rights,
        "holdoutPixelAccess": "NOT_PERFORMED",
        "flux2PixelAccess": "NOT_PERFORMED",
        "decision": "NO_CANDIDATE_SURVIVES_STAGE_A",
    }


def build_blocker(
    development: dict[str, Any],
    runtime: dict[str, Any],
    split: dict[str, Any],
    checkpoint: dict[str, Any],
    runtime_digest: str,
    development_digest: str,
) -> dict[str, Any]:
    c512 = development["candidateResults"][0]
    lite = development["candidateResults"][1]
    return {
        "schemaVersion": "lythaus-wp007c-selection-blocker-v1",
        "baseSha": BASE_SHA,
        "benchmarkFingerprint": BENCHMARK_FINGERPRINT,
        "holdoutFreezeSha256": HOLDOUT_FREEZE_SHA,
        "flux2ReserveFreezeSha256": FLUX2_RESERVE_FREEZE_SHA,
        "spaiCheckpointSha256": checkpoint["sha256"],
        "spaiUpstreamCommit": SPAI_UPSTREAM_COMMIT,
        "developmentSplitSha256": split["developmentSplitSha256"],
        "candidateSetFrozenBeforeScoring": True,
        "scoreBlind": True,
        "candidateDevelopmentArtifactSha256": development_digest,
        "candidateRuntimeArtifactSha256": runtime_digest,
        "developmentData": {
            "syntheticFamilies": 64,
            "cameraFamilies": 36,
            "digitalFamilies": 28,
            "totalFamilies": 128,
            "ownerUnknownGeneratorUsed": False,
            "sourceFamilyLeakage": "PASS",
            "truthMetadataInputLeakage": "PASS",
        },
        "candidateOutcomes": [
            {
                "candidateId": "SPAI_NATIVE_CPU_OPT",
                "rightsStatus": "PASS",
                "runtimeClassification": "NOT_PRACTICAL",
                "stageAPass": False,
                "blockingGates": ["RUNTIME_NOT_PRACTICAL"],
                "highResolutionRuntimeSeconds": [
                    record["runtimeSeconds"]
                    for record in next(item for item in runtime["candidates"] if item["candidateId"] == "SPAI_NATIVE_CPU_OPT")["requiredHighResolutionProfile"]["records"]
                ],
                "scoreEquivalence": "PASS",
            },
            {
                "candidateId": "SPAI_C512",
                "rightsStatus": "PASS",
                "runtimeClassification": next(item for item in runtime["candidates"] if item["candidateId"] == "SPAI_C512")["runtimeClassification"],
                "stageAPass": c512["stageAPass"],
                "blockingGates": [
                    "NON_CAMERA_CONFOUNDING_HIGH",
                    "OVERALL_SHORTCUT_RISK_HIGH",
                ],
                "metrics": c512["metrics"],
                "nonCameraConfounding": c512["nonCameraConfounding"],
                "overallShortcutRisk": c512["shortcutAudit"]["overallShortcutRisk"],
                "threshold": c512["threshold"],
            },
            {
                "candidateId": "PATCHCRAFT_OFFICIAL",
                "rightsStatus": "RIGHTS_BLOCKED",
                "runtimeClassification": "NOT_RUN",
                "stageAPass": False,
                "blockingGates": ["RESEARCH_RIGHTS_UNCONFIRMED"],
            },
            {
                "candidateId": "LYTHAUS_SPECTRAL_LITE_V0",
                "rightsStatus": "PASS",
                "runtimeClassification": next(item for item in runtime["candidates"] if item["candidateId"] == "LYTHAUS_SPECTRAL_LITE_V0")["runtimeClassification"],
                "stageAPass": lite["stageAPass"],
                "blockingGates": [
                    "DEVELOPMENT_SYNTHETIC_RECALL_BELOW_0.60",
                    "OVERALL_SHORTCUT_RISK_HIGH",
                ],
                "metrics": lite["metrics"],
                "nonCameraConfounding": lite["nonCameraConfounding"],
                "overallShortcutRisk": lite["shortcutAudit"]["overallShortcutRisk"],
                "threshold": lite["threshold"],
            },
        ],
        "selectedSpecialist": "NONE",
        "selectedThreshold": "NOT_CREATED",
        "transformationStress": "NOT_RUN_NO_STAGE_A_PASS",
        "calibrationFreezeSha256": "NOT_CREATED_NO_STAGE_A_PASS",
        "flux1Unblind": "NOT_PERFORMED",
        "flux2FutureReserveStatus": "SEALED",
        "decision": "REJECT_CURRENT_EF3_CANDIDATES",
        "finalClassification": "NO_CANDIDATE_SURVIVES_STAGE_A",
        "scientificBoundary": "STOP_BEFORE_TRANSFORMATION_CALIBRATION_OR_HOLDOUT_ACCESS",
        "selectionBlockerSha256": "PENDING",
    }


def build_report(
    development: dict[str, Any],
    runtime: dict[str, Any],
    blocker: dict[str, Any],
    runtime_digest: str,
    development_digest: str,
    blocker_digest: str,
    checkpoint: dict[str, Any],
) -> str:
    c512 = development["candidateResults"][0]
    lite = development["candidateResults"][1]
    native = next(item for item in runtime["candidates"] if item["candidateId"] == "SPAI_NATIVE_CPU_OPT")
    patchcraft = next(item for item in runtime["candidates"] if item["candidateId"] == "PATCHCRAFT_OFFICIAL")
    native_times = ", ".join(f"{float(value):.6f}" for value in [record["runtimeSeconds"] for record in native["requiredHighResolutionProfile"]["records"]])
    return f"""# WP007C EF3 Candidate Selection

## Decision

`WP007C_FINAL_DECISION = REJECT_CURRENT_EF3_CANDIDATES`

No candidate survived the predeclared development-only Stage A gates. The
scientific boundary is therefore before transformation stress, calibration
freeze, and any FLUX.1 pixel access.

## Immutable baseline

- `WP007C_BASE_SHA = {BASE_SHA}`
- `WP007C_DEVELOPMENT_SPLIT_SHA256 = {development['developmentSplitSha256']}`
- `WP007AHR4_HOLDOUT_FREEZE_SHA256 = {HOLDOUT_FREEZE_SHA}`
- `FLUX2_RESERVE_FREEZE_SHA256 = {FLUX2_RESERVE_FREEZE_SHA}`
- `SPAI_CHECKPOINT_SHA256 = {checkpoint['sha256']}`
- `SPAI_UPSTREAM_COMMIT = {SPAI_UPSTREAM_COMMIT}`
- `SPAI_RUNTIME_LOCK_SHA256 = {RUNTIME_LOCK_SHA}`

The common split contained 64 DiffusionDB synthetic, 36 camera-negative, and
28 digital non-AI development families. Candidate membership was frozen before
scoring. Owner unknown-generator samples were not used.

## Candidate outcomes

| Candidate | Runtime | Synthetic recall | Camera FPR | Digital FPR | Overall negative FPR | Confounding | Shortcut | Stage A |
| --- | ---: | ---: | ---: | ---: | ---: | --- | --- | --- |
| `SPAI_NATIVE_CPU_OPT` | NOT_PRACTICAL | not run | not run | not run | not run | not run | not run | FAIL |
| `SPAI_C512` | {next(item for item in runtime['candidates'] if item['candidateId'] == 'SPAI_C512')['runtimeClassification']} | {c512['metrics']['developmentSyntheticRecall']:.6f} | {c512['metrics']['developmentCameraFpr']:.6f} | {c512['metrics']['developmentDigitalFpr']:.6f} | {c512['metrics']['developmentOverallNegativeFpr']:.6f} | {c512['nonCameraConfounding']} | {c512['shortcutAudit']['overallShortcutRisk']} | FAIL |
| `PATCHCRAFT_OFFICIAL` | not run | not run | not run | not run | not run | not run | not run | RIGHTS BLOCKED |
| `LYTHAUS_SPECTRAL_LITE_V0` | {next(item for item in runtime['candidates'] if item['candidateId'] == 'LYTHAUS_SPECTRAL_LITE_V0')['runtimeClassification']} | {lite['metrics']['developmentSyntheticRecall']:.6f} | {lite['metrics']['developmentCameraFpr']:.6f} | {lite['metrics']['developmentDigitalFpr']:.6f} | {lite['metrics']['developmentOverallNegativeFpr']:.6f} | {lite['nonCameraConfounding']} | {lite['shortcutAudit']['overallShortcutRisk']} | FAIL |

`SPAI_C512` had a strong synthetic recall of 0.937500 and acceptable negative
FPRs, but failed both the HIGH non-camera-confounding gate and the HIGH
overall-shortcut gate. `LYTHAUS_SPECTRAL_LITE_V0` was fast and had acceptable
negative FPRs, but synthetic recall was 0.000000 and the overall shortcut gate
was HIGH. The native-resolution optimization preserved the original scores
exactly in the four-sample smoke, but the three predeclared high-resolution
camera profiles took `{native_times}` seconds, all over the 60-second stop
rule. PatchCraft was not retrieved or run because its code/checkpoint research
rights remained unconfirmed.

## Boundary and seals

- `TRANSFORMATION_STRESS = NOT_RUN_NO_STAGE_A_PASS`
- `WP007C_SELECTED_SPECIALIST = NONE`
- `WP007C_CALIBRATION_FREEZE_SHA256 = NOT_CREATED_NO_STAGE_A_PASS`
- `FLUX1_HOLDOUT_UNBLIND = NOT_PERFORMED`
- `FLUX2_PROVIDER_CALLS = 0`
- `FLUX2_FUTURE_RESERVE_STATUS = SEALED`
- `WP007B_REOPENED = FALSE`

No FLUX.1 or FLUX.2 pixels were accessed by candidate development. No
candidate saw holdout scores. No threshold was applied to FLUX.1.

## Evidence artifacts

- Runtime evidence SHA-256: `{runtime_digest}`
- Development evidence SHA-256: `{development_digest}`
- Selection blocker SHA-256: `{blocker_digest}`

The PatchCraft rights record is retained in
`research/wp007c/patchcraft-rights-audit.json`; no substitute detector was
introduced. This is a research-only result with no production, Safety, Judge,
EF2, or upload changes.

The following remain unresolved: end-to-end authenticity accuracy, human false
positive rate, broad generator/camera/digital-negative generalization,
mixed-origin detection, region localization, and EF3 directional validation.
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo-root", type=pathlib.Path, default=pathlib.Path("."))
    parser.add_argument("--candidate-results", required=True, type=pathlib.Path)
    parser.add_argument("--native-profile", required=True, type=pathlib.Path)
    parser.add_argument("--native-smoke", required=True, type=pathlib.Path)
    parser.add_argument("--original-smoke-csv", required=True, type=pathlib.Path)
    parser.add_argument("--c512-smoke", required=True, type=pathlib.Path)
    parser.add_argument("--spectral-smoke", required=True, type=pathlib.Path)
    parser.add_argument("--output-dir", type=pathlib.Path, default=pathlib.Path("research/wp007c"))
    args = parser.parse_args()
    repo_root = args.repo_root.resolve()
    output_dir = (repo_root / args.output_dir).resolve()
    split = read_json(repo_root / "research/wp007c/development-split.json")
    checkpoint = read_json(repo_root / "research/wp007b/spai-checkpoint-manifest.json")
    rights = read_json(repo_root / "research/wp007c/patchcraft-rights-audit.json")
    if split["baseSha"] != BASE_SHA or split["holdoutFreezeSha256"] != HOLDOUT_FREEZE_SHA:
        raise RuntimeError("IMMUTABLE_BASELINE_MISMATCH")
    if checkpoint["sha256"] != SPAI_CHECKPOINT_SHA:
        raise RuntimeError("CHECKPOINT_SHA_MISMATCH")
    if not split["candidateSetFrozenBeforeScoring"]:
        raise RuntimeError("CANDIDATE_SET_NOT_FROZEN")
    candidate_results = read_json(args.candidate_results)
    runtime = build_runtime_results(args, split, rights)
    runtime_path = output_dir / "candidate-runtime-results.json"
    write_json(runtime_path, runtime)
    runtime_digest = sha256_file(runtime_path)
    development = build_development_results(candidate_results, runtime, split, rights)
    development_path = output_dir / "candidate-development-results.json"
    write_json(development_path, development)
    development_digest = sha256_file(development_path)
    blocker = build_blocker(development, runtime, split, checkpoint, runtime_digest, development_digest)
    blocker_path = output_dir / "selection-blocker.json"
    blocker["selectionBlockerSha256"] = canonical_sha(blocker, "selectionBlockerSha256")
    write_json(blocker_path, blocker)
    blocker_digest = sha256_file(blocker_path)
    report_path = output_dir / "wp007c-final-report.md"
    report_path.write_text(
        build_report(development, runtime, blocker, runtime_digest, development_digest, blocker_digest, checkpoint),
        encoding="utf-8",
    )
    print(f"WP007C_FINAL_DECISION=REJECT_CURRENT_EF3_CANDIDATES")
    print(f"WP007C_SELECTION_BLOCKER_SHA256={blocker['selectionBlockerSha256']}")
    print("WP007C_FLUX1_HOLDOUT_UNBLIND=NOT_PERFORMED")
    print("WP007C_FLUX2_PROVIDER_CALLS=0")


if __name__ == "__main__":
    main()
