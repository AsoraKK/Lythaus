import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import pg from 'pg';
import { publicationControlTarget } from '../ci/run-publication-pg17.mjs';
import { TARGET, GRANT_SQL, applyApprovedProductGrants, readProductGrantState, readBackCommittedGrants, aclDigest } from '../ci/product-privilege-grants.mjs';

test('PG17 applies only the four fixed grants, verifies separate committed sessions, and contains real failure/uncertain outcomes', { timeout: 90_000 }, async t => {
  const target = publicationControlTarget(process.env.PLANETSCALE_PG17_TEST_DATABASE_URL ?? '');
  const control = new pg.Client({ connectionString: target.toString(), ssl: false });
  const ownedRoles = [], databases = new Set();
  const quote = value => { assert.match(value, /^[a-z_][a-z0-9_]*$/); return '"' + value + '"'; };
  const statements = GRANT_SQL.match(/GRANT[\s\S]*?;/g);
  try {
    await control.connect();
    assert.match((await control.query('SHOW server_version_num')).rows[0].server_version_num, /^17/);
    assert.equal((await control.query('SELECT current_user AS name')).rows[0].name, 'postgres');
    const exists = await control.query('SELECT rolname FROM pg_catalog.pg_roles WHERE rolname = ANY($1::text[])', [[TARGET.admin, TARGET.runtime, TARGET.verifier]]);
    assert.equal(exists.rows.length, 0, 'fixed fixture roles must not preexist in the disposable cluster');
    for (const role of [TARGET.admin, TARGET.runtime, TARGET.verifier]) {
      await control.query(`CREATE ROLE ${quote(role)} ${role === TARGET.runtime ? 'LOGIN' : 'NOLOGIN'} INHERIT`); ownedRoles.push(role);
    }
    await control.query(`GRANT postgres TO ${quote(TARGET.admin)} WITH INHERIT TRUE`);
    await control.query(`GRANT postgres TO ${quote(TARGET.admin)} WITH SET FALSE`);

    for (const mode of ['commit', 'third_statement', 'post_delta', 'lost_commit_ack', 'lost_rollback_ack', 'readback_failure']) {
      await t.test(mode, async () => {
        const name = `lythaus_auth_test_post_grants_${randomUUID().replaceAll('-', '')}`;
        await control.query(`CREATE DATABASE ${quote(name)}`); databases.add(name);
        const local = new URL(target); local.pathname = '/' + name;
        const setup = new pg.Client({ connectionString: local.toString(), ssl: false });
        const connect = config => {
          const client = new pg.Client({ connectionString: local.toString(), ssl: false });
          return { on: (...args) => client.on(...args), query: (...args) => client.query(...args), end: () => client.end(),
            connect: async () => {
              await client.connect();
              await client.query(`SET SESSION AUTHORIZATION ${quote(config.role)}`);
            } };
        };
        const snapshot = async client => {
          await client.query('BEGIN READ ONLY');
          try { return await readProductGrantState(client, TARGET.admin, true); }
          finally { await client.query('ROLLBACK'); }
        };
        let admin;
        try {
          await setup.connect();
          await setup.query('CREATE SCHEMA trust');
          await setup.query('CREATE SCHEMA editorial');
          await setup.query('CREATE TABLE trust.reward_redemptions (id text, user_id text, reward_id text, reward_level text, reward_title text, status text, redeemed_at text)');
          await setup.query(`ALTER TABLE trust.reward_redemptions OWNER TO ${quote(TARGET.admin)}`);
          await setup.query('CREATE TABLE editorial.publications (id text, slug text, title text, post_id text, published_at text)');
          await setup.query(`GRANT USAGE ON SCHEMA trust TO ${quote(TARGET.runtime)}`);
          await setup.query(`GRANT USAGE ON SCHEMA trust, editorial TO ${quote(TARGET.verifier)}`);
          await setup.query(`GRANT REFERENCES ON trust.reward_redemptions, editorial.publications TO ${quote(TARGET.verifier)}`);
          admin = connect({ role: TARGET.admin }); await admin.connect();
          const before = await snapshot(admin);
          assert.equal(before.checks.length, 17);
          assert.ok(before.checks.every(check => !check.permitted && check.authority && !check.runtimeGrantable));
          const mutations = [], queries = [];
          const writer = { query: async (sql, values) => {
            queries.push(sql);
            if (sql.startsWith('GRANT')) mutations.push(sql);
            if (['third_statement', 'lost_rollback_ack'].includes(mode) && sql === statements[2]) throw new Error('synthetic query failure');
            const result = await admin.query(sql, values);
            if (mode === 'post_delta' && sql === statements[3]) await admin.query(`GRANT SELECT (id) ON editorial.publications TO ${quote(TARGET.verifier)}`);
            if (mode === 'lost_commit_ack' && sql === 'COMMIT') throw new Error('synthetic lost commit acknowledgment');
            if (mode === 'lost_rollback_ack' && sql === 'ROLLBACK') throw new Error('synthetic lost rollback acknowledgment');
            return result;
          } };
          const receipt = await applyApprovedProductGrants(writer, before);
          const expected = { commit: 'COMMITTED', third_statement: 'ROLLED_BACK', post_delta: 'ROLLED_BACK',
            lost_commit_ack: 'UNKNOWN_COMMIT_OUTCOME', lost_rollback_ack: 'UNKNOWN_ROLLBACK_OUTCOME', readback_failure: 'COMMITTED' }[mode];
          assert.equal(receipt.mutationOutcome, expected, JSON.stringify(receipt.blockers));
          assert.deepEqual(mutations, statements.slice(0, ['third_statement', 'lost_rollback_ack'].includes(mode) ? 3 : 4));
          assert.equal(queries.filter(sql => sql === 'COMMIT').length, ['commit', 'lost_commit_ack', 'readback_failure'].includes(mode) ? 1 : 0);
          assert.ok(!queries.some(sql => sql.startsWith('REVOKE')));
          for (const sql of queries) assert.doesNotMatch(sql, /\bFROM\s+(trust|editorial)\./i);
          const actual = await snapshot(admin);
          const committed = ['commit', 'lost_commit_ack', 'readback_failure'].includes(mode);
          assert.ok(actual.checks.every(check => check.permitted === committed));
          if (committed) {
            assert.equal(receipt.introduced.length, 17);
            assert.equal(receipt.introduced.filter(entry => entry.grantor === TARGET.admin).length, 12);
            assert.equal(receipt.introduced.filter(entry => entry.grantor === 'postgres').length, 5);
          } else {
            assert.deepEqual(actual.objects.map(object => aclDigest(object.aclSnapshot)), before.objects.map(object => aclDigest(object.aclSnapshot)));
            assert.ok(actual.objects.flatMap(object => object.aclSnapshot).filter(item => item.kind === 'column').every(item => item.aclIsNull));
          }
          if (mode === 'commit') await readBackCommittedGrants({ role: TARGET.admin }, { role: TARGET.verifier }, receipt, connect);
          if (mode === 'readback_failure') {
            await assert.rejects(readBackCommittedGrants({ role: TARGET.admin }, { role: TARGET.verifier }, receipt,
              () => ({ connect: async () => { throw new Error('synthetic unavailable connection'); }, end: async () => {} })));
            assert.equal(receipt.mutationOutcome, 'COMMITTED');
          }
        } finally {
          await admin?.end(); await setup.end();
          await control.query(`DROP DATABASE ${quote(name)} WITH (FORCE)`); databases.delete(name);
        }
      });
    }
  } finally {
    for (const name of databases) await control.query(`DROP DATABASE ${quote(name)} WITH (FORCE)`);
    for (const role of ownedRoles.reverse()) await control.query(`DROP ROLE ${quote(role)}`);
    await control.end();
  }
});
