# Ordinary business-rule matrix

All 47 executed cases below passed in the final run. `Pass` means the stated
assertions ran successfully, including expected rejection cases. `Observed`
also passed but records candidate behavior whose product authority is pending.
M/S and exact source paths are defined in [SOURCE_MAP.md](SOURCE_MAP.md).
Nothing in this matrix represents a hosted request or a real credential event.

| ID | Synthetic case and invariant | Actual result / interpretation | Test and source |
| --- | --- | --- | --- |
| E01 | Same contribution event delivered twice | Pass: one event; 10 points; replay `created:false` | events.test.mjs; M reputation.ts |
| E02 | Two independent, distinct-day events delivered in either order | Pass: 20 points in both orders | events.test.mjs; M reputation.ts |
| E03 | Counted contribution reversed, then inverse event repeated | Pass: original marked reversed, total 0, exactly two history entries | events.test.mjs; M reputation.ts |
| E04 | Reversal arrives before original; ordinary retry after original | Pass: first call rejects missing reference without a write; retry yields 0. Automatic retry delivery is untested. | events.test.mjs; M reputation.ts |
| E05 | Original event repeated after reversal | Pass: old points stay removed; no new entry | events.test.mjs; M reputation.ts |
| E06 | Two inverse commands reference the same original | Pass: second command rejects non-reversible state; no second inverse entry | events.test.mjs; M reputation.ts |
| W01 | Recompute identical current evidence twice | Pass: one weekly revision and one fake outbox row; 250 points | events.test.mjs; M monthly-earning.ts |
| W02 | Latest accepted evidence becomes reversed after weekly settlement | Pass: 250 → 0, revision 2 has stored `corrected` state; repeated recomputation stable | events.test.mjs; M monthly-earning.ts |
| W03 | Pending evidence becomes accepted after original activity week | Pass: 0 → 250; same week ID and August ownership | events.test.mjs; M monthly-earning.ts |
| T01 | Actual wrapper runs contribution write, then local downstream failure | Pass: fake durable store unchanged after rollback; retry commits one event; verified failure receipt after cleanup | events.test.mjs; M index.ts |
| T02 | Fake commit succeeds but response is lost | Pass: wrapper returns unknown commit outcome; normal replay finds one event | events.test.mjs; M index.ts |
| T03 | Failure followed by missing rollback acknowledgement | Pass: unknown cleanup outcome; no verified rollback receipt | events.test.mjs; M index.ts |
| C01 | Five August weeks, rotate input order | Pass: best four score 7,000 with identical selection/results | calendar-display.test.mjs; M monthly-reputation-policy.ts |
| C02 | Equal week scores, reverse input order | Pass: earlier closing weeks win deterministic tie break | calendar-display.test.mjs; M monthly-reputation-policy.ts |
| C03 | Week starts 31 August and closes in September | Pass: owned only by September under the current proposal | calendar-display.test.mjs; M monthly-reputation-decisions.ts |
| C04 | 28/29/30/31-day months and December rollover | Pass: 4 or 5 distinct seven-day weeks, no ownership overlap with next month; December → January | calendar-display.test.mjs; M monthly-reputation-decisions.ts |
| C05 | Duplicate week ID or overlapping supplied windows | Pass: rejected before counting | calendar-display.test.mjs; M monthly-reputation-policy.ts |
| C06 | One millisecond before month cutoff versus cutoff; exact weekly settlement boundary | Pass: early month assessment rejected, cutoff accepted; weekly open → settling → locked at proposed 72 hours | calendar-display.test.mjs; M monthly-reputation-policy.ts / monthly-earning-policy.ts |
| C07 | Equivalent non-UTC timestamp representation or wrong month owner | Pass: explicit UTC serialization and ownership checks reject these inputs | calendar-display.test.mjs; M monthly-reputation-policy.ts |
| C08 | One latest corrected week replaces its previous score | Pass: best four become 8,500, four unique week IDs, no old revision counted | calendar-display.test.mjs; M monthly-reputation-policy.ts |
| D01 | Unassessed default Level 1 | Pass: pending, no confirmed level/score | calendar-display.test.mjs; M monthly-reputation-projection.ts |
| D02 | Shadow calculation | Pass: nested shadow inspectable, no top-level confirmed level | calendar-display.test.mjs; M monthly-reputation-projection.ts |
| D03 | Confirmed level with pending versus ready selection | Pass: level retained in both; overall ready only with ready selection | calendar-display.test.mjs; M monthly-reputation-projection.ts |
| D04 | Preparation-only calculation | Pass: no confirmed level or source score | calendar-display.test.mjs; M monthly-reputation-projection.ts |
| D05 | Subsequent pending/unavailable server projection after a confirmed example | Pass: new result has no prior confirmed fields. This function is stateless; no cache was exercised. | calendar-display.test.mjs; M monthly-reputation-projection.ts |
| I01 | Continuous coverage for all 31 days | Pass: ready, 0 nonqualifying ms, 31 protected days | intervals.test.mjs; S choice/grace |
| I02 | Exactly 24-hour known gap | Pass: ready at 86,400,000 ms | intervals.test.mjs; S choice/grace |
| I03 | 24 hours plus one millisecond | Pass: `monthly_grace_exceeded`, no eligibility | intervals.test.mjs; S choice/grace |
| I04 | Two separate 12-hour gaps, then extend last by 1 ms | Pass: cumulative 24 hours allowed, +1 ms exceeds allowance | intervals.test.mjs; S choice/grace |
| I05 | Disabled interval and ended coverage describe the same absence | Pass: single 24-hour union, eligible | intervals.test.mjs; S choice/grace |
| I06 | Adjacent disabled intervals | Pass: one continuous 24-hour interval | intervals.test.mjs; S choice/grace |
| I07 | Overlapping qualifying coverage | Pass: protected time stays 31 days, not double-counted | intervals.test.mjs; S choice/grace |
| I08 | Normal midmonth change between synthetic methods with continuous coverage | Pass: ready; no gap or unknown time | intervals.test.mjs; S choice/grace |
| I09 | Synthetic method A versus B, under each existing possible common action | Pass: equal monthly benefit and exactly one positive action for either method; does not choose an approved amount | intervals.test.mjs; S common benefit plus M maintenance report |
| I10 | Gap spans previous/current month boundary | Pass: only current month's 12 hours count | intervals.test.mjs; S choice/grace |
| I11 | Gap spans current/next month boundary | Pass: only current month's 12 hours count | intervals.test.mjs; S choice/grace |
| I12 | Disable and enable at identical timestamp | Pass: zero-duration change uses no grace | intervals.test.mjs; S choice/grace |
| I13 | Full 28/29/30/31-day calendar months | Pass: exact duration for each month; all ready | intervals.test.mjs; S choice/grace |
| I14 | Recorded choice changes supplied in reverse array order | Pass: sorted by existing revision; identical decision | intervals.test.mjs; S choice/grace |
| I15 | Normal method change lacks coverage for the new option | Observed: `coverage_telemetry_unknown`; 17 days unknown, no assumed award | intervals.test.mjs; S choice/grace; P4 |
| I16 | Enrollment on day 20; collection begins 1 ms after month start | Observed: respectively `not_enrolled_before_calendar_month` and `coverage_history_incomplete` | intervals.test.mjs; S choice/grace; P4 |
| I17 | Evaluate before month close, at close and after proposed settlement | Pass against candidate: open, settling, ready at next-month day 4 | intervals.test.mjs; S choice/grace; calendar approval P2 |
| I18 | Local device-preference record alone | Pass: unavailable; no qualifying coverage evidence emitted | intervals.test.mjs; S choice/grace |
| I19 | Missing mapping or disabled collection | Pass: unavailable/inactive; cannot produce ready result | intervals.test.mjs; S choice/grace |
| I20 | Full coverage without within-month authentication observation; observation at next-month cutoff | Observed: both `qualifying_authentication_missing`; extra monthly-use requirement needs a decision | intervals.test.mjs; S choice/grace; P3 |
| I21 | 64 deterministic schedules of four separate gaps, reversed input order | Pass: independently summed gap duration, month partition and ≤24-hour threshold all match | intervals.test.mjs; S choice/grace |
| I22 | Two partly overlapping 24-hour absence spans | Pass: union is 36 hours, not 48; exceeds grace | intervals.test.mjs; S choice/grace |

