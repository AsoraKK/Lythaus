# Disabled monthly v2 reader and export preparation

This dependent draft extends the existing domain readers and CSV serializer after
the reviewed source, assembly, snapshot and disposable-clock drafts. It introduces
no production schema application, grants, routing, deployment or activation.

`readOwnMonthlyRewardSnapshot` and `readOwnMonthlyReputationReport` accept the same
explicit `disposable_local_pg17` preparation context as the writers. That context
requires the canonical synthetic loopback database, PostgreSQL 17 and validated
v2 proposal constraints. It permits shadow preparation only. Default callers
continue to select v1 configuration; passing v2 rules without the context returns
unavailable. Neither Public, Admin nor Jobs entrypoints supply the context.

The requested source month determines the following effective month, including
December to January. The entitlement reader uses the saved snapshot and the real
PostgreSQL settlement clock. It does not consult current source progress or
reselect weeks. New progress can appear in the report while the earlier snapshot
continues to supply the fixed authority until a same-policy approved correction
is applied. An occupied snapshot chain under another policy requires review;
correction history is filtered by policy rather than relabeling another policy's
score. The report verifies stored integer components, assessment/source identity,
assembly configuration and digest provenance, preserving the existing calculator.

Prepared JSON uses data version 2, the exact v2 policy/catalogue identity and
`preparationOnly: true`, `runtimeActivationAllowed: false`, `appliedPoints: 0`.
It names email (maximum 1000), optional suggestion (150) and quarterly total (1150)
separately. The source maximum is 13650. The four whole selected weeks and monthly
maintenance retain their v1 earning policy and rules identities; lower level
thresholds remain unchanged. Qualification projections contain safe reasons and
validity windows, without private evidence, contribution, reviewer or event IDs.
Source and assembly digests identify the saved evidence without exposing it.

Direct prepared snapshot responses carry this same v2 identity and disabled
metadata when pending or unavailable, including absent configuration, future
months, cutover and policy-review branches. They do not invent score or authority
fields. Default v1 responses retain their exact shapes. The history reason probe
is scoped to the requested policy for both versions: another policy's sources
alone cannot change `no_previous_assessment` into `settlement_pending`.

Suggestion `validFrom` and `validUntil` are independently nullable evidence fields.
`null` means the stored qualification projection does not supply that evidence
date. It does not mean an inferred quarter start/end, indefinite validity or a
date derived from the source/effective month or snapshot. JSON retains null and
CSV leaves the corresponding cell empty. Consumers must present those dates as
unavailable; a qualification or 150-point result can coexist with unavailable
dates. This preparation does not alter approved qualification or fabricate dates.

The existing CSV serializer requires the explicit `disabled_v2_preparation` option
for a prepared v2 report. It adds version, component, denominator, inherited-policy
and fixed-authority revision columns, using the existing escaping and formula
protection. Calling it normally with v2 fails closed. Historical v1 JSON and CSV
shapes, column order, escaping and 13500 denominator remain intact.

The six settled positive cases retain the original 32-case snapshot suite and add
prepared reader/export assertions for retries, policy collisions, immutable
corrections and future progress. Ordinary PostgreSQL still refuses premature
positive settlement and explicitly skips those six cases. Prepared unit cases
exercise 13650, whole fifth-week omission, year rollover, integer and policy
rejection, fixed authority, settlement refusal and CSV formula protection. They
also participate in the existing report/export coverage job.

## Coordinator-owned release gates

- Agree versioned Public JSON/CSV contracts and error behavior, then update the
  existing authenticated route, OpenAPI schemas and generated Dart client together.
- Update monthly report UI and settings/reward consumers with the fixed following
  month authority and distinct 13650/1150/1000/150 denominators. Historical v1 stays
  13500/1000. Shared entrypoints and `lib/main.dart` require owner coordination.
- Reconcile privacy, deletion/export coverage, retention and admin audit projections
  with the canonical owners; this draft exposes no private quarterly IDs.
- Supply approved production quarter timezone, first v2 source month, rubric and
  reviewer authority, immutable cutover/configuration and decision approvals.
- Review and approve forward SQL proposals, grants and runtime bindings separately.
  No production provider access or activation is implied by synthetic validation.

The coordinator owns integration into main and the freeze. Analytics/support paths
and their independently reviewed work are outside this draft's authored changes.
