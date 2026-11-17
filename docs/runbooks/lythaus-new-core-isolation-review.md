# Isolated admin review after schema installation

Status: **READ-ONLY REVIEW BLOCKED ON CLOUDFLARE METADATA. PROPOSED INSPECTOR IS LOCAL ONLY.**

## Verified foundation and source pins

Schema installation [44045540354](https://github.com/AsoraKK/Lythaus/actions/runs/44045540354)
is verified. Do not rerun it. It used runner
`a3da5aa99054c6bd9e284ea716701ed7adaf1801` under protected main
`4f77e6f916e2d3504f207924b365dc31f8e07496` and installed the 22 unchanged
canonical migrations and grants from
`050b1d1a3e973b367c28eae9617840e5d4816573`.

The live receipt verified PostgreSQL 17.12, 11 schemas, 102 tables, 103
relations, exact ledger checksums and definition/grant fingerprints. It
reported zero memberships, one false bootstrap latch and zero completion
events. Those are schema-run observations, not a fresh bootstrap preflight.

The prepared test code/config lives on the runner source branch, not on
protected main: `apps/lythaus-admin-api/src/new-core-test-worker.ts` and
`wrangler.new-core-test.jsonc`. The candidate also factors the existing
bootstrap handler into a shared module. No deployed version UUID, immutable
Worker bundle digest or control-panel asset manifest has been verified.
The runner SHA is a source candidate, not deployment approval.

## Current read-only findings

| Area | Evidence and remaining gap |
| --- | --- |
| Test hostname | Local DNS resolution failed. Public DNS returned status 0 with no A, AAAA or CNAME answers. This is not NXDOMAIN and does not prove the private Cloudflare app/Worker is absent. |
| Production hostname | An anonymous GET of `https://admin.lythaus.co/flags` returned 302 to Cloudflare Access. This proves an edge challenge, not the full live policy or bindings. |
| Local Cloudflare access | The exact GET for Hyperdrive `7e39fc4a286147988ed12df7a6322616` returned HTTP 401. No denied request is retried. |
| Intended owner | The private expected-owner runtime value is unavailable locally. Neither the current isolated allowlist nor an exact owner match is verified. No identity is printed, hashed or stored in this review. |
| Hyperdrive | Historical run `43835553248` matched the new target with caching disabled, but its connection used a broad provider role and lacked verified explicit TLS/CA fields. This is historical evidence only. Schema grants did not change Hyperdrive. |
| Worker/config | Prepared config pins only `lythaus-admin-api-new-core-test`, `admin-new-core-test.lythaus.co/*`, binding `DB_ADMIN_FRESH` to the new Hyperdrive, `workers_dev:false` and `preview_urls:false`. Live settings, serving build and binding are unverified. |
| Access pins | The prepared manifest has no isolated application ID, policy ID, issuer or audience attestation. Live Access may differ; API reads are required. |

The old inspector at source `18c24397e8518c0eae76b650cd9862f9cbb8d4a3`
is not on protected main. Its workflow runs on a source-branch push and lacks
the existing owner-review environment. Do not publish a change to that branch
or reuse it as a shortcut. Existing main workflows inspect production Admin
Access or the Jobs Hyperdrive; they do not inspect this isolated target.

## Proposed next change for approval

Publish only the local GET-only inspection proposal through a normal PR.
It adds a dispatch-only workflow, bounded metadata inspector, synthetic tests,
this review and one CI test step. Publishing cannot start the inspector.
After normal merge, pin the actual protected-main SHA and queue one read-only
review held at the unchanged `production` owner gate. This authorizes no
Cloudflare mutation, deployment, bootstrap, SQL, grant revocation or import.

The workflow consumes the existing `CLOUDFLARE_API_TOKEN` in place. It never
extracts, creates, copies or rescopes a token. It references the optional
existing `LYTHAUS_NEW_CORE_OWNER_EMAIL` secret only for a private in-memory
policy comparison. It creates no secret. If that expectation is unavailable,
exact owner verification stays blocked; arrange a separately approved private
expectation or a private owner review of the exact policy selector. Never put
the owner identity in a dispatch input, repo file, output or artifact.

GitHub permissions are contents/read and actions/read. The precredential job
checks owner dispatch, first attempt, protected main and its exact SHA, the
existing environment ID `18972418184`, reviewer and main-only policy. The
credentialed job waits for normal owner review, requires recorded approval,
then rechecks main/gate before any Cloudflare read. No bypass is used.

All Cloudflare calls are bounded GETs in account
`e5b7ae46e04698f507b7e4b3d4ef1af0` and zone
`7bc572c8b7cd3c00be9c655176c29382`. They inspect:

- The exact new Hyperdrive origin fingerprint, branch, logical `postgres`,
  exact login `lythaus_admin.xwkb9quljkzd`, cache-off and TLS/CA configuration.
- Access apps covering the test host, overlapping apps, the single-email
  allow rule, ordered deny-all rule, absence of bypass/service policies,
  private owner match, audience and organization issuer.
- Current Worker settings and serving-version metadata, exact version UUID
  and source tag, Access variables, binding IDs and secret-name presence only.
- Account Worker binding metadata to detect shared use of the new Hyperdrive;
  unrelated names, values and contents are not reported.
- Production Lythaus serving-version/binding snapshots and zone route/DNS
  metadata, without reading any production database or changing anything.

The report is evidence with explicit blockers, not deployment authorization.
An absent version pin or private owner expectation cannot become a pass.
Provider version tags are source claims; artifact provenance and actual origin
TLS/session validation remain separate requirements. HTTP 401/403 or incomplete
inventory stays blocked; no token change, fallback, retry or create-if-missing
operation is attempted.

## Production isolation for later proposals

This review and proposed inspection have zero provider writes. They cannot
change existing routes, scripts, versions, Hyperdrives or bindings. An
independent current unchanged-state attestation is blocked by the API 401.

Any later change must separately allowlist only the exact test hostname,
dedicated test Worker, isolated Access app and new Hyperdrive. It must first
prove the new Hyperdrive has no other consumer and compare production
route/serving-version/binding snapshots before and after. Stop on any
production difference. The existing `lythaus-core/main`, production Admin
Worker, live hostnames and production Hyperdrive IDs remain out of scope.
Verify existing equivalents, Access seats and account allowances before
proposing resource creation or possible spend. No cost is approved here.

## Acceptance after separate setup/deployment/bootstrap approvals

1. Pin one reviewed source SHA, built bundle/asset digests and the exact
   Cloudflare serving version UUID. Reject a version split or mismatched
   source/build identity. Require the owner-only Access gate before routing
   the hostname; preserve signature, issuer, audience, exact host and origin.
2. Reconfirm `0 memberships / false latch / 0 completion events` using the
   scoped aggregate verifier in read-only mode. Do not rerun installation.
3. The owner signs in personally in a fresh private browser session. While
   there is no membership, normal GET `/api/admin/moderation/cases` must return
   `403 admin_role_required`. This is a live verified-Access non-admin check.
   The `/flags` HTML shell alone is insufficient: assets are Access-protected,
   while its data API performs the normal membership lookup.
4. Only after separate bootstrap approval, use the supported same-origin
   one-time POST and exact confirmation through the normal Worker subject
   mapping. Expect 201. No manual HMAC, direct insert, old binding copy or
   consumer-account promotion. Never request an OTP, JWT, password or subject.
5. End that session. In another fresh standard Access session open `/flags`.
   Require a successful rendered page and normal moderation-case GET, both
   reporting the approved source SHA/version UUID. Record status and build
   IDs only. Do not use a health response or HTML shell as admin proof.
6. Read-only aggregate verification must report exactly one active admin,
   one consumed latch, one completion event, one locked credentialless actor
   and no consumer credentials, provider links, handle or profile. Normal
   GETs may write the existing rate-limit bookkeeping; no decision POST is
   enabled or exercised by this read-only UI acceptance.
7. Repeat bootstrap in the owner's standard session: require HTTP 409
   `bootstrap_closed` and unchanged aggregate state. Confirm unauthenticated
   access is denied. If a separately approved non-owner tester is available,
   prove edge denial without widening Access or storing the tester identity;
   do not describe a local synthetic test as a live post-bootstrap test.
8. Compare production snapshots unchanged. When setup is complete and only
   the human test remains, mark `OWNER_TEST_PENDING`. Until then the status is
   `ISOLATED_SETUP_REVIEW_BLOCKED`. Production cutover and a fresh sign-in on
   the live admin hostname are separate gates. No import occurs in this plan.
