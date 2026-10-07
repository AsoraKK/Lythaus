# WP00 auth lane baseline — 7 October 2026

Checkpoint: current `origin/main` and this isolated worktree are
`f757d35a3263f86f817ea09fd76368bd1f6a8e01`. GitHub reads found 35 open PRs and
15 open issues. Issue 720 remains open. This is a dated inventory, not a launch
certification or an instruction to close existing work.

## Retained work and live state

PRs 917, 918, 899, 922, 931, 919 and 941 are merged and retained. In particular,
password screening, mailbox-owned setup, recovery/session semantics, next-day
resend, idempotency recovery and prompt dispatch already exist. PRs 903, 926,
909, 910, 895, 930, 906, 936, 934 and 940 are also merged. Drafts 921, 893, 889
and 886 remain open. They are separate candidates and have not been integrated
into this auth lane.

Canonical release 102, run 37518378344, completed successfully on 6 October
against this exact main SHA. Its six surfaces and seven canonical smoke labels
passed. Authenticated browser acceptance was skipped. Its final state is
`OWNER_TEST_DEPLOYED_UNCERTIFIED`, `NO-GO`, `OWNER_TEST_PENDING`; the coordinator
was deferred for that owner-directed release. The Jobs smoke label is deployment
evidence, not an HTTP or authenticated database journey.

The retained post-release read-only database check reports PlanetScale `main`,
103 relations and 21 approved migrations ending at
`0020_auth_recovery_delivery.sql`. Approved prompt-dispatch flags, paired key
compatibility, existing Queue consumer cap 1 and lifecycle subscription evidence
belong to the coordinator's retained release record. This lane makes no provider,
Queue, credential, schema, production-data or release changes and does not
reinterpret those records as proof of inbox arrival.

## Lane A ownership

The allowed implementation set, only if a residual failure is reproduced, is:

- `apps/lythaus-public-api/src/auth-runtime-policy.ts`
- `apps/lythaus-public-api/src/auth-intake-runtime.ts`
- `apps/lythaus-public-api/src/auth-recovery-policy.ts`
- `apps/lythaus-public-api/src/auth-account-transaction.ts`
- `apps/lythaus-public-api/src/auth-password-screen.ts`
- `apps/lythaus-public-api/src/auth-session-runtime.ts`
- `apps/lythaus-public-api/src/auth-session-transport.ts`
- `apps/lythaus-public-api/src/auth-email-dispatch-queue.ts`
- `apps/lythaus-public-api/src/email-envelope-entrypoint.ts`
- `apps/lythaus-jobs/src/transactional-email-runtime.ts`
- Matching existing auth/email unit, workerd, PostgreSQL and browser tests.
- This baseline, `docs/testing/wp01-auth-runtime-evidence-20261007.md` and
  `docs/releases/wp01-auth-external-acceptance-packet-20261007.json`.

Shared Worker indexes, routers, root manifests and locks, CI, OpenAPI root/bundle,
generated Dart client, DB/shared-contract exports, shared auth/session providers,
profile/settings/shell and privacy reconciliation are reserved for Lane B or the
integrator. They may be inspected and tested here. A reproduced defect requiring
one of them must be proposed as a minimal serialized patch to the coordinator.
Homepage wordmark/beam/assets remain with their existing owner.

## Approved bounded gap

WP01 selects exact-source runtime and rendered auth evidence: initial issuance,
resend, reset, retry/replay, expiry/cooldown, scanner GET versus deliberate POST,
session/cancellation races, anti-enumeration and sanitized external acceptance
handoff. Existing regressions are run first. A code change is justified only by
an observed residual failure; an evidence-only result is valid.

No real account creation, mailbox sends, credentials, configuration activation,
production writes/DDL, new resources, paid tier changes or protection bypass are
authorized in this lane. Owner UAT is reserved for Saturday 10 October; no repeat
signup request is made during this checkpoint. The prior denied approval API
boundary remains closed.

## Other completion-plan gates

The original 22-action catalogue is retained byte-for-byte, SHA-256
`bc8be9d8f4cae4b0f3ec327e09f308069dd3e6b07e8ff57ccc6a6cc62435f5a2`.
The existing 100-case monthly matrix is a requirements/evidence map, not 100
executed end-to-end workflows. D01–D13 and F01 remain owner decisions. The
13,500 maximum is unchanged; the suggestion amendment is unscored until its
budget/source placement is approved. Monthly proposals remain inactive. Support
and tag index remain default OFF. A global rewards-OFF state has not been
established; existing authenticated routes must be preserved.

Passkey/TOTP/security provenance, privacy export/deletion lifecycle, support,
monthly earning/review/reward UX, merchant/provider capability, policy decisions
and accessibility/device acceptance remain separate work packages. This auth
checkpoint does not certify their implementation or start those packages.

## State vocabulary

Report implemented, tested, merged, deployed, activated and owner-accepted
separately. In-memory mail capture is a synthetic provider observation. Live
provider acceptance, authenticated delivery lifecycle, inbox receipt and owner
acceptance require distinct evidence. The next WP01 report will map each case to
its actual runtime/test boundary and list every skip and unverified gate.
