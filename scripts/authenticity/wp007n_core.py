"""WP007N internal CPU instruments; measurements never confer origin authority."""
from __future__ import annotations

import ctypes
import hashlib
import io
import json
import os
import shutil
import sys
import time
import tempfile
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image, ImageOps, JpegImagePlugin
from torchvision import transforms as T

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "research/wp007n"
RUNTIME = Path(os.environ.get("WP007N_RUNTIME", str(Path(tempfile.gettempdir()) / "lythaus-wp007n-runtime")))
DINO_CODE = Path(os.environ.get("WP007N_DINO_CODE", str(Path(tempfile.gettempdir()) / "lythaus-wp007e-backbones/facebookresearch-dinov2")))
SAFE_HASH = "b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e"
SAFE_THRESHOLD = 0.5864923000335693
SEED = 2026091907
CONDITIONS = ("original", "jpeg95", "jpeg75", "resize75", "resize75_jpeg95", "png_roundtrip")


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()


def digest(value):
    return hashlib.sha256(canonical(value)).hexdigest()


def file_hash(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def array_hash(array):
    array = np.ascontiguousarray(array)
    return hashlib.sha256(canonical([str(array.dtype), list(array.shape)]) + array.tobytes()).hexdigest()


def save_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".partial")
    temporary.write_bytes(json.dumps(value, indent=2, sort_keys=True, allow_nan=False).encode() + b"\n")
    os.replace(temporary, path)


def resources():
    class Memory(ctypes.Structure):
        _fields_ = [("length", ctypes.c_ulong), ("load", ctypes.c_ulong)] + [(x, ctypes.c_ulonglong) for x in ("total", "available", "page_total", "page_available", "virtual_total", "virtual_available", "extended")]
    m = Memory()
    m.length = ctypes.sizeof(m)
    if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m)):
        raise RuntimeError("MEMORY_TELEMETRY_UNAVAILABLE")
    return {"availableBytes": m.available, "freeDiskBytes": shutil.disk_usage(RUNTIME).free}


def guard():
    state = resources()
    if state["availableBytes"] < 4 * 1024**3:
        raise RuntimeError("AVAILABLE_MEMORY_GUARD")
    if state["freeDiskBytes"] < 1024**3:
        raise RuntimeError("FREE_DISK_GUARD")
    return state


def configure():
    torch.set_num_threads(2)
    torch.set_num_interop_threads(1)
    torch.use_deterministic_algorithms(True)
    torch.manual_seed(SEED)


def seed_for(input_hash, draw):
    return int.from_bytes(hashlib.sha256(canonical([SEED, input_hash, int(draw)])).digest()[:8], "big") % (2**63 - 1)


def noise_for(tensor, input_hash, draw):
    generator = torch.Generator(device="cpu").manual_seed(seed_for(input_hash, draw))
    return torch.randn(tensor.shape, generator=generator, dtype=tensor.dtype, device="cpu")


def transform_for(arm):
    mean, std = ((.485, .456, .406), (.229, .224, .225)) if arm == "A" else ((.5, .5, .5), (.5, .5, .5))
    return T.Compose([T.Resize((224, 224), interpolation=T.InterpolationMode.BILINEAR, antialias=True), T.ToTensor(), T.Normalize(mean, std)])


def preprocessing_contract(arm):
    return {"arm": arm, "geometry": [224, 224], "resize": "PIL_BILINEAR_SQUASH_ANTIALIAS_TRUE", "mean": [.485, .456, .406] if arm == "A" else [.5]*3, "std": [.229, .224, .225] if arm == "A" else [.5]*3, "precision": "float32", "orientation": "EXIF_TRANSPOSE_BEFORE_RGB", "icc": "NO_PROFILE_CONVERSION_PIL_RGB_VALUES", "pooling": "x_norm_clstoken_1024" if arm == "A" else "official_attention_pool_projected_1024"}


