# SAFE-A v0.1 licence-reliance record

**Status:** `OWNER_REVIEW_REQUIRED`; this is a licence-scope record, not a
maintainer permission letter and not a release receipt.

**Review date:** 2026-09-28

## Pinned evidence

| Item | Evidence |
| --- | --- |
| Upstream repository | [`Ouxiang-Li/SAFE`](https://github.com/Ouxiang-Li/SAFE) |
| Pinned commit | [`4e998724651b227def64f5be0cd60c0aa1552c35`](https://github.com/Ouxiang-Li/SAFE/commit/4e998724651b227def64f5be0cd60c0aa1552c35) |
| Published licence | Pinned [`LICENSE`](https://github.com/Ouxiang-Li/SAFE/blob/4e998724651b227def64f5be0cd60c0aa1552c35/LICENSE), Apache License 2.0; blob SHA `261eeb9e9f8b2b4b0d119366dda99c6fd7d35c64` |
| README evidence | Pinned [`README.md` Inference section](https://github.com/Ouxiang-Li/SAFE/blob/4e998724651b227def64f5be0cd60c0aa1552c35/README.md#-inference) says the published `./checkpoint/checkpoint-best.pth` can be run to reproduce results; blob SHA `5e750d5918ac785c5591461fbfbeca2158499630` |
| Checkpoint path | Pinned [`checkpoint/checkpoint-best.pth`](https://github.com/Ouxiang-Li/SAFE/blob/4e998724651b227def64f5be0cd60c0aa1552c35/checkpoint/checkpoint-best.pth), present in the tree; repository blob SHA `21e7aceb520a44ffcdf09234aae8f02b5986f80a`, 5,840,638 bytes |
| Checkpoint bytes | Ephemeral download of the pinned raw path hashes to SHA-256 `b3f5ecfb46a154ed553aaaf4bf3ba59182310726ddb0cbb1fe42bd0e22d2f20e`, matching Lythaus SAFE-A identity |
| Separate notices | No `NOTICE`, `COPYING`, checkpoint-directory licence, or checkpoint-specific terms were present in the pinned tree |

The checkpoint was fetched only to verify the published bytes and was not
loaded for inference, training, distillation, or deployment.

## Published licence scope

The root Apache-2.0 text grants the usual copyright and patent permissions to
reproduce, prepare derivative works, publicly display or perform, sublicense,
and distribute the Work, subject to its conditions. The observed conditions
relevant to a private Lythaus runtime are retaining the licence and notices,
marking modified files, and avoiding an implication of trademark permission.
The licence is provided without warranty and does not grant the SAFE name or
marks.

The pinned licence and README contain no non-commercial clause, research-only
field-of-use clause, inference prohibition, or checkpoint-hosting prohibition.
The repository's research framing and four-GPU training instructions do not
create such a restriction.

## Boundaries that remain separate

- The root licence does not document the provenance or licensing terms of the
  training datasets. That provenance remains `UNKNOWN`; it is not treated as a
  proved prohibition on inference from the published checkpoint.
- PyTorch, torchvision, DWT dependencies, and their notices require their own
  supply-chain review.
- Fixture and user-image rights, retention, private storage, and deployment
  approval are operational/data decisions separate from SAFE model licensing.
- No training, distillation, calibration, or derivative-weight work is
  authorized by this record.

## Material ambiguity and one narrow question

The only checkpoint-licence ambiguity found is that the root Apache-2.0 file
does not expressly name the binary checkpoint, even though the checkpoint is
distributed in the repository and the README expressly provides it for
inference. No contrary term or maintainer licence exception was found in the
pinned tree or the public issue history. Issue comments from Ouxiang-Li about
JPEG robustness and four-class ProGAN training are scientific clarifications,
not licence restrictions.

**Question for owner/legal review or, if required, the SAFE maintainer:**

> Does the root Apache License 2.0 at commit `4e998724651b227def64f5be0cd60c0aa1552c35` apply to the included `checkpoint/checkpoint-best.pth` for commercial inference and private hosted serving, subject to Apache-2.0 notices and without granting SAFE trademarks?

No question about Lythaus's runner, budget, retention schedule, deployment
process, or cohort is part of this licence question.

## Release interpretation

Until the owner records acceptance of this reliance record or resolves the
narrow question, the release may keep a rights-review gate. That gate is not a
claim that a separate maintainer permission letter is universally required.
