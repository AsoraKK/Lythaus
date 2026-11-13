import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { installReputationLockFunctionFixture } from '../../lythaus-jobs/tests/helpers/install-reputation-lock-fixture.mjs';
import { isAllowedLocalPostgres17Host } from '../../../scripts/ci/postgres17-host-policy.mjs';

export async function nativePostgresPrivacyWorkflowFixture(connectionString, { supportPolicy, onStep, afterQuery } = {}) {
  const target = new URL(connectionString);
  assert.ok(isAllowedLocalPostgres17Host(target.hostname));
  assert.ok(target.pathname.startsWith('/lythaus_auth_test') || target.pathname.startsWith('/lythaus_support_test_workflow_')
    || (process.env.GITHUB_ACTIONS === 'true' && target.pathname === '/postgres'));
  const installer = new pg.Client({ connectionString, ssl: false, connectionTimeoutMillis: 5000 });
  await installer.connect();
  try {
    assert.equal((await installer.query('SELECT current_user AS role')).rows[0].role, 'postgres');
    await installReputationLockFunctionFixture(installer, 'lythaus_jobs');
  } finally { await installer.end(); }
  const require = createRequire(new URL('../../../node_modules/wrangler/package.json', import.meta.url));
  const { build } = require('esbuild');
  const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const clients = new Map();
  const statements = [];
  const steps = [];
  let sequence = 0;
  const bundle = await build({ absWorkingDir: root, bundle: true, write: false,
    format: 'esm', platform: 'node', target: 'es2022', external: ['cloudflare:workers'],
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire('file:///fixture.mjs');" },
    plugins: [{ name: 'disposable-workflow-postgres-transport', setup(builder) {
      builder.onLoad({ filter: /packages\/db\/src\/index\.ts$/ }, args => {
        const original = readFileSync(args.path, 'utf8');
        const start = original.indexOf('export async function query<');
        const end = original.indexOf('export function assertVerifyFull(');
        assert.ok(start > 0 && end > start);
        return { loader: 'ts', contents: original.slice(0, start) + `
          import { env as fixtureEnv } from 'cloudflare:workers';
          async function fixtureSql(input) {
            const response = await fixtureEnv.DISPOSABLE_POSTGRES.fetch('https://fixture.invalid/sql', {
              method: 'POST', body: JSON.stringify(input), headers: { 'content-type': 'application/json' },
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error);
            return result;
          }
          export async function query(binding, text, values = []) {
            return fixtureSql({ action: 'query', role: binding.role, text, values });
          }
          export async function transaction(binding, work) {
            const { transactionId } = await fixtureSql({ action: 'begin', role: binding.role });
            try {
              const result = await work({ query: (text, values = []) => fixtureSql({ action: 'query', transactionId, text, values }) });
              await fixtureSql({ action: 'commit', transactionId });
              return result;
            } catch (error) {
              await fixtureSql({ action: 'rollback', transactionId });
              throw error;
            }
          }
        ` + original.slice(end) };
      });
    } }],
    stdin: { resolveDir: root, contents: `
      import { AccountExportWorkflow, AccountDeleteWorkflow, RetentionCleanupWorkflow } from './apps/lythaus-jobs/src/index.ts';
      function boundedStep(step, env, instanceId) {
        async function trace(name, state) {
          await env.FIXTURE_TRACE.fetch('https://fixture.invalid/step', {
            method: 'POST', body: JSON.stringify({ instanceId, name, state }),
          });
        }
        return {
          async do(name, ...args) {
            const callback = args.at(-1);
            await trace(name, 'started');
            try {
              const result = await step.do(name, { ...(args.length > 1 ? args[0] : {}),
                retries: { limit: 0, delay: '1 second', backoff: 'constant' } }, callback);
              await trace(name, 'succeeded');
              return result;
            } catch (error) { await trace(name, 'failed'); throw error; }
          },
          async sleep(name) {
            await trace(name, 'started');
            await step.sleep(name, '1 millisecond');
            await trace(name, 'succeeded');
          },
        };
      }
      export class FixtureAccountExport extends AccountExportWorkflow {
        run(event, step) { return super.run(event, boundedStep(step, this.env, event.instanceId)); }
      }
      export class FixtureAccountDelete extends AccountDeleteWorkflow {
        run(event, step) { return super.run(event, boundedStep(step, this.env, event.instanceId)); }
      }
      export class FixtureRetentionCleanup extends RetentionCleanupWorkflow {
        run(event, step) { return super.run(event, boundedStep(step, this.env, event.instanceId)); }
      }
      export default { async fetch(request, env) {
        const url = new URL(request.url);
        if (url.pathname === '/__fixture/workflow') {
          const input = await request.json();
          const workflows = { export: env.ACCOUNT_EXPORT, delete: env.ACCOUNT_DELETE, retention: env.RETENTION_CLEANUP };
          const workflow = workflows[input.kind];
          if (!workflow) return Response.json({ error: 'Unknown fixture workflow' }, { status: 400 });
          if (input.action === 'create') {
            const instance = await workflow.create({ params: input.params });
            return Response.json({ id: instance.id });
          }
          if (input.action === 'terminate') {
            await (await workflow.get(input.id)).terminate();
            return Response.json({ terminated: true });
          }
          if (input.action === 'status') return Response.json(await (await workflow.get(input.id)).status());
          return Response.json({ error: 'Unknown fixture workflow action' }, { status: 400 });
        }
        if (url.pathname === '/__fixture/r2') {
          const input = await request.json();
          const buckets = { PRIVATE_EXPORTS: env.PRIVATE_EXPORTS, MEDIA_APPROVED: env.MEDIA_APPROVED, MEDIA_QUARANTINE: env.MEDIA_QUARANTINE };
          const bucket = buckets[input.bucket];
          if (!bucket) return Response.json({ error: 'Unknown fixture bucket' }, { status: 400 });
          if (input.action === 'put') {
            await bucket.put(input.key, input.body, input.options);
            return Response.json({ stored: true });
          }
          if (input.action === 'delete') {
            await bucket.delete(input.key);
            return Response.json({ deleted: true });
          }
          if (input.action === 'list') return Response.json(await bucket.list(input.options));
          const object = await bucket.get(input.key);
          return Response.json(object ? { body: await object.text(), httpMetadata: object.httpMetadata } : null);
        }
        return new Response('Disposable privacy workflow fixture');
      } };
    ` },
  });
  const runtime = new Miniflare(convertV4MiniflareOptions({ workers: [{
    name: 'profile-privacy-workflows-local', modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: '2026-07-27', compatibilityFlags: ['nodejs_compat'],
    bindings: { DB_PRIVACY_FRESH: { role: 'lythaus_privacy' }, DB_JOBS_FRESH: { role: 'lythaus_jobs' },
      AUTHENTICITY_BETA_STORAGE_ENABLED: 'true',
      ...(supportPolicy ? { SUPPORT_FEEDBACK_POLICY: JSON.stringify(supportPolicy) } : {}) },
    r2Buckets: ['PRIVATE_EXPORTS', 'MEDIA_APPROVED', 'MEDIA_QUARANTINE'],
    workflows: { ACCOUNT_EXPORT: { name: 'profile-export-local', className: 'FixtureAccountExport' },
      ACCOUNT_DELETE: { name: 'profile-delete-local', className: 'FixtureAccountDelete' },
      RETENTION_CLEANUP: { name: 'support-retention-local', className: 'FixtureRetentionCleanup' } },
    serviceBindings: {
      FIXTURE_TRACE: async request => {
        const trace = await request.json(); steps.push(trace);
        await onStep?.(trace);
        return new Response(null, { status: 204 });
      },
      DISPOSABLE_POSTGRES: async request => {
        const input = await request.json();
        const temporary = !input.transactionId;
        let entry = clients.get(input.transactionId);
        try {
          if (temporary) {
            assert.ok(['lythaus_privacy', 'lythaus_jobs'].includes(input.role));
            const client = new pg.Client({ connectionString, ssl: false, connectionTimeoutMillis: 5000 });
            await client.connect();
            entry = { client, role: input.role };
            await client.query("SET statement_timeout='5s'");
            await client.query('SET ROLE ' + input.role);
          }
          assert.ok(entry);
          const { client, role } = entry;
          if (input.action === 'begin') {
            await client.query('BEGIN');
            const transactionId = String(++sequence);
            clients.set(transactionId, entry);
            return Response.json({ transactionId });
          }
          if (input.action === 'query') {
            const statement = { role, text: input.text, values: input.values };
            statements.push(statement);
            try {
              const result = await client.query(input.text, input.values);
              await afterQuery?.(input, result);
              return Response.json({ rows: result.rows, rowCount: result.rowCount });
            } catch (error) { statement.error = error.message; throw error; }
          }
          assert.ok(['commit', 'rollback'].includes(input.action));
          await client.query(input.action === 'commit' ? 'COMMIT' : 'ROLLBACK');
          return Response.json({ completed: true });
        } catch (error) {
          return Response.json({ error: error.message }, { status: 500 });
        } finally {
          if ((temporary && input.action !== 'begin') || ['commit', 'rollback'].includes(input.action)) {
            clients.delete(input.transactionId);
            await entry?.client.end();
          }
        }
      },
    },
  }] }));
  // Route local test access through the worker because Miniflare's getBindings() stalls with Workflows enabled.
  async function fixtureRequest(path, input) {
    const response = await runtime.dispatchFetch(`https://fixture.invalid${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? `Fixture request failed (${response.status})`);
    return result;
  }
  function bucket(name) {
    return {
      async put(key, body, options) { return fixtureRequest('/__fixture/r2', { action: 'put', bucket: name, key, body, options }); },
      async delete(key) { return fixtureRequest('/__fixture/r2', { action: 'delete', bucket: name, key }); },
      async list(options) { return fixtureRequest('/__fixture/r2', { action: 'list', bucket: name, options }); },
      async get(key) {
        const object = await fixtureRequest('/__fixture/r2', { action: 'get', bucket: name, key });
        return object && { httpMetadata: object.httpMetadata,
          async text() { return object.body; }, async json() { return JSON.parse(object.body); } };
      },
    };
  }
  return { statements, steps,
    bucket,
    async run(kind, params) {
      assert.ok(['export', 'delete', 'retention'].includes(kind));
      const { id } = await fixtureRequest('/__fixture/workflow', { action: 'create', kind, params });
      const deadline = Date.now() + 30_000;
      let status;
      do {
        status = await fixtureRequest('/__fixture/workflow', { action: 'status', kind, id });
        if (['complete', 'errored', 'terminated'].includes(status.status)) return status;
        await setTimeout(20);
      } while (Date.now() < deadline);
      await fixtureRequest('/__fixture/workflow', { action: 'terminate', kind, id });
      throw new Error('Disposable workflow timeout: ' + JSON.stringify(status));
    },
    async dispose() {
      await runtime.dispose();
      await Promise.all([...clients.values()].map(({ client }) => client.end()));
      clients.clear();
    },
  };
}