def load_model(arm, official=False):
    guard()
    start = time.perf_counter()
    artifact = RUNTIME / ("models/dinov2_vitl14_pretrain.pth" if arm == "A" else "models/PE-Core-B16-224.pt")
    frozen = json.loads((OUT / "checkpoint-freeze.json").read_text())[arm]
    if file_hash(artifact) != frozen["sha256"] or artifact.stat().st_size != frozen["bytes"]:
        raise RuntimeError("CHECKPOINT_IDENTITY_MISMATCH")
    if arm == "A":
        path = RUNTIME / "models/dinov2_vitl14_pretrain.pth"
        model = torch.hub.load(str(DINO_CODE), "dinov2_vitl14", source="local", pretrained=False)
        model.load_state_dict(torch.load(path, map_location="cpu", weights_only=True, mmap=True), strict=True)
    else:
        sys.path.insert(0, str(RUNTIME / "pe"))
        from core.vision_encoder.pe import VisionTransformer
        path = RUNTIME / "models/PE-Core-B16-224.pt"
        model = VisionTransformer.from_config("PE-Core-B16-224", pretrained=official, checkpoint_path=str(path))
        if not official:
            state = torch.load(path, map_location="cpu", weights_only=True, mmap=True)
            state = state.get("state_dict", state.get("weights", state))
            state = {k.replace("module.", ""): v for k, v in state.items()}
            state = {k.replace("visual.", ""): v for k, v in state.items() if k.startswith("visual.")}
            if not state:
                raise RuntimeError("NO_VISION_WEIGHTS")
            model.load_state_dict(state, strict=True)
    model.eval().requires_grad_(False)
    guard()
    return model, {"checkpointSha256": file_hash(path), "checkpointBytes": path.stat().st_size, "parameters": sum(p.numel() for p in model.parameters()), "initializationSeconds": time.perf_counter()-start, "preprocessing": preprocessing_contract(arm)}


@torch.inference_mode()
def response(model, tensor, input_hash, draws=3):
    clean = model(tensor)
    if not bool(torch.isfinite(clean).all()):
        raise ValueError("NONFINITE_CLEAN_FEATURE")
    measurements = []
    for draw in range(draws):
        noise = noise_for(tensor, input_hash, draw)
        perturbed = model(tensor + .05 * noise)
        if not bool(torch.isfinite(perturbed).all()):
            raise ValueError("NONFINITE_PERTURBED_FEATURE")
        similarity = F.cosine_similarity(clean, perturbed, dim=-1).item()
        if not np.isfinite(similarity):
            raise ValueError("NONFINITE_COSINE")
        measurements.append({"draw": draw, "seed": seed_for(input_hash, draw), "similarity": similarity, "response": 1.-similarity})
    return clean, measurements


def controlled(image, condition):
    if condition not in CONDITIONS:
        raise ValueError("UNDECLARED_CONDITION")
    result = image.copy()
    if condition.startswith("resize75"):
        result = result.resize((max(1, round(image.width*.75)), max(1, round(image.height*.75))), Image.Resampling.LANCZOS)
    facts = {"condition": condition, "operationScope": "FULL_DECODED_UPLOAD", "requestedQuality": None, "dqt": None, "sampling": None}
    if "jpeg" in condition:
        q = 75 if condition == "jpeg75" else 95
        buf = io.BytesIO()
        result.save(buf, format="JPEG", quality=q, subsampling=2, optimize=False, progressive=False)
        encoded = buf.getvalue()
        result = Image.open(io.BytesIO(encoded))
        facts.update(requestedQuality=q, dqt=result.quantization, sampling=JpegImagePlugin.get_sampling(result), encodedSha256=hashlib.sha256(encoded).hexdigest(), codec="Pillow/libjpeg")
        result = result.convert("RGB")
    elif condition == "png_roundtrip":
        buf = io.BytesIO()
        result.save(buf, format="PNG")
        result = Image.open(io.BytesIO(buf.getvalue())).convert("RGB")
    facts.update(dimensions=list(result.size), decodedRgbSha256=array_hash(np.asarray(result)))
    return result, facts