These extensions were **not executed** and are not counted as skipped tests:

| ID | Untested behavior | Reason / appropriate next evidence |
| --- | --- | --- |
| U01 | Real database constraints, commit durability or simultaneous transactions | This phase used local mocks only; no database execution. Do not infer these properties from E/T/W. |
| U02 | Automatic Jobs retry, receipt persistence, monthly assembly and snapshot correction as one delivery flow | Pack stops at the stated units. T3 specifies a bounded local consumer replay suite. |
| U03 | Order-dependent attribution under same-day diminishing returns/caps | E02 deliberately uses independent dates. A normative attribution rule and focused fixtures are needed before claiming arbitrary order independence. |
| U04 | Effective event time, late delivery and finality beyond the recorded candidate boundaries | No retrospective entitlement rule was invented. P5 must identify the applicable version and correction rule. |
| U05 | Integrated S+M implementation and interactions with #1091/#1092/#1090/#1093 | Pending heads were not merged. T2 requires one exact reviewed source and prospective fixtures. |
| U06 | Flutter rendering, stale cache, offline refresh, keyboard/screen-reader retry | Flutter absent from PATH; source inspection is not a widget result. T4 names existing local test files. |
| U07 | Non-UTC product calendars / DST interpretation | Current contract accepts UTC only. P2 is pending; C07 tests serialization, not regional calendar policy. |
| U08 | Real qualifying-method evidence and recovery/reset behavior | Only synthetic facts are used. Method identity and coverage semantics need P1/P4; no credentials exercised. |
| U09 | Token refresh behavior | Explicitly preserved by no production changes; not executed in this QA. |
| U10 | Actual reward selection persistence, delivery or redemption | Only eligibility projection is in this pack; no entitlement or live reward operation was performed. |

The superseded objectives are outside this replacement task and have no rows,
tests or carried-forward findings here.
