# Reputation lock v2: source preparation only

Base reviewed: `fd00b1bf01d26df5fbbb6da5a707e87c08386742` (main).
This draft does not authorize SQL execution, installation, grants, caller
activation, privacy changes, diagnostics, credentials, merge, or deployment.
The install and verification SQL remain single outer comments. No workflow,
migration manifest, canonical grants, registry, or runtime source changes here.

## Recovered evidence

Local Git object `178ad06e7703fe88fff62eaaeaef28a39ff784b6` exists and contains
the previously described executable helper suite, fixture preparer, and runner.
Those sources are absent from this main base. This draft recovers those files
through `git show`, then extends them; it does not import historical credentials.
The prior documentary 19/19 is historical, not a result for this draft.

The old cluster wrapper inspected a shared container for its password. The new
manual wrapper reads no credentials/shared container, uses an already installed
`postgres:17` image (`--pull=never`), creates its own uniquely named container,
binds only to loopback, and removes only that container. Test-only trust auth is
confined to this disposable cluster. Running it is a separate execution action.

## Confirmed gaps and prepared changes

| Path / transition | Source finding | Preparation / remaining gate |
| --- | --- | --- |
| Install preflight | v1 checks Jobs memberships as a member, but misses members of Jobs | v2 rejects all incoming and outgoing Jobs edges, including disabled edges; any transitive/mixed route into Jobs must end in an incoming edge |
| Definer owner audience | Non-Jobs roles can inherit owner rights or SET ROLE to a role inheriting owner rights | v2 checks effective inheritance plus SET-then-INHERIT paths before install |
| Function EXECUTE | Two explicit ACL entries do not prove effective audience | v2 atomically checks exact ACL recipients, PUBLIC, grant option, Jobs access, effective non-Jobs access, and SET-then-INHERIT access before COMMIT |
| Jobs role attributes | Catalog role mapping remains historical | v2 refuses SUPERUSER/BYPASSRLS/CREATEROLE/CREATEDB on Jobs; actual session/catalog proof remains missing |
| `processReputationSource` | Canonical outbox read commits before `processSingleReputationSignal` runs | Synthetic regression captures the subject, scrubs outbox, completes deletion, then delivers the already captured input |
| `recordReputationSignal` | A returned `deleted` row proceeds to replay/ledger/profile writes | Inert v2 caller patch rejects `reputation_subject_deleted` immediately after acquiring the subject lock |
| `refreshReputationProfile` | A returned `deleted` row proceeds to aggregate/profile/balance writes | Same terminal guard precedes all profile and aggregate reads/writes |
| Account deletion final transaction | Deletes activity/profile before updating users to `deleted` | Real PostgreSQL deadlock regression prepared for opposing user-before-profile caller order; accepts either victim and requires SQLSTATE `40P01`, rollback, explicit retry/redelivery, and no duplicate event/activity/award |
| Earlier balance/outbox cleanup | Commits in a separate transaction before final user tombstone | Unfixed activation blocker: a locked-user refresh in this interval can recreate an earlier-purged balance; characterization regression explicitly records the unsafe outcome |
| Deleted delivery error | Existing Queue handling retries failures | No new ack/skip policy proposed; terminal-delivery acknowledgement/DLQ behavior needs separate review |

Source anchors at this base: `packages/db/src/reputation.ts:149,321`;
`apps/lythaus-jobs/src/index.ts:621,667,703,2044,2105,2141,2161,2175,2192`;
`packages/db/src/index.ts:57` (transaction rollback/rethrow); Jobs queue claim
release/retry at `apps/lythaus-jobs/src/index.ts:1780,1991`.
The transaction wrapper does not retry deadlocks internally. The fixture retries
whole transactions explicitly to model Workflow/Queue redelivery. It does not
claim to execute the full deployed Workflow scheduler.

Privacy retention and ordering are preserved in active source. The helper does
not make retained ledger events, balances, or activity appropriate to retain or
recreate after deletion. Closing the multi-transaction cleanup interval and
choosing a common lock order require the privacy lane/parent before activation.

## Reproducible validation sources

`packages/db/tests/reputation-lock-proposal.postgres.mjs` covers canonical-role
denial, exact target role, owner attributes/RLS/default ACL preflight, atomic
create/revoke/grant visibility, incoming direct/transitive/mixed memberships,
non-Jobs EXECUTE and grant-option drift, search-path/table/function/operator/UUID
domain shadowing, isolation rejection, same-subject serialization, source replay,
different subjects, status writer ordering, stale refresh, rollback, targeted
reversal, missing subjects, deletion versus captured delivery, actual deadlock
victim rollback/redelivery, and helper install/drop rollback.

The preflight test includes a v1 defect control: an incoming membership inherits
EXECUTE under v1 but v2 rejects installation. Native mock controls also show both
v1 patched methods continuing after `deleted`, while v2 stops after one query.

Source-only checks run for this draft:

