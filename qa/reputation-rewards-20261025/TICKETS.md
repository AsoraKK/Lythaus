# Prioritized follow-up specifications

No confirmed defect patch is justified by the executed results. These tickets
close specific policy, integration and verification gaps. They are suitable
for a subsequent Sol 6.1/Luna implementation lane; this task makes no production
change. M/S and file locations refer to SOURCE_MAP.md. Effort categories are
S (one focused documentation/test change) and M (several cooperating modules
with focused regression tests), not estimates for deployment or approval.

1. **T1 — Record the missing prospective inputs. P1; Luna documentation,
   owner decisions required; effort S.**

   Scope: resolve P1–P5 in POLICY.md against existing owner evidence. Record
   exact version, common action/amount, method mapping, calendar/settlement,
   monthly-observation and correction semantics. Update only the prospective
   technical decision record and appropriate versioned configuration schema
   after approval. Relevant files: `docs/policy/current-policy-authority.md`,
   the prospective monthly decision record, S
   `packages/contracts/src/monthly-security-choice.ts` mapping type, and
   existing `packages/contracts/src/monthly-reputation-decisions.ts` references.
   Do not rewrite immutable historical catalogues or globally relabel D01–D13.

   Dependencies: owner authority for unresolved inputs, not another decision
   on equal benefits or the inclusive 24-hour threshold. Acceptance: every
   prospective configuration value links to a dated decision; two qualifying
   methods map to the same action; unknown values remain unavailable; no
   method is inferred from device preference. Keep P3/P4 explicitly pending
   if unresolved. Rollout: documentation and inactive fixtures only. Rollback:
   revert the new prospective record/configuration, preserving old versions.

2. **T2 — Verify the pending common-benefit integration on one exact source.
   P1; Sol 6.1; effort M.**

   Scope: coordinate the existing #1084 implementation with current main;
   reuse its interval/common-action functions instead of creating another
   calculator. Relevant paths: S `packages/contracts/src/monthly-security-choice.ts`,
   `monthly-security-grace.ts`, `packages/db/src/member-security-maintenance.ts`,
   `packages/db/src/monthly-assembly.ts`, and
   `apps/lythaus-jobs/src/monthly-assembly.ts`. Main's historical maintenance
   calculation remains versioned. No new service, credential mechanism or
   refresh behavior is part of this ticket. Consume only existing canonical
   coverage facts; absent approved facts remain explicitly unavailable.

   Dependencies: T1's mapping/calendar/observation decisions and the existing
   PR review workflow. Acceptance: port the I01–I22 assertions into supported
   contract tests on the final combined SHA; add a local mocked assembly case
   proving one common benefit reaches the monthly source for each approved
   method. Exactly 86,400,000 ms must qualify and +1 ms must not; partial
   overlap must use its union; continuous method change must preserve benefit;
   local preferences alone must remain unavailable. Existing historical tests
   must retain their outputs. All 47 current assertions must remain represented,
   with any policy-dependent expectation changed only under the recorded new
   version. Rollout: preparation/shadow fixtures first, runtime activation still
   separate. Rollback: stop the prospective configuration and retain immutable
   observations/revisions; do not delete history or alter tokens.

3. **T3 — Close ordinary delivery and correction gaps with a bounded consumer
   replay suite. P1; Sol 6.1; effort M.**

   Scope: extend supported local mocks through the actual Jobs consumers and
   monthly receipt/source/snapshot functions. Relevant files:
   `apps/lythaus-jobs/src/monthly-earning.ts`, `monthly-assembly.ts`,
   `packages/db/src/monthly-earning.ts`, `monthly-reputation.ts`,
   `monthly-reward-snapshots.ts`, and their existing test directories. The
   historical event adapter in `apps/lythaus-jobs/src/index.ts` is relevant only
   to the missing-original reversal retry case. Keep tests restricted to
   ordinary delivery and synthetic records; do not add diagnostic/permission
   work or duplicate #1100.

   Dependencies: P5 for finality and correction outcomes, T2 for integrated
   benefit cases. Acceptance: duplicate delivery yields one receipt/result;
   out-of-order dependency remains retryable and converges after the original
   arrives; a newer accepted/reversed revision wins over stale delivery;
   injected failure after a local write produces no published result; an
   uncertain commit response stays unknown and normal retry reuses the
   recorded result; weekly correction changes the next source revision without
   replacing immutable old rows. Explicitly test the approved snapshot
   correction behavior rather than equating recomputation with entitlement.
   Describe mock limits: no database durability/locking certification. Rollout:
   tests first, then only a targeted production fix if a failing assertion
   demonstrates one. Rollback: revert that focused fix while retaining the
   reproducer; no data deletion or runtime switch is authorized here.

4. **T4 — Verify client status replacement and fallback behavior. P2; Luna,
   Sol 6.1 if provider logic changes; effort S/M.**

   Scope: use existing Flutter model/widget/provider tests with local fake
   responses. Relevant paths: `lib/ui/screens/rewards/monthly_reputation_widgets.dart`,
   `lib/features/rewards/application/reward_providers.dart`,
   `test/ui/screens/rewards/monthly_reputation_widgets_test.dart`,
   `test/features/rewards/application/reward_providers_test.dart`, and
   `test/features/rewards/domain/reward_models_test.dart`. Confirm exact model
   paths from those tests before editing. No login or token-refresh changes.

   Dependencies: an existing Flutter-capable environment; P3/P4 for any new
   reason-code wording. Acceptance: confirmed → pending/unavailable response
   removes stale confirmed fields; shadow stays visibly provisional;
   preparation never looks earned; confirmed level plus pending selection is
   accurately described; error/retry remains keyboard and semantics
   accessible; missing evidence is distinct from a confirmed grace overrun
   where the approved contract supplies that distinction. Tests must render
   the widget and exercise fake provider refresh, not just reconstruct its
   string output. Rollout: test-only first; change only a demonstrated UI
   mismatch. Rollback: revert the focused display/provider change without
   changing server snapshots or stored obligations.

The smallest next step is T1 followed by the existing-candidate integration
check in T2. The executed arithmetic does not justify a replacement rewards
engine, new thresholds, a new identity service or a broad rewrite. Separate
database durability and deployment acceptance would require their own explicit
scope and evidence; they are not silently included in these completed tests.
