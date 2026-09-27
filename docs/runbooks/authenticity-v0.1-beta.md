# Authenticity v0.1 beta operations

Read [readiness](../releases/authenticity-v0.1-readiness.json) before acting. This candidate is not deployed. Author/admin-only is the approved scope; public enforcement remains off. Use existing GitHub, Cloudflare and PlanetScale accounts. The owner explicitly authorized reuse of the existing OpenAI image Safety account/adapter.

## Offline checks

Run `npm run typecheck:native`, `npm run validate:native-workers`, `npm run test:planetscale-production-migrations`, and `node --experimental-strip-types --test packages/authenticity/tests/beta.test.mjs packages/authenticity/tests/wp005a.test.mjs packages/authenticity/tests/wp005b.test.mjs`.

Install the separate small Worker dependency lock with `npm ci --ignore-scripts --prefix apps/lythaus-authenticity-runtime`, then `npx tsc -p apps/lythaus-authenticity-runtime/tsconfig.json --noEmit`. Flutter checks are `flutter test test/features/authenticity` and the repository's web/native build workflows. Regenerate OpenAPI through `openapi:lint`, `openapi:bundle`, `openapi:gen:dart` and `openapi:test:dart`.

The PostgreSQL 17 CI job applies all migrations and role grants to an ephemeral database, then runs `validate-authenticity-beta-postgres17.mjs`. Its R2/model outputs are explicit protocol fixtures, not real inference. Production reconciliation must use actual PostgreSQL 17 fingerprints, never invented digests. Historical migration identities remain immutable.

## Runtime preparation and release

1. Resolve checkpoint rights and authorized nonsealed fixture mapping. Keep receipts and media private. Do not copy weights, signed URLs or local fixture paths into Git/CI logs.
2. Select an authorized runtime satisfying compute policy. This laptop currently fails the global 80 GiB free-disk requirement and lacks a running Docker engine/Torch. Do not install heavyweight ML dependencies or use it as an unattended server to bypass that gate.
3. Build the provided Dockerfile with BuildKit secrets named `safe_rights` and `safe_checkpoint`. The checkpoint is copied into the private image only after both rights and checksum verification. Retain upstream notices. Record immutable image digest, dependency lock hash and preprocessing implementation hash.
4. Run bounded real CPU/container parity using the frozen manifest before selecting a Cloudflare instance. Record cold start, startup/peak RSS, cgroup peak, warm inference/decode/end-to-end times, image size and maximum decoded input memory. Select the smallest measured fit with headroom; the old proof's 256 MiB lite setting is not an acceptable assumption.
5. Obtain review and merge through existing protected release governance. Apply migration 0017 only through the existing approved migration workflow. PlanetScale main writes require the owner's scoped approval. No unreviewed SHA may deploy.
6. Materialize the runtime template with the approved digest and measured instance; maximum instances stays one, public URLs stay disabled, dispatch is internal, sleep is 30 seconds and the process has a 30-minute maximum active life. Bind Jobs `AUTHENTICITY_BETA_CONTAINER` to `SafeBetaContainer` in `lythaus-authenticity-runtime`; set the same private dispatch secret in Jobs/runtime. Initial Worker deployment remains disabled.
7. Verify exact Worker, image, model, migration and Flutter identities. Confirm remaining shared experiment budget, approved allowlist, retention and Cloudflare bindings. Activate only through reviewed protected release/configuration controls. Never regard a hash-shaped approval value as evidence that a rights decision actually occurred.

The existing protected `native-workers-deploy` workflow optionally deploys the disabled runtime when the owner installs a private `AUTHENTICITY_BETA_RELEASE_RECEIPT` secret and matching `AUTHENTICITY_BETA_RELEASE_RECEIPT_SHA256` environment variable. `materialize-authenticity-beta-runtime.mjs` validates the exact reviewed source, seven-day expiry, rights/resource evidence, real parity, maximum-pixel memory, smallest fit with 30% memory headroom, image disk headroom and current budget evidence. It adds the internal Jobs binding and emits separate disabled deployment receipts. No receipt is installed by this PR. Normal releases with the variable unset keep this component absent and the feature disabled. Activation and live receipts remain separate gates; disabled deployment cannot claim live readiness.

## Configuration and budgets

