# Isolated Admin setup

This manually dispatched workflow configures the test site on the existing
new-core database. The setup uses the application from
`276b43265584ec0dc158e67cbdb13cb58ece75db` and the schema installed by
[run 44045540354](https://github.com/AsoraKK/Lythaus/actions/runs/44045540354).
The [isolated inspection](https://github.com/AsoraKK/Lythaus/actions/runs/44114706197)
recorded the origin, disabled query caching, zero observed consumers and the
production rollback baseline. The [Access check](https://github.com/AsoraKK/Lythaus/actions/runs/44177194818)
verified that the two live Admin Access applications use the same sole human selector.

## Dispatch and owner review

Select `main` and enter the full protected main SHA. Choose `setup` to check
inputs and configure the isolated site in one gated run. Choose `inspect`
to check inputs only. The environment reviewer can reject either operation.
Inspection uses the same Pages project inventory as setup. The first GET uses
the provider default, and later requests specify only the page number. The job
checks page identity, stable pagination metadata, unique project IDs and the
reported total. It stops if it cannot prove the list is complete within ten
pages. A short page can have successors. The result reports the project count
and whether the private owner selector matches the two pinned Access policies.
[Cloudflare Pages API reference](https://developers.cloudflare.com/api/resources/pages/subresources/projects/methods/list/)

The protected job reports whether the Admin URL was delivered, whether it
matched the pinned branch and role, and whether a connection was attempted.
It reports the presence and format of the owner secret separately from an
owner-confirmed live policy selector. If a protected input is unavailable or
its custody is unresolved, use inspection before authorizing setup.

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
For [run 45339184826](https://github.com/AsoraKK/Lythaus/actions/runs/45339184826),
the only acknowledged mutation was creating Access application
`edd1c92d-bb85-4cd3-b31b-5971a7b12d13`. Choose `inspect` to compare redacted
per-check listing, application details and policy results. The account listing
must prove unique coverage of the test hostname and a unique audience; the
application details must match that audience and pass every configuration check.
The cookie-path field is reported as a redacted shape on both responses.
For this recorded app only, omission is accepted when the app has only the
exact pathless public hostname and no destination overrides. This relies on
[Cloudflare's Cookie Path behavior](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/#cookie-path-attribute):
the switch adds the application's configured URL path, and here no application
path exists. It is not a general inference that omitted settings are false.
An explicit enabled, null, or malformed value blocks reuse; newly created apps
still require a literal false value in the detail readback.
Only if all detail and policy checks pass, choose `resume-access` under the
same normal owner review. It will not create, update or delete an Access app.
It stops if the exact recorded app cannot be verified, or if the existing
Worker, routing, Hyperdrive or production guards do not pass. It is not a
generic retry or permission to reuse any other application.
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

Setup generates the subject key once in an unrouted parent version. Before routing, it stages a second version on the same immutable Worker ID with the provider's `inherit` binding pinned to the parent version ID. Only the verified child version can receive test traffic. Record the Worker ID and both version IDs. Before consuming the latch, require the final release path to stage its full Admin handler on this same replacement Worker, inheriting the secret from the attested test version. Refuse a different Worker ID or replacement key. Production serving versions keep their own rollback bindings. Real recognition across the intended Access application, issuer and subject still needs the owner's fresh session.

Both the bootstrap handler and ordinary moderation reads use the signed Access `sub`. The isolated source rejects missing or blank subjects even when the assertion contains an email and requires RS256. Compared with schema-runner source `a3da5aa99054c6bd9e284ea716701ed7adaf1801`, only the verifier and its regression test changed. The Worker SHA-256 is `6a276e4b4ed3883b2c00c8b089149b7b14cfebf3ce3811f0a799ff686e9101b3`. The 30-file control-panel manifest retains SHA-256 `5c3969463149d5611e50b73fc030e1ae46e84aa08b27222c3122f9a17a9565c0`. The setup workflow runs the repository's dependency audit on the separately checked-out root and control-panel inputs before staging.

In that fresh signed-in browser, the acceptance harness can call `verifyFlagsSession(page, {hostname, versionId, sourceSha})`. It reloads the ordinary page and observes the UI's own same-origin moderation request. The receipt contains only the serving identity and pass indicators. Bind those identifiers to Cloudflare's version-specific Hyperdrive readback and the immutable PlanetScale database and branch before accepting the result.

The acceptance operator can start the headed browser with `node scripts/ci/verify-new-core-flags-session.mjs HOSTNAME VERSION_ID SOURCE_SHA ISSUER`. Supply the four nonsecret fields from the reviewed deployment and Access organization readback. The browser starts with a fresh cookie store, checks the challenge against that issuer and leaves sign-in to the owner.

The isolated Access application has one exact hostname, a one-hour session, HttpOnly, SameSite=Lax and the provider's hostname cookie scope. Both UI and API use that hostname. The setup reads those attributes back before configuring Hyperdrive or staging a Worker. On a shared final hostname, first prove the approved routing and cookie scope keep public requests separate. A fresh session at the final URL remains mandatory.

Production uses its own approval. Fence data writers and asynchronous work
before changing databases. Admin, Public, Jobs, Privacy and the coordinator
must agree on the active database before traffic resumes. The existing Pages
UI, Workers, routes, bindings and retained source records provide the rollback
baseline. If writes have reached the new database, preserve those writes
before restoring traffic. Completion requires a fresh owner sign-in on
`https://control.lythaus.co/flags` and its normal protected API, after hostname ownership and public-path coexistence have been verified.
