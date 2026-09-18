"""Analyze frozen SAFE-A scores from the real-media JPEG laboratory."""

from __future__ import annotations

import argparse
import json
import math
import statistics
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable


THRESHOLD = 0.5864923000335693
QUALITY_REQUESTS = [100, 99, 98, 97, 96, 95, 92, 90, 85, 80, 75, 65, 50]


def wilson(successes: int, total: int, z: float = 1.959963984540054) -> dict[str, float | None]:
    if total == 0:
        return {"lower": None, "upper": None}
    p = successes / total
    denominator = 1.0 + z * z / total
    centre = p + z * z / (2.0 * total)
    margin = z * math.sqrt((p * (1.0 - p) + z * z / (4.0 * total)) / total)
    return {"lower": max(0.0, (centre - margin) / denominator), "upper": min(1.0, (centre + margin) / denominator)}


def median(values: Iterable[float]) -> float | None:
    values = list(values)
    return statistics.median(values) if values else None


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    positives = [row for row in rows if row["truthLabel"] == 1]
    negatives = [row for row in rows if row["truthLabel"] == 0]
    tp = sum(row["thresholdPass"] for row in positives)
    fp = sum(row["thresholdPass"] for row in negatives)
    collapse = sum(row["originalThresholdPass"] and not row["thresholdPass"] for row in positives)
    return {
        "n": len(rows),
        "syntheticN": len(positives),
        "syntheticDetected": tp,
        "syntheticRecall": tp / len(positives) if positives else None,
        "syntheticRecallWilson95": wilson(tp, len(positives)),
        "negativeN": len(negatives),
        "falsePositives": fp,
        "negativeFpr": fp / len(negatives) if negatives else None,
        "negativeFprWilson95": wilson(fp, len(negatives)),
        "originalPassToDescendantMiss": collapse,
        "medianRawScore": median(row["rawScore"] for row in rows),
        "medianOriginalRawScore": median(row["originalRawScore"] for row in rows),
        "medianScoreDelta": median(row["scoreDeltaFromOriginal"] for row in rows),
        "minRawScore": min((row["rawScore"] for row in rows), default=None),
        "maxRawScore": max((row["rawScore"] for row in rows), default=None),
        "sourceFamilies": len({row["sourceFamilyId"] for row in rows}),
    }


