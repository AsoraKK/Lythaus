# Isolated Admin setup

This manually dispatched workflow configures the test site on the existing
new-core database. The setup uses the application from
`a3da5aa99054c6bd9e284ea716701ed7adaf1801` and the schema installed by
[run 44045540354](https://github.com/AsoraKK/Lythaus/actions/runs/44045540354).
The [isolated inspection](https://github.com/AsoraKK/Lythaus/actions/runs/44114706197)
recorded the origin, disabled query caching, zero observed consumers and the
production rollback baseline. The [Access check](https://github.com/AsoraKK/Lythaus/actions/runs/44177194818)
verified that the two live Admin Access applications use the same sole human selector.

## Dispatch and owner review

Select `main` and enter the full protected main SHA. Choose `setup` to check
inputs and configure the isolated site in one gated run. Choose `inspect`
to check inputs only. The environment reviewer can reject either operation.
An empty or inaccessible secret binding, invalid credential, target mismatch,
changed production baseline or unexpected existing test resource stops setup.

Use the existing protected Admin and Verifier database URLs and Cloudflare API
token. The Admin URL must authenticate as `lythaus_admin` on the verified
origin, branch `xwkb9quljkzd` and logical database `postgres`. Protect the
private owner selector. The UI and API selector must identify the intended
operator before a test policy can admit that identity.

The initial check can identify an accessible Admin binding and validate its
target without authenticating. To allow authentication, the reviewer must be
able to confirm that the current credential in this binding has stayed private.
Enter the first sentence below in the approval. If private billing or selector
evidence is also needed, check current Workers usage, the Access seat and the
sole Admin Access selector. Enter both sentences if all three statements hold.
An empty comment permits independent checks and reports unconfirmed custody.

> The current protected Admin credential has stayed private. Existing plan covers the rehearsal and the sole live Admin Access selector is my intended identity.

The incremental cost ceiling is zero. The usage check allows for 96 requests,
including two fresh UI sessions, at the default paid Worker CPU ceiling.
Stop on chargeable capacity,
an additional subscription or an upgrade. Secret values, owner addresses,
assertions, SQL connection strings and credential digests stay private.

## Review boundaries

| Resource | Approved scope under the setup gate |
| --- | --- |
| Access | One self-hosted application protecting the entire `admin-new-core-test.lythaus.co` host. One private human allow rule and explicit deny-all. Verify the issuer, JWKS and only this application's audience. |
| Database connection | Existing Hyperdrive `7e39fc4a286147988ed12df7a6322616` only. Use the existing scoped origin credential and verify-full TLS with the correct public CA. Keep caching off. Drain the previous origin connections before any Worker uses this config. |
| Worker | Stage `lythaus-admin-api-new-core-test` with workers.dev and previews disabled. Bind only `DB_ADMIN_FRESH` to the dedicated new-core Hyperdrive. Set the isolated subject-mapping secret once. Record the serving version UUID, source and upload hashes. |
| Routing | Attach the exact test hostname and route after Access, Worker and database readbacks pass. Compare production routes, bindings and serving versions against the inspection baseline. |

A partial setup can leave private resources behind. Read the last acknowledged
operation and reconcile the actual state before a separately reviewed repair.
Keep the owner policy in place, the subject-mapping secret in its Worker, and
the previous production resources available. Reusing the same secret and
immutable Worker version matters once an owner membership is created.

## Acceptance and production

Setup stops before the one-time bootstrap. Under its own approval the owner
first establishes that a verified nonmember receives 403 on the moderation API.
After bootstrap a fresh owner session must load the normal `/flags` page and
receive 200 from `/api/admin/moderation/cases` on the recorded Worker version.
Require outsider denial, exactly one admin membership, one consumed latch,
one completion audit event and `409 bootstrap_closed` on a second attempt.
Retain aggregate results and build identifiers only.

Production uses its own approval. Fence data writers and asynchronous work
before changing databases. Admin, Public, Jobs, Privacy and the coordinator
must agree on the active database before traffic resumes. The existing Pages
UI, Workers, routes, bindings and retained source records provide the rollback
baseline. If writes have reached the new database, preserve those writes
before restoring traffic. Completion requires a fresh owner sign-in on
`https://admin.lythaus.co/flags` and its normal protected API.
