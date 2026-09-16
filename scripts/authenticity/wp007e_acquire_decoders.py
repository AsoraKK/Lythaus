"""Acquire and hash the predeclared local, non-FLUX decoder candidates."""

from __future__ import annotations

import argparse
import hashlib
import json
import urllib.request
from pathlib import Path

from huggingface_hub import snapshot_download


TAESD_COMMIT = "e87efbcfc5298d84986b5d9280f40d358b6a228d"
DECODER_CANDIDATES = [
    {
        "variantId": "SD1X_FULL_A1",
        "lineage": "SD1X",
        "kind": "DIFFUSERS_AUTOENCODER_KL",
        "repo": "stabilityai/sd-vae-ft-mse",
        "revision": "31f26fdeee1355a5c34592e401dd41e45d25a493",
        "weightName": "diffusion_pytorch_model.safetensors",
        "license": "MIT",
        "sourceUrl": "https://huggingface.co/stabilityai/sd-vae-ft-mse",
    },
    {
        "variantId": "SD1X_TAESD_A2",
        "lineage": "SD1X",
        "kind": "TAESD_PTH",
        "repo": "madebyollin/taesd",
        "revision": TAESD_COMMIT,
        "encoderName": "taesd_encoder.pth",
        "decoderName": "taesd_decoder.pth",
        "license": "MIT",
        "sourceUrl": f"https://github.com/madebyollin/taesd/tree/{TAESD_COMMIT}",
    },
    {
        "variantId": "SDXL_FULL_B1",
        "lineage": "SDXL",
        "kind": "DIFFUSERS_AUTOENCODER_KL",
        "repo": "stabilityai/sdxl-vae",
        "revision": "6f5909a7e596173e25d4e97b07fd19cdf9611c76",
        "weightName": "diffusion_pytorch_model.safetensors",
        "license": "MIT",
        "sourceUrl": "https://huggingface.co/stabilityai/sdxl-vae",
    },
    {
        "variantId": "SDXL_TAESD_B2",
        "lineage": "SDXL",
        "kind": "TAESD_PTH",
        "repo": "madebyollin/taesd",
        "revision": TAESD_COMMIT,
        "encoderName": "taesdxl_encoder.pth",
        "decoderName": "taesdxl_decoder.pth",
        "license": "MIT",
        "sourceUrl": f"https://github.com/madebyollin/taesd/tree/{TAESD_COMMIT}",
    },
    {
        "variantId": "SD3_TAESD3_C1",
        "lineage": "SD3",
        "kind": "TAESD_PTH",
        "repo": "madebyollin/taesd",
        "revision": TAESD_COMMIT,
        "encoderName": "taesd3_encoder.pth",
        "decoderName": "taesd3_decoder.pth",
        "license": "MIT",
        "sourceUrl": f"https://github.com/madebyollin/taesd/tree/{TAESD_COMMIT}",
    },
    {
        "variantId": "SANA_TAESANA_D1",
        "lineage": "SANA",
        "kind": "TAESD_PTH_F32",
        "repo": "madebyollin/taesd",
        "revision": TAESD_COMMIT,
        "encoderName": "taesana_encoder.pth",
        "decoderName": "taesana_decoder.pth",
        "license": "MIT",
        "sourceUrl": f"https://github.com/madebyollin/taesd/tree/{TAESD_COMMIT}",
    },
]


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def download_url(url: str, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        with urllib.request.urlopen(url, timeout=60) as response:
            target.write_bytes(response.read())


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--weights-root", required=True)
    args = parser.parse_args()
    root = Path(args.weights_root)
    root.mkdir(parents=True, exist_ok=True)
    taesd_code = root / "taesd.py"
    download_url(f"https://raw.githubusercontent.com/madebyollin/taesd/{TAESD_COMMIT}/taesd.py", taesd_code)

    registry = {
        "schemaVersion": "lythaus-wp007e-decoder-weight-registry-v1",
        "taesdRepository": "madebyollin/taesd",
        "taesdCommit": TAESD_COMMIT,
        "taesdCode": {
            "filename": "taesd.py",
            "sha256": sha256_file(taesd_code),
            "sourceUrl": f"https://raw.githubusercontent.com/madebyollin/taesd/{TAESD_COMMIT}/taesd.py",
            "license": "MIT",
        },
        "candidates": [],
        "downloadPolicy": {
            "outsideGit": True,
            "safetensorsPreferred": True,
            "maxCombinedBytes": 2 * 1024 * 1024 * 1024,
            "fluxSpecificIdentifiersRejected": ["taef1", "taef2", "flux", "HiDream", "Z-Image"],
        },
    }
    total = 0
    for candidate in DECODER_CANDIDATES:
        variant_dir = root / candidate["variantId"]
        variant_dir.mkdir(parents=True, exist_ok=True)
        record = dict(candidate)
        if candidate["kind"].startswith("DIFFUSERS"):
            local_dir = snapshot_download(
                repo_id=candidate["repo"],
                revision=candidate["revision"],
                local_dir=str(variant_dir),
                allow_patterns=["config.json", "diffusion_pytorch_model.safetensors", "model_index.json", "README.md", "LICENSE"],
                local_dir_use_symlinks=False,
            )
            weight = Path(local_dir) / candidate["weightName"]
            if not weight.is_file():
                matches = list(Path(local_dir).rglob(candidate["weightName"]))
                if len(matches) != 1:
                    raise RuntimeError(f"decoder_weight_not_found:{candidate['variantId']}")
                weight = matches[0]
            record["localRelativeWeight"] = weight.relative_to(root).as_posix()
            record["weightBytes"] = weight.stat().st_size
            record["weightSha256"] = sha256_file(weight)
            record["configSha256"] = sha256_file(Path(local_dir) / "config.json")
            total += record["weightBytes"]
        else:
            files = []
            for field in ("encoderName", "decoderName"):
                name = candidate[field]
                target = variant_dir / name
                download_url(f"https://raw.githubusercontent.com/madebyollin/taesd/{TAESD_COMMIT}/{name}", target)
                if not target.is_file():
                    raise RuntimeError(f"taesd_weight_not_found:{candidate['variantId']}:{name}")
                files.append({
                    "kind": field.replace("Name", ""),
                    "filename": name,
                    "relativePath": target.relative_to(root).as_posix(),
                    "bytes": target.stat().st_size,
                    "sha256": sha256_file(target),
                })
                total += target.stat().st_size
            record["weights"] = files
        registry["candidates"].append(record)
    if total > registry["downloadPolicy"]["maxCombinedBytes"]:
        raise RuntimeError(f"decoder_weight_budget_exceeded:{total}")
    encoded = json.dumps(registry, ensure_ascii=True, sort_keys=True, separators=(",", ":")).encode("utf-8")
    registry["registrySha256"] = hashlib.sha256(encoded).hexdigest()
    repo_root = Path(__file__).resolve().parents[2]
    output = repo_root / "research" / "wp007e" / "decoder-registry.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(registry, ensure_ascii=True, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "status": "PASS",
        "registrySha256": registry["registrySha256"],
        "candidateCount": len(registry["candidates"]),
        "totalWeightBytes": total,
        "taesdCodeSha256": registry["taesdCode"]["sha256"],
    }, sort_keys=True))


if __name__ == "__main__":
    main()