def engineering(arm):
    configure()
    start = time.time()
    model, identity = load_model(arm)
    checkpoint = RUNTIME / ("models/dinov2_vitl14_pretrain.pth" if arm == "A" else "models/PE-Core-B16-224.pt")
    rows, clean_outputs, inputs = [], [], []
    for index in range(10):
        guard()
        rng = np.random.default_rng(index+10000)
        values = rng.integers(0, 256, (240+index*3, 280+index*5, 3), dtype=np.uint8)
        if index < 3:
            values[:] = index*127
        elif index < 6:
            values = np.asarray(Image.fromarray(values).resize((16, 16)).resize((values.shape[1], values.shape[0])))
        tensor = transform_for(arm)(Image.fromarray(values)).unsqueeze(0)
        ih = array_hash(tensor.numpy())
        t0 = time.perf_counter()
        with torch.inference_mode():
            clean = model(tensor)
            repeat = model(tensor)
            reference = model.forward_features(tensor)["x_norm_clstoken"] if arm == "A" else model(tensor)
            zero = model(tensor + torch.zeros_like(tensor))
            noise = noise_for(tensor, ih, 0)
            changed = model(tensor + noise*.05)
            replay = model(tensor + noise_for(tensor, ih, 0)*.05)
            sim = F.cosine_similarity(clean, changed, dim=-1).item()
            manual = (torch.sum(clean*changed, dim=-1)/(torch.linalg.vector_norm(clean, dim=-1)*torch.linalg.vector_norm(changed, dim=-1))).item()
        elapsed = time.perf_counter()-t0
        row = {"fixture": index, "engineeringOnly": True, "dimension": list(clean.shape), "finite": bool(torch.isfinite(clean).all()), "repeatMaxAbs": float((repeat-clean).abs().max()), "zeroNoiseMaxAbs": float((zero-clean).abs().max()), "referenceFeatureMaxAbs": float((reference-clean).abs().max()), "noiseReplayMaxAbs": float((replay-changed).abs().max()), "cosineArithmeticError": abs(sim-manual), "response": 1-sim, "sixForwardsSeconds": elapsed, "resources": resources()}
        rows.append(row)
        clean_outputs.append(clean.numpy())
        inputs.append(tensor)
        print(json.dumps({"arm":arm, "engineeringFixture":index, "seconds":elapsed}), flush=True)
    del model
    import gc
    gc.collect()
    official_errors = []
    if arm == "B":
        model, _ = load_model(arm, official=True)
        from core.vision_encoder.pe import CLIP
        from types import SimpleNamespace
        with torch.inference_mode():
            for tensor, expected in zip(inputs, clean_outputs):
                via_clip = CLIP.encode_image(SimpleNamespace(visual=model), tensor, normalize=False)
                official_errors.append(float(np.max(np.abs(via_clip.numpy()-expected))))
        del model
        gc.collect()
    result = {"identity":identity, "arm":arm, "fixtures":rows, "officialVisionLoaderAndClipEncodeErrors":official_errors, "checkpointAfter":file_hash(checkpoint), "checkpointUnchanged":file_hash(checkpoint)==identity["checkpointSha256"], "startedUnix":start, "endedUnix":time.time(), "codeHash":file_hash(__file__), "command":f"python wp007n_core.py engineering {arm}", "estimatedForwardP95Seconds":float(np.quantile([r['sixForwardsSeconds']/6 for r in rows],.95)), "productionAuthorization":"NO"}
    save_json(OUT / f"engineering-{arm}.json", result)


if __name__ == "__main__":
    if len(sys.argv) == 3 and sys.argv[1] == "engineering" and sys.argv[2] in ("A", "B"):
        engineering(sys.argv[2])
    else:
        raise SystemExit("Usage: wp007n_core.py engineering A|B")
