import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL ?? '';
const target = new URL(connectionString || 'file:///missing');
if (!['127.0.0.1', 'localhost'].includes(target.hostname)
  || !/^\/lythaus_auth_test_invite_[a-f0-9]{32}$/.test(target.pathname)
  || target.search !== '' || target.hash !== '') {
  throw new Error('Invite proposal rehearsal requires its owned loopback PostgreSQL 17 database');
}

const client = new pg.Client({ connectionString, ssl: false, connectionTimeoutMillis: 5000 });
await client.connect();
try {
  assert.match((await client.query('SHOW server_version_num')).rows[0].server_version_num, /^17/);
  assert.equal((await client.query("SELECT to_regclass('marketing.waitlist_invites') AS invite_table")).rows[0].invite_table, null);
  assert.equal((await client.query("SELECT to_regclass('marketing.waitlist_signups') AS waitlist_table")).rows[0].waitlist_table, 'marketing.waitlist_signups');

  // Simulate the trusted pre-migration role-provisioning stage. The persistent
  // roles.sql is applied again below and must leave CREATE revoked afterward.
  await client.query('GRANT CREATE ON SCHEMA marketing TO lythaus_waitlist_invite_function_owner');
  const proposal = await readFile('database/planetscale/proposals/2026-11-02-alpha-waitlist-invites.sql', 'utf8');
  await client.query('BEGIN');
  try {
    await client.query('SET LOCAL ROLE lythaus_migrations');
    await client.query(proposal);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  }

  const roles = await readFile('database/planetscale/grants/roles.sql', 'utf8');
  await client.query(roles);
  const roleOwnership = (await client.query(`
    SELECT n.nspowner::regrole::text AS schema_owner,
      pg_has_role('lythaus_waitlist_invite_function_owner', 'lythaus_migrations', 'USAGE') AS owner_is_migration_member,
      pg_has_role('lythaus_migrations', 'lythaus_waitlist_invite_function_owner', 'USAGE') AS migration_can_set_function_owner
    FROM pg_namespace n WHERE n.nspname = 'marketing'
  `)).rows[0];

  const owners = await client.query(`
    SELECT p.proname, r.rolname AS owner
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_roles r ON r.oid = p.proowner
    WHERE n.nspname = 'marketing' AND p.proname LIKE '%waitlist_invite%'
       OR n.nspname = 'marketing' AND p.proname IN ('bind_waitlist_invite','sync_waitlist_invite_outbox_state',
            'sync_waitlist_invite_account_state','revoke_waitlist_invites','on_waitlist_restriction',
            'unsubscribe_waitlist_entry','cancel_waitlist_invite_before_delete')
    ORDER BY p.proname
  `);
  assert.equal(owners.rows.length, 11, 'all eleven invite-definer functions have an explicit owner');
  assert.ok(owners.rows.every(row => row.owner === 'lythaus_waitlist_invite_function_owner'));

  const acl = await client.query(`
    SELECT
      has_column_privilege('lythaus_migrations','marketing.waitlist_signups','id','REFERENCES') AS migration_fk,
      has_table_privilege('lythaus_migrations','marketing.waitlist_signups','TRIGGER') AS migration_trigger,
      has_table_privilege('lythaus_migrations','marketing.waitlist_signups','SELECT') AS migration_waitlist_read,
      has_table_privilege('lythaus_migrations','identity.users','UPDATE') AS migration_user_write,
      has_table_privilege('lythaus_jobs','marketing.waitlist_invites','SELECT') AS jobs_invite_read,
      has_column_privilege('lythaus_waitlist_invite_function_owner','marketing.waitlist_signups','status','SELECT') AS owner_status_read,
      has_column_privilege('lythaus_waitlist_invite_function_owner','marketing.waitlist_signups','invited_at','SELECT') AS owner_invited_at_read,
      has_column_privilege('lythaus_waitlist_invite_function_owner','marketing.waitlist_signups','purge_after','SELECT') AS owner_purge_after_read,
      has_column_privilege('lythaus_waitlist_invite_function_owner','marketing.waitlist_signups','status','UPDATE') AS owner_status_update,
      has_table_privilege('lythaus_waitlist_invite_function_owner','marketing.waitlist_signups','UPDATE') AS owner_full_waitlist_update,
      has_column_privilege('lythaus_waitlist_invite_function_owner','marketing.waitlist_signups','email_ciphertext','SELECT') AS owner_waitlist_ciphertext_read,
      has_column_privilege('lythaus_waitlist_invite_function_owner','identity.users','id','SELECT') AS owner_user_id_read,
      has_column_privilege('lythaus_waitlist_invite_function_owner','identity.users','display_name','SELECT') AS owner_user_profile_read,
      has_column_privilege('lythaus_waitlist_invite_function_owner','system.transactional_email_outbox','delivery_envelope_ciphertext','SELECT') AS owner_email_envelope_read,
      has_column_privilege('lythaus_waitlist_invite_function_owner','system.transactional_email_outbox','terminal_at','SELECT') AS owner_terminal_at_read,
      has_column_privilege('lythaus_waitlist_invite_function_owner','system.transactional_email_outbox','delivery_envelope_ciphertext','UPDATE') AS owner_email_envelope_clear
      ,has_schema_privilege('lythaus_waitlist_invite_function_owner','marketing','CREATE') AS owner_marketing_create_after_grants
      ,has_column_privilege('lythaus_admin','marketing.waitlist_invites','waitlist_id','SELECT') AS admin_invite_metadata_read
      ,has_column_privilege('lythaus_admin','marketing.waitlist_invites','email_lookup_hmac','SELECT') AS admin_invite_hmac_read
      ,has_column_privilege('lythaus_admin','marketing.waitlist_invites','user_id','SELECT') AS admin_invite_user_id_read
      ,NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        CROSS JOIN LATERAL aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
        WHERE n.nspname = 'marketing'
          AND p.proname IN ('waitlist_invite_eligible','waitlist_invite_reissue_user','bind_waitlist_invite',
            'lock_waitlist_invite_delivery','lock_waitlist_invite_for_verification','sync_waitlist_invite_outbox_state',
            'sync_waitlist_invite_account_state','revoke_waitlist_invites','on_waitlist_restriction',
            'unsubscribe_waitlist_entry','cancel_waitlist_invite_before_delete')
          AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
      ) AS no_public_invite_function_execute
  `);
  assert.deepEqual(acl.rows[0], {
    migration_fk: true, migration_trigger: true, migration_waitlist_read: false, migration_user_write: false, jobs_invite_read: false,
    owner_status_read: true, owner_invited_at_read: true, owner_purge_after_read: true, owner_status_update: true,
    owner_full_waitlist_update: false, owner_waitlist_ciphertext_read: false, owner_user_id_read: true,
    owner_user_profile_read: false, owner_email_envelope_read: false, owner_terminal_at_read: true, owner_email_envelope_clear: true,
    owner_marketing_create_after_grants: false, admin_invite_metadata_read: true, admin_invite_hmac_read: false,
    admin_invite_user_id_read: false, no_public_invite_function_execute: true,
  }, `invite ACL after roles.sql reapplication; schemaOwner=${roleOwnership.schema_owner}, ownerMigrationMember=${roleOwnership.owner_is_migration_member}, migrationCanSetOwner=${roleOwnership.migration_can_set_function_owner}`);
  const role = (await client.query(`SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
    FROM pg_roles WHERE rolname='lythaus_waitlist_invite_function_owner'`)).rows[0];
  assert.deepEqual(role, { rolcanlogin: false, rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolreplication: false, rolbypassrls: false });
  process.stdout.write(JSON.stringify({ proposalAppliedAs: 'lythaus_migrations', definerOwnerCount: owners.rows.length, narrowColumnAcl: true }) + '\n');
} finally {
  await client.end();
}