def grouped(rows: list[dict[str, Any]], key_fn) -> dict[str, dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        groups[str(key_fn(row))].append(row)
    return {key: summarize(value) for key, value in sorted(groups.items())}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scores", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--markdown", type=Path, required=True)
    args = parser.parse_args()
    payload = json.loads(args.scores.read_text(encoding="utf-8"))
    rows = payload["records"]
    if payload["threshold"] != THRESHOLD or payload["flux2PixelAccess"] or payload["flux2ProviderCalls"] != 0:
        raise RuntimeError("JPEG_SCORE_PAYLOAD_NOT_FROZEN_OR_SEALED")
    if len(rows) != 2140:
        raise RuntimeError(f"JPEG_SCORE_COUNT_UNEXPECTED:{len(rows)}")
    if len({row["derivedId"] for row in rows}) != len(rows):
        raise RuntimeError("JPEG_SCORE_DERIVED_ID_DUPLICATE")
    if any(row["status"] != "OK" for row in rows):
        raise RuntimeError("JPEG_SCORE_FAILURE_PRESENT")

    primary_quality_operations = {f"JPEG{quality}_PILLOW_420" for quality in QUALITY_REQUESTS}
    pillow_quality = [row for row in rows if row["operation"] in primary_quality_operations]
    sharp_quality = [row for row in rows if row["encoderRole"] == "SHARP_LIBVIPS"]
    subsampling = [row for row in rows if row["operation"] == "JPEG95_PILLOW_SUBSAMPLING"]
    compound = [row for row in rows if row["operation"] not in primary_quality_operations and row["operation"] not in {"JPEG95_PILLOW_SUBSAMPLING", "JPEG95_SHARP_SUBSAMPLING"}]

    output = {
        "schemaVersion": "lythaus-wp007jr1-jpeg-safe-analysis-v1",
        "sourceScoreArtifact": "research/wp007j-r1/jpeg-safe-lab-results.json",
        "threshold": THRESHOLD,
        "scoreRows": len(rows),
        "pillowQualityRows": len(pillow_quality),
        "sharpQualityRows": len(sharp_quality),
        "pillowSubsamplingRows": len(subsampling),
        "compoundRows": len(compound),
        "overall": summarize(rows),
        "byEncoder": grouped(rows, lambda row: row["encoderRole"]),
        "byTruth": grouped(rows, lambda row: "synthetic" if row["truthLabel"] == 1 else row["sourceSubtype"] or "negative"),
        "pillowByQuality": grouped(pillow_quality, lambda row: row["requestedQuality"]),
        "sharpBySubsampling": grouped(sharp_quality, lambda row: row["requestedSubsampling"]),
        "pillowByQualityAndTruth": grouped(pillow_quality, lambda row: f"q{row['requestedQuality']}:{'synthetic' if row['truthLabel'] == 1 else row['sourceSubtype']}"),
        "pillowBySubsampling": grouped(subsampling, lambda row: row["requestedSubsampling"]),
        "pillowByGeneratorAndQuality": grouped(pillow_quality, lambda row: f"{row.get('generatorFamily') or row.get('sourceSubtype')}@q{row['requestedQuality']}"),
        "sharpByGeneratorAndSubsampling": grouped(sharp_quality, lambda row: f"{row.get('generatorFamily') or row.get('sourceSubtype')}@{row['requestedSubsampling']}"),
        "compoundByOperation": grouped(compound, lambda row: row["operation"]),
        "compoundByOperationAndTruth": grouped(compound, lambda row: f"{row['operation']}:{'synthetic' if row['truthLabel'] == 1 else row['sourceSubtype']}"),
        "qualityCliff": {
            "definition": "first requested quality in descending order with synthetic recall below 0.5 on the frozen SAFE-A threshold",
            "pillow": next((quality for quality in QUALITY_REQUESTS if (output := summarize([row for row in pillow_quality if row['requestedQuality'] == quality]))["syntheticRecall"] is not None and output["syntheticRecall"] < 0.5), None),
            "sharp": summarize(sharp_quality),
        },
        "unsupportedEncoderRequest": {"sharp": ["4:2:2"]},
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    lines = [
        "# SAFE-A JPEG laboratory analysis",
        "",
        f"Frozen SAFE-A threshold: `{THRESHOLD}`.",
        "",
        f"The scored matrix contains `{len(rows)}` descendants: `{len(pillow_quality)}` Pillow quality-sweep rows, `{len(sharp_quality)}` Sharp subsampling rows, and `{len(compound)}` bounded compound rows.",
        "",
        "## Quality sweep",
        "",
        "| Requested quality | N | Synthetic recall | Negative FPR | Median score delta |",
        "| ---: | ---: | ---: | ---: | ---: |",
    ]
    for quality in QUALITY_REQUESTS:
        item = output["pillowByQuality"].get(str(quality), {})
        lines.append(f"| {quality} | {item.get('n', 0)} | {item.get('syntheticRecall')} | {item.get('negativeFpr')} | {item.get('medianScoreDelta')} |")
    lines.extend([
        "",
        "## Encoder and compound summaries",
        "",
        "```json",
        json.dumps({"byEncoder": output["byEncoder"], "sharpBySubsampling": output["sharpBySubsampling"], "compoundByOperation": output["compoundByOperation"]}, indent=2, sort_keys=True),
        "```",
        "",
        "Sharp/libvips did not support the requested 4:2:2 mode in the installed path; that omission is recorded rather than silently represented as a result.",
        "",
        "This artifact reports bounded laboratory behaviour, not population-level FPR or universal JPEG claims.",
    ])
    args.markdown.parent.mkdir(parents=True, exist_ok=True)
    args.markdown.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps({"rows": len(rows), "pillowQuality": len(pillow_quality), "sharpQuality": len(sharp_quality), "compound": len(compound), "pillowCliff": output["qualityCliff"]["pillow"]}))


if __name__ == "__main__":
    main()
