# Private alpha operations

This runbook operates the combined private alpha described in [the architecture note](../architecture/authenticity-private-alpha.md). It does not authorize provider spend, checkpoint execution, production writes, deployment or activation. Public authenticity enforcement stays disabled.

## Switches and eligibility

The following Worker and Jobs variables are off by default and must be enabled together through the existing protected configuration path: `AUTHENTICITY_ALPHA_ENABLED`, `AUTHENTICITY_ALPHA_STORAGE_ENABLED`, `AUTHENTICITY_ALPHA_OBSERVER_ENABLED` and `AUTHENTICITY_ALPHA_ADVISER_ENABLED`. The existing expiring `authenticity-beta-v1` KV configuration still supplies the private allowlist, expiry, measured budget evidence and SAFE runtime approval. New cases, upload finalisation, and provider work require current admission; authenticated owners can still read, review, cancel, and delete their existing cases after admission expires or a master is disabled. Rollback therefore stops new analysis without disabling privacy cleanup.

The public API requires an authenticated allowlisted owner, `lythaus-authenticity-private-alpha-v0.1.0` consent and `trainingConsent: false`. A case reserves the approved measured `caseReservationUsd` from the KV evidence, never a positive environment estimate. The evidence hash must match `budgetApproval`, be no more than one hour old, remain unexpired, and describe the $2 authenticity sub-budget with $0.40 headroom. Alpha and legacy-beta reservations share the same serializable authenticity scope. Observer and adviser requests require their own measured reservation values; manual advice is never free. Reservations remain accounted for after an ambiguous outcome. Daily limits are five cases per owner and twenty globally; they are upper bounds, not promised capacity.

## Offline validation

Run the repository's native typechecks and migration validation, then:

```text
node --experimental-strip-types --test packages/authenticity/tests/private-alpha.test.mjs
flutter analyze lib/features/authenticity lib/core/routing/app_router.dart lib/ui/screens/profile/settings_screen.dart
```

The alpha test uses protocol fixtures only. It proves state separation, text abstention, adviser parsing and author DTO redaction; it is not detector accuracy or provider acceptance. Existing beta, forensic, OpenAPI, Flutter coverage and security suites remain required by CI.

## Real provider sequence

Before any paid or checkpoint-bearing run, record a finite approval covering the exact post-merge source SHA, checkpoint identity, fixture permissions, private evidence destination, runner, logs/caches, attempt cap, active time, cost and expiry. The historical SAFE smoke manifest remains eight originals plus eight controlled descendants, maximum sixteen SAFE attempts, no automatic retries or redirects, 10 MiB bytes, 16,777,216 pixels and absolute parity error at most `1e-6`. It is separate from ordinary alpha integration cases.

For ordinary private-alpha acceptance, use permitted non-sensitive content and keep truth labels outside provider inputs. Exercise at least one text-only case, one ordinary image case, one text-plus-image case and one explicit observer/adviser eligible case only after provider-call approval. Record processing completion, component skips/failures, support category, abstention, latency and attributable cost. Do not turn feedback, test coverage, API success or parity into accuracy claims.

The frozen SAFE smoke is prepared through `.github/workflows/authenticity-cpu-evaluation.yml` on the protected `authenticity-private-evaluation` environment. A run accepts only an exact current-main SHA and a privately hosted bundle containing the source-bound approval, checkpoint, `models/resnet.py` and the eight-original/eight-descendant mapping. The bundle URL/token and dispatch secret are environment secrets; the workflow uses a loopback-only container, removes the private bundle and raw receipt, and uploads only the sanitized receipt. Until that environment and bundle are configured, the workflow is ready but intentionally `NOT_RUN`.

The observer receives only a bounded visual task and has its own timeout and byte limit. GPT-OSS receives a sanitized Evidence Packet and is called at most once per case. A provider failure preserves the deterministic result and consumes the bounded attempt. No recursive calls, tools, raw provider body or hidden reasoning is stored.

## Expiry, cancellation and rollback

Cases expire after fifteen minutes, leases after five minutes and upload URLs after ten minutes. Jobs mark started external attempts ambiguous on lease/expiry/deletion; late results cannot restore a deleted or newer revision. Cancellation and deletion scrub text, results, step payloads and feedback transactionally, then create a pending purge for both original and quarantine keys. `purged_at` and privacy-location removal occur only after R2 confirms deletion; failures retain references and increment retry state. Legal holds block physical purge and remain explicit. Cancellation and deletion do not depend on the alpha admission switch.

To roll back an alpha activation, disable private alpha admission/storage first, then disable observer/adviser and SAFE runtime masters through the protected workflow. Verify new requests fail closed, queued cases become paused/expired, and Safety/authentication, owner reads and deletion remain available. Remove dispatch only after active work drains or the bounded process exits. Restore the last reviewed Worker and Flutter versions without dropping additive migrations 0018 or 0019. Record exact restored version IDs and observations. Reactivate only with fresh owner approval and usage evidence.

## Current evidence state

This branch contains the implementation and protocol tests. No Moondream, GPT-OSS or new OpenAI Safety call has been made for alpha; no checkpoint has been loaded; no serving image, Worker, Flutter deployment or production migration has been performed. A release claim requires exact-SHA CI, protected migration/deployment receipts, real provider counts, ordinary-input outcomes, live browser acceptance and an observed rollback.
