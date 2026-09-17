"""Build the post-freeze WP007F final result without changing any scores."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import statistics
from pathlib import Path


def wilson(successes: int, total: int) -> list[float]:
    if not total:
        return [None, None]
    z = 1.959963984540054
    p = successes / total
    denominator = 1 + z * z / total
    centre = p + z * z / (2 * total)
    spread = z * math.sqrt((p * (1 - p) + z * z / (4 * total)) / total)
    return [round((centre - spread) / denominator, 6), round((centre + spread) / denominator, 6)]


def rate(successes: int, total: int) -> dict:
    return {"count": successes, "total": total, "rate": round(successes / total, 6) if total else None, "wilson95": wilson(successes, total)}


def summary(values: list[float]) -> dict:
    if not values:
        return {"count": 0, "median": None, "p50": None, "p95": None, "iqr": [None, None], "min": None, "max": None}
    ordered = sorted(values)

    def percentile(fraction: float) -> float:
        position = (len(ordered) - 1) * fraction
        lower = math.floor(position)
        upper = math.ceil(position)
        if lower == upper:
            return ordered[lower]
        return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)

    return {
        "count": len(values),
        "median": round(statistics.median(values), 9),
        "p50": round(percentile(0.50), 9),
        "p95": round(percentile(0.95), 9),
        "iqr": [round(ordered[len(ordered) // 4], 9), round(ordered[(3 * len(ordered)) // 4], 9)],
        "min": round(min(values), 9),
        "max": round(max(values), 9),
    }


def score_map(path: Path) -> dict[str, float]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    if "records" in payload:
        return {item["sampleId"]: float(item["score"]) for item in payload["records"]}
    if len(payload.get("detectors", [])) != 1 and path.name.startswith("spai"):
        raise RuntimeError("FINAL_SCORE_FILE_INVALID")
    return {item["sampleId"]: float(item["rawScore"]) for detector in payload["detectors"] for item in detector["records"]}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--inputs", type=Path, required=True)
    parser.add_argument("--freeze", type=Path, required=True)
    parser.add_argument("--spai", type=Path, required=True)
    parser.add_argument("--pretrained", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    inputs = json.loads(args.inputs.read_text(encoding="utf-8"))
    freeze = json.loads(args.freeze.read_text(encoding="utf-8"))
    records = inputs["records"]
    by_sample = {item["sampleId"]: item for item in records}
    spai_payload = json.loads(args.spai.read_text(encoding="utf-8"))
    scores = {"SPAI_C512": score_map(args.spai)}
    runtimes = {"SPAI_C512": [float(item["runtimeSeconds"]) for item in spai_payload["records"]]}
    pretrained = json.loads(args.pretrained.read_text(encoding="utf-8"))
    for detector in pretrained["detectors"]:
        scores[detector["detectorId"]] = {item["sampleId"]: float(item["rawScore"]) for item in detector["records"]}
        runtimes[detector["detectorId"]] = [float(item["runtimeSeconds"]) for item in detector["records"]]
    thresholds = {item["detectorId"]: item["developmentActionThreshold"] for item in freeze["detectors"]}

    def predicate(detector_id: str, sample_id: str) -> bool:
        return scores[detector_id][sample_id] >= thresholds[detector_id]

    def rows_for(role: str) -> list[dict]:
        return [item for item in records if item["role"] == role]

    detector_results = []
    for detector_id in ("SPAI_C512", "UNIVERSAL_FAKE_DETECT", "RINE"):
        flux_rows = rows_for("FLUX1_HOLDOUT")
        camera_rows = rows_for("FINAL_CAMERA_CONTROLS")
        digital_rows = rows_for("FINAL_DIGITAL_CONTROLS")
        detector_results.append({
            "detectorId": detector_id,
            "threshold": thresholds[detector_id],
            "flux1Recall": rate(sum(predicate(detector_id, row["sampleId"]) for row in flux_rows), len(flux_rows)),
            "finalCameraFpr": rate(sum(predicate(detector_id, row["sampleId"]) for row in camera_rows), len(camera_rows)),
            "finalDigitalFpr": rate(sum(predicate(detector_id, row["sampleId"]) for row in digital_rows), len(digital_rows)),
            "finalOverallNegativeFpr": rate(sum(predicate(detector_id, row["sampleId"]) for row in camera_rows + digital_rows), len(camera_rows + digital_rows)),
            "flux1Score": summary([scores[detector_id][row["sampleId"]] for row in flux_rows]),
            "finalCameraScore": summary([scores[detector_id][row["sampleId"]] for row in camera_rows]),
            "finalDigitalScore": summary([scores[detector_id][row["sampleId"]] for row in digital_rows]),
            "runtimeSeconds": summary(runtimes[detector_id]),
        })

    def fused(row: dict) -> bool:
        sample_id = row["sampleId"]
        return predicate("SPAI_C512", sample_id) and (predicate("UNIVERSAL_FAKE_DETECT", sample_id) or predicate("RINE", sample_id))

    flux_rows = rows_for("FLUX1_HOLDOUT")
    camera_rows = rows_for("FINAL_CAMERA_CONTROLS")
    digital_rows = rows_for("FINAL_DIGITAL_CONTROLS")
    fused_rows = flux_rows + camera_rows + digital_rows
    fused_metrics = {
        "rule": "SPAI_C512_AND_ANY_CLIP_GENERATIVE_GROUP",
        "independentEvidenceGroups": ["SPAI_SPECTRAL", "CLIP_GENERATIVE"],
        "flux1Recall": rate(sum(fused(row) for row in flux_rows), len(flux_rows)),
        "finalCameraFpr": rate(sum(fused(row) for row in camera_rows), len(camera_rows)),
        "finalDigitalFpr": rate(sum(fused(row) for row in digital_rows), len(digital_rows)),
        "finalOverallNegativeFpr": rate(sum(fused(row) for row in camera_rows + digital_rows), len(camera_rows + digital_rows)),
    }
    prompt_regimes = {}
    for row in flux_rows:
        prompt_number = int(row["promptId"].split("_")[-1])
        regime = f"REGIME_{((prompt_number - 1) // 10) + 1}"
        prompt_regimes.setdefault(regime, []).append(row)
    for regime, rows_for_regime in sorted(prompt_regimes.items()):
        fused_metrics.setdefault("promptRegimes", {})[regime] = {
            "count": len(rows_for_regime),
            "spaiRecall": rate(sum(predicate("SPAI_C512", row["sampleId"]) for row in rows_for_regime), len(rows_for_regime)),
            "rineRecall": rate(sum(predicate("RINE", row["sampleId"]) for row in rows_for_regime), len(rows_for_regime)),
            "ufdRecall": rate(sum(predicate("UNIVERSAL_FAKE_DETECT", row["sampleId"]) for row in rows_for_regime), len(rows_for_regime)),
            "fusedRecall": rate(sum(fused(row) for row in rows_for_regime), len(rows_for_regime)),
        }

    output = {
        "schemaVersion": "lythaus-wp007f-flux1-final-result-v1",
        "calibrationFreezeSha256": hashlib.sha256(args.freeze.read_bytes()).hexdigest(),
        "inputManifest": args.inputs.name,
        "holdoutFreezeSha256": freeze["holdoutFreezeSha256"],
        "scoreBlind": False,
        "flux1PixelAccess": True,
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
        "detectors": detector_results,
        "fusedHighConfidenceRule": fused_metrics,
        "noPostUnblindTuning": True,
        "noSecondCandidateEvaluation": True,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"sha256": hashlib.sha256(args.output.read_bytes()).hexdigest(), "flux1Count": len(flux_rows), "finalNegativeCount": len(camera_rows) + len(digital_rows)}))


if __name__ == "__main__":
    main()
