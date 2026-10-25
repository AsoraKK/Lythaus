# Authority and input status

Follow-up reconciliation corrects the initial report's overly broad P3/P4
questions and P5 finality question. These are documented candidate behavior,
not demonstrated defects or new requests for owner decisions. No code or tests
changed.

M = `c0963c36693476ecc49ab1fcba0572454926b4d3`.
S = unmerged #1084 `ef288ef2819382afd571256d3f9e31e8bb8383bb`.
A = S `docs/architecture/member-action-verification-inactive-2026-10-23.md`.
B = M `docs/architecture/monthly-reputation-2026-10.md`.

The supplied owner decision and A:156–166,222–233 settle one equal benefit for
qualifying methods, whole-calendar-month accounting, cumulative union of
nonqualifying intervals, exactly 24 hours allowed and more than 24 hours
disqualifying that month's benefit. Normal supported method changes preserve
eligibility when coverage continues. No other reputation is deducted. Local
unlock preference alone is not qualifying server evidence; refresh-token
behavior is unchanged. Do not ask for these decisions again.

| ID | Correct classification | Evidence and action |
| --- | --- | --- |
| P1 | Genuine unresolved mapping/activation input | A:227–236 explicitly leaves qualifying account-level methods and the common existing catalogue action unmapped. S monthly-security-choice.ts:19–28,71–90 implements that intentional unavailable placeholder. Existing action maxima are 250 and 1,000; neither is selected by this QA. Recover an existing approved mapping if one exists; otherwise this narrowly identified mapping needs approval before use. |
| P2 | Operational approval still explicitly pending | A:234–236 and M docs/testing/non-security-monthly-settlement-20261023.md:78–86 retain UTC/week ownership and settlement approval gates. Current candidate uses closing-Sunday ownership and 72 hours. Passing those fixtures does not approve them. |
| P3 | Documented, intentionally inactive qualification rule | A:168–175 explicitly requires a matching server-verified authentication during protected coverage that month. M catalogue lines 159–166 already proposes authentication/assertion evidence; M monthly-maintenance-policy.ts:141–145 enforces the monthly observation. S grace.ts:80–95 retains it. I20 matches that documented behavior. Do not characterize it as an unexplained extra defect or automatically ask for another decision; retain it in the versioned mapping/acceptance review. |
| P4 | Documented coverage/history rules | A:164–170 separates unknown telemetry from grace and prohibits backdating a midmonth enrollment. I15/I16 match these intended guards. Missing history remains unknown; no automatic entitlement or guilt is inferred. No new initial-enrollment decision is requested here. |
| P5 | Fixed-month/correction behavior already documented; separate historical-obligation gate | B:194–202 says later activity/source revisions do not continuously change a published month; independently approved corrections append history. M monthly-reward-snapshots.ts:183–188 implements the correction gate. Test this existing behavior. B:158 and M non-security-monthly-settlement-20261023.md:88–90 retain the separate signed-obligation/cutover gate; do not reopen the entire snapshot policy. |

P3/P4 documentation proves deliberate candidate design, not a separate signed
owner approval for every qualification detail. No contradictory later owner
decision was found in the inspected local records. Final qualifying-method
mapping remains pending under P1; this review does not activate that mapping.

Version boundaries remain intact: historical `reputation-v2.0.0` is separate
from `lythaus-monthly-rewards-2026-10-v1` (13,500). Calendar
`closing-sunday-utc-proposal-v1`, weekly
`weekly-earning-human-contributions-proposal-v2` /
`human-contributions-2026-10-v1`, and maintenance
`monthly-maintenance-defaults-proposal-v1` remain versioned candidates.
S's interval version is `member-security-calendar-grace-24h-v1`.
The prospective 13,650 maximum and calendar-quarter expiry direction are
already approved in M current-policy-authority.md; they are not new questions
or tested entitlements here. Historical catalogues are unchanged.

This classification uses the pinned local repository documents and supplied
owner evidence, not a live PR refresh or production inspection.
