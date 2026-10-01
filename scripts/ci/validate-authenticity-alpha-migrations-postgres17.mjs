import assert from 'node:assert/strict';
import pg from 'pg';
import { loadApprovedMigrations } from './planetscale-migration-manifest.mjs';
import { assertCompleteMigrationPostconditions, classifyMigrationState } from './planetscale-migration-reconciliation.mjs';

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
const target = new URL(connectionString ?? 'postgresql://invalid');
if (!['localhost', '127.0.0.1', '::1'].includes(target.hostname) || !/^\/lythaus_alpha_/.test(target.pathname)) throw new Error('Fresh disposable local lythaus_alpha_ database required');
const client = new pg.Client({ connectionString, ssl: false });
await client.connect();
try {
  const version = Number((await client.query("SELECT current_setting('server_version_num')::integer AS n")).rows[0].n);
  assert.ok(version >= 170000 && version < 180000);
  assert.equal((await client.query("SELECT to_regnamespace('identity') AS n")).rows[0].n, null, 'Refuse an already initialized database');
  const { migrations } = loadApprovedMigrations();
  const catalog = async () => (await client.query(`
    WITH namespaces AS (
      SELECT oid,nspname,nspacl FROM pg_namespace
      WHERE nspname IN ('identity','content','social','feed','moderation','privacy','trust','media','editorial','marketing','system')
    ), relations AS (
      SELECT c.oid,n.nspname,c.relname,c.relkind,c.relacl FROM pg_class c JOIN namespaces n ON n.oid=c.relnamespace
    ), objects AS (
      SELECT 'schema' AS kind,nspname AS name,jsonb_build_object('acl',nspacl) AS definition FROM namespaces
      UNION ALL
      SELECT 'relation',nspname||'.'||relname,jsonb_build_object('kind',relkind,'acl',relacl) FROM relations
      UNION ALL
      SELECT 'column',r.nspname||'.'||r.relname||'.'||a.attname,
        jsonb_build_object('type',format_type(a.atttypid,a.atttypmod),'notNull',a.attnotnull,
          'identity',a.attidentity,'generated',a.attgenerated,'acl',a.attacl,
          'default',pg_get_expr(d.adbin,d.adrelid))
      FROM relations r JOIN pg_attribute a ON a.attrelid=r.oid
      LEFT JOIN pg_attrdef d ON d.adrelid=r.oid AND d.adnum=a.attnum
      WHERE a.attnum>0 AND NOT a.attisdropped
      UNION ALL
      SELECT 'constraint',n.nspname||'.'||c.conname,jsonb_build_object('definition',pg_get_constraintdef(c.oid))
      FROM pg_constraint c JOIN namespaces n ON n.oid=c.connamespace
      UNION ALL
      SELECT 'index',r.nspname||'.'||r.relname,jsonb_build_object('definition',pg_get_indexdef(r.oid))
      FROM relations r WHERE r.relkind='i'
      UNION ALL
      SELECT 'function',n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
        jsonb_build_object('definition',pg_get_functiondef(p.oid),'acl',p.proacl)
      FROM pg_proc p JOIN namespaces n ON n.oid=p.pronamespace WHERE p.prokind IN ('f','p')
    ) SELECT coalesce(jsonb_agg(to_jsonb(objects) ORDER BY kind,name,definition::text),'[]'::jsonb) AS snapshot FROM objects
  `)).rows[0].snapshot;
  for (const migration of migrations) {
    if (migration.name >= '0017_') {
      const before = await catalog();
      await client.query('BEGIN');
      try {
        await client.query(migration.contents.toString('utf8'));
        const [state] = await classifyMigrationState(client, [migration.name]);
        assertCompleteMigrationPostconditions(state);
      } finally { await client.query('ROLLBACK'); }
      assert.deepEqual(await catalog(), before, 'DDL rollback must restore columns, constraints, indexes, functions and grants');
      console.log(`PASS: ${migration.name} forward and transaction rollback`);
    }
    await client.query('BEGIN');
    try { await client.query(migration.contents.toString('utf8')); await client.query('COMMIT'); }
    catch (error) { await client.query('ROLLBACK'); throw error; }
  }
  for (const state of await classifyMigrationState(client, migrations.filter(m => m.name >= '0017_').map(m => m.name))) assertCompleteMigrationPostconditions(state);
  console.log('PASS: 0016 -> 0017 -> 0018 -> 0019 -> 0020, canonical checksums, isolated PG17; no production downgrade');
} finally { await client.end(); }
