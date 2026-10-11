import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { identicalCommunityAppealOverride } from '../../../packages/db/src/community-appeal-closure.ts';

export async function postSafetyEvidenceFixture(connectionString) {
  const target = new URL(connectionString);
  assert.ok(['localhost', '127.0.0.1'].includes(target.hostname));
  assert.ok(target.pathname.startsWith('/lythaus_auth_test_post_'));
  const require = createRequire(new URL('../../../node_modules/wrangler/package.json', import.meta.url));
  const { build } = require('esbuild');
  const { Miniflare, convertV4MiniflareOptions, Log, LogLevel } = require('miniflare');
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const calls = [], statements = [], logs = [];
  const activeTransactions = new Set();
  let duringCall, externalRequests = 0;
  class FixtureLog extends Log {
    logWithLevel(level, message) { logs.push(String(message)); }
  }
  const bundle = await build({ absWorkingDir: root, bundle: true, write: false,
    format: 'esm', platform: 'neutral', target: 'es2022',
    stdin: { resolveDir: root, contents: `
      import { preparePostSafetyEvidence } from './apps/lythaus-jobs/src/post-safety-evidence.ts';
      import { createOpenAIModerationProvider } from './packages/authenticity/src/openai-moderation.ts';
      export default { async fetch(request, env) {
        if (new URL(request.url).pathname === '/outbound') {
          try {
            const response = await fetch('https://api.openai.com/v1/moderations');
            return Response.json({ denied: !response.ok });
          }
          catch { return Response.json({ denied: true }); }
          return Response.json({ denied: false });
        }
        const input = await request.json(), trace = crypto.randomUUID();
        let factoryCalls = 0, hashCalls = 0, loads = 0, aborted = false;
        const dependencies = {
          async readSnapshot(revision, phase) {
            loads++;
            if (input.scenario === 'loader_rejection') throw new Error('synthetic-secret-body-token');
            if (input.scenario === 'late_loader_rejection' && phase === 'after') throw new Error('synthetic-secret-body-token');
            const response = await env.DISPOSABLE_POSTGRES.fetch('https://fixture.invalid/snapshot', {
              method: 'POST', body: JSON.stringify({ revision, trace }),
            });
            if (!response.ok) throw new Error('fixture_db_unavailable');
            const snapshot = await response.json();
            if (input.scenario === 'missing_protection' || input.scenario === 'late_missing_protection' && phase === 'after') delete snapshot.protection;
            return snapshot;
          },
          async hashBody(body) {
            hashCalls++;
            if (input.scenario === 'invalid_hash') return 'invalid';
            const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body));
            return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
          },
          now: () => Date.now(),
          createProvider(options) {
            factoryCalls++;
            if (input.scenario === 'factory_rejection') throw new Error('synthetic-secret-body-token');
            if (input.scenario === 'missing_method') return {};
            if (input.scenario === 'provider_rejection') return { async analyseText() { throw new Error('synthetic-secret-body-token'); } };
            const provider = createOpenAIModerationProvider({ ...options,
              apiKey: input.scenario === 'missing_credential' ? undefined : 'synthetic-post-safety-key',
              endpoint: 'https://moderation.synthetic.invalid/v1/moderations',
              fetchImpl: async (url, init) => {
                if (input.scenario === 'network') throw new Error('synthetic-secret-body-token');
                if (input.scenario === 'timeout') return new Promise((resolve, reject) => {
                  const abort = () => { aborted = true; reject(new Error('AbortError')); };
                  if (init.signal.aborted) abort(); else init.signal.addEventListener('abort', abort, { once: true });
                });
                return env.SYNTHETIC_PROVIDER.fetch(url, { ...init, headers: {
                  ...init.headers, 'x-fixture-scenario': input.scenario ?? 'safe', 'x-fixture-trace': trace,
                }});
              },
            });
            if (input.scenario === 'malformed_analysis') return { async analyseText(value) {
              const analysis = await provider.analyseText(value);
              return { ...analysis, modelVersion: null, rawResponse: 'synthetic-secret-body-token' };
            }};
            return provider;
          },
        };
        if (input.omit) delete dependencies[input.omit];
        const result = await preparePostSafetyEvidence(input, dependencies);
        return Response.json({ result, diagnostic: { factoryCalls, hashCalls, loads, aborted } });
      }};
    ` },
  });
  const runtime = new Miniflare(convertV4MiniflareOptions({ log: new FixtureLog(LogLevel.VERBOSE), workers: [{
    name: 'post-safety-preparation-local', modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: '2026-08-01', compatibilityFlags: ['nodejs_compat'],
    outboundService: () => { externalRequests++; throw new Error('Local fixture refuses external requests'); },
    serviceBindings: {
      DISPOSABLE_POSTGRES: async request => {
        const { revision, trace } = await request.json();
        const client = new pg.Client({ connectionString, ssl: false, connectionTimeoutMillis: 5000 });
        await client.connect();
        const query = async (text, values) => {
          assert.match(text, /^\s*SELECT\b/i);
          statements.push(text);
          return client.query(text, values);
        };
        try {
          await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
          activeTransactions.add(trace);
          await client.query("SET LOCAL statement_timeout='5s'");
          await client.query("SET LOCAL lock_timeout='2s'");
          await client.query("SET LOCAL idle_in_transaction_session_timeout='5s'");
          await client.query('SET LOCAL ROLE lythaus_jobs');
          const sourceEvent = (await query(`SELECT id, event_type AS "eventType", aggregate_type AS "aggregateType",
            aggregate_id AS "aggregateId", actor_id AS "actorId", payload FROM system.outbox_events WHERE id=$1`, [revision.sourceEventId])).rows[0];
          const post = (await query(`SELECT id, author_id AS "authorId", body, declared_creation_mode AS "declaredCreationMode",
            moderation_source_event_id AS "sourceEventId", moderation_state AS "moderationState", deleted_at AS "deletedAt"
            FROM content.posts WHERE id=$1`, [revision.contentId])).rows[0];
          const account = post ? (await query('SELECT id,status,deleted_at AS "deletedAt" FROM identity.users WHERE id=$1', [post.authorId])).rows[0] : undefined;
          const override = post ? await identicalCommunityAppealOverride({ query }, {
            contentType: 'post', contentId: post.id, sourceEventId: revision.sourceEventId,
            body: post.body, declaredCreationMode: post.declaredCreationMode,
          }) : false;
          const hold = await query(`SELECT 1 FROM moderation.cases c JOIN LATERAL (
              SELECT id,outcome,policy_version FROM moderation.decisions WHERE case_id=c.id ORDER BY created_at DESC,id DESC LIMIT 1
            ) d ON true WHERE c.content_type='post' AND c.content_id=$1 AND c.source_event_id=$2
            AND c.state<>'superseded' AND d.outcome IN ('block','queue')
            AND NOT (d.outcome='queue' AND d.policy_version='evaluation-only-v1')
            AND NOT EXISTS (SELECT 1 FROM moderation.community_appeal_overrides o WHERE o.decision_id=d.id) LIMIT 1`,
          [revision.contentId, revision.sourceEventId]);
          await client.query('COMMIT');
          return Response.json({ sourceEvent, post, account,
            protection: { identicalScopedPeerOverride: override, independentHold: hold.rowCount > 0 } });
        } catch {
          await client.query('ROLLBACK');
          return Response.json({ error: 'fixture_snapshot_unavailable' }, { status: 500 });
        } finally { activeTransactions.delete(trace); await client.end(); }
      },
      SYNTHETIC_PROVIDER: async request => {
        assert.equal(request.url, 'https://moderation.synthetic.invalid/v1/moderations');
        assert.equal(request.method, 'POST');
        assert.equal(request.headers.get('authorization'), 'Bearer synthetic-post-safety-key');
        assert.equal(activeTransactions.has(request.headers.get('x-fixture-trace')), false,
          'no DB transaction for this attempt remains open during provider call');
        const body = await request.json(), scenario = request.headers.get('x-fixture-scenario');
        calls.push({ body, scenario });
        if (duringCall) await duringCall({ body, scenario });
        if (/^http_/.test(scenario)) return Response.json({ error: {
          message: 'synthetic-secret-body-token', type: 'synthetic-secret-body-token', code: 'synthetic-secret-body-token', param: 'synthetic-secret-body-token',
        } }, { status: Number(scenario.slice(5)) });
        if (scenario === 'redirect') return new Response(null, { status: 307,
          headers: { location: 'https://redirect-target.synthetic.invalid/collect' } });
        if (scenario === 'malformed_json') return new Response('{broken');
        const response = { model: 'omni-moderation-latest', results: [{ flagged: scenario === 'flagged',
          categories: { harassment: scenario === 'flagged' }, category_scores: { harassment: scenario === 'flagged' ? 0.9 : 0.01 },
          category_applied_input_types: { harassment: ['text'] } }] };
        if (scenario === 'malformed_model') response.model = 'unapproved-model';
        if (scenario === 'malformed_schema') response.results[0].flagged = 'false';
        if (scenario === 'malformed_scores') response.results[0].category_scores.harassment = 2;
        if (scenario === 'unsafe_metadata') response.results[0].category_applied_input_types.harassment = ['synthetic-secret-body-token'];
        return Response.json(response);
      },
    },
  }] }));
  return { calls, statements, logs, get externalRequests() { return externalRequests; },
    set duringCall(value) { duringCall = value; },
    dispatchFetch: (...args) => runtime.dispatchFetch(...args),
    dispose: () => runtime.dispose(),
  };
}
