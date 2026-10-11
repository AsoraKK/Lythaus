import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

export const postReviewAuthorLockSignature = 'trust.lock_active_post_review_author(uuid,uuid,uuid)';
const proposal = readFileSync(new URL('./fixtures/post-review-author-lock.disabled.sql', import.meta.url), 'utf8');
assert.equal(createHash('sha256').update(proposal).digest('hex'),
  '39f13c0b1cf962545659b033e7b740ca47da1f1d836d38fd087f91851dbbf336');

export async function installProposedPostReviewCapability(connectionString) {
  const target = new URL(connectionString);
  assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname));
  assert.match(target.pathname, /^\/lythaus_auth_test_post_publishing_[a-f0-9]{16}$/);
  assert.equal(target.search, '');
  assert.equal(target.hash, '');
  const client = new pg.Client({ connectionString, ssl: false });
  await client.connect();
  try {
    const version = Number((await client.query("SELECT current_setting('server_version_num') AS version")).rows[0].version);
    assert.ok(version >= 170000 && version < 180000);
    const absent = async () => assert.equal((await client.query('SELECT to_regprocedure($1) AS signature',
      [postReviewAuthorLockSignature])).rows[0].signature, null);
    await absent();
    await client.query(proposal);
    await absent();
    await client.query(proposal.replace(/\nROLLBACK;\s*$/, '\n'));
    await client.query(`GRANT SELECT(id,status,deleted_at), UPDATE(id) ON identity.users TO lythaus_migrations;
      GRANT SELECT(id,author_id,moderation_source_event_id,moderation_state,deleted_at) ON content.posts TO lythaus_migrations;
      ALTER FUNCTION trust.lock_active_post_review_author(uuid,uuid,uuid) OWNER TO lythaus_migrations;
      GRANT EXECUTE ON FUNCTION trust.lock_active_post_review_author(uuid,uuid,uuid) TO lythaus_jobs`);
    await client.query('COMMIT');
    const privileges = (await client.query(`SELECT
      has_any_column_privilege('lythaus_jobs','identity.users','UPDATE') AS account_update,
      has_function_privilege('lythaus_jobs',$1,'EXECUTE') AS jobs_execute,
      has_function_privilege('lythaus_runtime',$1,'EXECUTE') AS runtime_execute,
      has_function_privilege('lythaus_admin',$1,'EXECUTE') AS admin_execute,
      has_function_privilege('lythaus_privacy',$1,'EXECUTE') AS privacy_execute`,
    [postReviewAuthorLockSignature])).rows[0];
    assert.deepEqual(privileges, { account_update: false, jobs_execute: true,
      runtime_execute: false, admin_execute: false, privacy_execute: false });
  } catch (error) { await client.query('ROLLBACK').catch(() => undefined); throw error; }
  finally { await client.end(); }
}
