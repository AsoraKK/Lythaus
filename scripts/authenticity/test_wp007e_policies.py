"""Focused integrity and boundary tests for the WP007E local experiment."""

from __future__ import annotations

import json
import os
import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image

SCRIPT_ROOT = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_ROOT.parents[1]
sys.path.insert(0, str(SCRIPT_ROOT))

from wp007e_common import canonicalize, png_bytes  # noqa: E402
from wp007e_train_evaluate import family_weights  # noqa: E402


def read_json(relative: str) -> dict:
    return json.loads((REPO_ROOT / relative).read_text(encoding="utf-8"))


class Wp007ePolicyTests(unittest.TestCase):
    def test_canonicalizer_is_deterministic(self) -> None:
        source = Image.fromarray(np.arange(17 * 23 * 3, dtype=np.uint8).reshape(17, 23, 3), mode="RGB")
        first = png_bytes(canonicalize(source))
        second = png_bytes(canonicalize(source))
        self.assertEqual(first, second)
        self.assertEqual(canonicalize(source).size, (512, 512))

    def test_decoder_lineage_groups_collapse_full_and_tiny_variants(self) -> None:
        registry = read_json("research/wp007e/decoder-registry.json")
        lineages = {item["variantId"]: item["lineage"] for item in registry["candidates"]}
        self.assertEqual(lineages["SD1X_FULL_A1"], lineages["SD1X_TAESD_A2"])
        self.assertEqual(lineages["SDXL_FULL_B1"], lineages["SDXL_TAESD_B2"])
        self.assertGreaterEqual(len(set(lineages.values())), 3)

    def test_holdout_lineage_removes_every_variant(self) -> None:
        plan = read_json("research/wp007e/decoder-proxy-plan.json")
        registry = read_json("research/wp007e/decoder-registry.json")
        by_variant = {item["variantId"]: item["lineage"] for item in registry["candidates"]}
        for heldout in plan["eligibleLineages"]:
            train_variants = [variant for variant in plan["eligibleVariants"] if by_variant[variant] != heldout]
            self.assertTrue(train_variants)
            self.assertTrue(all(by_variant[variant] != heldout for variant in train_variants))

    def test_family_weights_sum_to_one_across_lineages(self) -> None:
        proxies = [
            {"sampleId": "a1", "lineage": "SD1X", "variantId": "A1"},
            {"sampleId": "a2", "lineage": "SD1X", "variantId": "A2"},
            {"sampleId": "b1", "lineage": "SDXL", "variantId": "B1"},
            {"sampleId": "c1", "lineage": "SD3", "variantId": "C1"},
        ]
        weights = family_weights(proxies, {"SD1X", "SDXL", "SD3"})
        self.assertAlmostEqual(sum(weights.values()), 1.0)
        self.assertAlmostEqual(weights["a1"], 1 / 6)
        self.assertAlmostEqual(weights["a2"], 1 / 6)
        self.assertAlmostEqual(weights["b1"], 1 / 3)
        self.assertAlmostEqual(weights["c1"], 1 / 3)

    def test_flux_and_cloudflare_boundaries_remain_closed(self) -> None:
        plan = read_json("research/wp007e/decoder-proxy-plan.json")
        corpus = read_json("research/wp007e/paired-decoder-corpus-freeze.json")
        features = read_json("research/wp007e/feature-manifest.json")
        self.assertFalse(plan["fluxSpecificProxyUsed"])
        self.assertEqual(plan["cloudflareGenerationCalls"], 0)
        self.assertFalse(corpus["integrity"]["flux1PixelAccess"])
        self.assertFalse(corpus["integrity"]["flux2PixelAccess"])
        self.assertFalse(features["flux1PixelAccess"])
        self.assertFalse(features["flux2PixelAccess"])
        self.assertTrue(all("FLUX" not in item["sampleId"] for item in features["records"]))

    def test_forbidden_flux_specific_proxy_identifiers_are_not_eligible(self) -> None:
        plan = read_json("research/wp007e/decoder-proxy-plan.json")
        forbidden = ("TAEF1", "TAEF2", "FLUX.1", "FLUX.2", "HIDREAM", "Z-IMAGE")
        serialized = json.dumps(plan, sort_keys=True).upper()
        self.assertTrue(all(token not in serialized for token in forbidden))

    def test_primary_stage_a_is_terminal_without_recovery_trigger(self) -> None:
        report = read_json("research/wp007e/candidate-stage-a-results.json")
        self.assertFalse(any(item["stageAPass"] for item in report["candidates"]))
        pairdelta = [item for item in report["candidates"] if item["kind"] == "PAIRDELTA"]
        self.assertTrue(pairdelta)
        self.assertFalse(any(item["minHeldoutLineageRecall"] >= 0.55 and item["ddbDevRecall"]["rate"] >= 0.50 for item in pairdelta))

    def test_confirm_and_flux_are_not_loaded_before_selection_freeze(self) -> None:
        source = (SCRIPT_ROOT / "wp007e_train_evaluate.py").read_text(encoding="utf-8")
        self.assertNotIn("DDB_TRANSFER_CONFIRM", source)
        self.assertNotIn("FLUX1", source)
        self.assertFalse((REPO_ROOT / "research/wp007e/ef3-calibration-freeze.json").exists())


if __name__ == "__main__":
    unittest.main()
