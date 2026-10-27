# Read-only product privilege preflight

The manual `product-privilege-preflight.yml` workflow prepares the missing-rights
approval packet for rewards and Black News Board. It does not apply grants,
change credentials, create a runtime connection, read product rows or perform
live acceptance. Run only after the workflow is reviewed and merged, using the
exact then-current protected main SHA and the existing production environment.

It receives only the existing schema-read URL, PlanetScale API token, Cloudflare
API token and role-identifier mapping. The administrator URL is never supplied.
The workflow checks its execution SHA, checkout and freshly fetched main before
protected reads. It fetches only `lythaus/lythaus-core/branches/main`, rejects a
different branch/database/origin or non-`verify-full` URL, and uses the shared
Hyperdrive verifier to check the existing public Worker's `DB_APP_FRESH`
mapping. The single selected Hyperdrive is
`3e59f07db51345aa896333ca861d1adf`. Its name alone is not identity evidence.
The verifier's GET-only mode stops after a denied or failed read without listing
other resources, retries, credential creation or automatic repair.

Only then does one existing schema-verifier connection open with certificate
verification and bounded timeouts. A confirmed read-only transaction inspects
`pg_catalog`, current verifier identity and exact privilege predicates. It
resolves the unique catalog SQL role matching the live configured Hyperdrive
username and inspects its effective inherited privileges. This proves a live
configured mapping and catalog role, not the current/session user of a runtime
login: `runtimeSessionObserved` remains false. No `SET ROLE` is executed and the
verifier identity is never proposed as a substitute grantee.

The additional-rights checks are exactly:

- `trust.reward_redemptions`: SELECT on `id`, `user_id`, `reward_id`,
  `reward_level`, `reward_title`, `redeemed_at`, `status`; INSERT on `id`,
  `user_id`, `reward_id`, `reward_level`, `reward_title`.
- `editorial`: schema USAGE; `editorial.publications`: SELECT on `id`, `title`,
  `post_id`, `published_at`.

The report separately checks existing identity, entitlement, reputation,
content, social, rate-limit, idempotency and activity column prerequisites. It
observes table-wide SELECT/INSERT/UPDATE/DELETE as context but does not require
table-wide grants where column privileges suffice. The exact existing default
function `pg_catalog.now()` must remain executable. The handlers require no new
function or sequence grant. Missing prerequisites require a revised review;
they are never added to an executable grant automatically.