Master `AUTHENTICITY_BETA_ENABLED` defaults false in public API, Jobs and runtime. Private KV `authenticity-beta-v1` also requires `enabled:true`, a UUID allowlist, component switches, approval receipt hashes (`rightsApproval`, `budgetApproval`, `runtimeApproval`), image digest and preprocessing hash. `sourceHistoryHashes` must stay empty for ordinary unknown-history uploads. Only documented, approved lossless fixtures may be listed.

Safety remains independently enforced. `AUTHENTICITY_BETA_STORAGE_ENABLED` keeps expiry/deletion cleanup active even when inference is disabled. Disabling the beta does not disable authentication/Safety or publish media. Reads, cancellation and deletion remain available under their ownership rules.

The existing US$10/month total incremental experiment ceiling is binding. Beta is additionally limited to $2 with 20% metering headroom; the global admission reserve stops at $8. Default reservation is $0.50/case, so only three cases fit the $1.60 usable beta reserve until usage is reconciled. Daily ceilings of five/user and twenty/global are upper bounds, not promised capacity. Unknown billed cost remains null; committed estimates continue consuming budget. Broader application variables are not a substitute for the stricter beta checks.

The proposed smoke envelope is at most 16 SAFE attempts, two advisory calls on distinct cases, 30 active Container minutes and $0.50 reserved. This is not yet a certified price or permission to spend. Include Safety, startup/idle provisioned memory/disk, CPU, R2, queues, Workers/DO, logs and possible retries. Do not assume unused included allowances. Application admission limits are not a provider invoice cap.

`scripts/authenticity/beta-release-policy.mjs` computes a conservative bounded estimate with dated prices and rounded service units. Unknown allowances are treated as unavailable. It requires a usage receipt no older than one hour and separately supplied Safety, private image registry and database incremental upper bounds. These values are estimates, never observed bills. With unknown allowances, R2 Class A alone reserves $4.50 and a new Durable Object duration billing unit costs $12.50, so even the global $10 ceiling cannot be certified. Use verified remaining included/prepaid units or leave activation blocked; do not raise limits implicitly.

Pricing checked 2026-09-27: [Containers](https://developers.cloudflare.com/containers/platform/pricing/), [Durable Objects](https://developers.cloudflare.com/durable-objects/platform/pricing/), [R2](https://developers.cloudflare.com/r2/pricing/), [Queues](https://developers.cloudflare.com/queues/platform/pricing/), [Workers/KV/logs](https://developers.cloudflare.com/workers/platform/pricing/) and [GPT-OSS-20B](https://developers.cloudflare.com/workers-ai/models/gpt-oss-20b/). Refresh prices and account usage before activation. The calculator intentionally rounds ancillary service units conservatively even where marginal billing may be smaller.

## App acceptance

The planned existing Flutter route is `/authenticity`; the administrator navigation includes private authenticity cases. No live entry point is certified. With an approved account, test actual upload, progress, leave/return, private display, result limitations, review request, feedback and deletion at desktop and mobile web sizes. The selected bytes must match the recorded original hash. At least one useful eligible packet must exercise a real GPT-OSS advisory call. A CLI smoke or mocked UI is insufficient.

Exercise a second user's denied access, administrator role boundaries, Safety review, an unsupported image, a timeout/degraded response, duplicate completion/queue events and delete-during-inference. Confirm no public feed, reputation or real reward changes. Record sanitized case/run IDs, timings, hashes and exact source/runtime identities; never publish media or provider bodies.

## Kill switch and rollback

Set the private KV beta master false, then deploy the three Worker masters false through the existing protected workflow. New admission and in-flight step fences stop work; the one already-dispatched external attempt may still complete and remains accounted for. Do not remove the storage cleanup switch. Check queued cases terminate paused/expired and do not remain spinning past 15 minutes.

Restore the last approved Worker/client versions using existing release snapshots, retaining additive schema 0017 and private audit records. Do not drop tables to roll back. Remove runtime dispatch capability only after active work drains or the bounded process exits. Prove existing Safety/auth and private deletion still work. Record rollback version IDs, times and actual observations before claiming rollback acceptance.

## Outstanding owner decisions

One consolidated activation decision is needed after the implementation is reviewable: checkpoint hosting/commercial-context rights evidence; an authorized measured runtime and private image/Container resource; a scoped smoke budget against current shared usage; and protected release/migration approval. The current author/admin-only and existing Safety-account choices are already resolved. These gates block activation, not separable implementation or offline tests.
