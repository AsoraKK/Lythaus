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
booleans, RLS enable/force flags and policy counts. It excludes passwords, URLs,
tokens, the secret mapping, row data, policy expressions and raw provider/error
messages. Only this one JSON file is retained as a public Actions artifact.

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
