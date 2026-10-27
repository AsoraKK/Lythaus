import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { inspectProductPrivileges, PRODUCT_PRIVILEGE_REQUIREMENTS } from '../ci/product-privilege-preflight.mjs';
import { publicationControlTarget } from '../ci/run-publication-pg17.mjs';

test('PG17 catalog probes distinguish exact column, inherited, schema and RLS rights without reading product rows', { timeout: 30_000 }, async () => {
  const target = publicationControlTarget(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL ?? '');
  const control = new pg.Client({ connectionString: target.toString(), ssl: false });
  const suffix = randomUUID().replaceAll('-', '');
  const name = `lythaus_auth_test_post_priv_${suffix}`;
  const runtimeRole = `lythaus_priv_runtime_${suffix}`;
  const inheritedRole = `lythaus_priv_reader_${suffix}`;
  let client, created = false, rolesCreated = false;
  const quote = value => { assert.match(value, /^[a-z_][a-z0-9_]*$/); return '"' + value + '"'; };
  try {
    await control.connect();
    assert.match((await control.query('SHOW server_version_num')).rows[0].server_version_num, /^17/);
    await control.query(`CREATE DATABASE ${quote(name)}`); created = true;
    await control.query(`CREATE ROLE ${quote(runtimeRole)} NOLOGIN`); rolesCreated = true;
    await control.query(`CREATE ROLE ${quote(inheritedRole)} NOLOGIN`);
    const local = new URL(target); local.pathname = '/' + name;
    client = new pg.Client({ connectionString: local.toString(), ssl: false });
    await client.connect();
    assert.equal((await client.query('SELECT current_database() AS name')).rows[0].name, name);
    const identity = (await client.query('SELECT current_user AS name')).rows[0].name;
    for (const schema of new Set(PRODUCT_PRIVILEGE_REQUIREMENTS.map(item => item.schema))) {
      await client.query(`CREATE SCHEMA ${quote(schema)}`);
      if (schema !== 'editorial') await client.query(`GRANT USAGE ON SCHEMA ${quote(schema)} TO ${quote(runtimeRole)}`);
    }
    for (const item of PRODUCT_PRIVILEGE_REQUIREMENTS) {
      const columns = [...new Set(Object.values(item.columns).flat())];
      await client.query(`CREATE TABLE ${quote(item.schema)}.${quote(item.relation)} (${columns.map(column => quote(column) + ' text').join(', ')})`);
      if (item.scope === 'existing_prerequisite') for (const [privilege, names] of Object.entries(item.columns)) {
        assert.ok(['SELECT', 'INSERT', 'UPDATE'].includes(privilege));
        await client.query(`GRANT ${privilege} (${names.map(quote).join(', ')}) ON ${quote(item.schema)}.${quote(item.relation)} TO ${quote(runtimeRole)}`);
      }
    }
    const queries = [];
    const inspect = async () => {
      try {
        return await inspectProductPrivileges({ query: async (text, values) => {
          queries.push(text); return client.query(text, values);
        } }, { target: { sqlDatabaseName: name, role: identity, username: identity, branchId: 'fixture123' }, runtimeRole });
      } finally { await client.query('SET SESSION CHARACTERISTICS AS TRANSACTION READ WRITE'); }
    };
    let snapshot = await inspect();
    assert.equal(snapshot.runtimeRole.sqlRole, runtimeRole);
    assert.equal(snapshot.runtimeRole.runtimeSessionObserved, false);
    assert.ok(snapshot.missingPrivileges.some(item => item.object === 'editorial' && item.privilege === 'USAGE'));
    assert.ok(snapshot.missingPrivileges.some(item => item.object === 'trust.reward_redemptions' && item.privilege === 'INSERT'));
    assert.ok(snapshot.missingPrivileges.every(item => item.scope === 'proposed_additional'));
    const initialPublications = snapshot.objects.find(item => item.object === 'editorial.publications').aclSnapshot;
    assert.ok(initialPublications.every(item => item.aclIsNull && item.entries.length === 0));
    assert.ok(initialPublications.every(item => item.owner === identity && Number.isInteger(item.ownerOid)));
    assert.equal(snapshot.objects.filter(item => item.aclSnapshot).length, 2);
    const retention = (await client.query(`SELECT
      has_column_privilege($1, 'trust.user_activity_events', 'retention_until', 'SELECT') AS readable,
      has_column_privilege($1, 'trust.user_activity_events', 'retention_until', 'INSERT') AS insertable`, [runtimeRole])).rows[0];
    assert.deepEqual(retention, { readable: false, insertable: true });

    await client.query(`GRANT USAGE ON SCHEMA editorial TO ${quote(runtimeRole)}`);
    await client.query(`GRANT SELECT (id,user_id,reward_id,reward_level,reward_title,redeemed_at,status) ON trust.reward_redemptions TO ${quote(inheritedRole)}`);
    await client.query(`GRANT ${quote(inheritedRole)} TO ${quote(runtimeRole)}`);
    await client.query(`GRANT INSERT (id,user_id,reward_id,reward_level,reward_title) ON trust.reward_redemptions TO ${quote(runtimeRole)}`);
    await client.query(`GRANT SELECT (id) ON trust.reward_redemptions TO ${quote(inheritedRole)} WITH GRANT OPTION`);
    await client.query(`GRANT USAGE ON SCHEMA trust TO ${quote(inheritedRole)}`);
    await client.query(`SET ROLE ${quote(inheritedRole)}`);
    try { await client.query(`GRANT SELECT (id) ON trust.reward_redemptions TO ${quote(runtimeRole)}`); }
    finally { await client.query('RESET ROLE'); }
    await client.query(`REVOKE ALL ON editorial.publications FROM ${quote(identity)}`);
    await client.query('GRANT REFERENCES (id) ON editorial.publications TO PUBLIC');
    await client.query(`GRANT SELECT (id,title,post_id,published_at) ON editorial.publications TO ${quote(runtimeRole)}`);
    snapshot = await inspect();
    assert.deepEqual(snapshot.missingPrivileges, []);
    assert.deepEqual(snapshot.runtimeRole.memberships, [{ role: inheritedRole, effective: true, direct: true }]);
    const rewards = snapshot.objects.find(item => item.object === 'trust.reward_redemptions');
    assert.equal(rewards.tablePrivileges.SELECT, false);
    assert.equal(rewards.tablePrivileges.INSERT, false);
    assert.equal(rewards.tablePrivileges.UPDATE, false);
    assert.equal(rewards.tablePrivileges.DELETE, false);
    assert.ok(rewards.columns.every(item => item.permitted));
    const rewardIdAcl = rewards.aclSnapshot.find(item => item.column === 'id');
    assert.ok(rewardIdAcl.entries.some(entry => entry.grantor === identity && entry.grantee === inheritedRole
      && entry.privilege === 'SELECT' && entry.isGrantable));
    assert.ok(rewardIdAcl.entries.some(entry => entry.grantor === inheritedRole && entry.grantee === runtimeRole
      && entry.privilege === 'SELECT' && !entry.isGrantable));
    const publicationAcl = snapshot.objects.find(item => item.object === 'editorial.publications').aclSnapshot;
    assert.ok(publicationAcl.find(item => item.kind === 'schema').entries.some(entry => entry.grantee === runtimeRole
      && entry.grantor === identity && entry.privilege === 'USAGE' && !entry.isGrantable));
    assert.deepEqual(publicationAcl.find(item => item.kind === 'table').entries, []);
    assert.equal(publicationAcl.find(item => item.kind === 'table').aclIsNull, false);
    assert.ok(publicationAcl.find(item => item.column === 'id').entries.some(entry => entry.granteeOid === 0
      && entry.grantee === 'PUBLIC' && entry.grantor === identity && entry.privilege === 'REFERENCES' && !entry.isGrantable));
    assert.equal(publicationAcl.find(item => item.column === 'id').objectOid,
      publicationAcl.find(item => item.kind === 'table').objectOid);
    assert.ok(publicationAcl.filter(item => item.kind === 'column').every(item => Number.isInteger(item.attributeNumber)));
    assert.ok(snapshot.objects.filter(item => item.scope === 'existing_prerequisite').every(item => !('aclSnapshot' in item)));
    assert.equal(snapshot.functions[0].permitted, true);
    await client.query('ALTER TABLE trust.reward_redemptions ENABLE ROW LEVEL SECURITY');
    snapshot = await inspect();
    assert.equal(snapshot.objects.find(item => item.object === 'trust.reward_redemptions').rowSecurity, true);
    assert.equal(snapshot.objects.find(item => item.object === 'trust.reward_redemptions').policyCount, 0);
    for (const text of queries) {
      assert.doesNotMatch(text, /\b(INSERT INTO|UPDATE [a-z]|DELETE FROM|GRANT|REVOKE|CREATE|ALTER|DROP|TRUNCATE|SET ROLE)\b/i);
      assert.doesNotMatch(text, /\bFROM\s+(trust|identity|editorial|content|social|system)\./i);
    }
    assert.equal(queries.filter(text => text === 'BEGIN READ ONLY').length, 3);
    assert.equal(queries.filter(text => text === 'ROLLBACK').length, 3);
  } finally {
    await client?.end();
    if (created) await control.query(`DROP DATABASE ${quote(name)} WITH (FORCE)`);
    if (rolesCreated) {
      await control.query(`DROP ROLE IF EXISTS ${quote(runtimeRole)}`);
      await control.query(`DROP ROLE IF EXISTS ${quote(inheritedRole)}`);
    }
    await control.end();
  }
});
