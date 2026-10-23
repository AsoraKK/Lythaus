# WP007F Synthetic Evidence Compiler

Version: `lythaus-synthetic-evidence-compiler-v1`

The compiler combines calibrated synthetic-origin measurements into a bounded
0--100 evidence score. It never produces a probability and it never converts
camera-origin absence into synthetic-origin evidence.

## Inputs

- EF1 file/provenance measurements are descriptive and do not contribute a
  synthetic score by themselves.
- EF2 physical-camera evidence is retained on a separate axis. Strong EF2 and
  strong synthetic evidence produce `CONFLICTING`, not cancellation.
- `SPAI_C512` is the `SPAI_SPECTRAL` group, capped at 35 points.
- UniversalFakeDetect and RINE are both in `CLIP_GENERATIVE`, capped together
  at 35 points. The lead calibrated strength receives the group contribution;
  additional positive members receive only a bounded 0.15 corroboration bonus
  before the cap.
- Reliable explicit synthetic provenance contributes 35 points and is retained
  separately from detector evidence.
- Moderation is safety context only and is ignored by this compiler.
- Moondream observations and GPT-OSS advice are contextual/advisory inputs and
  cannot alter the numeric score.

## Evidence bands

`LOW` is below 25, `MODERATE` is 25--54.99, `HIGH` is 55--79.99, and
`VERY_HIGH` is 80--100.

## Resolution

- `SUPPORTED_SYNTHETIC`: score at least 55 or reliable synthetic provenance,
  without strong camera evidence.
- `SUPPORTED_CAMERA/HUMAN_ORIGIN`: strong camera evidence and no strong
  synthetic result. This is not inferred from low detector scores alone.
- `CONFLICTING`: strong synthetic and strong camera evidence coexist.
- `INSUFFICIENT`: missing/weak evidence does not support a bounded conclusion.

## Alpha labels

`AI-generated` requires `VERY_HIGH` evidence from at least two distinct
synthetic evidence families, or reliable explicit synthetic provenance plus
corroborating detector evidence. Correlated CLIP detectors alone cannot meet
the two-family rule. A single strongly positive detector is retained as
supporting evidence and normally routes to `Under review`.

`Human-authored` requires positive camera/provenance evidence and low
conflicting synthetic evidence. `AI-assisted` requires separate mixed-
authorship evidence and is not emitted from a weak whole-image detector score.
All ambiguity, conflicts, missing evidence, and detector failures route to
`Under review`.

## Snapshot contract

Every decision snapshot binds the input hash, evidence-packet version, exact
detector versions and hashes, raw scores, calibration profile, compiler
version, observations, advisory output, policy version, label, and timestamp.
Hidden LLM reasoning and raw image bytes are not stored in the snapshot.