```sh
node --experimental-strip-types --test --test-concurrency=1 \
  packages/db/tests/reputation-lock-candidate.test.mjs \
  packages/db/tests/reputation-persistence.test.mjs \
  scripts/tests/reputation-lock-proposal-runner.test.mjs
git apply --check database/planetscale/proposals/reputation_subject_lock.v2.patch.proposal
```

Result: **23/23 mock/boundary tests pass**; patch dry run and JavaScript syntax
checks pass. No PostgreSQL connection, Docker operation, SQL, provider diagnostic,
credential read, or production action was performed for these checks.

**PostgreSQL v2 tests are NOT RUN.** After separate execution authorization,
the reproducible isolated command is:

```sh
node scripts/ci/run-reputation-managed-lock-cluster.mjs \
  --synthetic-managed-cluster --execute-local-sql
```

Prerequisites: Node 22+, existing workspace npm dependencies (including pg and
esbuild through Wrangler), Docker, and an already installed PostgreSQL 17 image.
No provider connection is supported by that wrapper. The lower-level runner
requires loopback and the dedicated disposable control database, creates a
UUID-named database owned by the modeled owner, and drops only that database.

The synthetic bootstrap is a true local superuser. It creates a NONsuperuser
`postgres` with the historically observed flags and an empty synthetic
`pscale_superuser` group, and uses SET SESSION AUTHORIZATION solely as scaffolding.
It cannot establish actual Jobs identity, PlanetScale managed-role powers,
hidden memberships, platform restrictions, Hyperdrive transaction behavior, or
production installation authority. Owner/superuser/future administrative ACL or
membership changes remain outside the non-Jobs execution boundary. Any catalog
visibility denial/unknown audience is a blocker, not permission to relax checks.

## Versioned proposal bytes

Original files are unchanged and hash-checked in the native suite. Their known
full-file SHA256 values remain:

| v1 file | SHA256 |
| --- | --- |
| install | `71a4fc9a7945cd683bc1b70ad01e958d6d0735a6ab9a37f8c254669244732d62` |
| rollback | `b28eacc41c8c5b77311cd0dc3ef14467e7c515aac53e908186080e7c9a56796f` |
| verify | `35f8fe76fa3bab02c2388fba45a49352aa6918e04e38e2ed4a9be38b133e87fd` |
| caller patch | `7739004a2198740908ae99e82682890c18edb00222de3595e137e135ef5835d1` |

Version 2 files require a new exact approval; no old hash authorizes new bytes:

| v2 file | Bytes | SHA256 |
| --- | ---: | --- |
| `reputation_subject_lock.v2.sql.proposal` | 6980 | `05b49a7b3ba7f5a9e8bdb921f2c4c7e383ef502c67a1c2af4241b9a586ce0a31` |
| marked install payload | 6313 | `47617f6160983ad6b9bb9cc8190f2d6a00ab378254fdd5ec6ccd2b99c73aeb78` |
| `reputation_subject_lock.v2.verify.sql.proposal` | 4503 | `fd3480c3e0b3cea6814377ca877ce3acdb7aad692ace7060fdeb0c5f6f8e9a76` |
| `reputation_subject_lock.v2.patch.proposal` | 1562 | `a78a085e861b30dac7881cdefcf237567d62ef537b1bbce47a3004d8dc1c6a2a` |

The unchanged inert v1 rollback names the same proposed function and role;
restore/drain callers first, then an approved owner may revoke/drop without
CASCADE. Rollback is not approved or executed by this draft.

## Remaining approval prerequisites

- Independently review exact draft head, new SQL bytes, caller patch, and synthetic
  results after the PostgreSQL suite is authorized and run. The manual suite is
  not added to CI in this draft; existing CI does not certify these new PG cases.
- Existing PR CI should pass: repository hygiene, workflow lint, Native Workers
  and PlanetScale, relevant security checks, and Native PlanetScale PostgreSQL 17
  validation when selected. No checks on a different head substitute for this.
- Resolve final privacy lock order, pre-tombstone balance cleanup interval,
  whole-transaction retry/terminal handling, and deletion retention semantics.
- Obtain approved actual Jobs-session identity/isolation/search-path/effective
  privileges and a complete effective-audience catalog inspection. Configuration
  usernames and modeled SET SESSION AUTHORIZATION sessions are not that proof.
- Provide a narrow protected installer using an existing verified authorized
  owner path, exact SHA/hash inputs, bounded preflight/postconditions/rollback,
  evidence, and concurrency controls. No such installer is provided here; broad
  migration workflows and ephemeral credential fallbacks remain excluded.
- Reconcile this helper with the approved migration manifest, migration registry,
  resource registry and rollback bookkeeping. The helper is outside approved
  migrations 0000–0020; no migration number is reserved or schema applied here.
- Only after all prerequisites, request exact human action approval. Keep PR
  #1019 separate and unchanged; do not retry its merge through another route.

Role-path semantics follow PostgreSQL 17 [role membership](https://www.postgresql.org/docs/17/role-membership.html)
and [`pg_auth_members`](https://www.postgresql.org/docs/17/catalog-pg-auth-members.html).
This source packet does not certify publication, detection, rewards activation,
or real provider/production acceptance.
