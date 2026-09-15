import argparse
import csv
import hashlib
import json
import pathlib
import time

import numpy as np
from PIL import Image


FEATURE_DEFINITION = [
    "low_frequency_energy_fraction",
    "mid_frequency_energy_fraction",
    "high_frequency_energy_fraction",
    "spectral_entropy",
    "radial_log_slope",
    "axis_periodicity_fraction",
    "local_high_frequency_residual_std",
]


def sha256_file(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def features(path: pathlib.Path) -> list[float]:
    with Image.open(path) as image:
        image.load()
        gray = np.asarray(image.convert("L").resize((256, 256), Image.Resampling.BOX), dtype=np.float64) / 255.0
    gray -= gray.mean()
    spectrum = np.fft.fftshift(np.abs(np.fft.fft2(gray)) ** 2)
    height, width = spectrum.shape
    yy, xx = np.mgrid[-height // 2:height // 2, -width // 2:width // 2]
    radius = np.sqrt((yy / (height / 2.0)) ** 2 + (xx / (width / 2.0)) ** 2) / np.sqrt(2.0)
    total = float(spectrum.sum()) + 1e-12
    bands = [
        float(spectrum[radius <= 0.10].sum()) / total,
        float(spectrum[(radius > 0.10) & (radius <= 0.30)].sum()) / total,
        float(spectrum[radius > 0.30].sum()) / total,
    ]
    probabilities = spectrum.reshape(-1) / total
    entropy = float(-(probabilities * np.log(probabilities + 1e-12)).sum() / np.log(probabilities.size))
    radial_centres = np.array([0.15, 0.35, 0.55, 0.75], dtype=np.float64)
    radial_energy = np.array([
        float(spectrum[(radius > centre - 0.10) & (radius <= centre + 0.10)].sum()) / total
        for centre in radial_centres
    ])
    slope = float(np.polyfit(np.log(radial_centres), np.log(radial_energy + 1e-12), 1)[0])
    axis_mask = (np.abs(xx) <= 1) | (np.abs(yy) <= 1)
    axis_fraction = float(spectrum[axis_mask].sum()) / total
    neighbour_mean = (np.roll(gray, 1, axis=0) + np.roll(gray, -1, axis=0) + np.roll(gray, 1, axis=1) + np.roll(gray, -1, axis=1)) / 4.0
    residual_std = float(np.std(gray - neighbour_mean))
    return [bands[0], bands[1], bands[2], entropy, slope, axis_fraction, residual_std]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input-csv", required=True, type=pathlib.Path)
    parser.add_argument("--input-root", required=True, type=pathlib.Path)
    parser.add_argument("--output-json", required=True, type=pathlib.Path)
    args = parser.parse_args()

    with args.input_csv.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))
    output = []
    for row in rows:
        path = args.input_root / row["image"]
        if not path.is_file():
            raise RuntimeError(f"SPECTRAL_INPUT_MISSING:{row['image']}")
        started = time.perf_counter()
        vector = features(path)
        elapsed = time.perf_counter() - started
        low, mid, high, entropy, slope, axis, residual = vector
        raw_score = 3.0 * high + 1.0 * mid + 0.25 * entropy + 0.20 * residual - 0.10 * slope
        output.append({
            "sampleId": pathlib.Path(row["image"]).stem,
            "score": float(raw_score),
            "runtimeSeconds": round(elapsed, 6),
            "features": {name: float(value) for name, value in zip(FEATURE_DEFINITION, vector)},
            "inputSha256": sha256_file(path),
        })
    result = {
        "schemaVersion": "lythaus-wp007c-spectral-lite-score-run-v1",
        "candidateId": "LYTHAUS_SPECTRAL_LITE_V0",
        "scoreDirection": "HIGHER_SCORE_SYNTHETIC",
        "featureDefinition": FEATURE_DEFINITION,
        "featureResolution": "native_decode_then_deterministic_256_box_average_for_fixed_fft_grid",
        "rawScoreFormula": "3.0*high_frequency_energy_fraction + 1.0*mid_frequency_energy_fraction + 0.25*spectral_entropy + 0.20*local_high_frequency_residual_std - 0.10*radial_log_slope",
        "usesFilenames": False,
        "usesMetadata": False,
        "usesDimensionsAsPredictors": False,
        "records": output,
    }
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(f"{json.dumps(result, indent=2)}\n", encoding="utf-8")
    print("CANDIDATE=LYTHAUS_SPECTRAL_LITE_V0")
    print(f"RECORDS={len(output)}")


if __name__ == "__main__":
    main()
