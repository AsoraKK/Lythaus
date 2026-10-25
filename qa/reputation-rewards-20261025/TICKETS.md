# Prioritized follow-up specifications

These are verification/integration tickets, not fixes for demonstrated defects.
M/S and P1–P5 are defined in POLICY.md. S means a focused change; M means several
cooperating modules with bounded tests. No code change is part of this report.

1. **T1 — Reconcile only genuinely pending mapping and operational inputs.
   P1 priority; Luna; effort S.**

   Scope: record or recover P1's approved method/common-action mapping and P2's
   operational approval in the prospective technical decision record. Relevant
   files: `docs/policy/current-policy-authority.md`,
   `packages/contracts/src/monthly-security-choice.ts` on S, and the existing
   calendar/maintenance decision records. P3/P4 are documented guards; P5's
   fixed-month/correction model is documented. Do not ask again about equal
   benefits, 24 hours, initial enrollment, or whether snapshots are fixed.

   Acceptance: exact versions and approval references accompany the mapping;
   no method or amount is inferred from local unlock; missing mapping remains
   unavailable. Preserve historical catalogues. Dependency: genuine P1/P2
   authority only, not another broad owner questionnaire. Rollout: inactive
   documentation/configuration; rollback: revert the prospective addition
   without changing history.

2. **T2 — Verify existing #1084 integration on one exact combined source.
   P1 priority; Sol 6.1; effort M.**

   Scope: reuse S `packages/contracts/src/monthly-security-choice.ts`,
   `monthly-security-grace.ts`, `packages/db/src/member-security-maintenance.ts`,
   `packages/db/src/monthly-assembly.ts`, and
   `apps/lythaus-jobs/src/monthly-assembly.ts`. Do not build another calculator
   or change authentication/refresh behavior.

   Acceptance: retain equivalent coverage for all 47 cases; add a local mocked
   assembly case showing one equal benefit for every approved method.
   86,400,000 ms qualifies; +1 ms does not; overlaps use their union; continuous
   method changes preserve eligibility; missing mapping/history stays explicit.
   Preserve P3/P4's documented observations and enrollment guards plus historical
   outputs. Local synthetic work can proceed; real configuration depends on
   T1 and existing PR review. Rollout: preparation/shadow only until separately
   approved. Rollback: disable the prospective configuration; retain evidence
   and revisions, with no token or history changes.

3. **T3 — Exercise ordinary consumer replay and the existing correction flow.
   P1 priority; Sol 6.1; effort M.**

   Scope: supported local mocks through
   `apps/lythaus-jobs/src/monthly-earning.ts`, `monthly-assembly.ts`,
   `packages/db/src/monthly-earning.ts`, `monthly-reputation.ts`, and
   `monthly-reward-snapshots.ts`. Use the historical Jobs event adapter only
   for the missing-original reversal retry case; no database diagnostic work.

   Acceptance: duplicate delivery yields one receipt/result; dependency ordering
   remains retryable; stale delivery cannot replace newer evidence; injected
   work failure publishes nothing; uncertain commit remains unknown and replay
   reuses the result. Weekly revisions must not silently change a confirmed
   month; use the documented separately approved correction path and retain old
   rows. No new finality decision is needed to test that path. Signed historical
   obligations/cutover remain a separate existing gate. Rollout: tests first,
   targeted fix only if a test demonstrates a defect. Rollback: revert that
   focused fix, keep the reproducer. Mocks do not prove database durability.

4. **T4 — Verify rendered status replacement and accessible fallback.
   P2 priority; Luna, Sol 6.1 if provider logic changes; effort S/M.**

   Scope: `lib/ui/screens/rewards/monthly_reputation_widgets.dart`,
   `lib/features/rewards/application/reward_providers.dart`, and existing
   `test/ui/screens/rewards/monthly_reputation_widgets_test.dart`,
   `test/features/rewards/application/reward_providers_test.dart`,
   `test/features/rewards/domain/reward_models_test.dart`.

   Acceptance: fake refresh from confirmed to pending/unavailable clears stale
   confirmed data; shadow/preparation stays provisional; confirmed level plus
   pending selection is accurate; retry has usable keyboard/semantics behavior.
   Use existing reason-code distinctions; do not invent entitlements.
   Dependency: an existing Flutter environment. Rollout: tests first, change
   only a demonstrated mismatch. Rollback: revert the focused display/provider
   change without altering snapshots, obligations or tokens.

No rewrite, new service, threshold change, live activation or broad policy
reopening is warranted by these results.
