"""Smoke-test decoder lineages and freeze eligible local roundtrip semantics."""

from __future__ import annotations

import argparse
import gc
import importlib.util
import json
import statistics
import time
from pathlib import Path

import torch
from torchvision.transforms.functional import to_tensor
from PIL import Image

from wp007e_common import load_json, roundtrip_metrics, sha256_file, write_json


def runtime_tier(seconds: float) -> str:
    if seconds <= 5:
        return "FAST"
    if seconds <= 20:
        return "MODERATE"
    if seconds <= 60:
        return "SLOW"
    return "PROXY_RUNTIME_BLOCKED"


def load_taesd(code_path: Path):
    spec = importlib.util.spec_from_file_location("wp007e_taesd", code_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("taesd_code_import_failed")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.TAESD


def load_variant(candidate: dict, weights_root: Path, taesd_class):
    if candidate["kind"].startswith("DIFFUSERS"):
        from diffusers import AutoencoderKL

        local_dir = weights_root / candidate["variantId"]
        model = AutoencoderKL.from_pretrained(
            str(local_dir),
            torch_dtype=torch.float32,
            local_files_only=True,
        )
        model = model.to("cpu").eval()
        model.requires_grad_(False)
        return model
    files = {item["kind"]: weights_root / item["relativePath"] for item in candidate["weights"]}
    model = taesd_class(
        encoder_path=str(files["encoder"]),
        decoder_path=str(files["decoder"]),
    ).to("cpu").eval()
    model.requires_grad_(False)
    return model


@torch.inference_mode()
def roundtrip(model, candidate: dict, image: Image.Image) -> Image.Image:
    x = to_tensor(image).unsqueeze(0).to(dtype=torch.float32)
    if candidate["kind"].startswith("DIFFUSERS"):
        latent = model.encode(x.mul(2).sub(1)).latent_dist.mode()
        result = model.decode(latent).sample
        result = result.add(1).div(2).clamp(0, 1)
    else:
        latent = model.encoder(x)
        result = model.decoder(latent).clamp(0, 1)
    array = result[0].permute(1, 2, 0).mul(255).round().byte().cpu().numpy()
    return Image.fromarray(array, mode="RGB")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--weights-root", required=True)
    parser.add_argument("--media-root", required=True)
    args = parser.parse_args()
    repo_root = Path(__file__).resolve().parents[2]
    weights_root = Path(args.weights_root)
    media_root = Path(args.media_root)
    registry = load_json(repo_root / "research" / "wp007e" / "decoder-registry.json")
    canonical = load_json(repo_root / "research" / "wp007e" / "canonicalizer-spec.json")
    pair = load_json(repo_root / "research" / "wp007e" / "data-role-freeze.json")["roles"]["PAIR_BASE"]["records"]
    canonical_by_family = {
        item["sourceFamilyId"]: media_root / item["canonicalRelativePath"]
        for item in canonical["records"]
        if item["role"] == "PAIR_BASE"
    }
    smoke = pair[:2] + pair[-2:]
    smoke_images = [(item["sourceFamilyId"], Image.open(canonical_by_family[item["sourceFamilyId"]]).convert("RGB")) for item in smoke]
    taesd_class = load_taesd(weights_root / "taesd.py")
    all_results = []
    for candidate in registry["candidates"]:
        model = load_variant(candidate, weights_root, taesd_class)
        durations = []
        metrics = []
        for family, image in smoke_images:
            started = time.perf_counter()
            output = roundtrip(model, candidate, image)
            elapsed = time.perf_counter() - started
            durations.append(elapsed)
            metrics.append({"sourceFamilyId": family, **roundtrip_metrics(image, output)})
        p50 = statistics.median(durations)
        ordered = sorted(durations)
        p95 = ordered[min(len(ordered) - 1, max(0, int(0.95 * len(ordered)) - 1))]
        ssims = [item["ssim"] for item in metrics]
        psnrs = [item["psnrDb"] for item in metrics]
        catastrophic = sum(item < 0.5 for item in ssims) / len(ssims)
        result = {
            "variantId": candidate["variantId"],
            "lineage": candidate["lineage"],
            "smokeSourceFamilyIds": [family for family, _ in smoke_images],
            "runtimeSeconds": [round(value, 6) for value in durations],
            "runtimeP50Seconds": round(p50, 6),
            "runtimeP95Seconds": round(p95, 6),
            "runtimeTier": runtime_tier(p95),
            "fidelity": {
                "medianSsim": round(statistics.median(ssims), 6),
                "medianPsnrDb": round(statistics.median(psnrs), 6),
                "catastrophicSsimBelow05Fraction": round(catastrophic, 6),
                "perImage": metrics,
                "gate": "PASS" if statistics.median(ssims) >= 0.75 and statistics.median(psnrs) >= 22 and catastrophic <= 0.10 else "FAIL",
            },
            "latentSemantics": (
                {
                    "inputRange": "[0,1]",
                    "encoderNormalization": "none",
                    "latentDistribution": "deterministic_encoder_output",
                    "latentScaling": "none_for_pure_roundtrip",
                    "decoderInput": "raw_encoder_latent",
                    "decoderOutputRange": "model_output_clamped_to_[0,1]",
                    "posteriorMode": "NOT_APPLICABLE",
                }
                if not candidate["kind"].startswith("DIFFUSERS")
                else {
                    "inputRange": "[-1,1] after x*2-1",
                    "encoderNormalization": "AutoencoderKL_contract",
                    "latentDistribution": "DiagonalGaussianDistribution",
                    "latentScaling": "none_for_pure_roundtrip",
                    "decoderInput": "posterior_mode_latent",
                    "decoderOutputRange": "[-1,1] mapped to [0,1] and clamped",
                    "posteriorMode": "deterministic_mode",
                }
            ),
        }
        all_results.append(result)
        del model
        gc.collect()
    lineage_status = {}
    for result in all_results:
        current = lineage_status.setdefault(result["lineage"], [])
        if result["fidelity"]["gate"] == "PASS" and result["runtimeTier"] != "PROXY_RUNTIME_BLOCKED":
            current.append(result["variantId"])
    eligible_lineages = sorted(key for key, values in lineage_status.items() if values)
    eligible_variants = [result["variantId"] for result in all_results if result["variantId"] in {variant for values in lineage_status.values() for variant in values}]
    report = {
        "schemaVersion": "lythaus-wp007e-decoder-runtime-fidelity-v1",
        "decoderRegistrySha256": registry["registrySha256"],
        "canonicalizerSha256": canonical["canonicalizerSha256"],
        "smoke": {
            "count": len(smoke_images),
            "sourceFamilies": [family for family, _ in smoke_images],
            "pixelsFromFlux1": False,
            "pixelsFromFlux2": False,
        },
        "variants": all_results,
        "eligibleLineages": eligible_lineages,
        "eligibleVariants": eligible_variants,
        "lineageGrouping": {"SD1X": ["SD1X_FULL_A1", "SD1X_TAESD_A2"], "SDXL": ["SDXL_FULL_B1", "SDXL_TAESD_B2"], "SD3": ["SD3_TAESD3_C1"], "SANA": ["SANA_TAESANA_D1"]},
    }
    write_json(repo_root / "research" / "wp007e" / "decoder-runtime-and-fidelity.json", report)
    if len(eligible_lineages) < 2:
        raise RuntimeError(f"decoder_lineage_diversity_blocked:{len(eligible_lineages)}")
    plan = {
        "schemaVersion": "lythaus-wp007e-decoder-proxy-plan-v1",
        "wp007eBaseSha": "9b7c375bd030475e25c0058c58909a3a56dcdcc6",
        "dataRoleFreezeSha256": load_json(repo_root / "research" / "wp007e" / "data-role-freeze.json")["dataRoleFreezeSha256"],
        "canonicalizerSha256": canonical["canonicalizerSha256"],
        "decoderRegistrySha256": registry["registrySha256"],
        "eligibleLineages": eligible_lineages,
        "eligibleVariants": eligible_variants,
        "lineageGrouping": report["lineageGrouping"],
        "roundtrip": {
            "input": "canonical_real_512x512_rgb",
            "operation": "encoder_then_matching_decoder",
            "posterior": "mode_or_deterministic_encoder_output",
            "diffusionDenoising": False,
            "textEncoder": False,
            "randomLatentNoise": False,
            "dtype": "float32_cpu",
            "latentScaling": "no_pipeline_scaling_for_pure_roundtrip",
            "output": "clamp_rgb_[0,1]_save_png",
        },
        "pairBaseFamilyCount": len(pair),
        "membershipFrozenBeforeProxyConstruction": True,
        "fluxSpecificProxyUsed": False,
        "cloudflareGenerationCalls": 0,
        "costUsd": 0,
    }
    import hashlib

    plan["decoderProxyPlanSha256"] = hashlib.sha256(
        json.dumps(plan, ensure_ascii=True, sort_keys=True, separators=(",", ":")).encode("utf-8")
    ).hexdigest()
    write_json(repo_root / "research" / "wp007e" / "decoder-proxy-plan.json", plan)
    print(json.dumps({"status": "PASS", "eligibleLineages": eligible_lineages, "eligibleVariants": eligible_variants, "planSha256": plan["decoderProxyPlanSha256"]}, sort_keys=True))


if __name__ == "__main__":
    main()
