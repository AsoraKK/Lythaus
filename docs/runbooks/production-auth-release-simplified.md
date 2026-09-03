# Simplified production release runbook

This runbook is for the solo founder operating the canonical release workflow.
The current source of truth is the exact remote `main` SHA and the live GitHub
release/acceptance state. Never reuse an old candidate ID, acceptance run, or
release SHA without rechecking it.

## Before dispatch

1. Confirm the reviewed commit is still the current protected `origin/main`
   SHA and is the merge commit of one reviewed PR.
2. Confirm the exact successful CI, CodeQL, dependency-review, secret-scan,
   and historical-reconciliation run IDs for that SHA.
3. Supply the previous canonical production SHA, or `NONE` only for the first
   canonical release.
4. Set `confirm_production=true`. Set `force_auth_critical=true` only when an
   otherwise standard change should receive the critical ceremony.

The workflow computes `releaseClass`, `changedComponents`, and
`reusedComponents`; there is no manual downgrade switch.

## What happens next

`STANDARD_RELEASE` runs protected source and security checks, provider/schema
compatibility, changed-component candidates, automated readiness, activation,
and production smoke. It does not call Keeper, Gmail, real signup/reset,
human Turnstile, or the acceptance mailbox.

`AUTH_CRITICAL_RELEASE` runs all standard gates, then the protected Coordinator
acceptance. Complete the real Turnstile and mailbox steps in the Keeper page:

```text
Turnstile -> signup -> delivered email -> verification -> replay rejected
-> login/refresh -> resend -> password reset -> session revocation/logout
```

The workflow will not activate until server-derived acceptance evidence is
`PASSED`. The acceptance user is isolated and excluded from product metrics.

## Reuse and resume

The cutover artifact and Release Manifest v2 show every component's version ID,
source SHA, provenance, and status:

- `NEW_CANDIDATE`: built from the current release SHA.
- `REUSED_PRODUCTION`: the exact known-good production version was retained.
- `ACTIVATED`: a changed candidate is serving after final gates.

If a critical human window expires, do not upload duplicates. Recheck that the
recorded candidate/reused IDs, release SHA, source SHA, and expiry are still
valid, then dispatch the same exact release SHA with the current acceptance run
ID when the workflow supports a direct resume. If the old run is expired, the
Coordinator creates a fresh run against the same still-valid candidate set.

## Failure handling

Read `failureDomains` in the manifest and the sanitized cutover artifact.
`TOOLING_FAILURE` and `CERTIFICATION_BLOCKER` need operator/tool follow-up;
they are not evidence that runtime auth is broken. `PRODUCT_BLOCKER` requires
investigating the candidate. `SAFETY_BLOCKER` keeps activation fail-closed.

On a deployment failure, rollback restores only changed components to the
captured positive serving traffic. Zero-traffic candidates are excluded from
rollback. Reused components are not redeployed.

## Live launch gate

Repository integration and green CI do not prove production email delivery.
The open production auth issue (#720) remains a live evidence gate until a
fresh real signup, Cloudflare Email lifecycle observation, verification,
replay, session, resend, reset, and revocation acceptance passes for the exact
candidate set.
