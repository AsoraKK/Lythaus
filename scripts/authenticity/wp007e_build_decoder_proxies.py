"""Materialise every frozen eligible local decoder roundtrip proxy."""

from __future__ import annotations

import argparse
import gc
import json
import time
from pathlib import Path

import torch
from PIL import Image

from wp007e_audit_decoders import load_taesd, load_variant, roundtrip
from wp007e_common import load_json, roundtrip_metrics, save_png, sha256_file


def existing_records(path: Path) -> dict[tuple[str, str], dict]:
    result = {}
    if not path.is_file():
        return result
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            item = json.loads(line)
            result[(item["variantId"], item["sourceFamilyId"])] = item
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--weights-root", required=True)
    parser.add_argument("--media-root", required=True)
    args = parser.parse_args()
    repo_root = Path(__file__).resolve().parents[2]
    weights_root = Path(args.weights_root)
    media_root = Path(args.media_root)
    roles = load_json(repo_root / "research" / "wp007e" / "data-role-freeze.json")
    canonical = load_json(repo_root / "research" / "wp007e" / "canonicalizer-spec.json")
    plan = load_json(repo_root / "research" / "wp007e" / "decoder-proxy-plan.json")
    registry = load_json(repo_root / "research" / "wp007e" / "decoder-registry.json")
    eligible = set(plan["eligibleVariants"])
    candidates = [item for item in registry["candidates"] if item["variantId"] in eligible]
    if len({item["lineage"] for item in candidates}) < 3:
        raise RuntimeError("decoder_lineage_count_below_flux_gate")
    pair_records = roles["roles"]["PAIR_BASE"]["records"]
    canonical_records = {
        item["sourceFamilyId"]: item
        for item in canonical["records"]
        if item["role"] == "PAIR_BASE"
    }
    output_root = media_root / "decoder-proxies"
    journal_path = output_root / "proxy-records.jsonl"
    output_root.mkdir(parents=True, exist_ok=True)
    journal = existing_records(journal_path)
    taesd_class = load_taesd(weights_root / "taesd.py")
    completed = 0
    total = len(candidates) * len(pair_records)
    with journal_path.open("a", encoding="utf-8", newline="\n") as journal_file:
        for candidate in candidates:
            variant = candidate["variantId"]
            model = load_variant(candidate, weights_root, taesd_class)
            for source in pair_records:
                family = source["sourceFamilyId"]
                key = (variant, family)
                canonical_record = canonical_records[family]
                canonical_path = media_root / canonical_record["canonicalRelativePath"]
                if sha256_file(canonical_path) != canonical_record["canonicalSha256"]:
                    raise RuntimeError(f"canonical_hash_changed:{family}")
                output_path = output_root / variant / f"{source['sampleId']}.png"
                existing = journal.get(key)
                if existing is not None:
                    if not output_path.is_file() or sha256_file(output_path) != existing["proxySha256"]:
                        raise RuntimeError(f"existing_proxy_integrity_failure:{variant}:{family}")
                    completed += 1
                    continue
                with Image.open(canonical_path) as image:
                    source_image = image.convert("RGB")
                started = time.perf_counter()
                proxy = roundtrip(model, candidate, source_image)
                elapsed = time.perf_counter() - started
                proxy_hash = save_png(proxy, output_path)
                metrics = roundtrip_metrics(source_image, proxy)
                item = {
                    "sampleId": f"WP007E_PROXY_{variant}_{source['sampleId']}",
                    "sourceFamilyId": family,
                    "sourceSampleId": source["sampleId"],
                    "variantId": variant,
                    "lineage": candidate["lineage"],
                    "inputCanonicalSha256": canonical_record["canonicalSha256"],
                    "proxySha256": proxy_hash,
                    "proxyRelativePath": f"decoder-proxies/{variant}/{source['sampleId']}.png",
                    "width": proxy.width,
                    "height": proxy.height,
                    "format": "PNG",
                    "dtype": "float32_cpu_inference",
                    "roundtripElapsedSeconds": round(elapsed, 6),
                    "fidelity": {key: round(value, 8) for key, value in metrics.items()},
                    "originTruth": "GENERATIVE_DECODER_DERIVED_PROXY",
                    "trainingRole": "MATCHED_DECODER_PROXY",
                    "sourceRelationship": "ROUNDTRIP_FROM_CANONICAL_REAL",
                    "fullySyntheticTruth": "NOT_CLAIMED",
                    "benchmarkTruth": "DEVELOPMENT_PROXY_ONLY",
                }
                journal_file.write(json.dumps(item, ensure_ascii=True, sort_keys=True) + "\n")
                journal_file.flush()
                journal[key] = item
                completed += 1
                if completed % 10 == 0 or completed == total:
                    print(json.dumps({"status": "PROGRESS", "completed": completed, "total": total, "variant": variant}, sort_keys=True), flush=True)
            del model
            gc.collect()
    records = sorted(journal.values(), key=lambda item: (item["variantId"], item["sourceFamilyId"]))
    if len(records) != total:
        raise RuntimeError(f"proxy_count:{len(records)}:{total}")
    if len({item["sourceFamilyId"] for item in records}) != len(pair_records):
        raise RuntimeError("proxy_source_family_count_invalid")
    manifest = {
        "schemaVersion": "lythaus-wp007e-decoder-proxy-manifest-v1",
        "decoderProxyPlanSha256": plan["decoderProxyPlanSha256"],
        "dataRoleFreezeSha256": roles["dataRoleFreezeSha256"],
        "canonicalizerSha256": canonical["canonicalizerSha256"],
        "eligibleLineages": plan["eligibleLineages"],
        "eligibleVariants": plan["eligibleVariants"],
        "pairBaseFamilies": len(pair_records),
        "requested": total,
        "valid": len(records),
        "failed": 0,
        "cloudflareGenerationCalls": 0,
        "fluxSpecificProxyUsed": False,
        "records": records,
    }
    from wp007e_common import stable_hash, write_json

    manifest["proxyManifestSha256"] = stable_hash(manifest)
    write_json(output_root / "proxy-manifest.json", manifest)
    print(json.dumps({"status": "PASS", "requested": total, "valid": len(records), "failed": 0, "manifestSha256": manifest["proxyManifestSha256"], "lineages": plan["eligibleLineages"]}, sort_keys=True), flush=True)


if __name__ == "__main__":
    main()
