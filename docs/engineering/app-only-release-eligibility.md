# App-only canonical release candidate

This local candidate adds an `app_only` mode to the existing canonical release.
It is unreviewed, unpublished and has not been run against production. It
does not authorize an activation. The transaction reuses the live Public,
Admin, Jobs and acceptance-coordinator Workers, marketing and control-panel
Pages deployments; only the Flutter Pages artifact is a deployment candidate.
It does not apply a migration or grant, activate contribution feedback, change
reputation or rewards, or redeploy another component.

## Serving identity evidence

The app-only route consumes a bounded dashboard receipt because the Pages API
`canonical_deployment` record does not expose the production alias observed in
the Cloudflare dashboard. The `app_pages_serving_proof_json` dispatch input is
required for `app_only` and ignored by other modes. It is a manual transcription
from the dashboard production deployment detail, not an automated screenshot
or byte-for-byte host-content check. The protected production reviewer must
inspect the exact dispatch input and the preparation job summary before
approving the app Pages job.

The JSON receipt has exactly these fields: `schemaVersion` (`lythaus-app-pages-serving-proof-v1`),
`proofId` (lowercase UUID), `source` (`cloudflare-dashboard-production-panel`),
`sourceUrl` (the exact Cloudflare dashboard deployment-detail URL),
`observedAt` (canonical UTC timestamp), `capturedBy` (the workflow actor),
`accountId`, `hostname` (`app.lythaus.co`), `project` (`lythaus-web`),
`projectId`, `branch`, `deploymentId`, `deploymentUrl`, `commitSha`,
`environment` (`production`), `status` (`success`), `releaseSha`,
`previousProductionSha`, `previousProductionRunId`,
`previousManifestArtifactId` and `previousManifestDigest`. The validator checks
the official account and source URL, an observation no older than 30 minutes,
no future timestamp, exact host/project/branch/deployment identities, the
authenticated Pages API snapshot, and the digest-verified prior canonical
manifest. The proof ID and digest are checked against the prior manifest, and
a digest-named one-use Actions artifact is written before Pages deployment so
the same receipt cannot be reused after a failed attempt. The preparation is
also bound to the Actions run attempt; a failed-job rerun cannot reuse the
successful preparation output from an earlier attempt.

The app-only path re-reads the Pages API record immediately before deployment.
If Pages rollback is needed, the rollback helper validates the same proof
against the captured baseline before its one restore request and again against
the authenticated Pages readback afterward. App-only rollback accepts the
receipt only inside the protected canonical workflow and only when it matches
that workflow's exact preparation output and deployment candidate. The shared
rollback CLI remains fail-closed and does not accept a caller-supplied proof
context. This ties the dashboard association
to the exact baseline and verifies that Pages returned to that deployment. It
does not prove every asset or response currently served by the custom hostname.

The normal canonical protected-environment approval, exact merged main SHA,
merged-PR provenance, review-thread resolution, source ancestry, CI and
security checks, historical reconciliation, provider audits, production
configuration checks and fresh recovery gates still apply. The source
classification is retained in the canonical manifest separately from the
app-only deployment scope. No owner-testing or recovery exception is selected.

The canonical release workflow holds its existing production lock through the
app-only transaction. Direct production runs of `deploy-alpha-web.yml` for
`lythaus-web` share that lock; a reusable child called by the canonical
workflow uses a per-run group so it does not try to reacquire its caller's
lock. Preview deployments and other Pages projects remain outside this lock.
The lock serializes these GitHub Actions paths, but it cannot prevent
out-of-band provider changes, so provider state is recaptured before and after
deployment. Hosted workflow validation remains required.

The existing release inputs remain, with the additional app-only dashboard
receipt input above. For an app-only release, the preflight resolves the latest
successful canonical run for the supplied prior production SHA from
authenticated GitHub metadata. Preparation downloads its
unique unexpired manifest artifact, verifies its archive and internal SHA-256,
requires a verified `GO` manifest and matches every reused Worker and Pages
identity to live authenticated provider observations. A missing, stale or
mismatched prior manifest blocks the release. No previous live version has
been inferred from the current source tree.