The sanitized JSON includes actual resolved role names, verifier identities,
role attributes/memberships, owner access, schema/table/column/function privilege
booleans, RLS enable/force flags and policy counts. For only the two proposed
relations, `aclSnapshot` also records their schema/table ACLs and the union of
the requested columns' ACLs. Each object retains its OID, owner name/OID,
column number where applicable, and whether its stored ACL is null. Expanded
entries retain actual grantor/grantee names and OIDs, privilege and grant option;
grantee OID zero is explicitly `PUBLIC`. Null ACLs retain an empty entry list
and `aclIsNull: true`; an explicitly empty ACL retains `aclIsNull: false`.
The collector does not synthesize default ACLs or guess grantors from ownership.
Unrelated columns/relations are not captured. Each relation is bounded to 512
catalog rows, with missing, oversized or malformed metadata failing closed.
These entries supplement effective privileges; they do not prove a runtime
login or authorize a grant. PostgreSQL documents the catalog expansion in
[its ACL function reference](https://www.postgresql.org/docs/17/functions-info.html#FUNCTIONS-ACLITEM-FN-TABLE).
The report excludes passwords, URLs,
tokens, the secret mapping, row data, policy expressions and raw provider/error
messages. Only this one JSON file is retained as a public Actions artifact for
the existing seven days; no new secret, artifact or execution path is added.

`NEEDS_APPROVAL` means specific effective rights are missing; no permission is
changed. Ambiguous mapping, unavailable probes, elevated role attributes,
effective ownership or RLS/policy differences produce `BLOCKED`. Complete rights
produce `PRIVILEGES_PRESENT_NOT_ACCEPTED`: neither product acceptance nor grant,
publishing or billing authorization follows. RLS is never disabled or bypassed.

Column grants are not row isolation. Without effective RLS, a compromised runtime
identity could read all granted reward/publication columns, including unpublished
publication rows, and insert reward records for any valid user. Owner, maturity,
reputation and Black-tier checks remain application enforcement. Any approved
grant must name the role proven by this packet and describe these consequences;
rollback must preserve inherited and pre-existing ACLs rather than blindly revoke.

Tests use intercepted provider responses and an owned disposable loopback-only
PostgreSQL 17 database. They verify exact column/inherited/schema permissions,
RLS metadata, sanitized failures, GET-only denial behavior, TLS/identity ordering
and workflow secret boundaries. They provide code evidence; only a later exact
merged-SHA protected run can supply live mapped-role and effective-rights evidence.

## 22 October: grantor-authority preparation

The completed mapped-role observation remains run `39588144680`; reuse it
rather than repeat the same product preflight. Historical approval wording in
this document is not a request to repeat any valid owner authorization retained
by the release coordinator.

Source preparation based on main `e0a8eb52e3ec58719007ba8651e1e5d5bc24232d`
extends the existing protected cutover identity workflow. Its existing migrator
connection now checks only the sixteen proposed column grant options and
editorial schema USAGE grant option, in its read-only transaction. This does
not add an executable grant path or change the product preflight's reader-only
secret boundary. See the [operator contract](../runbooks/planetscale-0021-cutover-preparation.md#read-only-sql-identity-preflight).

The focused cutover/product unit suite passes 20 tests without skips on Node
24.19.0, using synthetic provider/SQL responses. Cases cover every missing grant
option, incomplete/ambiguous/nonboolean metadata, read-only confirmation,
sanitized failures, transaction rollback, identity failure suppression and
separate migration/product status. PostgreSQL 17 and hosted execution were not
performed in this preparation; no existing admin or schema-reader connection
URL was available in the saved environment.

Next operator action, after review and coordinated integration: run
`planetscale-cutover-identity-preflight.yml` once from protected main with
`release_sha` equal to that exact then-current main SHA. Use only its existing
protected credentials. Inspect both identity and `productGrantAuthority`
statuses; a green identity result alone does not prove product grant authority.
Stop on missing access or blocked authority, without credential creation,
repair or a different connection route. Preserve the sanitized artifact with
the existing mapped-role packet. Any later grant action retains its separate
exact authorization, current grantee/ACL/rollback review and independent review;
no grant action, release, migration or feature activation is authorized here.

## 23 October: ACL and rollback preparation

Run `39856460642` on protected main
`bd3260d0d02388ac7c5492ee4cf0b61126847c3b` completed its read-only catalog
inspection with `NEEDS_APPROVAL`, no blockers and exactly seventeen proposed
privilege gaps. This is the expected nonzero result while rights are missing.
The named runtime role is `pscale_api_ysl604shosjg`; existing owner authorization
is retained by the release coordinator. The static `grantApproval: NOT_GRANTED`
field does not assess conversational consent. This collector change supplies
the missing ACL/grantor provenance for that already-scoped preparation.

After source review, integration and required checks, one exact merged-main
protected run may capture that evidence using the existing schema-reader URL.
It still cannot apply grants. The eventual independently reviewed execution
packet must bind the exact target `lythaus/lythaus-core/main`, named grantee,
existing administrator identity and four-statement SQL to the retained approval.
The four statements in the approval package, with its placeholder replaced by
the quoted named role and its final newline retained, have SHA-256
`b61a4f8d24773a3e881b659badaeabc4167798a788f7f20eac05643f525f842f`.

At execution time, recheck target, identity, grant authority, effective rights,
RLS and ACL baseline through the existing authorized administrator connection.
Capture the pre-change ACLs before those exact four statements, verify only
the approved delta and postconditions, and roll back the transaction on any
discrepancy. A committed change's rollback packet must derive from the captured
before/after ACLs and actual grantor attribution, preserving unrelated and
inherited rights. Do not assume an arbitrary `GRANTED BY` identity is usable,
blindly revoke privileges, or use cascading revocation. Runtime login and
exact-candidate product acceptance remain separate, and no grant executor is
introduced into this read-only workflow.
