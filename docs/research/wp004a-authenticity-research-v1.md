# Lythaus Authenticity AI — Research V1 / WP004A

Lythaus Authenticity AI Research V1 is a bounded software instrument for testing the thesis that safety context, deterministic forensics, targeted visual observations, an evidence packet, and a reasoning Judge are more useful together than a single image-origin classifier. It is not a production authenticity detector and makes no accuracy claim.

## Architecture

The research path is:

`preflight → safety moderation + deterministic forensics → Vision Observer → Evidence Packet V1 → GPT-OSS Judge`

The domains remain separate:

- OpenAI moderation answers harmful-content questions and is marked `SAFETY_CONTEXT_ONLY`.
- Existing Lythaus deterministic V1 forensics remain experimental measurements. EF1, EF2, and EF4 are carried into the packet; EF3 and EF5 are explicitly unavailable until implemented.
- The Vision Observer reports scene, text, geometry, lighting, reflection, repetition, anatomy, and suspicious-region observations. It never receives an origin-classification task or emits an AI/human probability.
- The Judge receives the structured packet, ranks competing origin hypotheses, reports contradictions and missing evidence, and always has `INSUFFICIENT_EVIDENCE` available. `enforcementAuthority` is permanently `false` in this package.

Camera acquisition and depicted synthetic content are independent packet axes. The packet can represent camera evidence and synthetic evidence simultaneously; it never implements `REAL = 1 - AI`.

## Provider boundaries

The canonical `ModerationProvider` now carries an additive generic provider-evidence object. The OpenAI adapter uses `omni-moderation-latest`, the standalone `/v1/moderations` endpoint, image data URLs, injected `fetch`, no automatic retry, and sanitized failure categories. A flagged provider result defaults to Lythaus `REVIEW`; it is not itself product enforcement or synthetic-origin evidence.

The current Workers AI candidates were verified against Cloudflare documentation before the adapters were added: `@cf/moondream/moondream3.1-9B-A2B` for image-to-text observations and `@cf/openai/gpt-oss-20b` for structured text reasoning. The adapter uses the Workers AI binding shape and does not create or deploy a Worker. Live local Observer/Judge execution requires a caller to inject a configured Workers AI binding.

Research-only model configuration distinguishes:

- `AUTHENTICITY_REASONER_MODEL`
- `AUTHENTICITY_VISION_OBSERVER_MODEL`
- `AUTHENTICITY_FORENSICS_VERSION`

The historical `AUTHENTICITY_IMAGE_MODEL` field remains unchanged and is not silently migrated.

## Data and manifests

The inventory command accepts `--data-root` or `LYTHAUS_WP004A_DATA_ROOT`; it has no developer-specific default. It reads image files without modifying them and records hashes, dimensions, MIME/signature status, format, metadata-presence flags, sanitized encoder information, decode status, perceptual hash, duplicate status, privacy-sensitive metadata flags, and an owner assertion. It never writes originals, Base64 media, raw EXIF values, GPS, serial identifiers, or image bytes to Git or logs.

Runtime and ground-truth manifests are separate types and files:

- `research/wp004a/runtime-manifest.example.json` contains only sample identity, relative path, rights class, and evaluation permission.
- `research/wp004a/ground-truth-manifest.example.json` is evaluator input only. Unknown truth axes are `null`; truth describes production history and does not contain visual clues.

The inventory records the collection assertion `LYTHAUS_ORIGINALS_OWNER_ASSERTED`, but its generated ground-truth scaffold uses `NEEDS_OWNER_CONFIRMATION` and `UNKNOWN` until the owner confirms each sample's production history; filenames and visual appearance are not treated as truth.

The runner has no ground-truth loading path. Only `research-evaluator.ts` joins Judge predictions to ground truth.

## Commands

```text
npm run authenticity:inventory -- --data-root <external-research-root> --output <external-output>/inventory.json --runtime-manifest <external-output>/runtime.json
npm run test:authenticity-wp004a
npm run authenticity:observer-trial -- --mode mock-only --data-root <external-research-root> --manifest <external-output>/runtime.json --max-samples 2 --output <external-output>/trial.json
```

Live provider use requires `--allow-network` and an explicit `--max-samples`. Local execution defaults to mocks/network-disabled. The CLI permits a live moderation-only path when `OPENAI_API_KEY` is present. It refuses live Observer/Judge/full mode without an injected Cloudflare binding. The runner enforces per-provider and total hard caps, records successes/failures/latency/retries, and performs no recursive interrogation loop.

## Trial stages

- Trial 0A: generated neutral PNG, one OpenAI moderation call maximum.
- Trial 0B: an additional deterministic neutral fixture only if required; keep the documented cap.
- Trial 0C: one or two non-sensitive fixtures, Observer only, no Judge.
- Trial 0D: two image cases through the full mocked or explicitly injected pipeline.
- Trial 1: up to eight curated originals after the plumbing review.
- Trial 2: approximately twenty images only after camera, synthetic, hard-negative, and mixed-origin coverage is adequate.
- Trial 3: only controlled `ORIGINAL`, `JPEG75`, `RESIZE50`, and `METADATA_STRIPPED` descendants after Trial 2 is stable.

The manual workflow `.github/workflows/wp004a-openai-moderation-smoke.yml` is prepared but intentionally has no push or pull-request trigger. It creates a neutral PNG during the job, passes `OPENAI_API_KEY` through the GitHub secret environment, makes at most one request, and prints only sanitized provider status, latency, flagged state, field counts, and schema validity. It has not been dispatched; reviewed branch/merge governance may be required before GitHub exposes it for dispatch.

## Current blockers and no-go conditions

Software-only foundation work is ready for review. Local possession of an OpenAI key is not required for tests. Live Cloudflare calls are blocked in the local CLI until a configured Workers AI binding is supplied. No live OpenAI, Moondream, or GPT-OSS call is part of this work package.

This work package does not deploy, train, download third-party checkpoints, create Containers/Workers/Queues/R2 research storage, ingest images into a database, migrate PlanetScale, restore retired providers, or grant moderation/Judge enforcement authority. Research output belongs under the external data root; only reviewed sanitized summaries may enter the repository.

## First scientific checks

The first packets and tests target repeatable visual observations, preservation of distinct evidence families, conflict reconciliation, abstention, metadata-removal neutrality, simultaneous camera/synthetic representation, and safety-category invariance. Negative or inconclusive evidence is a valid result.
