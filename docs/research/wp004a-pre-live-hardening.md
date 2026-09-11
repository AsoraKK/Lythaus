# WP004A Pre-Live Hardening

This note records the pre-live architecture pass after the WP004A foundation commit. It is research infrastructure, not a detector release.

## Verified provider contracts

- Cloudflare REST execution uses `POST /accounts/{account_id}/ai/run/{model_name}` with Bearer API-token authentication.
- Moondream remains `@cf/moondream/moondream3.1-9B-A2B`. Its documented image-to-text input supports `task: query|caption|point|detect`, image data URLs, and `reasoning` for query tasks.
- GPT-OSS remains `@cf/openai/gpt-oss-20b`. Its documented structured input uses messages and supports JSON response formatting.
- Official references: [Cloudflare REST API](https://developers.cloudflare.com/api/resources/ai/methods/run/), [Moondream model page](https://developers.cloudflare.com/ai/models/%40cf/moondream/moondream3.1-9B-A2B/), and [GPT-OSS model page](https://developers.cloudflare.com/workers-ai/models/gpt-oss-20b/).

## Two-speed Observer

`DIRECT` is the default first pass and sends `reasoning: false` for query tasks. `REASONED` sends `reasoning: true` only for query tasks. The versioned routing policy is experimental and uses a research-routing threshold, not an authenticity threshold. Escalation is owned by the runner; the Observer does not call itself. A direct `INDETERMINATE` result uses `OBSERVATION_INDETERMINATE`; `PARTIAL_OCCLUSION` is reserved for the controlled `occlusion: PARTIAL` observation field.

Every normalized observation records its task, reasoning mode, protocol provenance, input hash, and execution time. Raw Moondream `reasoning` objects are discarded before a result is returned. They cannot enter the Evidence Packet or Judge request.

## Call budgets

The runner reports aggregate and task-specific calls. Current first-trial semantics are:

- direct Observer: one provider request per image;
- reasoned Observer: one query request per image;
- A/B Observer: one direct plus one reasoned query per image;
- full recheck: one direct query, at most one reasoned query total, and at most two Judge passes per image. The reasoned budget is consumed by either Observer-triggered escalation or Judge-directed recheck, never both;
- caption, detect, and point: one provider request each when explicitly selected;
- no ROI follow-up and no recursive agent loop.

The REST transport itself has a required request cap, timeout, sanitized error categories, and injected fetch. Local calls are network-disabled unless explicitly enabled.

## Pixel-domain forensic gate

The runner preserves original compressed bytes for EF1 and uses the existing Sharp `raw().toBuffer({ resolveWithObject: true })` decode pattern for EF2/EF4 pixel measurements. A decode failure still permits EF1 container evidence, but records `forensics-decode` as a failed component and marks EF2/EF4 unavailable. Raw container bytes are never used as a substitute pixel grid.

## Baseline verification

An isolated detached worktree at base SHA `58fb4b6fe879747fca4f59a29fac788f041b4a0e` and the WP004A HEAD were each checked. Both produced the same results:

- `npm run validate:native-workers`: failed on stale or unverifiable generated Worker declarations for Public API, Admin API, and Jobs.
- `npm run test:native-architecture`: 255 passed, 1 failed at `production-release-governance.test.mjs:329`, the canonical manifest finalization assertion.

The failure behavior is materially identical and remains outside this work package.

## Research boundaries

Safety remains `SAFETY_CONTEXT_ONLY`; camera acquisition and synthetic depicted content remain independent axes. GPT-OSS remains advisory with `enforcementAuthority: false`. Runtime manifests never load evaluator truth, unknown local samples are excluded from accuracy metrics, and the manual OpenAI and Cloudflare workflows are prepared but not dispatched.
