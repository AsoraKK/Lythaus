"""Shared deterministic WP007E image, manifest, and hashing primitives."""

from __future__ import annotations

import hashlib
import io
import json
import os
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageOps


CANONICAL_SIZE = 512
CANONICAL_RESAMPLER = "PIL.Image.Resampling.LANCZOS"


def stable_bytes(value: Any) -> bytes:
    return json.dumps(value, ensure_ascii=True, sort_keys=True, separators=(",", ":")).encode("utf-8")


def stable_hash(value: Any) -> str:
    return hashlib.sha256(stable_bytes(value)).hexdigest()


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        json.dump(value, handle, ensure_ascii=True, sort_keys=True, indent=2)
        handle.write("\n")


def role_root(root_key: str) -> Path:
    roots = {
        "CSAFE_WP006E_CACHE": Path(os.environ["LYTHAUS_WP007E_DATA_ROOT"]) / "wp006e-csafe-cache-4e8c0d40f2c7",
        "WP007E_CONTROLLED_DIGITAL_CACHE": Path(os.environ["LYTHAUS_WP007E_DIGITAL_ROOT"]),
        "WP007A_DIFFUSIONDB_CACHE": Path(os.environ["LYTHAUS_WP007E_DATA_ROOT"]) / "90_RESEARCH_ONLY" / "wp007a-diffusiondb-cache",
    }
    if root_key not in roots:
        raise KeyError(f"unknown_source_root:{root_key}")
    return roots[root_key]


def source_path(record: dict[str, Any]) -> Path:
    path = role_root(record["sourceRootKey"]) / Path(record["sourceRelativePath"])
    if not path.is_file():
        raise FileNotFoundError(path)
    return path


def decode_source(record: dict[str, Any]) -> Image.Image:
    path = source_path(record)
    source = path.read_bytes()
    if path.suffix.lower() == ".svg":
        import cairosvg

        source = cairosvg.svg2png(bytestring=source, output_width=1024, output_height=1024)
    with Image.open(io.BytesIO(source)) as image:
        image.load()
        return ImageOps.exif_transpose(image).convert("RGB")


def canonicalize(image: Image.Image) -> Image.Image:
    image = image.convert("RGB")
    width, height = image.size
    if width < 1 or height < 1:
        raise ValueError("empty_image")
    scale = CANONICAL_SIZE / min(width, height)
    resized_size = (max(CANONICAL_SIZE, round(width * scale)), max(CANONICAL_SIZE, round(height * scale)))
    resized = image.resize(resized_size, resample=Image.Resampling.LANCZOS)
    left = (resized.width - CANONICAL_SIZE) // 2
    top = (resized.height - CANONICAL_SIZE) // 2
    return resized.crop((left, top, left + CANONICAL_SIZE, top + CANONICAL_SIZE)).convert("RGB")


def png_bytes(image: Image.Image) -> bytes:
    output = io.BytesIO()
    image.convert("RGB").save(output, format="PNG", optimize=False, compress_level=6)
    return output.getvalue()


def save_png(image: Image.Image, path: Path) -> str:
    data = png_bytes(image)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    return sha256_bytes(data)


def image_array(image: Image.Image) -> np.ndarray:
    return np.asarray(image.convert("RGB"), dtype=np.float32) / 255.0


def roundtrip_metrics(original: Image.Image, reconstructed: Image.Image) -> dict[str, float]:
    a = image_array(original)
    b = image_array(reconstructed)
    mse = float(np.mean((a - b) ** 2))
    psnr = float("inf") if mse == 0 else float(10.0 * np.log10(1.0 / mse))
    luminance_a = 0.2126 * a[:, :, 0] + 0.7152 * a[:, :, 1] + 0.0722 * a[:, :, 2]
    luminance_b = 0.2126 * b[:, :, 0] + 0.7152 * b[:, :, 1] + 0.0722 * b[:, :, 2]
    try:
        from skimage.metrics import structural_similarity

        ssim = float(structural_similarity(luminance_a, luminance_b, data_range=1.0))
    except Exception:
        ssim = float("nan")
    return {"psnrDb": psnr, "ssim": ssim, "meanAbsolutePixelError": float(np.mean(np.abs(a - b)))}


def implementation_hash(*paths: Path) -> str:
    digest = hashlib.sha256()
    for path in paths:
        digest.update(path.name.encode("utf-8"))
        digest.update(path.read_bytes())
    return digest.hexdigest()
