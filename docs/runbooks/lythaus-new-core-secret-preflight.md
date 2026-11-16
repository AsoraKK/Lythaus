# Existing Actions secrets: read-only preflight proposal

Status: **READ-ONLY CONTROL WORKFLOW. SCHEMA INSTALLATION EXCLUDED.**
The approved schema candidate is published unchanged at
`050b1d1a3e973b367c28eae9617840e5d4816573` on
`codex/new-core-schema-050b1d1a`. The separate preflight PR contains only the
manual read-only control workflow, inspector, tests, CI test wiring and this
runbook. Publication and merge do not dispatch the preflight or authorize
schema installation.

## Verified GitHub controls

Read-only GitHub metadata returned:

| Item | Observation |
| --- | --- |
| Repository | [Lythaus](https://github.com/AsoraKK/Lythaus/), ID `1010752912`, public, default `main` |
| Authenticated GitHub identity | Repository owner; Codex dispatch under this connection is the same GitHub identity |
| Eligible direct collaborators | Only the owner was returned; no independent dispatcher is verified |
| Existing reviewed environment | `production`; sole required reviewer is the owner |
| Prevent self-review | **false** on the existing environment; the owner can dispatch and approve normally |
| Branch policy | One policy, branch `main` only |
| Administrator bypass | Available in current settings; this proposal never invokes it |
| Dedicated new-core environment | Absent from the complete four-environment inventory |
| Dedicated provisioning branch | HTTP 404 |
| Role-provisioning workflow registration | HTTP 404; do not repurpose or run it |
| Approved schema source | Published at the exact approved SHA on `codex/new-core-schema-050b1d1a`; this branch push matches no push workflows |
| Repository and four environment secret-name inventories | HTTP 403 with the current connection |

The owner reports all three inputs already exist in Actions Secrets. Treat
that as owner-reported presence, not proof that this particular job receives
them or that they point to the new target. No secret values were requested,
printed, extracted or copied. Do not request duplicate secrets in Codex.
Direct navigation to the Actions Secrets settings URL in the available
browser returned GitHub's Page not found screen without an authenticated
browser session. No signed-in shared-browser control tool is callable here.
That UI result and API 403 do not establish absence of the owner's secrets.

## Smallest owner-run route

Use a new **read-only** workflow on protected `main` with the existing
`production` review environment unchanged. This supports repository secrets
and secrets already in that environment. Environment-level values take
precedence if the same name exists at both scopes; the inspector tests the
actual selected value and rejects an old origin, wrong branch or wrong role.

The owner dispatches, then uses **Review deployments → Approve and deploy**.
That button approves this read-only job; it does not deploy a Worker or apply
schema. Do not use **Start all waiting jobs**, the separate admin bypass path.
The job also requires recorded owner approval through the Actions review
history API. No token with approval/dispatch write authority is given to it.

The intended independent-dispatcher/Prevent-self-review-true provisioning
proposal remains blocked with one verified human. This owner-run alternative
uses the policy already present; it does not change or weaken an environment
setting. No production migration workflow or production database URL is used.

## Proposed preflight

The new workflow is
[lythaus-new-core-secret-preflight.yml](../../.github/workflows/lythaus-new-core-secret-preflight.yml).
It has only `workflow_dispatch`; publication cannot start this job. It takes
the reviewed control-workflow SHA, exact schema SHA, the sole permitted target
and a false-by-default read-only confirmation. It refuses reruns, other
actors, unprotected/non-main refs and debug mode.

1. A secret-free job verifies current environment existence, owner reviewer,
   self-review policy and exact main-only branch policy using GET requests.
2. The protected job waits for normal owner review, then checks out the
   control commit and schema candidate separately at their exact SHAs.
3. Install locked dependencies with scripts disabled before injecting any
   provider credentials. Inject only the three existing named secrets into
   the final inspection step; no `$GITHUB_ENV`, secret outputs or artifacts.
4. Validate `PLANETSCALE_API_TOKEN` format as the supported service-token
   ID/token pair and read only the fixed new database, branch and complete
   managed-role inventory. No provider write endpoint is used.
5. Parse each database URL in memory. Before connecting, require the pinned
   origin fingerprint, `postgres`, port 5432, branch `xwkb9quljkzd`, scoped
   migration/verifier usernames and TLS verify-full. Reject a default admin
   or old-target URL before authentication.
6. Connect separately with `default_transaction_read_only=on` from startup,
   short timeouts and TLS certificate verification. Confirm current/session
   role, PG17, read-only state, login attributes and expected database rights.
   The migration connection runs only approved catalog baseline readers and
   six-role membership checks; the verifier confirms scoped login/permissions
   and ledger absence. No migration, grants, bootstrap, data or credential
   mutation is executed, even if all checks pass.
7. Print a fixed JSON report of per-input booleans: accessible, valid format,
   exact target, authentication/metadata authorization, read-only enforcement,
   role profile and baseline. Raw driver/provider exceptions are discarded.

GitHub token permissions are only **contents: read** and **actions: read**.
The automatic job token expires with its normal run lifecycle; no new PAT,
SQL credential, secret scope or persistent authority is required. The hosted
runner/process environment is discarded after the job. Only boolean reports
and public source pins are retained in job logs/summary.

## Exact blockers and smallest next action

- **Main-only review gate:** a run from `codex/new-core-provisioning` cannot
  use `production`. The proposed workflow instead runs from `main`.
- **Workflow registration and source availability:** the new dispatch
  workflow must be registered on the default branch and the exact schema
  commit must be fetchable. The schema branch is published; workflow
  registration happens only after normal review and merge of this PR.
- **Secret scope:** API metadata is denied, so repository/production scope
  cannot be independently confirmed here. If an input is only in another
  environment, this proposal reports inaccessible. Do not move/copy it. A
  separately reviewed read-only job in that existing scope could follow the
  owner gate, provided its own branch policies permit the same control ref.
  If migration/verifier secrets are split across environments, the existing
  schema installer cannot receive both in one job without a separate scope
  or credential-delivery decision. Preflight success must not conceal that.
- **Original protected-main schema pin:** registering a new workflow on
  `main` changes the pinned baseline `ba10cfb16941cd163e345af3c00b9bd739884646`.
  The original schema runner must stop on that difference. The preflight
  reports this explicitly and grants no schema-write authority. Before any
  later schema job, review and approve that changed control/main pin while
  retaining the exact canonical migration candidate and checksums.

Normal PR checks and merge gates apply to this wrapper. A later dispatch is
a separate action using the existing review environment. Never edit secret
scopes, copy credentials, apply schema, change provider settings or deploy
as part of this read-only workflow.

Sources: [GitHub manual dispatch](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow),
[deployment review and bypass](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/review-deployments),
[secret precedence](https://docs.github.com/en/actions/reference/security/secrets).
