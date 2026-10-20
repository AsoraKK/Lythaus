import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

export async function postModerationFixture(connectionString, bindings, { simulateSubjectLock = false } = {}) {
  const target = new URL(connectionString);
  assert.ok(['localhost', '127.0.0.1'].includes(target.hostname));
  assert.ok(target.pathname.startsWith('/lythaus_auth_test_post_'));
  const require = createRequire(new URL('../../../node_modules/wrangler/package.json', import.meta.url));
  const { build } = require('esbuild');
  const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const clients = new Map(), deliveries = [], statements = [], sqlErrors = [];
  const modelCallFixtureId = randomUUID();
  const modelCallMetrics = new pg.Pool({ connectionString, ssl: false, max: 8 });
  let sequence = 0, failModel = false, failQueue = false, duringSql, afterSql, failSql;
  const bundle = await build({ absWorkingDir: root, bundle: true, write: false,
    format: 'esm', platform: 'node', target: 'es2022', external: ['cloudflare:workers'],
    banner: { js: "import { createRequire } from 'node:module'; const require = createRequire('file:///fixture.mjs');" },
    plugins: [{ name: 'local-postgres', setup(builder) {
      builder.onResolve({ filter: /^pg$/ }, () => ({ path: 'fixture-pg', namespace: 'fixture-pg' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture-pg' }, () => ({ loader: 'js', contents: `
        import { env as fixtureEnv } from 'cloudflare:workers';
        async function fixtureSql(input) {
          const response = await fixtureEnv.DISPOSABLE_POSTGRES.fetch('https://fixture.invalid/sql', {
            method: 'POST', body: JSON.stringify(input), headers: { 'content-type': 'application/json' },
          });
          const result = await response.json();
          if (!response.ok) { const error = new Error(result.error); error.code = result.code; throw error; }
          return result;
        }
        export class DatabaseError extends Error {}
        export class Client {
          constructor({ connectionString }) { this.role = new URL(connectionString).username; }
          on() { return this; } removeListener() { return this; }
          async connect() { this.id = (await fixtureSql({ action: 'connect', role: this.role })).transactionId; }
          query(text, values = []) { return fixtureSql({ action: 'query', transactionId: this.id, text, values }); }
          end() { return fixtureSql({ action: 'close', transactionId: this.id }); }
        }
      ` }));
    } }],
    stdin: { resolveDir: root, contents: `
      import api from './apps/lythaus-public-api/src/index.ts';
      import jobs from './apps/lythaus-jobs/src/index.ts';
      export default { async fetch(request, env, ctx) {
        const path = new URL(request.url).pathname;
        env.AI = { async run() {
          const response = await env.FIXTURE_MODEL.fetch('https://fixture.invalid/model');
          if (!response.ok) throw new Error('synthetic_provider_unavailable');
          return response.json();
        }};
        if (path === '/fixture/queue') {
          const body = await request.json();
          let ack = 0, retry = 0;
          await jobs.queue({ queue: 'lythaus-moderation-dev', messages: [{ id: body.eventId,
            body, ack() { ack++; }, retry() { retry++; } }] }, env);
          return Response.json({ ack, retry });
        }
        if (path === '/fixture/relay') {
          for (const name of ['MODERATION_QUEUE', 'AUDIT_QUEUE', 'FEED_QUEUE', 'NOTIFICATIONS_QUEUE'])
            env[name] = { async send(body) {
              const response = await env.FIXTURE_QUEUE.fetch('https://fixture.invalid/queue', {
                method: 'POST', body: JSON.stringify({ queue: name, body }),
              });
              if (!response.ok) throw new Error('synthetic_queue_unavailable');
            }};
          await jobs.scheduled({}, env);
          return Response.json({ completed: true });
        }
        return api.fetch(request, env, ctx);
      }};
    ` },
  });
  const runtime = new Miniflare(convertV4MiniflareOptions({ workers: [{
    name: 'post-incident-local', modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: '2026-07-27', compatibilityFlags: ['nodejs_compat'],
    bindings: { ...bindings, ...Object.fromEntries([['DB_APP_FRESH', 'lythaus_runtime'],
      ['DB_JOBS_FRESH', 'lythaus_jobs'], ['DB_PRIVACY_FRESH', 'lythaus_privacy']].map(([name, role]) =>
        [name, { connectionString: 'postgresql://' + role + '@fixture.hyperdrive.local/fixture?sslmode=disable' }])),
      AUTHENTICITY_AI_ENABLED: 'true', AUTHENTICITY_ALPHA_ENABLED: 'false',
      AUTHENTICITY_BETA_ENABLED: 'false', MEDIA_UPLOADS_ENABLED: 'false',
      AUTHENTICITY_TEXT_MODEL: '@cf/openai/gpt-oss-20b', AI_GATEWAY_ID: 'lythaus-ai',
      COST_BUDGET_ENABLED: 'true', COST_BUDGET_PERIOD_PREFIX: 'synthetic-post-test',
    },
    outboundService: () => { throw new Error('Local fixture refuses external requests'); },
    serviceBindings: {
      FIXTURE_MODEL: async () => {
        await modelCallMetrics.query(`INSERT INTO system.audit_events
          (id,action,target_type,correlation_id,metadata)
          VALUES($1,'test.fixture.authenticity_model_called','test_fixture',$2,$3::jsonb)`,
        [randomUUID(), modelCallFixtureId, JSON.stringify({ fixtureId: modelCallFixtureId })]);
        if (failModel) return new Response(null, { status: 503 });
        return Response.json({ response: JSON.stringify({ riskScore: 0.1,
          signals: [{ category: 'synthetic_evidence', confidence: 0.5, rationale: 'Local fixture only' }] }) });
      },
      FIXTURE_QUEUE: async request => {
        const delivery = await request.json();
        deliveries.push(delivery);
        return new Response(null, { status: failQueue === delivery.body.eventId ? 503 : 204 });
      },
      DISPOSABLE_POSTGRES: async request => {
        const input = await request.json();
        const temporary = !input.transactionId;
        let client = clients.get(input.transactionId);
        try {
          if (temporary) {
            assert.ok(['lythaus_runtime', 'lythaus_jobs', 'lythaus_privacy'].includes(input.role));
            client = new pg.Client({ connectionString, ssl: false, connectionTimeoutMillis: 5000 });
            await client.connect();
            await client.query("SET statement_timeout='5s'");
            await client.query('SET ROLE ' + input.role); client.fixtureRole = input.role;
          }
          assert.ok(client);
          if (input.action === 'connect') {
            const transactionId = String(++sequence);
            clients.set(transactionId, client);
            return Response.json({ transactionId });
          }
          if (input.action === 'query') {
            const diagnostic = { ...input, role: client.fixtureRole, backendPid: client.processID };
            statements.push(diagnostic);
            if (duringSql) await duringSql(diagnostic);
            if (failSql && input.text.includes(failSql.match) && failSql.remaining > 0) {
              failSql.remaining--; throw new Error('synthetic_interrupted_database_write');
            }
            let result;
            if (simulateSubjectLock && input.text.includes("to_regprocedure('trust.lock_reputation_subject(uuid)')")) {
              result = { rows: [{ available: true }], rowCount: 1, command: 'SELECT' };
            } else if (simulateSubjectLock && input.text === 'SELECT status FROM trust.lock_reputation_subject($1::pg_catalog.uuid)') {
              assert.equal(client.fixtureRole, 'lythaus_jobs');
              await client.query('RESET ROLE');
              try { result = await client.query('SELECT status FROM identity.users WHERE id=$1 FOR UPDATE', input.values); }
              finally { await client.query('SET ROLE lythaus_jobs'); }
            } else result = await client.query(input.text, input.values);
            if (afterSql) await afterSql({ ...diagnostic, command: result.command });
            return Response.json({ rows: result.rows, rowCount: result.rowCount, command: result.command });
          }
          assert.equal(input.action, 'close');
          return Response.json({ completed: true });
        } catch (error) {
          sqlErrors.push({ code: error.code, text: input.text, role: client?.fixtureRole });
          return Response.json({ error: error.message, code: error.code }, { status: 500 });
        }
        finally {
          if ((temporary && input.action !== 'connect') || input.action === 'close') {
            clients.delete(input.transactionId);
            await client?.end();
          }
        }
      },
    },
  }] }));
  return { deliveries, statements, sqlErrors, simulateSubjectLock,
    set duringSql(value) { duringSql = value; }, set afterSql(value) { afterSql = value; }, set failSql(value) { failSql = value; },
    async modelCallCount() {
      const result = await modelCallMetrics.query(`SELECT count(*)::int AS count FROM system.audit_events
        WHERE action='test.fixture.authenticity_model_called' AND metadata->>'fixtureId'=$1`, [modelCallFixtureId]);
      return result.rows[0].count;
    },
    set failModel(value) { failModel = value; }, set failQueue(value) { failQueue = value; },
    dispatchFetch: (...args) => runtime.dispatchFetch(...args),
    async dispose() {
      await runtime.dispose();
      await Promise.all([...clients.values()].map(client => client.end()));
      await modelCallMetrics.end();
      clients.clear();
    },
  };
}
