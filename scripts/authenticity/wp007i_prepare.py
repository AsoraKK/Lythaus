"""Prepare the WP007I score-blind corpus and frozen protocol artifacts.

This module intentionally separates metadata curation from media retrieval and
detector scoring.  It does not import SAFE and it never reads detector scores.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
from pathlib import Path
from typing import Any


PARENT_SHA = "bcbadd676f8ff0670369de80d487d77a6613fcf5"
SAFE_UPSTREAM_SHA = "4e998724651b227def64f5be0cd60c0aa1552c35"
SAFE_CHECKPOINT_SHA = "b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e"
SAFE_THRESHOLD = 0.5864923000335693
FLUX2_PATTERNS = (r"flux\.2", r"flux2", r"flux-2")

PRIOR_GENERATOR_FAMILIES = {
    "BAGEL",
    "BLIP3o-4B",
    "BLIP3o-8B",
    "FLUX.1-Krea-dev",
    "FLUX.1-dev",
    "FLUX.1-schnell",
    "GPT-4o",
    "GPT-Image-1.5",
    "Gemini-2.5-Flash",
    "HiDream-I1",
    "HunyuanImage-3.0",
    "Infinity-8B",
    "Janus-Pro-1B",
    "Janus-Pro-7B",
    "LongCat-Image",
    "OmniGen2-7B",
    "PixArt-Alpha",
    "PixArt-Sigma",
    "Qwen-Image",
    "Qwen-Image-2512",
    "SD-3-Medium",
    "SD-3.5-Medium",
    "Seedream-4.5",
    "Z-Image",
    "FLUX.2-dev",
    "FLUX.2-klein-4B",
    "FLUX.2-klein-9B",
}

FRESH_SYNTHETIC = [
    {"family": "SD-3.5-Large", "revision": "cad54bdbf289fa95678aac7ddd19f5871a8774c1"},
    {"family": "Seedream-4", "revision": "aae6dcedc48c878bab2825d5972bee6b6df4653a"},
    {"family": "Gemini-2.0-Flash", "revision": "0cbf2aed1ac30538880012bc5e0ea7bb3a26878b"},
    {"family": "GoT-R1-7B", "revision": "a50cecb2c822c1865d1e98ef56d12edcb814914f"},
    {"family": "Nano-Banana", "revision": "88c97bb55a7dedccf5aa7d532142390e5cb5ca37"},
    {"family": "imagen-4", "revision": "a24a279b3a48ed84d8b2d5a6f8e9adf642db6c6b"},
]

TRANSFORMS = [
    "JPEG95",
    "JPEG85",
    "JPEG75",
    "RESIZE75",
    "RESIZE50",
    "SCREENSHOT_STYLE_RESAMPLING",
    "METADATA_STRIP",
    "MILD_CROP",
    "MILD_BLUR",
    "MILD_SHARPEN",
]


def sha256_bytes(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def canonical_hash(value: Any) -> str:
    raw = json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    return sha256_bytes(raw)


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, sort_keys=True, ensure_ascii=False) + "\n", encoding="utf-8")


def run_git(repo: Path, *args: str) -> str:
    result = subprocess.run(["git", "-C", str(repo), *args], check=True, capture_output=True, text=True)
    return result.stdout


def denied_family(family: str) -> bool:
    return family in PRIOR_GENERATOR_FAMILIES or any(re.search(pattern, family, re.I) for pattern in FLUX2_PATTERNS)


def build_plan(root: Path) -> None:
    out = root / "research" / "wp007i"
    h_root = root / "research" / "wp007h"
    h_artifacts = {
        name: sha256_file(h_root / name)
        for name in (
            "experiment-plan.json",
            "safe-artifact-rights.json",
            "safe-specialist-profile.json",
            "safe-qualification-results.json",
            "safe-transformation-results.json",
            "forbidden-generator-families.json",
        )
    }
    forbidden = {
        "schemaVersion": "lythaus-wp007i-forbidden-families-v1",
        "purpose": "Fail closed before media retrieval; metadata enumeration is permitted only for exclusion.",
        "flux2FamilyPatterns": list(FLUX2_PATTERNS),
        "sealedPriorGeneratorFamilies": sorted(PRIOR_GENERATOR_FAMILIES),
        "sealedReservePolicy": "Do not open WP007H future reserve or any EF2/future benchmark reserve in WP007I.",
        "pixelAccess": False,
        "providerCalls": 0,
    }
    write_json(out / "forbidden-generator-families.json", forbidden)
    forbidden_hash = sha256_file(out / "forbidden-generator-families.json")
    plan = {
        "schemaVersion": "lythaus-wp007i-experiment-plan-v1",
        "workPackage": "WP007I",
        "parentSha": PARENT_SHA,
        "parentPullRequest": 848,
        "branch": "agent/wp007i-safe-policy",
        "objective": "Qualify frozen SAFE as selective positive EF3 evidence under a deterministic, independently tested applicability gate.",
        "hypotheses": [
            "SAFE high-score evidence remains specific on a substantially larger independent negative population.",
            "A deterministic byte/input-regime gate can identify destructive transformations without using SAFE score or truth labels at inference time.",
            "Positive-only SAFE policy reduces false accusations relative to treating low SAFE scores as human evidence.",
            "Shadow supporters do not alter SAFE qualification and are promoted only for repeated unique rescue with low contradiction burden.",
        ],
        "safeFrozenConfiguration": {
            "detectorId": "SAFE",
            "upstreamCommit": SAFE_UPSTREAM_SHA,
            "checkpointSha256": SAFE_CHECKPOINT_SHA,
            "threshold": SAFE_THRESHOLD,
            "thresholdSource": "WP007G-R1 frozen threshold; WP007I cannot retune it.",
            "preprocessingVersion": "SAFE_OFFICIAL_RGB_CENTER_CROP_256_DWT_CLASS1_V1",
            "preprocessing": "RGB decode; torchvision CenterCrop(256,256); ToTensor; official SAFE DWT/model; class-1 softmax",
            "modelWeightsChangeAllowed": False,
            "preprocessingChangeAllowed": False,
        },
        "negativeCorpus": {
            "targetFreshIndependentFamilies": 800,
            "minimumIfRightsCleanDiversityFails": 400,
            "plannedSources": [
                {"source": "UNSPLASH_LITE", "count": 600, "subtype": "CAMERA_NATIVE", "rights": "INTERNAL_COMMERCIAL_ML_LICENSE; NO REDISTRIBUTION"},
                {"source": "LYTHAUS_PROCEDURAL_HARD_NEGATIVES", "count": 200, "subtype": "DIGITAL_NON_AI_HARD_NEGATIVE", "rights": "LYTHAUS_OWNED_DETERMINISTIC_GENERATION"},
            ],
            "roles": {"NEGATIVE_DEV_I": 400, "NEGATIVE_CONFIRM_I": 400},
            "scoreBlind": True,
            "primaryDenominatorUsesIndependentSourceFamilies": True,
        },
        "freshSyntheticCorpus": {
            "families": FRESH_SYNTHETIC,
            "samplesPerFamily": 20,
            "totalTarget": 120,
            "roles": {"FRESH_SYNTHETIC_DEV": 60, "FRESH_SYNTHETIC_CONFIRM": 60},
            "selection": "SHA256(WP007I-SYNTH|generatorFamily|relativePath), first 20 per family.",
            "scoreBlind": True,
            "rights": "RESEARCH_ONLY_UNLESS_PER_FAMILY_OUTPUT_RIGHTS_ARE_ESTABLISHED",
        },
        "applicability": {
            "candidateInputs": [
                "container format and MIME",
                "dimensions and aspect ratio",
                "JPEG quantization-table structure and estimated quality",
                "JPEG sampling/progressive markers where readable",
                "metadata presence/state",
                "file-size-to-pixel relationship",
                "deterministic resampling indicators",
            ],
            "forbiddenInputs": ["SAFE raw score", "ground-truth origin", "supporter scores", "EF2 score", "Moondream", "Safety", "Judge"],
            "states": ["HIGH", "MODERATE", "DEGRADED", "UNSUPPORTED", "UNKNOWN"],
            "devConfirmSplit": "Source families are frozen separately before any SAFE scoring.",
            "candidateRuleVersion": "WP007I_APPLICABILITY_RULE_V1",
        },
        "transformations": {
            "singleFactorOnly": True,
            "types": TRANSFORMS,
            "sourceFamilyDisjointDevConfirm": True,
            "parametersFrozenBeforeScoring": True,
        },
        "policies": {
            "P0_SAFE_RAW_REFERENCE": "Frozen threshold and raw evidence band; no applicability conditioning.",
            "P1_SAFE_POSITIVE_ONLY": "Above frozen threshold is positive synthetic evidence; below threshold is not a human conclusion.",
            "P2_SAFE_APPLICABILITY": "High SAFE evidence is authoritative only in supported input regimes; low score in degraded/unknown regime is inconclusive.",
            "P3_P2_EF2_CONFLICT_PRESERVATION": "P2 plus explicit conflict state when independent strong EF2 and SAFE positive evidence coexist; no score cancellation.",
        },
        "qualificationGates": {
            "minimumNegativeSourceFamilies": 400,
            "preferredNegativeSourceFamilies": 800,
            "minimumNegativeConfirmFamilies": 200,
            "minimumFreshSyntheticFamilies": 4,
            "minimumFreshSyntheticSamples": 80,
            "safeThresholdImmutable": True,
            "maximumModelFailureRate": 0.02,
            "catastrophicNegativeSubtypeFprStop": 0.10,
            "applicabilityDestructiveRegimeDetectionMinimum": 0.75,
            "applicabilityOriginalFalseDowngradeMaximum": 0.20,
            "applicabilityOriginalSupportedCoverageMinimum": 0.70,
            "fprReporting": "Every material rate includes numerator, denominator, observed rate, and Wilson 95% interval.",
            "flux2PixelAccess": False,
            "flux2ProviderCalls": 0,
        },
        "shadowSupporters": {
            "detectors": ["SPAI_C512", "RINE", "UFD"],
            "roles": {"SPAI_C512": "SHADOW_SPECTRAL_SPECIALIST", "RINE": "SHADOW_LEARNED_SUPPORT", "UFD": "SHADOW_DIAGNOSTIC"},
            "canChangeSafeQualification": False,
            "noRouterOptimization": True,
        },
        "scientificBoundaries": {
            "noNewMetaCalibrator": True,
            "noFineTuning": True,
            "noProductionRouting": True,
            "noPublicLabelChange": True,
            "flux1": "CONSUMED_POSTHOC_DIAGNOSTIC_ONLY; no retuning",
            "flux2": "SEALED; no pixel access, decode, scoring, transform, provider calls, or manual inspection",
        },
        "integrity": {
            "scoreBlindCuration": True,
            "membershipFrozenBeforeScoring": True,
            "confirmationCannotFitPolicy": True,
            "reserveCannotBeOpened": True,
            "forbiddenFamiliesSha256": forbidden_hash,
            "wp007hArtifactHashes": h_artifacts,
        },
        "planHashing": {"canonicalization": "UTF-8 JSON sorted keys compact separators with planSha256 omitted", "selfHashWrittenBeforeScoring": True},
    }
    plan["planSha256"] = canonical_hash(plan)
    write_json(out / "experiment-plan.json", plan)
    safe_reference = {
        "schemaVersion": "lythaus-wp007i-safe-freeze-reference-v1",
        "sourceWorkPackage": "WP007H",
        "parentWp007hHead": "bcbadd676f8ff0670369de80d487d77a6613fcf5",
        "upstreamCommit": SAFE_UPSTREAM_SHA,
        "checkpointSha256": SAFE_CHECKPOINT_SHA,
        "threshold": SAFE_THRESHOLD,
        "thresholdFrozen": True,
        "preprocessingFrozen": True,
        "rightsStatus": "RESEARCH_EVALUATION_ELIGIBLE_DEPLOYMENT_REVIEW_REQUIRED",
        "productionAuthorization": "NO",
        "wp007hArtifactHashes": h_artifacts,
    }
    write_json(out / "safe-freeze-reference.json", safe_reference)
    audit = {
        "schemaVersion": "lythaus-wp007i-current-state-audit-v1",
        "workPackage": "WP007I",
        "auditedAtUtc": "2026-09-17",
        "parent": {"pullRequest": 848, "parentSha": PARENT_SHA, "branch": "agent/wp007i-safe-policy", "lineagePreserved": True},
        "originMain": "8e3b3ebad2f846e61db2bfe819376723da7e9863",
        "priorPrs": {"844": "OPEN_4c4f02349f497e2ff021ff3c37abb432cb93dc0d", "845": "OPEN_5a6231c6f8ede3de5e117ed3692bcf493f0c1a1c", "847": "OPEN_fc9c1a65528a39da008fed12c1a601e32c226e09", "848": "OPEN_bcbadd676f8ff0670369de80d487d77a6613fcf5"},
        "wp007hDisposition": "SAFE_SPECIALIST_QUALIFIED_WITH_LIMITED_APPLICABILITY",
        "wp007hResultsPreserved": True,
        "detectorArtifacts": {"SAFE": {"upstreamCommit": SAFE_UPSTREAM_SHA, "checkpointSha256": SAFE_CHECKPOINT_SHA, "threshold": SAFE_THRESHOLD}, "SPAI_C512": "SHADOW", "RINE": "SHADOW", "UFD": "SHADOW"},
        "sealed": {"flux1": "CONSUMED_POSTHOC_DIAGNOSTIC_ONLY", "flux2": "SEALED_FUTURE_RESERVE", "flux2PixelAccess": False, "flux2ProviderCalls": 0},
        "localResources": {"execution": "CPU bounded workers; no training; no GPU; no new provider", "workingRootKey": "WP007I_TEMP_WORKTREE"},
        "parentArtifactHashes": h_artifacts,
    }
    write_json(out / "current-state-audit.json", audit)
    write_json(out / "rights-status-update.json", {
        "schemaVersion": "lythaus-wp007i-rights-status-v1",
        "safe": {"status": "RESEARCH_EVALUATION_ELIGIBLE_DEPLOYMENT_REVIEW_REQUIRED", "checkpointSpecificCommercialGrant": "NOT_STATED", "productionAuthorization": "NO", "evidenceArtifact": "research/wp007h/safe-artifact-rights.json"},
        "unsplashLite": {"status": "INTERNAL_COMMERCIAL_ML_LICENSE_FOR_LITE_DATASET", "restriction": "NO_REDisTRIBUTION_OR_PUBLIC_DISCLOSURE_OF_DATASET_CONTENT", "useInWp007i": "PRIVATE_EVALUATION_ONLY"},
        "t2iCoreBench": {"status": "RESEARCH_ONLY_UNLESS_PER_FAMILY_OUTPUT_RIGHTS_ESTABLISHED", "useInWp007i": "PRIVATE_RESEARCH_CONFIRMATION_ONLY"},
        "lythausProcedural": {"status": "LYTHAUS_OWNED_DETERMINISTIC_EVALUATION_MEDIA", "useInWp007i": "PRIVATE_EVALUATION_ONLY"},
        "noInferenceFromSilence": True,
    })
    print(json.dumps({"planSha256": plan["planSha256"], "forbiddenSha256": forbidden_hash}, sort_keys=True))


def lfs_pointer(repo: Path, revision: str, path: str) -> tuple[str, int]:
    pointer = run_git(repo, "show", f"{revision}:{path}")
    oid = re.search(r"^oid sha256:([0-9a-f]{64})$", pointer, re.M)
    size = re.search(r"^size (\d+)$", pointer, re.M)
    if not oid or not size:
        raise RuntimeError(f"LFS_POINTER_INVALID:{revision}:{path}")
    return oid.group(1), int(size.group(1))


def enumerate_family(repo: Path, family: str, revision: str) -> list[dict[str, Any]]:
    if denied_family(family):
        raise RuntimeError(f"FORBIDDEN_GENERATOR_FAMILY:{family}")
    paths = [line for line in run_git(repo, "ls-tree", "-r", "--name-only", revision, "--", f"data/{family}").splitlines() if line.endswith(".png")]
    if not paths:
        raise RuntimeError(f"FAMILY_NOT_FOUND:{family}:{revision}")
    paths = sorted(paths, key=lambda p: sha256_bytes(f"WP007I-SYNTH|{family}|{p.removeprefix(f'data/{family}/')}".encode()))[:20]
    rows = []
    for path in paths:
        oid, size = lfs_pointer(repo, revision, path)
        rel = path.removeprefix(f"data/{family}/")
        rows.append({
            "generatorFamily": family,
            "officialRevision": revision,
            "path": path,
            "relativePath": rel,
            "lfsSha256": oid,
            "bytes": size,
            "selectionHash": sha256_bytes(f"WP007I-SYNTH|{family}|{rel}".encode()),
            "retrievalStatus": "SELECTED_SCORE_BLIND_METADATA_ONLY",
            "rightsClass": "RESEARCH_ONLY_UNLESS_PER_FAMILY_OUTPUT_RIGHTS_ESTABLISHED",
        })
    return rows


def curate(root: Path, history_repo: Path, unsplash_tsv: Path) -> None:
    out = root / "research" / "wp007i"
    plan = json.loads((out / "experiment-plan.json").read_text(encoding="utf-8"))
    photos = []
    with unsplash_tsv.open("r", encoding="utf-8", errors="replace") as handle:
        header = handle.readline().rstrip("\n").split("\t")
        for line in handle:
            values = line.rstrip("\n").split("\t")
            if len(values) == len(header):
                photos.append(dict(zip(header, values)))
    eligible = [row for row in photos if row.get("photo_id") and row.get("photo_image_url") and row.get("exif_camera_make") and row.get("exif_camera_model") and int(float(row.get("photo_width") or 0)) >= 512 and int(float(row.get("photo_height") or 0)) >= 512]
    eligible.sort(key=lambda row: sha256_bytes(f"WP007I-NEGATIVE|UNSPLASH_LITE|{row['photo_id']}".encode()))
    unsplash = []
    for index, row in enumerate(eligible[:600]):
        role = "NEGATIVE_DEV_I" if index < 300 else "NEGATIVE_CONFIRM_I"
        app_role = "APPLICABILITY_DEV" if index < 300 else "APPLICABILITY_CONFIRM"
        unsplash.append({
            "sampleId": f"UNSPLASH_{row['photo_id']}",
            "sourceFamilyId": f"UNSPLASH_LITE_FAMILY_{row['photo_id']}",
            "role": role,
            "applicabilityRole": app_role,
            "label": 0,
            "sourceSubtype": "CAMERA_NATIVE",
            "cameraDeviceFamily": f"UNSPLASH:{row.get('exif_camera_make')}:{row.get('exif_camera_model')}",
            "sourceDataset": "Unsplash Lite Dataset 1.4.0",
            "photoId": row["photo_id"],
            "sourceUrl": row["photo_image_url"],
            "sourcePageUrl": row.get("photo_url"),
            "metadataCameraMake": row.get("exif_camera_make"),
            "metadataCameraModel": row.get("exif_camera_model"),
            "declaredWidth": int(float(row.get("photo_width") or 0)),
            "declaredHeight": int(float(row.get("photo_height") or 0)),
            "selectionHash": sha256_bytes(f"WP007I-NEGATIVE|UNSPLASH_LITE|{row['photo_id']}".encode()),
            "sourceRights": "INTERNAL_COMMERCIAL_ML_LICENSE; NO REDISTRIBUTION",
            "localRelativePath": f"negative/unsplash/{row['photo_id']}.bin",
        })
    categories = ["CGI", "THREE_D_RENDER", "DIGITAL_ILLUSTRATION", "VECTOR_LIKE", "CHART", "DIAGRAM", "UI_SCREENSHOT", "GAME_SCREENSHOT", "MEME", "TEXT_GRAPHIC", "PROCEDURAL_PATTERN", "COMPOSITE"]
    procedural = []
    for seed in range(200):
        category = categories[seed % len(categories)]
        role = "NEGATIVE_DEV_I" if seed < 100 else "NEGATIVE_CONFIRM_I"
        app_role = "APPLICABILITY_DEV" if seed < 100 else "APPLICABILITY_CONFIRM"
        family = f"LYTHAUS_PROC_HN_{category}_{seed:03d}"
        procedural.append({
            "sampleId": family,
            "sourceFamilyId": family,
            "role": role,
            "applicabilityRole": app_role,
            "label": 0,
            "sourceSubtype": category,
            "cameraDeviceFamily": None,
            "sourceDataset": "Lythaus deterministic procedural hard-negative generator",
            "selectionHash": sha256_bytes(f"WP007I-NEGATIVE|LYTHAUS_PROCEDURAL|{category}|{seed:03d}".encode()),
            "sourceRights": "LYTHAUS_OWNED_DETERMINISTIC_EVALUATION_MEDIA",
            "proceduralCategory": category,
            "proceduralSeed": seed,
            "localRelativePath": f"negative/procedural/{family}.png",
        })
    negatives = unsplash + procedural
    if len(negatives) < 800:
        raise RuntimeError(f"NEGATIVE_TARGET_NOT_MET_BEFORE_SCORE:{len(negatives)}")
    negative_freeze = {
        "schemaVersion": "lythaus-wp007i-negative-data-freeze-v1",
        "freezeStatus": "FROZEN_BEFORE_SAFE_SCORING",
        "scoreBlind": True,
        "selectionUsesSafeScores": False,
        "selectionUsesAuthenticityJudgment": False,
        "roles": {"NEGATIVE_DEV_I": 400, "NEGATIVE_CONFIRM_I": 400},
        "independentSourceFamilyDenominator": True,
        "records": negatives,
        "rights": {"unsplash": "PRIVATE_INTERNAL_EVALUATION_ONLY_NO_REDISTRIBUTION", "procedural": "LYTHAUS_OWNED"},
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    }
    write_json(out / "negative-data-freeze.json", negative_freeze)

    synthetic_records = []
    for family_index, spec in enumerate(FRESH_SYNTHETIC):
        for row in enumerate_family(history_repo, spec["family"], spec["revision"]):
            row.update({
                "sampleId": f"{row['generatorFamily']}__{Path(row['relativePath']).stem}",
                "role": "FRESH_SYNTHETIC_DEV" if family_index < 3 else "FRESH_SYNTHETIC_CONFIRM",
                "applicabilityRole": "APPLICABILITY_DEV" if family_index < 3 else "APPLICABILITY_CONFIRM",
                "label": 1,
                "sourceSubtype": "MODERN_GENERATED",
                "localRelativePath": f"synthetic/{row['generatorFamily']}/{row['relativePath']}",
                "sourceDataset": "T2I-CoReBench-Images historical individual Git-LFS object",
            })
            synthetic_records.append(row)
    synthetic_freeze = {
        "schemaVersion": "lythaus-wp007i-fresh-synthetic-freeze-v1",
        "freezeStatus": "FROZEN_BEFORE_SAFE_SCORING",
        "scoreBlind": True,
        "selectionUsesSafeScores": False,
        "selectionUsesAuthenticityJudgment": False,
        "families": [spec["family"] for spec in FRESH_SYNTHETIC],
        "roles": {"FRESH_SYNTHETIC_DEV": 60, "FRESH_SYNTHETIC_CONFIRM": 60},
        "records": synthetic_records,
        "forbiddenFamiliesSha256": sha256_file(out / "forbidden-generator-families.json"),
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    }
    write_json(out / "fresh-synthetic-freeze.json", synthetic_freeze)

    def app_subset(records: list[dict[str, Any]], role: str, per_group: int) -> list[dict[str, Any]]:
        selected = [row for row in records if row["applicabilityRole"] == role]
        return sorted(selected, key=lambda row: row["selectionHash"])[:per_group]

    app_dev = app_subset(negatives, "APPLICABILITY_DEV", 75) + app_subset(synthetic_records, "APPLICABILITY_DEV", 15)
    app_confirm = app_subset(negatives, "APPLICABILITY_CONFIRM", 75) + app_subset(synthetic_records, "APPLICABILITY_CONFIRM", 15)
    write_json(out / "applicability-development-manifest.json", {"schemaVersion": "lythaus-wp007i-applicability-dev-v1", "scoreBlind": True, "records": app_dev, "sourceFamilyDisjointFromConfirmation": True, "flux2PixelAccess": False})
    write_json(out / "applicability-confirmation-manifest.json", {"schemaVersion": "lythaus-wp007i-applicability-confirm-v1", "scoreBlind": True, "records": app_confirm, "sourceFamilyDisjointFromDevelopment": True, "confirmationCannotFitRule": True, "flux2PixelAccess": False})
    data_role = {
        "schemaVersion": "lythaus-wp007i-data-role-freeze-v1",
        "parentSha": PARENT_SHA,
        "negativeFreezeSha256": sha256_file(out / "negative-data-freeze.json"),
        "syntheticFreezeSha256": sha256_file(out / "fresh-synthetic-freeze.json"),
        "forbiddenFamiliesSha256": sha256_file(out / "forbidden-generator-families.json"),
        "roles": {"NEGATIVE_DEV_I": 400, "NEGATIVE_CONFIRM_I": 400, "FRESH_SYNTHETIC_DEV": 60, "FRESH_SYNTHETIC_CONFIRM": 60, "FLUX1": "POSTHOC_ONLY", "FLUX2": "SEALED"},
        "familyDisjointnessChecked": True,
        "scoreBlind": True,
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    }
    write_json(out / "data-role-freeze.json", data_role)
    print(json.dumps({"negative": len(negatives), "synthetic": len(synthetic_records), "appDev": len(app_dev), "appConfirm": len(app_confirm), "negativeFreezeSha256": data_role["negativeFreezeSha256"]}, sort_keys=True))


def main() -> None:
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="command", required=True)
    p_plan = sub.add_parser("plan")
    p_plan.add_argument("--root", type=Path, required=True)
    p_curate = sub.add_parser("curate")
    p_curate.add_argument("--root", type=Path, required=True)
    p_curate.add_argument("--history-repo", type=Path, required=True)
    p_curate.add_argument("--unsplash-tsv", type=Path, required=True)
    args = parser.parse_args()
    if args.command == "plan":
        build_plan(args.root)
    else:
        curate(args.root, args.history_repo, args.unsplash_tsv)


if __name__ == "__main__":
    main()
