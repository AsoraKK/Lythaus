# First administrator bootstrap

## Purpose

Lythaus admin authorization has two independent gates:

1. Cloudflare Access authenticates and allowlists the human operator.
2. `identity.admin_memberships` maps the verified Access subject HMAC to an internal admin actor.

A new installation can therefore reach a deliberate bootstrap state: Access works while `identity.admin_memberships` is empty. This runbook closes that state exactly once without extracting `ACCESS_SUBJECT_HMAC_KEY`, copying product PII keys, or linking the administrator to a consumer account.

## Security model

The Admin Worker uses the existing `ACCESS_SUBJECT_HMAC_KEY` binding internally. No email address, raw Access subject, digest, password or token is committed to Git or returned by the endpoint.

The first administrator is represented by a dedicated control-plane `identity.users` row that is:

- `locked`;
- credentialless;
- handleless;
- provider-linkless;
- profileless;
- used only as the foreign-key/audit actor for the administrator membership.

The normal `lythaus_admin` database role still has **no direct INSERT privilege** on `identity.users` or `identity.admin_memberships`. It can execute only the fixed `SECURITY DEFINER` function `identity.bootstrap_first_administrator(uuid, bytea, uuid, text)`.

The function serializes callers with an advisory transaction lock and closes permanently on the first durable bootstrap fact. Closure is defended by three independent facts:

- `system.feature_flags['identity.first_admin_bootstrap_consumed']` is true;
- an administrator membership exists; or
- the sanitized `identity.first_admin_bootstrapped` audit event exists.

A failed audit write rolls back the user, membership and latch atomically. Concurrent calls produce exactly one administrator.

## HTTP boundary

Only this exact route bypasses normal membership lookup:

`POST https://admin.lythaus.co/api/admin/bootstrap/first-administrator`

It still requires:

- the canonical admin hostname;
- a valid Cloudflare Access assertion using the existing issuer/audience/signature verification;
- the existing Access application allowlist;
- same-origin mutation policy;
- `Content-Type: application/json`;
- a bounded JSON body;
- no unknown fields;
- exact confirmation `BOOTSTRAP FIRST ADMINISTRATOR`.

All other admin routes continue through the ordinary `identity.admin_memberships` lookup.

The endpoint returns only `{ "created": true, "role": "administrator" }`. It never returns the internal user ID, Access subject or digest.

## Validation before production

PR validation must prove:

- native TypeScript typecheck;
- bootstrap unit/HTTP guard tests;
- PostgreSQL 17 rollback behavior;
- two concurrent bootstrap calls create exactly one membership;
- the control-plane principal has no consumer credentials/profile;
- closure survives membership removal;
- only `lythaus_admin` can execute the bootstrap function;
- `lythaus_admin` still cannot directly insert users or memberships;
- repository hygiene contains no personal bootstrap identifiers.

`native-planetscale-ci.yml` runs the real PostgreSQL 17 proof after applying the canonical schema and grants.

## Production sequence

1. Merge the reviewed bootstrap PR through protected main.
2. Collect fresh exact-main CI/security evidence.
3. Run the protected `PlanetScale production migrations` workflow for that exact main SHA. No schema migration is added; the run reapplies the reviewed role boundary and records sanitized bootstrap-boundary evidence.
4. Run the canonical AUTH_CRITICAL production release. Admin is a changed component and must receive a new exact candidate/version; unchanged components may be reused according to the release plan.
5. If the canonical AUTH_CRITICAL release is blocked at human acceptance because no administrator exists yet, run the protected **first-admin bootstrap activation** workflow. Supply only the exact candidate SHA, canonical release run and staged Admin version ID from that release. The workflow requires protected `main`, revalidates the immutable candidate artifact and the bootstrap route, checks both Access applications, requires the sanitized database state `0/false/0`, captures rollback state, and activates only the Admin candidate at 100%.
6. Before invoking bootstrap, reconfirm both Cloudflare Access applications still permit only the intended administrator identity. Do not broaden Access to make bootstrap easier.
7. In an Access-authenticated same-origin browser session, submit exactly one POST to the bootstrap endpoint with the required confirmation.
8. Verify sanitized database state: membership count is exactly one, the bootstrap latch is consumed, and the completion audit count is exactly one.
9. Reload the normal Admin UI/API and prove the ordinary membership lookup succeeds. Do not use the bootstrap route for routine administration.
10. Renew the expired production-auth acceptance run against the current exact candidate/reused-component set and continue issue #720 acceptance.

The first-admin activation workflow is deliberately narrow and one-shot in practice: it cannot run after bootstrap because its read-only precondition rejects any state other than zero active memberships, an unconsumed latch and zero completion audit events. It is not a replacement for the canonical AUTH_CRITICAL release or for the real issue #720 acceptance.

## Browser invocation

From the already authenticated `https://admin.lythaus.co` origin, the bootstrap request is equivalent to:

```js
await fetch('/api/admin/bootstrap/first-administrator', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ confirmation: 'BOOTSTRAP FIRST ADMINISTRATOR' }),
  credentials: 'same-origin',
});
```

Do not run this from another origin, a copied Access token, or a service token. The real human Access assertion is part of the bootstrap proof.

## After bootstrap

The durable database latch makes the endpoint inert. A subsequent call returns `bootstrap_closed` and cannot create another administrator, including if the membership row were later removed.

The wrapper may be removed in a later protected cleanup PR after issue #720 is resolved, but removal is not relied on for security. The database capability itself remains one-shot and least-privilege.

Production auth remains **NO-GO** until the separate issue #720 real signup/email/verification/login/resend/reset acceptance passes.
