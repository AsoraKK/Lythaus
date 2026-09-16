"""Verify and freeze the complete WP007E decoder proxy corpus."""

from __future__ import annotations

import json
from pathlib import Path

from wp007e_common import load_json, sha256_file, stable_hash, write_json


def main() -> None:
    media_root = Path(__import__("sys").argv[1])
    repo_root = Path(__file__).resolve().parents[2]
    roles = load_json(repo_root / "research" / "wp007e" / "data-role-freeze.json")
    plan = load_json(repo_root / "research" / "wp007e" / "decoder-proxy-plan.json")
    decoder_manifest = load_json(media_root / "decoder-proxies" / "proxy-manifest.json")
    benign_manifest = load_json(media_root / "benign-negatives" / "benign-manifest.json")
    if decoder_manifest["valid"] != decoder_manifest["requested"] or benign_manifest["valid"] != benign_manifest["requested"]:
        raise RuntimeError("proxy_or_benign_manifest_incomplete")
    decoder_records = []
    for item in decoder_manifest["records"]:
        path = media_root / item["proxyRelativePath"]
        if not path.is_file() or sha256_file(path) != item["proxySha256"]:
            raise RuntimeError(f"decoder_proxy_hash_failure:{item['sampleId']}")
        decoder_records.append({
            "sampleId": item["sampleId"],
            "sourceFamilyId": item["sourceFamilyId"],
            "variantId": item["variantId"],
            "lineage": item["lineage"],
            "inputCanonicalSha256": item["inputCanonicalSha256"],
            "proxySha256": item["proxySha256"],
            "proxyRelativePath": item["proxyRelativePath"],
            "fidelity": item["fidelity"],
            "role": "MATCHED_DECODER_PROXY",
        })
    benign_records = []
    for item in benign_manifest["records"]:
        path = media_root / item["outputRelativePath"]
        if not path.is_file() or sha256_file(path) != item["outputSha256"]:
            raise RuntimeError(f"benign_proxy_hash_failure:{item['sampleId']}")
        benign_records.append({
            "sampleId": item["sampleId"],
            "sourceFamilyId": item["sourceFamilyId"],
            "transform": item["transform"],
            "inputCanonicalSha256": item["inputCanonicalSha256"],
            "outputSha256": item["outputSha256"],
            "outputRelativePath": item["outputRelativePath"],
            "role": "BENIGN_HARD_NEGATIVE",
        })
    freeze = {
        "schemaVersion": "lythaus-wp007e-paired-decoder-corpus-freeze-v1",
        "wp007eBaseSha": "9b7c375bd030475e25c0058c58909a3a56dcdcc6",
        "dataRoleFreezeSha256": roles["dataRoleFreezeSha256"],
        "decoderProxyPlanSha256": plan["decoderProxyPlanSha256"],
        "decoderProxyManifestSha256": decoder_manifest["proxyManifestSha256"],
        "benignManifestSha256": benign_manifest["benignManifestSha256"],
        "pairBaseFamilies": 60,
        "decoderVariants": plan["eligibleVariants"],
        "decoderLineages": plan["eligibleLineages"],
        "decoderProxyCount": len(decoder_records),
        "benignNegativeProxyCount": len(benign_records),
        "decoderProxies": decoder_records,
        "benignNegatives": benign_records,
        "truthBoundary": {
            "decoderProxyTruth": "GENERATIVE_DECODER_DERIVED_PROXY",
            "fullySyntheticBenchmarkTruth": "NOT_CLAIMED",
            "trainingRole": "DEVELOPMENT_ONLY",
        },
        "integrity": {
            "localHashVerification": "PASS",
            "allDecoderProxyFilesVerified": True,
            "allBenignFilesVerified": True,
            "flux1PixelAccess": False,
            "flux2PixelAccess": False,
            "fluxSpecificProxyUsed": False,
            "cloudflareGenerationCalls": 0,
        },
    }
    freeze["pairedCorpusFreezeSha256"] = stable_hash(freeze)
    write_json(repo_root / "research" / "wp007e" / "paired-decoder-corpus-freeze.json", freeze)
    print(json.dumps({"status": "PASS", "decoderProxyCount": len(decoder_records), "benignNegativeProxyCount": len(benign_records), "freezeSha256": freeze["pairedCorpusFreezeSha256"], "localHashVerification": "PASS"}, sort_keys=True))


if __name__ == "__main__":
    main()
