# WP006B Synthetic Generation Rights Gate

`WP006B_RESEARCH_DATE = 2026-09-13`

## Decision

`CLOUDFLARE_SYNTHETIC_GENERATION = UNRESOLVED`

No synthetic-generation request was made. No image was uploaded to Cloudflare,
no generated media was retained, and no new inference or generation budget was
consumed by WP006B.

This is a deliberate gate, not a finding that Cloudflare generation is
forbidden. The WP006B owner-seed instruction requires an explicit authorization
decision before generation. The current repository evidence does not bind a
specific Lythaus account, model/version, upstream terms, output-retention plan,
or owner authorization for this run closely enough to make that decision.

## Primary sources reviewed

- [Cloudflare Workers AI data usage](https://developers.cloudflare.com/workers-ai/platform/data-usage/): Cloudflare describes model providers as third-party services, treats customer inputs and outputs as Customer Content, and states that it does not use Customer Content to train or improve services without explicit consent. Provider terms still apply.
- [Cloudflare Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/): the current page documents the free neuron allocation and paid overage model; exact model availability and account access must be checked at generation time.
- [Cloudflare Terms of Service](https://www.cloudflare.com/terms/): the customer must have the rights needed for Customer Content and third-party products remain subject to their own terms.
- [Cloudflare Workers AI models](https://developers.cloudflare.com/workers-ai/models/): the catalog is the authority for current model availability and access requirements.
- [Black Forest Labs FLUX repository](https://github.com/black-forest-labs/flux): the repository distinguishes model-specific licensing and identifies FLUX.1 Schnell as Apache-2.0 in its model information.
- [FLUX.1-schnell model card](https://huggingface.co/black-forest-labs/FLUX.1-schnell): the model card describes Apache-2.0 terms and additional use restrictions; the exact checkpoint-access and account terms must be accepted and recorded before use.

## Rights interpretation

Cloudflare hosting is not, by itself, a grant of rights to model weights or
generated outputs. Before a future generation run, Lythaus must record the
specific provider/model/version, the applicable Cloudflare and upstream model
terms, whether output retention and internal commercial-product evaluation are
permitted, and whether any account-access terms create additional obligations.
The source-media rights for prompts or reference images must also be recorded
separately.

`AUTHORIZED` is therefore not asserted for this package. No output may be
marked calibration-eligible on the basis of a future generation until its
generation provenance and rights record are complete.

## Required future authorization gate

Generation may be proposed in a later, separately authorized step only after
all of the following are documented:

1. exact current model ID, model version/date, and upstream license;
2. current account access and any paid-only restriction;
3. output-use, retention, and internal commercial-evaluation permission;
4. prompt, seed, settings, timestamp, response status, and content hash fields;
5. maximum request count, estimated neurons, and estimated cost within the
   approved work-package cap;
6. no personal/reference image upload unless separately approved;
7. a generator-family holdout plan declared before specialist scoring.

Until then, the six owner-supplied synthetic candidates remain
`OWNER_CONFIRMATION_REQUIRED`; their technical metadata is not synthetic truth.
