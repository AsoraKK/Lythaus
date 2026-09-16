# WP007G — Modern Generator Calibration + Dynamic Evidence Fusion

## Decision

`MODERN_DATA_ACCESS_BLOCKED`

WP007G reached a legitimate data-access boundary before calibration. The
bounded public fallbacks produced useful descriptive raw scores, but they did
not provide the predeclared disjoint modern generator-family roles needed to
fit or validate either calibrator. No FLUX.1 re-pass was performed and FLUX.2
remained completely sealed.

## Baseline and integrity

- Parent PR #844 remained open and unmerged at the exact reviewed head
  `4c4f02349f497e2ff021ff3c37abb432cb93dc0d`.
- The WP007G branch was based exactly on that head; no production files,
  secrets, or holdout pixels were changed.
- The FLUX.2 denylist covers `FLUX.2-dev`, `FLUX.2-klein-4B`,
  `FLUX.2-klein-9B`, and matching family patterns.
- `FLUX2_PROVIDER_CALLS=0`; no FLUX.2 pixels were downloaded, decoded,
  inspected, transformed, or scored.

## Modern data audit

The primary T2I-CoReBench-Images catalog is public and metadata-auditable, but
its current selective-access surface exposed only a partial index while the
family archives are multi-gigabyte and the complete catalog is about 269 GB.
That exceeds the frozen bounded-access policy. The FLUX.2-labelled families
were denied by metadata without touching their bytes.

The approved fallback materialised four initial families:

- DEV: `FLUX.1-schnell`, `PixArt-Sigma-XL-2-1024-MS`,
  `stable-diffusion-3-medium-diffusers` — 60 images total.
- CONFIRM: `GPT-4o` — 20 images.
- RESERVE: none.

The separate T2I `FLUX.1-Krea-dev` retry was selected/downloaded after initial
SAFE scores were visible. Its 20 images were explicitly excluded from all
fitting, thresholding, candidate selection, and scientific claims. Owner
unknown-generator material remained diagnostic/review-required and was not
used as a modern family.

This gives four eligible families, below the frozen minimum of eight DEV, four
disjoint CONFIRM, and two disjoint RESERVE families. The gate therefore fails
before calibration. The failure is not a detector-performance conclusion.

## Detector acquisition and raw qualification

SAFE was independently audited from the official Apache-2.0 repository at
`4e998724651b227def64f5be0cd60c0aa1552c35`. The checkpoint is 5,840,638 bytes
with SHA-256
`b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e`.
The official ResNet evaluation path was reproduced on CPU. Warm p50/p95 was
approximately 27.659/29.977 ms per image over the raw run.

Existing SPAI_C512, RINE, and UniversalFakeDetect artifacts were reused after
hash verification. Descriptive modern score runs covered 80 generated images
from the four available families. They show heterogeneous behavior:

- SAFE was high on all four families (medians about 0.9366–0.9534).
- RINE was positive but family-dependent (medians about 0.4403–0.8997).
- SPAI_C512 was very high on PixArt/SD3 and near-zero on GPT-4o.
- UniversalFakeDetect was mostly near zero, leaving the low-tail hypothesis
  unresolved without a WP007G negative CDF.

These are raw distributions, not probabilities and not a calibrated result.
The complete run files remain outside Git; committed records contain their
hashes and auditable group summaries.

## Calibration status

Neither `G1_SIGNED_LINEAR_V0` nor `G2_TWO_TAIL_GROUPED_V0` was fit. No
NEGATIVE_CALIBRATION_G, NEGATIVE_DEV_G, NEGATIVE_CONFIRM_G, or
NEGATIVE_RESERVE_G role could be frozen from fresh independent families. As a
result there are no valid thresholds, coefficients, generator-held-out
recalls, FPRs, confirmation metrics, reserve metrics, transformation result,
or calibration freeze.

The new deterministic compiler module
`packages/authenticity/src/wp007g.ts` implements the v2 evidence contract,
empirical two-tailed features, grouped CLIP evidence caps, signed detector
relationships, explicit missingness, and independent EF2 conflict
preservation. Focused tests pass. It has no calibrated WP007G production
profile attached.

The contract-only container was updated to advertise v2 and was exercised
locally through `/health`, `/version`, and `/score`. It returned SHADOW mode,
explicit `UNAVAILABLE` detector evidence, `INSUFFICIENT` resolution, and
`enforcementAuthority=NONE`. No model weights were mounted. A live Cloudflare
deployment was not attempted because current Wrangler authentication is
expired/noninteractive; no secret was requested or exposed.

## FLUX and product boundary

The prior WP007F FLUX.1 result remains a consumed post-hoc diagnostic only.
WP007G did not access it again because no initial calibrator was earned. No
FLUX.2 evaluation was eligible. The existing WP007F alpha contract remains
SHADOW-only/contract-only; SAFE deployment rights still require review and no
live deployment was attempted. No production routing, labels, Safety policy,
Judge authority, upload flow, or database schema was changed.

The correct scientific conclusion is `MODERN_DATA_ACCESS_BLOCKED`, not a claim
that dynamic fusion or the UFD low-tail hypothesis failed. A future run needs
rights-clean, disjoint modern generator families and fresh negative roles
before calibration can safely resume.

## Reproducibility artifacts

The branch records the modern data freeze, denylist, rights audits, exact raw
run hashes, detector registry, no-fit decisions, and compiler tests. Large
media, checkpoints, and raw score files remain outside Git according to the
research storage policy.

Key artifact hashes:

- modern-generator-data-freeze: `54fb8839a27ad1ab29d439658513680b65c5ee43b6f021cf5fac17900ab60925`
- forbidden-generator-families: `4d0f44de4c14d06f7b6f6aaf250502c701bd7b085c346d183d6944782ea65e32`
- runtime-lock: `0b9465798866a8c47a053c7f64c110402def31ae66c37a75950a179bbb6fbfa1`
- storage-delta: `1464337bed24f73c2858a6e8a153f0577ffb41a7c626318742d70f95e6b2ab53`
