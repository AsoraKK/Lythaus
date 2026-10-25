# Inactive-state display and qualification decisions

Status: decision record for the inactive implementation lane, dated 25 October
2026. Owner direction below was supplied through the parent task; this lane did
not independently retrieve the original conversation. This record does not amend
public terms, certify a provider, or activate a feature.

## Settled direction

- Optional app unlock remains off by default and local to the device. Refreshing
  data or choosing device unlock is a client preference, not server
  authentication, monthly earning evidence, or reputation evidence.
- The shared monthly maintenance benefit requires server-verifiable qualifying
  coverage across the calendar month and a matching server-verified event. The
  union of nonqualifying intervals may total up to 24 hours. Above 24 hours, only
  this common benefit is lost. Supported method changes preserve qualification
  when coverage remains continuous. All supported methods use the same benefit
  and do not stack. Unknown methods are unresolved, not proof of ineligibility;
  they create no blame, penalty, or backdated credit.
- Prospective v2 keeps the approved 13,650 source-month maximum and expiry at
  calendar-quarter end for all quarterly awards, for remaining months only and
  with no earlier retroactive credit. Implementation acceptance and activation
  remain separate gates. Historical signed v1 stays unchanged.

## Owner decisions still needed

1. **Qualifying server methods and common catalogue amount.** Name the exact
   server-verified method evidence that qualifies and map every supported method
   to one existing common action and amount. Existing calculator candidates are
   `monthly.mfa_maintenance` at 250 points and
   `monthly.credential_maintenance` at 1,000 points. Neither amount nor method
   mapping is selected here. The 250-point option limits the common benefit; the
   1,000-point option preserves the larger credential candidate but increases
   the award. Method-specific values would conflict with the settled equal-
   benefit rule. Record the chosen action, amount, method evidence, and policy
   version before any earning path is accepted.
2. **UTC week ownership and settlement.** The current proposal assigns a UTC
   Monday-to-Monday week to the month containing its closing Sunday and waits 72
   hours after week end before settlement. Keeping it gives cross-month weeks a
   consistent owner and time for late evidence, at the cost of delayed final
   reports. A different explicit UTC ownership rule or settlement window may
   settle sooner or shift points between months, but needs a versioned choice
   and matching boundary tests. The proposal is not approval.

## Display and activation boundary

The client labels a level **confirmed** only from a matching confirmed server
snapshot. **Shadow** is an advisory server projection, **pending** is awaiting
assessment, and **unavailable** means no authoritative result can be shown.
Reward-selection readiness stays separate from level confirmation. None of
these labels activates scoring or rewards.

Rendered evidence uses synthetic account and response data at 430 logical
pixels, with bundled fonts. The captures are:

- [Account security preview](../evidence/inactive-state-display-2026-10-25/account-security-inactive-preview.png)
- [Unavailable monthly level](../evidence/inactive-state-display-2026-10-25/monthly-level-unavailable.png)
- [Historical v1 fixture: confirmed level with unavailable reward selection](../evidence/inactive-state-display-2026-10-25/monthly-level-confirmed-selection-unavailable.png)

The confirmed capture uses historical v1's 13,500 maximum; it is not evidence
of a confirmed prospective v2 level. The v2 13,650 preparation remains a shadow
projection and does not activate rewards.

Reproduce them by setting `LYTHAUS_INACTIVE_EVIDENCE_DIR` to
`docs/evidence/inactive-state-display-2026-10-25` and running
`flutter test --no-pub` on the member verification preview and monthly
reputation widget test files. The opt-in helper writes no screenshots when the
variable is unset.

The existing proposed calculator settings and fixtures are implementation
evidence only: `monthly-maintenance-defaults-proposal-v1` remains
`pending_owner_approval`, and the UTC closing-Sunday/72-hour rules remain
proposals. The existing 47-case set is not owner approval, production evidence,
or activation proof. No new earning rule, security flag, provider, or activation
is authorized by this document.
