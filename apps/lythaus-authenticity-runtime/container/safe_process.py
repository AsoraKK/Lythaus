"""Persistent, CPU-only SAFE-A process. No request can select code or weights."""
from __future__ import annotations

import hashlib
import json
import math
import os
from pathlib import Path
import resource
import signal
import sys
import time
import warnings

CHECKPOINT = "b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e"
SOURCE = "57eb62f43283daffc1828bfa8b01a783c3f0b14e11cda09994fd7c22a531f3ac"
PREPROCESSING = "SAFE_OFFICIAL_RGB_CENTER_CROP_256_DWT_CLASS1_V1"
PIXELS = 16_777_216


def digest(path: Path) -> str:
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def verify_artifacts(root: Path) -> None:
    if digest(root / "models/resnet.py") != SOURCE:
        raise ValueError("SOURCE_CHECKSUM_MISMATCH")
    if digest(root / "checkpoint.pth") != CHECKPOINT:
        raise ValueError("CHECKPOINT_CHECKSUM_MISMATCH")


def load(root: Path):
    verify_artifacts(root)
    import torch
    sys.path.insert(0, str(root))
    from models.resnet import resnet50
    torch.set_num_threads(1)
    torch.set_num_interop_threads(1)
    model = resnet50(num_classes=2)
    state = torch.load(root / "checkpoint.pth", map_location="cpu", weights_only=False)
    model.load_state_dict(state.get("model", state), strict=True)
    model.eval()
    for parameter in model.parameters():
        parameter.requires_grad_(False)
    return model


def deadline(_signal, _frame):
    raise TimeoutError("TIMEOUT")


def infer(model, directory: Path, mime: str) -> dict:
    import torch
    from PIL import Image, ImageOps
    from torchvision import transforms
    Image.MAX_IMAGE_PIXELS = PIXELS
    warnings.simplefilter("error", Image.DecompressionBombWarning)
    started = time.perf_counter()
    result = {"status": "DECODE_FAILURE", "score": None, "facts": None,
              "timings": {"decodeMs": 0, "inferenceMs": 0, "peakRssBytes": 0}}
    signal.signal(signal.SIGALRM, deadline)
    try:
        signal.setitimer(signal.ITIMER_REAL, 5)
        with Image.open(directory / "input") as original:
            actual_mime = Image.MIME.get(original.format)
            width, height = original.size
            if actual_mime != mime or mime not in ("image/png", "image/jpeg"):
                result["status"] = "UNSUPPORTED"
                return result
            if getattr(original, "n_frames", 1) != 1 or original.mode != "RGB" or min(width, height) < 256 or width * height > PIXELS:
                result["status"] = "UNSUPPORTED"
                return result
            original.load()
            image = original.convert("RGB")
            result["facts"] = {"mime": mime, "width": width, "height": height, "frames": 1, "mode": "RGB", "sourceHistory": "UNKNOWN"}
            tensor = transforms.ToTensor()(transforms.CenterCrop((256, 256))(image))
            (directory / "pixels").write_bytes(image.tobytes())
            display = ImageOps.exif_transpose(original).convert("RGB")
            display.thumbnail((1024, 1024))
            clean_display = Image.frombytes("RGB", display.size, display.tobytes())
            clean_display.save(directory / "display.png", format="PNG")
        result["timings"]["decodeMs"] = (time.perf_counter() - started) * 1000
        signal.setitimer(signal.ITIMER_REAL, 90)
        inference_started = time.perf_counter()
        with torch.inference_mode():
            logits = model(tensor.unsqueeze(0))
            score = torch.softmax(logits, dim=1)[0, 1].item()
        result["timings"]["inferenceMs"] = (time.perf_counter() - inference_started) * 1000
        if not math.isfinite(score) or not 0 <= score <= 1:
            result["status"] = "INVALID_OUTPUT"
        else:
            result.update(status="OK", score=score)
    except TimeoutError:
        result.update(status="TIMEOUT", score=None)
    except Exception:
        result.update(status="INVALID_OUTPUT" if result["facts"] else "DECODE_FAILURE", score=None)
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        result["timings"]["peakRssBytes"] = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024
    return result


def main():
    root = Path("/opt/safe")
    started = time.perf_counter()
    try:
        model = load(root)
    except FileNotFoundError:
        print(json.dumps({"ready": False, "status": "UNAVAILABLE"}), flush=True)
        return
    except ValueError:
        print(json.dumps({"ready": False, "status": "CHECKSUM_MISMATCH"}), flush=True)
        return
    except Exception:
        print(json.dumps({"ready": False, "status": "UNAVAILABLE"}), flush=True)
        return
    print(json.dumps({"ready": True, "loadMs": (time.perf_counter()-started)*1000,
                      "startupRssBytes": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*1024}), flush=True)
    for line in sys.stdin:
        try:
            request = json.loads(line)
            path = Path(request["directory"]).resolve()
            if path.parent != Path("/tmp/beta") or not path.name.startswith("case-"):
                raise ValueError("INVALID_PATH")
            output = infer(model, path, request["mime"])
            print(json.dumps(output, allow_nan=False), flush=True)
        except Exception:
            print(json.dumps({"status": "INVALID_OUTPUT", "score": None}), flush=True)


if __name__ == "__main__":
    main()
