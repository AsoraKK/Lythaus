# Posting feedback role inspection packet

**Read-only preparation; no production query or role change was performed by
this task.** Do not put connection strings, passwords, tokens, or secret-store
values in this packet. Resolve the role placeholders only after an authorized
operator verifies the real role and its mapping to the existing Jobs binding.

The candidate migration is
`database/planetscale/migrations/0021_posting_feedback_ledger.sql`. It remains
comment-only at `posting_feedback_ledger.sql.proposal`; the approved main
baseline currently contains 20 files through
`0020_auth_recovery_delivery.sql` with set checksum
`1d5c137e85941a109db09249a56c6e95d24673803db5147fa54fc803933fe09c`. Read-only
metadata supplied for `lythaus/lythaus-core/main` reports that the `evaluation`
schema is absent. This task did not independently query production.

Release 110 evidence maps `DB_JOBS_FRESH` to Hyperdrive
`442bb04b99004cb38c6974ec031d65ee`, resource `lythaus-db-jobs-dev`, and
`lythaus-core/main` with `postgres` origin. Its database username is redacted.
The username-to-role mapping is therefore still unverified. The observed
candidate `pscale_api_9jfbtij9y4b2` has no role memberships, schema `USAGE` but no
`CREATE` on `identity`, `content` and `trust`, `SELECT` but no table or `id`-column
`UPDATE` on `identity.users`, and `SELECT`/`UPDATE` on `content.posts`. Those
owner-supplied facts establish neither evaluation permissions nor its mapping to
Jobs; it is not an approved grantee. The observed
`pscale_api_47syed2xlt6p` belongs to `postgres`, `read_all`, and `write_all`; it
is highly privileged and is not an approved ledger grantee. Keep these and all
unverified roles out of the SQL grant templates.

The proposal placeholders remain:

- `__APPROVED_EVALUATION_WRITER_ROLE__`
- `__APPROVED_EVALUATION_READER_ROLE__`
- `__APPROVED_RETENTION_ROLE__`
- `__APPROVED_MIGRATION_ROLE__` for the separately verified DDL executor

An authorized operator may use the following read-only statements against the
approved target after confirming that session is read-only. Bind no secret data.
If the provider console cannot expose role identity or memberships, record that
field as `UNKNOWN/BLOCKED`; do not guess from the role name or permissions.

