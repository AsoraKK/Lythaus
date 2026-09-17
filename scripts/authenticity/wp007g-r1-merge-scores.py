"""Merge exact upstream detector outputs into a safe, row-keyed table."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


FLUX2_MARKERS = ("flux.2", "flux2", "flux-2")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def load_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def nested_records(payload: dict, requested_id: str) -> tuple[str, list[dict]]:
    if "records" in payload:
        return payload.get("detectorId", payload.get("candidateId", "UNKNOWN")), payload["records"]
    detectors = payload.get("detectors", [])
    matching = [detector for detector in detectors if detector.get("detectorId") == requested_id]
    if len(matching) != 1:
        raise RuntimeError(f"EXPECTED_ONE_REQUESTED_DETECTOR_OUTPUT:{requested_id}")
    detector = matching[0]
    return detector["detectorId"], detector["records"]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--spai", type=Path, required=True)
    parser.add_argument("--rine", type=Path, required=True)
    parser.add_argument("--ufd", type=Path, required=True)
    parser.add_argument("--safe", type=Path, required=True)
    parser.add_argument("--modern-freeze", type=Path, required=True)
    parser.add_argument("--negative-freeze", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--posthoc", action="store_true")
    args = parser.parse_args()

    manifest = load_json(args.manifest)
    if args.posthoc:
        if not manifest.get("posthocDiagnostic") or not manifest.get("flux1PixelAccess") or manifest.get("flux2PixelAccess"):
            raise RuntimeError("POSTHOC_MANIFEST_REQUIRED")
    elif not manifest.get("scoreBlind") or manifest.get("flux1PixelAccess") or manifest.get("flux2PixelAccess"):
        raise RuntimeError("SCORE_BLIND_SEALED_MANIFEST_REQUIRED")
    expected = {record["rowKey"]: record for record in manifest["records"]}
    if len(expected) != len(manifest["records"]):
        raise RuntimeError("DUPLICATE_MANIFEST_ROW_KEY")
    for record in expected.values():
        family = record.get("generatorFamily", "") or ""
        if any(marker in family.lower() for marker in FLUX2_MARKERS):
            raise RuntimeError(f"FLUX2_FAMILY_DENIED:{family}")

    detector_payloads = {
        "SPAI_C512": load_json(args.spai),
        "RINE": load_json(args.rine),
        "UNIVERSAL_FAKE_DETECT": load_json(args.ufd),
        "SAFE": load_json(args.safe),
    }
    detector_source_paths = {
        "SPAI_C512": args.spai,
        "RINE": args.rine,
        "UNIVERSAL_FAKE_DETECT": args.ufd,
        "SAFE": args.safe,
    }
    detector_rows: dict[str, dict[str, dict]] = {}
    detector_meta: dict[str, dict] = {}
    for expected_id, payload in detector_payloads.items():
        if payload.get("flux2PixelAccess") or (payload.get("flux1PixelAccess") and not args.posthoc):
            raise RuntimeError(f"SEALED_HOLDOUT_ACCESS:{expected_id}")
        actual_id, records = nested_records(payload, expected_id)
        if expected_id == "UNIVERSAL_FAKE_DETECT":
            detector_name = "UFD"
        elif expected_id == "SPAI_C512":
            detector_name = "SPAI_C512"
        else:
            detector_name = actual_id
        if detector_name == "SAFE" and actual_id != "SAFE":
            raise RuntimeError("SAFE_ID_MISMATCH")
        if expected_id == "SPAI_C512":
            keys = [row["sampleId"] for row in records]
        elif detector_name == "SAFE":
            keys = [row["rowKey"] for row in records]
        else:
            keys = [f"{row['role']}__{row['sourceFamilyId']}" for row in records]
        if len(keys) != len(set(keys)):
            raise RuntimeError(f"DUPLICATE_DETECTOR_ROW:{detector_name}")
        if set(keys) == set(expected):
            detector_rows[detector_name] = dict(zip(keys, records))
        elif detector_name == "SPAI_C512":
            bridge = {row["sampleId"]: row["rowKey"] for row in expected.values()}
            if set(keys) != set(bridge):
                missing = sorted(set(bridge) - set(keys))[:3]
                extra = sorted(set(keys) - set(bridge))[:3]
                raise RuntimeError(f"DETECTOR_COVERAGE_MISMATCH:{detector_name}:missing={missing}:extra={extra}")
            detector_rows[detector_name] = {bridge[key]: record for key, record in zip(keys, records)}
        elif detector_name != "SAFE":
            # The preserved CLIP adapters emit role/sourceFamilyId but not
            # the transform-prefixed rowKey.  Resolve that relation only
            # through the frozen manifest, never by score or ordering.
            bridge = {
                f"{row['role']}__{row['sourceFamilyId']}": row["rowKey"]
                for row in expected.values()
            }
            if set(keys) != set(bridge):
                missing = sorted(set(bridge) - set(keys))[:3]
                extra = sorted(set(keys) - set(bridge))[:3]
                raise RuntimeError(f"DETECTOR_COVERAGE_MISMATCH:{detector_name}:missing={missing}:extra={extra}")
            detector_rows[detector_name] = {bridge[key]: record for key, record in zip(keys, records)}
        else:
            missing = sorted(set(expected) - set(keys))[:3]
            extra = sorted(set(keys) - set(expected))[:3]
            raise RuntimeError(f"DETECTOR_COVERAGE_MISMATCH:{detector_name}:missing={missing}:extra={extra}")
        detector_meta[detector_name] = {
            "source": str(detector_source_paths[expected_id]),
            "detectorId": actual_id,
            "checkpointSha256": payload.get("checkpointSha256") or payload.get("detectors", [{}])[0].get("checkpointSha256"),
            "clipWeightSha256": payload.get("detectors", [{}])[0].get("clipWeightSha256"),
            "loadSeconds": payload.get("loadSeconds") or payload.get("detectors", [{}])[0].get("loadSeconds"),
            "runtimeP50Seconds": payload.get("runtimeP50Seconds") or payload.get("detectors", [{}])[0].get("runtimeP50Seconds"),
            "runtimeP95Seconds": payload.get("runtimeP95Seconds") or payload.get("detectors", [{}])[0].get("runtimeP95Seconds"),
        }

    merged: list[dict] = []
    for row_key in sorted(expected):
        source = expected[row_key]
        values = {
            "SPAI_C512": detector_rows["SPAI_C512"][row_key]["score"],
            "RINE": detector_rows["RINE"][row_key]["rawScore"],
            "UFD": detector_rows["UFD"][row_key]["rawScore"],
            "SAFE": detector_rows["SAFE"][row_key]["rawScore"],
        }
        runtimes = {
            "SPAI_C512": detector_rows["SPAI_C512"][row_key].get("runtimeSeconds"),
            "RINE": detector_rows["RINE"][row_key].get("runtimeSeconds"),
            "UFD": detector_rows["UFD"][row_key].get("runtimeSeconds"),
            "SAFE": detector_rows["SAFE"][row_key].get("runtimeMs", 0) / 1000.0,
        }
        merged.append({
            "rowKey": row_key,
            "sampleId": source["sampleId"],
            "sourceFamilyId": source["sourceFamilyId"],
            "role": source["role"],
            "label": source["label"],
            "sourceSubtype": source.get("sourceSubtype"),
            "cameraDeviceFamily": source.get("cameraDeviceFamily"),
            "generatorFamily": source.get("generatorFamily"),
            "promptRegime": source.get("promptRegime"),
            "transform": source.get("transform"),
            "baseRowKey": source.get("baseRowKey"),
            "baseSourceFamilyId": source.get("baseSourceFamilyId"),
            "inputFormat": source["format"],
            "inputBytes": source["bytes"],
            "inputFileSha256": source["sourceSha256"],
            "detectorScores": values,
            "detectorRuntimeSeconds": runtimes,
        })

    output = {
        "schemaVersion": "lythaus-wp007g-r1-raw-modern-scores-v1",
        "scoreBlind": not args.posthoc,
        "posthocDiagnostic": args.posthoc,
        "flux1PixelAccess": args.posthoc,
        "flux2PixelAccess": False,
        "modernDataFreezeSha256": sha256_file(args.modern_freeze),
        "negativeDataFreezeSha256": sha256_file(args.negative_freeze),
        "inputManifestSha256": sha256_file(args.manifest),
        "detectors": detector_meta,
        "records": merged,
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(output, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "records": len(merged),
        "modern": sum(row["label"] == 1 for row in merged),
        "negative": sum(row["label"] == 0 for row in merged),
        "outputSha256": sha256_file(args.output),
    }))


if __name__ == "__main__":
    main()
