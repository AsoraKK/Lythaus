# Lythaus Authenticity AI Cloudflare Readiness — WP002

**Assessment date:** 2026-08-09
**Repository baseline:** `94ea99fb4b58cfdbd6fbf440f853995e5994c65c`
**Account scope:** Cloudflare account `e5b7ae46e04698f507b7e4b3d4ef1af0`, zone `lythaus.co`

## Evidence state

The committed resource registry and Worker configuration were inspected and are
`VERIFIED_REPO`. Wrangler 4.120.0 was available, but its saved Cloudflare
credential was expired and could not be refreshed in the non-interactive
environment. All live inventory, billing, current usage, routes, eligibility,
and limits are therefore `UNKNOWN`. No live mutation was attempted.

Evidence states used by this report:

- `VERIFIED_REPO`: present in committed configuration or the resource registry.
- `VERIFIED_LIVE`: confirmed by a current provider read-only query.
- `UNKNOWN`: a live query was blocked or the provider did not expose the fact.
- `BLOCKED`: a known policy, licensing, cost, or safety gate prevents use.

## Resource reuse matrix

| Current resource | Repository evidence | Intended authenticity role | Reusable | Future mutation | Cost class | Human approval | Blockers |
|---|---|---|---|---|---|---|---|
| `lythaus-public-api-development` | Worker with existing app Hyperdrive, KV, quarantine/approved R2, and queue producers | Submission validation and preflight boundary | Yes, in place | None in WP002; future media route requires review | Existing Worker usage | Required for activation | Media uploads are disabled; live state unknown |
| `lythaus-jobs-development` | Worker with Workers AI, Jobs/Privacy Hyperdrive, R2, queue consumers, and Workflows | Queue-driven authenticity orchestration and audit | Yes, in place | Future routed proof event only after owner approval | Existing Worker usage | Required for any model or queue use | Existing queues contain mixed events |
| `lythaus-admin-api-development` | Existing admin/privacy Hyperdrive and audit/export R2 | Human review, appeal, and audit access | Yes, in place | No WP002 mutation | Existing Worker usage | Required for future review UI changes | Live routes and Access state unknown |
| `lythaus-media-quarantine-dev` | Existing `MEDIA_QUARANTINE` binding | Quarantine-before-publication media storage | Yes | Future lifecycle/prefix review only | Existing R2 usage | Required before new writes | Lifecycle and contents unknown live |
| `lythaus-media-approved-dev` | Existing `MEDIA_APPROVED` binding | Not used for research artefacts; publication only | No for benchmark material | None | Existing R2 usage | Required for any publication path | Do not mix evaluation material with user media |
| `lythaus-audit-archive-dev` | Existing `AUDIT_ARCHIVE` binding with protected audit prefix | Sanitised evidence and run metadata | Yes for sanitised records | Future prefix contract only | Existing R2 usage | Required before production writes | No PII or raw benchmark media |
| `lythaus-config-dev` | Existing `LYTHAUS_CONFIG` KV binding | Emergency disable and feature flags | Yes | Future flag additions require review | Existing KV usage | Required for live flag change | Never canonical case/model data |
| `lythaus-jobs-development` Hyperdrive `442bb04b99004cb38c6974ec031d65ee` | `DB_JOBS_FRESH` binding | Case/job/audit write boundary | Yes, conditionally | No schema mutation in WP002 | Existing Hyperdrive usage | Required for any live write | Target branch and live origin unknown |
| Existing role-specific Hyperdrives | Four configured app/admin/jobs/privacy bindings | PlanetScale authority access | Yes, conditionally | No rebinding in WP002 | Existing Hyperdrive usage | Required for live changes | Exact live target must be reverified |
| `lythaus-moderation-dev` and DLQ | Jobs consumer plus public/jobs producers | Preserve moderation isolation; no authenticity sharing | No new consumer | Routed proof event only with approval | Existing Queue usage | Required for consumer change | Mixed event stream; duplicate consumer risk |
| `lythaus-media-dev` and DLQ | Registry entry; media processing disabled | Future media job candidate | Conditional | Enablement requires separate approval | Existing Queue usage | Required | Currently disabled; live depth unknown |
| `lythaus-audit-dev` and DLQ | Existing Jobs consumer | Sanitised audit event transport | Conditional | Reuse only with idempotent message type | Existing Queue usage | Required | Live queue depth unknown |
| Existing account/appeal/retention Workflows | Jobs bindings in committed config | Appeal and retention lifecycle | Yes for metadata only | No WP002 mutation | Existing Workflow usage | Required for lifecycle changes | Live workflow state unknown |
| Workers AI binding `AI` | Jobs Worker config and gpt-oss shadow variables | Future Judge/evidence reasoning only | Conditional | No model invocation in WP002 | Metered usage | Required for any inference | Auth and usage limits unknown live |
| Container proof skeleton | `apps/lythaus-authenticity-container-proof` with `lite`, max 1, no queue consumer | Future deterministic CPU proof | Structurally yes | Owner-approved binding/deployment only | Metered Container usage | Required | Not deployed; live eligibility unknown |
| Production routes/custom domains | Hostnames appear in Worker vars/config | Future controlled routing | Unknown | No route change in WP002 | Existing route usage | Required | Current routes were not queryable |

The unassigned `lythaus-core-fresh` Hyperdrive remains explicitly excluded:
it must not be used without live proof and must not be duplicated or rebound by
WP002.

## Cloudflare proof decision

The deterministic proof path can eventually reuse the existing quarantine R2,
Jobs Hyperdrive, and an owner-approved routed event through the Jobs runtime.
The current proof config intentionally has no queue consumer because an
additional consumer could consume unrelated messages. WP002 does not add one.

The recommendation is **CONDITIONAL PROCEED** for a future CPU Container proof,
not a deployment approval. A future approval packet must contain:

1. a current read-only resource and billing inspection;
2. a published-rate calculation and bounded worst-case test estimate;
3. the exact `lite` instance and `max_instances: 1` limit;
4. the routed message type and idempotency contract;
5. rollback and emergency-disable steps;
6. human approval before any binding or deployment mutation.

No model inference is required to prove the first Container boundary.

## Required human follow-up

Restore a read-only Cloudflare credential for a repeat audit of account, Worker,
route, queue depth, R2 lifecycle, Hyperdrive target, Workers AI eligibility,
Container eligibility, current usage, and billing. Until then, this report is
not a live capacity or spend attestation.