```sql
BEGIN TRANSACTION READ ONLY;

SELECT current_database() AS database_name,
       current_user::text AS effective_role,
       session_user::text AS login_role,
       current_setting('server_version_num') AS server_version,
       current_setting('transaction_read_only') AS transaction_read_only;

SELECT n.nspname AS schema_name,
       c.relname AS relation_name,
       pg_get_userbyid(c.relowner) AS owner_name,
       c.relkind AS relation_kind
  FROM pg_class AS c
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
 WHERE n.nspname = 'evaluation' AND c.relname LIKE 'posting_feedback_%'
 ORDER BY n.nspname, c.relname;

WITH requested_roles(role_name) AS (VALUES
  ('__APPROVED_EVALUATION_WRITER_ROLE__'),
  ('__APPROVED_EVALUATION_READER_ROLE__'),
  ('__APPROVED_RETENTION_ROLE__'),
  ('__APPROVED_MIGRATION_ROLE__')
)
SELECT requested_roles.role_name,
       namespace.nspname AS schema_name,
       CASE WHEN roles.oid IS NOT NULL AND namespace.oid IS NOT NULL
            THEN has_schema_privilege(roles.oid, namespace.oid, 'USAGE') END AS schema_usage,
       CASE WHEN roles.oid IS NOT NULL AND namespace.oid IS NOT NULL
            THEN has_schema_privilege(roles.oid, namespace.oid, 'CREATE') END AS schema_create
  FROM requested_roles
  LEFT JOIN pg_roles AS roles ON roles.rolname = requested_roles.role_name
  LEFT JOIN pg_namespace AS namespace ON namespace.nspname = 'evaluation'
 ORDER BY requested_roles.role_name;

WITH requested_roles(purpose, role_name) AS (VALUES
  ('writer', '__APPROVED_EVALUATION_WRITER_ROLE__'),
  ('reader', '__APPROVED_EVALUATION_READER_ROLE__'),
  ('retention', '__APPROVED_RETENTION_ROLE__'),
  ('migration_executor', '__APPROVED_MIGRATION_ROLE__')
)
SELECT requested_roles.purpose,
       requested_roles.role_name AS requested_role_name,
       roles.oid::text AS role_oid,
       roles.rolcanlogin,
       roles.rolsuper,
       roles.rolcreaterole,
       roles.rolcreatedb,
       roles.rolinherit
  FROM requested_roles
  LEFT JOIN pg_roles AS roles ON roles.rolname = requested_roles.role_name
 ORDER BY requested_roles.purpose;

WITH requested_roles(role_name) AS (VALUES
  ('__APPROVED_EVALUATION_WRITER_ROLE__'),
  ('__APPROVED_EVALUATION_READER_ROLE__'),
  ('__APPROVED_RETENTION_ROLE__'),
  ('__APPROVED_MIGRATION_ROLE__')
)
SELECT granted.rolname AS granted_role,
       member.rolname AS member_role,
       grantor.rolname AS grantor_role,
       memberships.admin_option
  FROM pg_auth_members AS memberships
  JOIN pg_roles AS granted ON granted.oid = memberships.roleid
  JOIN pg_roles AS member ON member.oid = memberships.member
  JOIN pg_roles AS grantor ON grantor.oid = memberships.grantor
 WHERE granted.rolname IN (SELECT role_name FROM requested_roles)
    OR member.rolname IN (SELECT role_name FROM requested_roles)
 ORDER BY granted.rolname, member.rolname;

SELECT grantee,
       table_schema,
       table_name,
       privilege_type,
       is_grantable
  FROM information_schema.role_table_grants
 WHERE table_schema = 'evaluation'
   AND table_name IN (
     'posting_feedback_probe_samples', 'posting_feedback_probe_runs',
     'posting_feedback_attempt_claims', 'posting_feedback_results',
     'posting_feedback_result_categories'
   )
   AND grantee IN (
     '__APPROVED_EVALUATION_WRITER_ROLE__',
     '__APPROVED_EVALUATION_READER_ROLE__',
     '__APPROVED_RETENTION_ROLE__'
   )
 ORDER BY grantee, table_name, privilege_type;

SELECT grantee,
       table_schema,
       table_name,
       column_name,
       privilege_type,
       is_grantable
  FROM information_schema.column_privileges
 WHERE table_schema = 'evaluation'
   AND table_name IN (
     'posting_feedback_probe_runs', 'posting_feedback_attempt_claims',
     'posting_feedback_results', 'posting_feedback_result_categories'
   )
   AND grantee IN (
     '__APPROVED_EVALUATION_WRITER_ROLE__',
     '__APPROVED_EVALUATION_READER_ROLE__',
     '__APPROVED_RETENTION_ROLE__'
   )
 ORDER BY grantee, table_name, column_name, privilege_type;

ROLLBACK;
```

After roles are verified, compare the observed grants against the exact commented
templates in `posting_feedback_ledger.sql.proposal`. A missing schema, missing role
or empty grant result is `UNKNOWN/BLOCKED`, not a privilege pass. The writer needs
schema `USAGE` and only the listed `INSERT`, key `SELECT`, and claim-state
`UPDATE` privileges. The reader gets `SELECT` on result and category rows only.
The retention role gets `USAGE`, `SELECT (expires_at)`, and `DELETE` on result
rows only; foreign-key cascade removes categories. No application or retention
role gets `DELETE` on run/sample claims. The candidate migration executor and
actual Jobs login identity must be reviewed separately; do not infer either from
the observed candidate service role.

Seven-day result retention is approved. The proposal leaves the small run and
sample claim tombstones without expiry so result cleanup cannot re-enable a
provider call. Approval for that longer-lived tombstone retention is unresolved;
no migration or retention grant may be applied until that policy is resolved.
