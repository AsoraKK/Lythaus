# Authority and unresolved inputs

The later delegated authorization limits this task to ordinary business-rule
QA. The supplied owner decision of 23 October and the replacement brief settle
these prospective invariants: the same benefit for all qualifying methods;
whole-calendar-month accounting; cumulative **union** of nonqualifying time;
up to and including 24 hours allowed; more than 24 hours disqualifying.
Normal method changes are not themselves a reason to lose the benefit.
Local app unlock preference alone is not server-verified qualifying evidence.
Token refresh behavior must remain unchanged. These points are not reopened.

M and S denote the exact commits in SOURCE_MAP.md. M
`docs/policy/current-policy-authority.md` gives later explicit owner decisions
prospective authority, keeps historical versions intact and separates approval
from activation. The current fixtures do not approve a policy, collection date,
threshold, capability or benefit amount.

| Version / source | Authority and observed implementation | Treatment in this pack |
| --- | --- | --- |
| `reputation-v2.0.0`, M contracts/database cumulative path | Historical event catalogue and inverse-event semantics | E01–E06 exercise this ledger separately from monthly earning |
| `lythaus-monthly-rewards-2026-10-v1`, catalogue hash `bc8be9d8f4cae4b0f3ec327e09f308069dd3e6b07e8ff57ccc6a6cc62435f5a2` | Historical monthly candidate, 13,500 ceiling | C/D/W version context; no relabeling as prospective v2 |
| `closing-sunday-utc-proposal-v1`, M monthly-reputation-decisions.ts:15 | Pending D01; Monday 00:00Z week, owned by closing Sunday's month | C01–C08 test existing candidate behavior; no calendar approval inferred |
| `weekly-earning-human-contributions-proposal-v2` / `human-contributions-2026-10-v1`, M monthly-earning-policy.ts:28 | Versioned proposal; retains 72-hour weekly settlement default | W01–W03 and C06; no runtime configuration changes |
| `monthly-maintenance-defaults-proposal-v1`, M monthly-maintenance-policy.ts:22 | Historical proposal with 72-hour settlement and unavailable capability defaults; separate action amounts at :127 | Base calculation only. Fixture capabilities/mapping are explicitly synthetic. |
| `member-security-calendar-grace-24h-v1`, S monthly-security-grace.ts:5 | Pending implementation of approved interval direction; common-action mapping remains an input | I01–I22 test code behavior, not server evidence or activation |
| Prospective monthly v2, recorded in current-policy-authority.md | Owner-approved 13,650 maximum and calendar-quarter expiry direction; version-specific implementation remains separate | Not exercised as a prospective monthly entitlement; the historical 13,500 ceiling is not used to revoke this approval |

Historical separate-action amounts and rolling quarterly defaults do not
override later prospective policy. Conversely, testing the grace candidate
does not amend signed historical catalogues or migrate recorded periods.
The old activation/decision constants must be read in their version context.

These are the remaining product inputs, separated from implementation defects:

| ID | Precise decision needed | Current code observation / evidence | Why it matters |
| --- | --- | --- | --- |
| P1 | Which already approved server-verified methods map to the qualifying requirement, and which single versioned action/amount funds the common benefit? | S monthly-security-choice.ts:19 requires explicit options, catalogue/rule versions and either `monthly.credential_maintenance` or `monthly.mfa_maintenance`. Existing action maxima are 1,000 and 250; I09 tests equality under both without choosing one. | Equal treatment is settled; the approved methods and common budget are not supplied. Do not infer that biometrics or local unlock qualify, or require a particular method by default. |
| P2 | Is UTC with closing-Sunday week ownership and 72-hour settlement the approved operational convention for the prospective version? | M calendar is marked pending D01; weekly and maintenance rules remain proposals. C03/C06/C07/I17 verify current values only. | Calendar month lengths are unambiguous; ownership/timezone/settlement values still need versioned authority. |
| P3 | Does continuous qualifying coverage also require one qualifying authentication observation during the source month? | S grace.ts:80–95 requires it; I20 proves full coverage without that observation is insufficient. | The supplied owner decision does not explicitly settle an extra monthly-use condition. Confirm it or change only prospective eligibility evaluation; do not change refresh-token behavior to manufacture evidence. |
| P4 | How are first enrollment during the month, missing early history and missing coverage after a normal change classified? Does initial non-enrollment fall within the approved grace allowance, or is prior enrollment a separate prerequisite? | I15/I16 show explicit unknown-history and prior-enrollment checks. Candidate separates unknown time from verified off-time. | Avoid inventing either automatic entitlement or final disqualification from missing data. The 24-hour threshold itself is already settled. |
| P5 | When late evidence or reversal changes a settled week, what is the correction/finality rule for an already confirmed monthly snapshot and any recorded reward obligation? | W02/C08 show corrected weekly calculations; M snapshot flow has a separate correction gate at monthly-reward-snapshots.ts:183. That gate and obligations were not executed here. | A lower recalculation is not sufficient authority to retroactively erase an obligation. Specify the prospective correction path and retain history. |

No owner answer is required to retain or reproduce this test pack. These
questions are inputs to subsequent implementation/acceptance work, not requests
to reactivate the cancelled scope or to change live policy.
