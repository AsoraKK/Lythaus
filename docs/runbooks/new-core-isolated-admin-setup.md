# Isolated Admin setup

This manually dispatched workflow configures the test site on the existing
new-core database. The setup uses the application from
`3fbaea846f67fe5ad452d53c456b5355069757ca` and the schema installed by
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

[Run 45411243223](https://github.com/AsoraKK/Lythaus/actions/runs/45411243223)
acknowledged the dedicated Hyperdrive configuration/restart and the creation
of Worker `89391a349e454b3994bd43299c6386ed`. It stopped at
`WORKER_EXPOSURE_OR_LOGGING`, before staging or routing. Do not repeat
`setup` or `resume-access`. Those operations now explicitly check for the
recorded Worker and stop before any repeat changes if it exists, even if the
Workers script list does not show an undeployed Worker.

Use `inspect` for the `recordedWorker` receipt. This is read-only and uses
the existing review gate and provider token scope; it does not
authorize staging or further setup. Compare named Worker checks with the
redacted field shapes and the separately read script subdomain and settings.
`omitted` and `null` are not evidence that an exposure flag is false.
The receipt also checks version/deployment inventory, test routing and domain
collisions, the production baseline/no Hyperdrive consumers, and the scoped
Hyperdrive, verified CA and restart timestamp. An unavailable diagnostic is
reported as a sanitized error; it cannot establish readiness. Review the
[Worker details](https://developers.cloudflare.com/api/resources/workers/subresources/beta/subresources/workers/methods/get/)
and [Worker script settings](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/settings/methods/get/)
schemas before proposing a separately reviewed continuation. Do not change
existing settings just to make a readback pass.

The [previous metadata edit](https://github.com/AsoraKK/Lythaus/actions/runs/45452252216)
was acknowledged but did not change the invocation logging readback. Do not
retry that operation. The [protected inspection](https://github.com/AsoraKK/Lythaus/actions/runs/45460021762)
verified the exact Worker is still empty and unexposed. Choose
`resume-worker-script-settings` after reviewing the new protected main SHA.
This operation rechecks the exact Access app, existing dedicated Hyperdrive
and CA, Worker settings, and lack of versions, deployments or routes. It
requires the pinned inspection to remain valid. Neither the previous Worker
metadata PATCH nor the [script settings PATCH](https://github.com/AsoraKK/Lythaus/actions/runs/45471262367)
changed the stored invocation flag. Do not retry either PATCH. The exact Worker
GET must explicitly disable both observability and logs at each readback.
[Cloudflare's Wrangler regression test](https://github.com/cloudflare/workers-sdk/commit/56974d4)
confirms that the stored invocation flag has no effect while logs are disabled.
The named script-settings GET may omit observability only alongside that fresh
Worker proof; any positive or malformed logging field on the script readback
blocks. The protected inspect mode reports redacted shapes.
Only after both pass does it stage the pinned build and attach the isolated site
under the existing checks. It does not recreate the Worker or Access app,
reconfigure or restart Hyperdrive, or bootstrap any user.

### Verify an interrupted first upload before any retry

The [successful Lythaus Admin release](https://github.com/AsoraKK/Lythaus/actions/runs/36693424861/job/109874000726)
staged on an existing serving Worker, verified the exact uploaded version,
and then assigned traffic. Keep those stages separate. Do not copy the
Wrangler upload command to an empty Worker: [Cloudflare documents the first-upload limitation](https://developers.cloudflare.com/workers/versions-and-deployments/deployment-management/#first-upload).
Use the [Worker-ID version API](https://developers.cloudflare.com/api/resources/workers/subresources/beta/subresources/workers/subresources/versions/methods/create/)
and the [asset completion-token flow](https://developers.cloudflare.com/workers/static-assets/direct-upload/)
as the first-upload contract. Do not substitute a command that deploys as a side effect.

[Run 45542341904](https://github.com/AsoraKK/Lythaus/actions/runs/45542341904)
completed the asset uploads, then received HTTP 400 on the first version POST.
It did not acknowledge a version or reach activation, DNS or routing.
The HTTP status alone does not establish Cloudflare's rejection reason or prove
the Worker version list is empty. Use the protected read-only `inspect` mode
before another write. If a version, deployment, route, or custom domain exists,
stop for reconciliation; do not overwrite, delete, or generate another key.
If a fresh upload is reviewed, a provider rejection receipt identifies `initial` or
`inherit` and, for a supported error response, the numeric provider code and a
fixed field category. A missing category or code is not grounds to guess at a
payload change. Do not print provider message text, raw pointers, tokens or bindings.

### Stage and resume the repaired version

PR #1190 was squash-merged on protected main as
`3fbaea846f67fe5ad452d53c456b5355069757ca`. The reviewed PR head and the
protected commit share Git tree `7562808920f718ad05babf3e6aadd6623ece4bed`.
The staging job verifies ancestry, builds from the protected application commit
and checks the sealed artifacts. The separate schema checkout supplies the
previously verified read-only fingerprint implementation.

Two failures reproduced offline with the original artifact. Workerd rejected
the named string export in the Worker entry module. Cloudflare's Workers
Assets parser rejected the sole Pages rewrite `/* /index.html 200` as a loop.
The JSON upload now stages `isolated-entry.js`, a default-only module with
SHA-256 `73bddc229c88563f494f8f2d7d014371ac2af4a212e0e88e26bffc7f18c86ee5`,
alongside the sealed application module and the original security headers.
The sealed UI remains intact. SPA fallback supplies the index response.
Cloudflare's original rejection code and field are still unknown.

Use `inspect` first. The recorded Worker is
`89391a349e454b3994bd43299c6386ed`. With a reviewed controller on protected
main, select `stage-one-nonserving-version` only after the exact empty or
parent-only checkpoint is confirmed. This bounds the operation to asset upload
and at most one undeployed immutable version. The client excludes activation,
DNS, routes, Worker creation, Access changes, Hyperdrive changes and bootstrap.
Recheck disabled workers.dev/previews and no active deployment or route.
On failure retain acknowledged uploads and leave the site unrouted.

For a continuation, pass the previous protected job's numeric `prior_run`.
The controller checks repository, owner, environment review, attempt, workflow
and merged-main history, then loads its immutable, cumulative
`isolated-worker-lineage-<run>-1` artifact. Each version POST has its own
nonsecret intent UUID recorded before transmission. The response ID, when
available, must agree with provider readback. A lost version acknowledgement
can be reconciled by the same intent, exact bytes/configuration and parent ID.
Inspect every accepted immutable version, check the complete inventory again,
and inherit the existing key. An unknown row, mismatched receipt, missing
acknowledged row, competing deployment or unexpected route blocks continuation.
A lost activation, DNS or route acknowledgement requires independent provider
reconciliation when the protected receipt lacks that resource ID.

Only a separately authorized serving operation may activate the verified
child or attach the isolated route. Both the acknowledged deployment ID and
its sole 100% child must match before DNS and at final readback. A repeated
operation re-verifies the recorded route and Access boundary. Human acceptance,
first-admin bootstrap and production cutover retain their separate gates.

The wire-contract unit test uses Cloudflare's pinned JSON API definition and the
real HTTP serializer with a local transport. The runtime test starts the exact
module set with the pinned compatibility flags. The disposable PostgreSQL test
uses signed fixture assertions, the normal API and concurrent bootstrap, then
checks the locked administrator, latch and audit counts and removes the container.
[Worker-ID API contract](https://github.com/cloudflare/api-schemas/blob/10837344ff6c5abd1d5602f1aeebe82ef353fa32/openapi.json)
· [Workers Assets parser fixture](https://github.com/cloudflare/workers-sdk/blob/87fd28ce586693e50aa17d410f121394c5fef24c/packages/workers-shared/utils/tests/parseRedirects.invalid.test.ts)

Keep the owner policy in place, the subject-mapping secret in its Worker, and
the previous production resources available. Reusing the same secret and
immutable Worker version matters once an owner membership is created.

## Acceptance and production

The protected activation verified the isolated route on 25 November. The owner then received `admin_request_failed` during the pre-bootstrap check. The deployed Admin handler uses HTTP 500 for that code. An empty membership query ordinarily returns `403 admin_role_required`. Keep bootstrap paused while investigating this response. [Activation receipt](https://github.com/AsoraKK/Lythaus/actions/runs/45611431085)

On 25 November, `diagnose-admin-read` verified the serving child, the intended owner selector, the scoped Admin login and the clean bootstrap state. The application's membership SELECT returned zero rows for a synthetic subject, over verified TLS in a read-only session. Cloudflare returned no Hyperdrive samples between 12:19:30 and 13:00 UTC. These independent observations leave the cause of the owner's live HTTP 500 open. [Protected diagnostic](https://github.com/AsoraKK/Lythaus/actions/runs/45628704670)

### Isolated binding repair

The first repair staged without traffic in run `45653512950` and activated in run `45660396889`. Protected application `78747f85d02c69efa8a1b6f86b73b08947cdce0b` produced version `193c3dcb-9238-4adc-8eab-48707fdd8b7e` on Worker `89391a349e454b3994bd43299c6386ed`. It inherited its key from child `37f36eb4-911d-4c51-b723-751329cd1b92`. Deployment `85526c44-7551-41b0-805f-dd6270f05c2d` assigned that repair 100% of isolated traffic. The owner subsequently reached the signed lookup and saw `db_binding / invalid_binding` before the PostgreSQL client connected. [Staging receipt](https://github.com/AsoraKK/Lythaus/actions/runs/45653512950) · [Activation receipt](https://github.com/AsoraKK/Lythaus/actions/runs/45660396889)

The serving bundle reproduced that failure in a disposable PostgreSQL 17 rehearsal with synthetic URI delimiters in the connection credentials. The corrected application passes the native Hyperdrive fields directly to the driver. The protected rehearsal uses a native Worker binding, verified origin TLS and signed requests. These tests cover a reproducible failure mechanism. The live owner's precise rejected input remains unknown. [Application fix](https://github.com/AsoraKK/Lythaus/pull/1195)

Protected application `78958d886d72eecc6ea01001d808f1d8c505046d` produced Worker SHA-256 `e568b5cfc238a9b87f3ca87ff3ef1ebfff5efd7415cd2bd469d6089b2104b0bd` (655,674 bytes) and asset manifest SHA-256 `f9848f5188fad141385d3653c16adbc57eff69afa7317990ecccad7422284316` (30 files, 393,868 bytes). Staging rebuilds these artifacts and checks both digests before it requests a new version.

The fourth version, `1ac91b08-7caa-4d31-aa7d-ad8e8bd6301f`, inherited the third version's key in staging run `45690056180`. Activation run `45691256887` independently verified the fourth version serving 100% on isolated deployment `0993b439-654e-4243-9340-a810f727f142`. Both anonymous reads redirected to Access. The owner's new signed health request returned `db_binding / invalid_binding` at 22:41 UTC on 25 November, request reference `a5ec445d-3802-437e-9c0d-89f21b68654a`. The old failure response did not identify the responding Worker version. [Stage](https://github.com/AsoraKK/Lythaus/actions/runs/45690056180) · [Activation](https://github.com/AsoraKK/Lythaus/actions/runs/45691256887)

### Wrapped PostgreSQL binding

Cloudflare's wrapped PostgreSQL binding uses a generated hostname of 32 lowercase hexadecimal characters followed by `.workers.alt`, with scheme `postgresql` and port 5432. The fourth version rejected this documented shape before pg opened a socket. The application correction accepts it on native bindings and preserves existing TLS checks for URL-only connections. The isolated signed error response carries its own source and Worker version plus fixed diagnostic categories. The protected stage exercises both the old native binding and the genuine November wrapped runtime against local fixtures. [Cloudflare implementation and tests](https://github.com/cloudflare/workerd/commit/6518742838e5c65c9a355351ae015a05fd127ab6) · [Application correction](https://github.com/AsoraKK/Lythaus/pull/1197)

The reviewed application is protected commit `fc1dce9683219edee3312cf339526b2850385aa2`. The sealed Worker SHA-256 is `38bee5bd1a6b394816a7169c8209e788eabf99d9645ed8a1775909a69288fd07` (657,919 bytes). The panel manifest SHA-256 is `d4d62e847efe855abf4b19484ef3a0d56118f511ae70c82ef9db370a1e29026d` (30 files, 394,578 bytes).

1. Dispatch `stage-isolated-repair` from the reviewed protected controller with `prior_run=45691256887`. Confirm the source and sealed artifacts in the review. The operation verifies the original lineage, both previous repair pairs and all four immutable versions. It stages one nonserving version with explicit key inheritance from `1ac91b08-7caa-4d31-aa7d-ad8e8bd6301f`. The staging receipt must confirm that the fourth version retains 100% on isolated deployment `0993b439-654e-4243-9340-a810f727f142`.
2. Dispatch `activate-isolated-repair` against the same protected controller with the successful **new staging run** as `prior_run`. The separate approval names the candidate version. Activation assigns it 100% of isolated traffic. Require the verified deployment, the independent script-version readback and the anonymous Access challenges. The owner then visits the normal flags page and moderation endpoint in a fresh Access session. Both signed reads should reach the expected nonmember denial before any bootstrap.
3. If an acknowledgement is lost or readback differs, use `reconcile-isolated-repair` with the run that recorded the intent. Keep further writes paused while the outcome is uncertain. A fresh corrected attempt can be reviewed if the archived receipt proves the previous run stopped before the version or deployment request.

The immediate rollback target for this correction is version `1ac91b08-7caa-4d31-aa7d-ad8e8bd6301f` on the same isolated Worker. A separately approved rollback requires a fresh check of the serving deployment, route, owner-only Access, bootstrap latch and any accepted or uncertain writes. Preserve all versions and receipts. Before production promotion, reconcile the final serving lineage in the cutover draft and rehearse the full handler and routing under the write fence.

### Check final hostname and connector metadata before bootstrap

On 26 November the owner’s fresh session on version `260d15e3-dd61-47db-bbf4-5dd3839141a5` displayed “This account has no active administrator membership.” The moderation API returned `admin_role_required`. This satisfies the signed nonmember check on the isolated hostname. [Verified activation](https://github.com/AsoraKK/Lythaus/actions/runs/45758911466)

The owner selected `control.lythaus.co` as the dedicated Admin hostname, with the panel at `/flags`. Keep public sites, APIs and callbacks on their current destinations. To verify actual hostname ownership and connector candidates before any routing change, dispatch **New-core isolated admin read-only review** from protected main with its exact current `control_sha`, `confirm_read_only=true` and `production_connector_discovery_only=true`. Leave the worker source input at its workflow default. The production environment owner reviews the bounded Cloudflare metadata GETs. A partial inventory identifies the read or scope that needs reconciliation. Treat returned connector matches as configuration evidence. Verify SQL logins, path ownership, identity-provider continuity and the full handler’s explicit key inheritance separately before the one-time grant. Bootstrap and production routing retain their own approvals.

Setup stops before the one-time bootstrap. Under its own approval the owner
first establishes that a verified nonmember receives 403 on the moderation API.
After bootstrap a fresh owner session must load the normal `/flags` page and
receive 200 from `/api/admin/moderation/cases` on the recorded Worker version.
Require outsider denial, exactly one admin membership, one consumed latch,
one completion audit event and `409 bootstrap_closed` on a second attempt.
Retain aggregate results and build identifiers only.

Setup generates the subject key once in an unrouted parent version. Before routing, it stages a second version on the same immutable Worker ID with the provider's `inherit` binding pinned to the parent version ID. The original activation assigned test traffic to that verified child. Each later repair inherits from its verified serving predecessor on the same Worker and retains its own stage and activation receipts. Before consuming the latch, require the final release path to stage its full Admin handler on this same replacement Worker, inheriting the secret from the attested test version. Refuse a different Worker ID or replacement key. Production serving versions keep their own rollback bindings. Real recognition across the intended Access application, issuer and subject still needs the owner's fresh session.

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