Preparation also verifies the reviewed app input blobs, the serving Public
contract, exact Worker source ancestry, one 100% serving version per Worker,
and the protected admin and Keeper routes. It verifies the unique successful
exact-SHA CI web artifact and its archive digest before restrictive extraction.
The same verified artifact is used for browser acceptance and downloaded and
verified again by the existing Flutter Pages deployment helper. Unsafe archive
paths, links, duplicate entries, ambiguous artifacts and digest mismatches
fail closed.

The existing protected Keeper flow, its real mailbox/Turnstile observer and
ADR-003 acceptance remain required. The app browser check is additional: it
uses the existing authorized test-account secrets, restricts API reads and
session actions, validates login request bodies and actual upstream CORS,
rejects redirects and unexpected writes, and binds its receipt to the CI
artifact and the captured Worker versions. Its local synthetic tests do not
replace real acceptance. If run later, the browser's logout revokes all
sessions for that test account; the existing ADR-003 runner also attempts a
privacy-export request. No account action was performed while implementing
this candidate.

Cases A11, A12 and A13 run in a separate, unprivileged Workerd and disposable
local PostgreSQL 17 job. For app-only releases the job checks out the captured
serving Public Worker's ancestral source and binds its results to that exact
Worker version and release run. Preparation recaptures and compares the
source and version before the production authentication runner consumes the
receipt. The runner retains the localhost guard around actual content writes;
missing, failed or mismatched fixture evidence blocks acceptance. Real
production authentication, mailbox evidence and browser checks remain
separate requirements. No synthetic result certifies the full publishing
pipeline or real provider behavior.

The deployment helper rechecks the exact completed Keeper run and live
dependencies immediately before the fresh recovery check and Pages activation.
Finalization reads the Keeper run again after smoke and provider captures; an
expired or mismatched run blocks certification and initiates only the bounded
app rollback when the candidate is safely bound. The manifest records when
that final acceptance check happened rather than claiming a later live check.

After a successful helper return, finalization binds the exact Pages project,
deployment ID, URL and source SHA to the observed candidate. It checks the
production surfaces and compares all four Worker versions, routes and reused
Pages identities again. If post-deployment verification fails, rollback may
restore only the captured prior app deployment while the current deployment
still matches that exact candidate; it issues at most one restore request and
requires provider readback. If the deployment or rollback outcome is
ambiguous, it stops for inspection instead of guessing or retrying a write.
The shared Pages verifier accepts production candidates only from the
successful canonical deployment; rollback verifies the captured baseline,
serving candidate, provider response and exact subsequent canonical readback.
Cloudflare documents `canonical_deployment` as the most recent production
deployment, but does not explicitly guarantee that field is the active serving
pointer after rollback. For the canonical app-only route, the approved
independent control-plane check is the fresh dashboard observation of the
custom-hostname-to-deployment association, joined to the authenticated Pages
API record and the digest-verified prior manifest. Rollback rechecks the same
baseline identity against the authenticated API readback. This is a bounded
deployment-identity check: it does not verify bytes or every response served
from `app.lythaus.co`, and it does not certify the full stack. The manifest
records these limits. Other release modes retain current-main behavior.
Jobs has no public health route; the smoke result explicitly records that its
proof is captured version evidence rather than a health request.

The reviewed app pins include the UI tree from PR #1128 and the approved
authentication-test correction. The CI blob changes from
`fbef2a9cc943b96a155820ff2107bcad177ef965` to
`5a9b45972e05e1b1799c33ddf4ad363f8352777a` solely to register the synthetic
browser regression against `build/web`; a test checks that exact predecessor
difference. The app-only browser, network policy and synthetic test blobs are
also pinned. These pins and the complete policy diff require independent
review before any source publication.

Fresh recovery remains an external release blocker. The existing verifier
requires a protected, deletion-protected PlanetScale `main` backup completed
within 24 hours, plus a matching tracked
`lythaus-0021-restore-evidence-v1` record verified within 24 hours after the
backup. Its allowlisted artifact and record hashes must match, the review must
be complete, all eight required scopes must pass, and there must be no
unresolved gates, including the independent recovery destination. The last
inspected record was stale and left that destination unresolved. A new
protected provider read and fresh valid evidence are required at release time;
no restore was started under this task.

Validation to date uses synthetic fixtures and local code only. Run the
registered focused workflow on Node 22, actionlint, and the synthetic browser
suite against the built artifact; then obtain independent source review and
hosted checks before considering the existing production approval flow.
