"""Capture the isolated WP007E runtime contract and its immutable hash."""

from __future__ import annotations

import hashlib
import json
import platform
import sys
from pathlib import Path

import numpy
import PIL
import diffusers
import safetensors
import sklearn
import skimage
import torch
import torchvision
import transformers


def main() -> None:
    repo_root = Path(__file__).resolve().parents[2]
    packages = {
        "python": platform.python_version(),
        "torch": torch.__version__,
        "torchvision": torchvision.__version__,
        "diffusers": diffusers.__version__,
        "transformers": transformers.__version__,
        "safetensors": safetensors.__version__,
        "numpy": numpy.__version__,
        "Pillow": PIL.__version__,
        "scikit-learn": sklearn.__version__,
        "scikit-image": skimage.__version__,
    }
    value = {
        "schemaVersion": "lythaus-wp007e-runtime-lock-v1",
        "pythonExecutableClass": "EXTERNAL_ISOLATED_VENV",
        "platform": platform.platform(),
        "cpuOnly": True,
        "cudaAvailable": bool(torch.cuda.is_available()),
        "device": "cpu",
        "torchThreads": int(torch.get_num_threads()),
        "torchInteropThreads": int(torch.get_num_interop_threads()),
        "randomSeed": 20260916,
        "packages": packages,
        "cudaStackInstalled": False,
        "xformersRequired": False,
        "featureWeightsTrainable": False,
        "externalCloudGeneration": False,
    }
    encoded = json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":")).encode("utf-8")
    value["runtimeLockSha256"] = hashlib.sha256(encoded).hexdigest()
    path = repo_root / "research" / "wp007e" / "runtime-lock.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=True, sort_keys=True, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"status": "PASS", "runtimeLockSha256": value["runtimeLockSha256"], "packages": packages}, sort_keys=True))


if __name__ == "__main__":
    main()
