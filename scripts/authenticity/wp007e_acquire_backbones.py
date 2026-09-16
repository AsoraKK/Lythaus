"""Acquire the two predeclared official frozen representation backbones."""

from __future__ import annotations

import argparse
import hashlib
import importlib
import json
import os
import subprocess
import sys
from pathlib import Path


CLIP_REPO = "https://github.com/openai/CLIP.git"
CLIP_COMMIT = "d05afc436d78f1c48dc0dbf8e5980a9d471f35f6"
DINO_REPO = "https://github.com/facebookresearch/dinov2.git"
DINO_COMMIT = "7764ea0f912e53c92e82eb78a2a1631e92725fc8"


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def git_checkout(url: str, commit: str, target: Path) -> None:
    if not (target / ".git").is_dir():
        subprocess.run(["git", "clone", "--filter=blob:none", url, str(target)], check=True, capture_output=True, text=True)
    subprocess.run(["git", "fetch", "--depth", "1", "origin", commit], cwd=target, check=True, capture_output=True, text=True)
    subprocess.run(["git", "checkout", "--detach", commit], cwd=target, check=True, capture_output=True, text=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--backbone-root", required=True)
    args = parser.parse_args()
    root = Path(args.backbone_root)
    root.mkdir(parents=True, exist_ok=True)
    clip_repo = root / "openai-CLIP"
    dino_repo = root / "facebookresearch-dinov2"
    git_checkout(CLIP_REPO, CLIP_COMMIT, clip_repo)
    git_checkout(DINO_REPO, DINO_COMMIT, dino_repo)
    weights_root = root / "weights"
    weights_root.mkdir(parents=True, exist_ok=True)
    sys.path.insert(0, str(clip_repo))
    import clip

    clip_model, _ = clip.load("ViT-B/32", device="cpu", download_root=str(weights_root), jit=False)
    del clip_model
    clip_weight = weights_root / "ViT-B-32.pt"
    if not clip_weight.is_file():
        raise RuntimeError("clip_weight_not_found")

    os.environ["TORCH_HOME"] = str(root / "torch-home")
    import torch

    dino_model = torch.hub.load(str(dino_repo), "dinov2_vits14", source="local", pretrained=True)
    dino_model.cpu().eval()
    del dino_model
    dino_candidates = list((root / "torch-home").rglob("dinov2_vits14_pretrain.pth"))
    if len(dino_candidates) != 1:
        raise RuntimeError(f"dino_weight_count:{len(dino_candidates)}")
    dino_weight = dino_candidates[0]
    repos = {
        "CLIP": {
            "repository": "openai/CLIP",
            "commit": CLIP_COMMIT,
            "license": "MIT",
            "licenseFileSha256": sha256_file(clip_repo / "LICENSE"),
            "weightSource": "official_openai_clip_model_url_vit_b32",
            "weightFilename": clip_weight.name,
            "weightRelativePath": clip_weight.relative_to(root).as_posix(),
            "weightBytes": clip_weight.stat().st_size,
            "weightSha256": sha256_file(clip_weight),
            "modelId": "ViT-B/32",
            "feature": "official image encoder output, L2 normalized",
            "researchUse": "CONFIRMED_FOR_RESEARCH_USE",
        },
        "DINOv2": {
            "repository": "facebookresearch/dinov2",
            "commit": DINO_COMMIT,
            "license": "Apache-2.0",
            "licenseFileSha256": sha256_file(dino_repo / "LICENSE"),
            "weightSource": "official_dinov2_vits14_pretrained_checkpoint",
            "weightFilename": dino_weight.name,
            "weightRelativePath": dino_weight.relative_to(root).as_posix(),
            "weightBytes": dino_weight.stat().st_size,
            "weightSha256": sha256_file(dino_weight),
            "modelId": "dinov2_vits14",
            "feature": "concat class_token and mean patch tokens, L2 normalized",
            "researchUse": "CONFIRMED_FOR_RESEARCH_USE",
        },
    }
    total = sum(item["weightBytes"] for item in repos.values())
    if any(item["weightBytes"] > 1024 * 1024 * 1024 for item in repos.values()):
        raise RuntimeError("backbone_weight_over_1GiB")
    registry = {
        "schemaVersion": "lythaus-wp007e-backbone-registry-v1",
        "backbones": repos,
        "totalWeightBytes": total,
        "maxPerBackboneBytes": 1024 * 1024 * 1024,
        "storage": "external_outside_git",
        "device": "cpu",
        "fineTuning": False,
        "textEncoder": False,
        "zeroShotClassification": False,
    }
    registry["registrySha256"] = hashlib.sha256(json.dumps(registry, ensure_ascii=True, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
    repo_root = Path(__file__).resolve().parents[2]
    output = repo_root / "research" / "wp007e" / "backbone-registry.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(registry, ensure_ascii=True, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "PASS", "registrySha256": registry["registrySha256"], "clipWeightSha256": repos["CLIP"]["weightSha256"], "dinoWeightSha256": repos["DINOv2"]["weightSha256"], "totalWeightBytes": total}, sort_keys=True))


if __name__ == "__main__":
    main()
