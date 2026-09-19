"""Cross-check current-byte JPEG facts against jpegio and jpeglib."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--feature-records", type=Path, required=True)
    parser.add_argument("--runtime-manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    sys.path.insert(0, str(Path(__file__).parent))
    from wp007l_toolforge import parse_file
    import jpegio
    import jpeglib

    rows = [json.loads(line) for line in args.feature_records.read_text(encoding="utf-8").splitlines() if line.strip()]
    runtime = json.loads(args.runtime_manifest.read_text(encoding="utf-8"))
    runtime_by_id = {row["sampleId"]: row for row in runtime["records"]}
    originals = [row for row in rows if row.get("kind") == "ORIGINAL" and row.get("valid") and row.get("format") == "JPEG"]
    dimensions = 0
    quant_tables = 0
    sampling = 0
    coefficient_shapes = 0
    errors = []
    for row in originals:
        path = Path(runtime_by_id[row["sampleId"]]["runtimePath"]) if row["sampleId"] in runtime_by_id else None
        if path is None or not path.exists():
            errors.append({"sampleId": row.get("sampleId"), "error": "runtimePath_missing"})
            continue
        try:
            parsed = parse_file(path)
            a = jpegio.read(str(path))
            b = jpeglib.read_dct(str(path))
            expected = parsed["dimensions"]
            actual = {"width": int(b.width), "height": int(b.height)}
            dimensions += int(expected["width"] == actual["width"] and expected["height"] == actual["height"] and int(a.image_width) == actual["width"] and int(a.image_height) == actual["height"])
            qt_a = [np.asarray(item) for item in (a.quant_tables or []) if item is not None]
            qt_b = [np.asarray(item) for item in np.asarray(b.qt)]
            quant_tables += int(len(qt_a) == len(qt_b) and all(np.array_equal(x, y) for x, y in zip(qt_a, qt_b)))
            factors = [(int(item.h_samp_factor), int(item.v_samp_factor)) for item in a.comp_info]
            if factors:
                if factors[0] == (1, 1):
                    expected_sampling = "4:4:4"
                elif factors[0] == (2, 1):
                    expected_sampling = "4:2:2"
                elif factors[0] == (2, 2):
                    expected_sampling = "4:2:0"
                else:
                    expected_sampling = "OTHER"
                sampling += int(parsed.get("sampling") == expected_sampling and factors == [(int(item[0]), int(item[1])) for item in np.asarray(b.samp_factor)])
            b_shape = tuple(np.asarray(b.Y).shape[:2])
            a_shape = tuple(np.asarray(a.coef_arrays[0]).shape)
            coefficient_shapes += int(a_shape == (b_shape[0] * 8, b_shape[1] * 8))
        except Exception as error:  # pragma: no cover - tool-specific failures are recorded
            errors.append({"sampleId": row.get("sampleId"), "error": f"{type(error).__name__}:{str(error)[:160]}"})
    count = len(originals)
    output = {
        "schemaVersion": "lythaus-wp007l-jpegio-crosscheck-v2",
        "sampleCount": count,
        "featureRecordsSha256": __import__("hashlib").sha256(args.feature_records.read_bytes()).hexdigest(),
        "checks": {
            "dimensions": {"matches": dimensions, "n": count},
            "quantizationTables": {"matches": quant_tables, "n": count},
            "samplingFactors": {"matches": sampling, "n": count},
            "lumaCoefficientShapes": {"matches": coefficient_shapes, "n": count},
        },
        "errors": errors,
        "libraries": {
            "jpegio": {"version": "0.3.0", "commit": "3c01f1591481399be6d7395f342ae2f2649a2fb8", "license": "Apache-2.0"},
            "jpeglib": {"version": "1.0.2", "commit": "039804ffb96d30cae7c00d76c4c029f4caa73af1", "license": "MPL-2.0"},
        },
        "interpretation": "Independent current-byte cross-check only; neither oracle establishes acquisition or authorship.",
        "flux2PixelAccess": False,
        "flux2ProviderCalls": 0,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(json.dumps({"samples": count, "errors": len(errors), "dimensions": dimensions, "quantTables": quant_tables, "sampling": sampling, "coefficientShapes": coefficient_shapes}))


if __name__ == "__main__":
    main()
