# ADR-004: Separate runtime authentication from release certification

Status: Accepted

## Decision

Lythaus has two deliberately separate planes:

```text
Runtime authentication
User -> Turnstile -> Public API -> PlanetScale
                           -> transactional outbox -> Jobs -> Cloudflare Email

Release certification
Protected main -> source -> infrastructure -> candidates
               -> product acceptance -> activation
```

`RUNTIME_AUTHENTICATION` is the user-facing system. It keeps the Public API,
PlanetScale auth/session/challenge model, Turnstile, transactional outbox,
scoped encrypted delivery envelope, Cloudflare Email lifecycle processing,
scanner-safe verification POST, replay protection, anti-enumeration, password
hashing, refresh/logout, reset, and session revocation.

`AUTH_CERTIFICATION` is evidence used to decide whether a release is safe. The
Coordinator, Keeper, lifecycle observer, browser automation, Gmail access, and
provider inventories live here. None is called by a normal user request. In
particular, delivery-observer outages cannot prevent a valid runtime challenge
from being consumed.

## Release classes

The source plan in `scripts/release/release-classification.mjs` is the only
release-class authority. It compares the exact release SHA with the previous
production SHA and applies auditable path rules.

- `STANDARD_RELEASE`: unrelated marketing, UI, docs, feed, admin, analytics,
  and explicitly safe product migrations.
- `AUTH_CRITICAL_RELEASE`: auth flow/runtime/configuration changes, Turnstile,
  email generation or consumption, auth/session migrations, crypto/security or
  cookie dependencies, public contracts, acceptance machinery, and ambiguous
  paths.

`FORCE_AUTH_CRITICAL=true` can upgrade a standard plan. There is no release
class input that can downgrade a computed critical plan. A missing baseline or
ambiguous path is conservative and critical. Shared database, security,
contract, and root dependency changes map to every affected component.

## Five gates

Every native release records these conceptual gates and states:

1. `SOURCE`: protected `main`, exact SHA, required CI/security evidence, and
   deterministic class/component plan (`PREFLIGHT`).
2. `INFRASTRUCTURE`: provider, Hyperdrive, PlanetScale schema/migration,
   secrets, lifecycle, and rollback evidence (`INFRASTRUCTURE_VERIFIED`).
3. `CANDIDATE`: build only changed components and prove changed-to-reused
   compatibility (`CANDIDATE_READY`).
4. `PRODUCT_ACCEPTANCE`: standard releases record
   `PRODUCT_ACCEPTANCE_NOT_REQUIRED`; critical releases require
   `PRODUCT_ACCEPTANCE_REQUIRED` then `PRODUCT_ACCEPTANCE_PASSED`.
5. `ACTIVATION`: activate changed components, smoke production, and record
   `ACTIVATED` then `VERIFIED`. Safety failures are `BLOCKED`; a successful
   component rollback is `ROLLED_BACK`.

## Selective deployment

The release plan covers Public, Admin, Jobs, Coordinator, marketing, Flutter
web, and control panel. A changed component gets a new exact-SHA candidate and
`BUILT_FROM_RELEASE_SHA`. An unchanged component reuses the exact positive
serving production version and records
`REUSED_KNOWN_GOOD_PRODUCTION_VERSION`.

The Coordinator is a stable protected service. It is not restaged, rerouted, or
uploaded for an unrelated release. Its encrypted acceptance context binds the
release being certified separately from the Public candidate's source SHA, so
it can safely certify a reused Public version. Coordinator code is redeployed
only when its component changes.

Jobs follows the same rule. A changed Jobs version is uploaded, tested, and
rollback-protected. An unchanged Jobs version is reused, while the changed
Public version must prove transactional-email envelope compatibility with it.

Zero-traffic candidates are valid candidate state. Rollback snapshots contain
only the exact positive serving traffic for the components that were changed;
reused components are not touched.

## Acceptance policy

`STANDARD_RELEASE` never requires Keeper, Gmail, a human Turnstile solve, a
real signup/reset, an acceptance mailbox, or an acceptance user. It still runs
the required automated readiness, provider/schema compatibility, production
smoke, and security gates.

`AUTH_CRITICAL_RELEASE` runs the existing real acceptance against the exact
candidate set: real Turnstile, signup, transactional email, verification,
replay rejection, login/session, resend, password reset, and session
revocation. Evidence retains the release SHA, candidate/reused version IDs,
candidate source SHA, `acceptanceRunId`, and expiry. If the human window expires
while the candidate set is still valid, resume with a fresh acceptance run over
that same set rather than rebuilding it.

Browser and Gmail automation are optional convenience tools. They are never
production infrastructure or a substitute for server-derived evidence.

## Failure domains

Release evidence uses one of five labels:

- `SAFETY_BLOCKER`: release identity, schema, secret, candidate, or rollback
  safety is not proven.
- `PRODUCT_BLOCKER`: a real auth/product behavior failed.
- `CERTIFICATION_BLOCKER`: the protected human/evidence ceremony is incomplete.
- `OBSERVABILITY_WARNING`: optional lifecycle/log observation is unavailable.
- `TOOLING_FAILURE`: GitHub runner, browser, provider CLI, or network tooling
  failed.

This prevents an unavailable browser or runner from being reported as an auth
defect. Activation still fails closed for genuine safety and critical-product
failures.

## Consequences

Unrelated releases are shorter and deterministic because they reuse known-good
versions and skip the human auth ceremony. Auth changes retain the strongest
real acceptance path. The trade-off is that a critical release remains
deliberately blocked until the real external acceptance is complete; this is a
launch safety gate, not a runtime dependency.
