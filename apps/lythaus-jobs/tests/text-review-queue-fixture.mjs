import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';

export const fixtureId = n => '019a0000-0000-7000-8000-' + String(n).padStart(12, '0');
const hash = value => createHash('sha256').update(value).digest('hex');
export const fixtureDigest = value => hash(JSON.stringify(value));

export async function textReviewQueueFixture() {
  const require = createRequire(new URL('../../../node_modules/wrangler/package.json', import.meta.url));
  const { build } = require('esbuild');
  const { Miniflare, convertV4MiniflareOptions, Log, LogLevel } = require('miniflare');
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  let data, sequence = 0, modelCalls = 0, externalRequests = 0, duringModel, failure, modelResponse, failModel;
  const sessions = new Map(), statements = [], errors = [], budgetKeys = [];
  function reset(type = 'post') {
    const row = { id: fixtureId(1), author_id: fixtureId(2), body: 'Synthetic text revision', declared_creation_mode: 'human',
      moderation_state: 'under_review', moderation_source_event_id: fixtureId(3), deleted_at: null, published_at: null };
    const payload = { [type + 'Id']: row.id, sourceEventId: row.moderation_source_event_id,
      bodyHash: hash(row.body), declaredCreationMode: 'human' };
    data = { type, row, author: { status: 'active', deleted_at: null }, capability: true, hold: false, overrides: [],
      source: { id: row.moderation_source_event_id, event_type: `content.${type}.created`, aggregate_type: type,
        aggregate_id: row.id, actor_id: row.author_id, payload },
      inbox: {}, detectors: [], cases: [], decisions: [], provenance: [], activity: [], audit: [], declaration: null };
    modelResponse = { riskScore: 0, signals: [{ category: 'synthetic_fixture', confidence: 1, rationale: 'Synthetic only' }] };
    failModel = false; failure = undefined; duringModel = undefined; statements.length = 0; errors.length = 0; budgetKeys.length = 0;
    return event();
  }
  const event = () => ({ eventId: data.source.id, eventType: data.source.event_type, payload: structuredClone(data.source.payload) });
  const result = (rows = [], rowCount = rows.length, command = 'SELECT') => ({ rows, rowCount, command });
  function execute(state, sql, v) {
    if (sql.includes('INSERT INTO system.consumer_inbox')) {
      if (state.inbox[v[0]]) return result([], 0, 'INSERT');
      state.inbox[v[0]] = { state: 'processing', claimed_at: new Date().toISOString() }; return result([], 1, 'INSERT');
    }
    if (sql.includes('SELECT state, claimed_at FROM system.consumer_inbox')) return result(state.inbox[v[0]] ? [state.inbox[v[0]]] : []);
    if (sql.includes('UPDATE system.consumer_inbox') && sql.includes('claimed_at = now()')) return result([], 0, 'UPDATE');
    if (sql.includes("UPDATE system.consumer_inbox SET state = 'completed'")) { state.inbox[v[0]].state = 'completed'; return result([], 1, 'UPDATE'); }
    if (sql.includes('DELETE FROM system.consumer_inbox')) { delete state.inbox[v[0]]; return result([], 1, 'DELETE'); }
    if (sql.includes('has_function_privilege')) return result([{ available: state.capability }]);
    if (sql.includes('SELECT trust.lock_active_post_review_author')) return result([{ locked: state.author.status === 'active'
      && state.author.deleted_at === null && state.row.author_id === v[2] && state.row.moderation_source_event_id === v[1] }]);
    if (sql.includes('SELECT id FROM moderation.cases')) return result(state.cases.map(c => ({ id: c.id })));
    if (sql.includes('FROM content.posts post JOIN identity.users')) return result(state.row.id === v[0]
      ? [{ ...state.row, author_status: state.author.status, author_deleted_at: state.author.deleted_at }] : []);
    if (sql.includes('FROM content.comments')) return result(state.row.id === v[0] && state.row.deleted_at === null ? [state.row] : []);
    if (sql.includes('SELECT status, deleted_at FROM identity.users')) return result([state.author]);
    if (sql.includes('SELECT id, event_type, aggregate_type, aggregate_id, actor_id, payload FROM system.outbox_events'))
      return result(state.source.id === v[0] ? [state.source] : []);
    if (sql.includes('FROM moderation.community_appeal_overrides')) return result(state.overrides.filter(o =>
      o.content_type === v[0] && o.content_id === v[1] && o.source_event_id === v[2] && o.content_hash === v[3]));
    if (sql.includes('SELECT provider, model_version, signal FROM moderation.detector_runs')) return result(state.detectors.map(r =>
      ({ provider: r.provider, model_version: r.model_version, signal: r.signal })));
    if (sql.includes('SELECT 1 FROM moderation.cases c LEFT JOIN LATERAL')) return result(state.hold ? [{ hold: true }] : []);
    if (sql.includes('SELECT 1 FROM moderation.cases')) return result(state.hold ? [{ hold: true }]
      : state.cases.filter(c => c.source_event_id === v[1] && c.state !== 'superseded'));
    if (sql.includes('SELECT 1 FROM moderation.detector_runs')) return result(state.detectors.filter(r => r.provider === v[0] && r.source_event_id === v[1]));
    if (sql.includes('INSERT INTO moderation.detector_runs')) {
      const comment = sql.includes("'comment'");
      const row = { id: v[0], content_type: comment ? 'comment' : 'post', content_id: v[1], provider: v[2],
        model_version: comment ? 'manual-review-v1' : v[3], signal: JSON.parse(v[comment ? 3 : 4]), source_event_id: v[comment ? 4 : 5] };
      if (state.detectors.some(r => r.provider === row.provider && r.source_event_id === row.source_event_id)) return result([], 0, 'INSERT');
      state.detectors.push(row); return result([{ id: row.id }], 1, 'INSERT');
    }
    if (sql.includes('UPDATE moderation.cases')) { for (const c of state.cases) if (c.source_event_id !== v[1] && c.state === 'open') c.state = 'superseded'; return result([], 1, 'UPDATE'); }
    if (sql.includes('INSERT INTO content.content_declarations')) { state.declaration = { signal: JSON.parse(v[4]), public_label: 'Under review', review_required: true }; return result([], 1, 'INSERT'); }
    if (sql.includes('INSERT INTO moderation.cases')) {
      if (state.cases.some(c => c.source_event_id === v[3])) return result([], 0, 'INSERT');
      state.cases.push({ id: v[0], content_type: state.type, content_id: v[1], policy_version: v[2], source_event_id: v[3], state: 'open' });
      return result([{ id: v[0] }], 1, 'INSERT');
    }
    if (sql.includes('INSERT INTO moderation.decisions')) { state.decisions.push({ id: v[0], case_id: v[1], policy_version: v[2], outcome: 'queue', decided_by: null }); return result([], 1, 'INSERT'); }
    if (sql.includes('INSERT INTO trust.provenance_events')) { state.provenance.push({ id: v[0] }); return result([], 1, 'INSERT'); }
    if (sql.includes('UPDATE moderation.detector_runs r')) {
      const d = state.decisions.find(d => d.id === v[0] && d.case_id === v[1] && d.outcome === 'queue' && d.decided_by === null && d.policy_version === 'evaluation-only-v1');
      const c = state.cases.find(c => c.id === v[1] && c.content_type === v[3] && c.content_id === v[4]
        && c.source_event_id === v[5] && c.state === 'open' && c.policy_version === 'evaluation-only-v1');
      const r = state.detectors.find(r => r.id === v[2] && r.content_type === v[3] && r.content_id === v[4] && r.source_event_id === v[5]);
      const metadata = JSON.parse(v[7]), evidence = JSON.parse(v[8]);
      if (!d || !c || !r || r.signal.textReviewEvidence?.evidenceHash !== v[6] || !isDeepStrictEqual(r.signal.textReviewEvidence, evidence)
        || r.signal.textReviewDecision && !isDeepStrictEqual(r.signal.textReviewDecision, metadata)) return result([], 0, 'UPDATE');
      r.signal.textReviewDecision = metadata; return result([{ id: r.id }], 1, 'UPDATE');
    }
    if (sql.includes('INSERT INTO trust.user_activity_events')) { state.activity.push({ id: v[0] }); return result([{ id: v[0] }]); }
    if (sql.includes('INSERT INTO system.audit_events')) {
      if (state.audit.some(a => a.id === v[0])) return result([], 0, 'INSERT');
      state.audit.push({ id: v[0] }); return result([{ id: v[0] }], 1, 'INSERT');
    }
    throw new Error('unhandled_fixture_sql:' + sql.slice(0, 90));
  }
  const bundle = await build({ absWorkingDir: root, bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2022',
    external: ['cloudflare:workers'], banner: { js: "import { createRequire } from 'node:module'; const require = createRequire('file:///fixture.mjs');" },
    plugins: [{ name: 'scripted-transport-only', setup(builder) {
      builder.onLoad({ filter: /\/packages\/db\/src\/budget\.ts$/ }, () => ({ loader: 'js', contents: `
        import { env } from 'cloudflare:workers';
        export const BUDGET_RESERVATION_STATUSES = [];
        export async function reserveBudget(_binding, input) {
          await env.FIXTURE_BUDGET.fetch('https://synthetic.invalid/budget', { method: 'POST', body: JSON.stringify(input) });
          return { id: 'synthetic-budget', status: 'reserved' };
        }
        export const reserveBudgetInTransaction = reserveBudget;
        export async function settleBudgetReservation() {}
        export async function reconcileBudgetReservation() {}
        export async function releaseBudgetReservation() {}
        export async function expireBudgetReservations() {}
      ` }));
      builder.onResolve({ filter: /^pg$/ }, () => ({ path: 'scripted-pg', namespace: 'scripted-pg' }));
      builder.onLoad({ filter: /.*/, namespace: 'scripted-pg' }, () => ({ loader: 'js', contents: `
        import { env } from 'cloudflare:workers';
        async function sql(input) {
          const response = await env.FIXTURE_SQL.fetch('https://synthetic.invalid/sql', { method: 'POST', body: JSON.stringify(input) });
          const result = await response.json(); if (!response.ok) throw new Error(result.error); return result;
        }
        export class Client {
          on() {} removeListener() {}
          async connect() { this.id = (await sql({ action: 'connect' })).id; }
          query(text, values = []) { return sql({ action: 'query', id: this.id, text, values }); }
          end() { return sql({ action: 'close', id: this.id }); }
        }
      ` }));
    } }], stdin: { resolveDir: root, contents: `
      import jobs from './apps/lythaus-jobs/src/index.ts';
      export default { async fetch(request, env) {
        env.AI = { async run() { const r = await env.FIXTURE_MODEL.fetch('https://synthetic.invalid/model');
          if (!r.ok) throw new Error('synthetic_provider_failure'); return r.json(); } };
        const body = await request.json(); let ack = 0, retry = 0;
        await jobs.queue({ queue: 'lythaus-moderation-dev', messages: [{ id: body.eventId, body,
          ack() { ack++; }, retry() { retry++; } }] }, env);
        return Response.json({ ack, retry });
      }};
    ` } });
  const runtime = new Miniflare(convertV4MiniflareOptions({ log: new Log(LogLevel.NONE), workers: [{
    name: 'text-review-scripted', modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: '2026-07-27', compatibilityFlags: ['nodejs_compat'],
    bindings: { DB_JOBS_FRESH: { connectionString: 'postgresql://lythaus_jobs@synthetic.hyperdrive.local/fixture?sslmode=disable' },
      AUTHENTICITY_AI_ENABLED: 'true', AUTHENTICITY_TEXT_MODEL: 'synthetic-model-v1', AI_GATEWAY_ID: 'lythaus-ai',
      COST_BUDGET_ENABLED: 'true', COMMUNITY_APPEAL_RULES_VERSION: 'synthetic-only' },
    outboundService: async () => { externalRequests++; return new Response('denied', { status: 502 }); },
    serviceBindings: {
      FIXTURE_BUDGET: async request => { budgetKeys.push((await request.json()).idempotencyKey); return Response.json({}); },
      FIXTURE_MODEL: async () => { modelCalls++; assert.ok(![...sessions.values()].some(s => s.working), 'model call must have no open DB transaction');
        if (duringModel) await duringModel();
        return failModel ? new Response('synthetic failure', { status: 503 }) : Response.json(modelResponse); },
      FIXTURE_SQL: async request => {
        const input = await request.json();
        try {
          if (input.action === 'connect') { const id = ++sequence; sessions.set(id, {}); return Response.json({ id }); }
          if (input.action === 'close') { sessions.delete(input.id); return Response.json({}); }
          const session = sessions.get(input.id); assert.ok(session);
          const sql = input.text.replace(/\s+/g, ' ').trim(); statements.push({ sql, id: input.id });
          if (sql === 'BEGIN') { session.working = structuredClone(data); return Response.json(result([], 0, 'BEGIN')); }
          if (sql === 'COMMIT') { data = session.working; session.working = undefined; return Response.json(result([], 0, 'COMMIT')); }
          if (sql === 'ROLLBACK') { session.working = undefined; return Response.json(result([], 0, 'ROLLBACK')); }
          const fail = phase => { if (failure?.phase === phase && failure.remaining && sql.includes(failure.match)) {
            failure.remaining--; throw new Error('synthetic_database_interruption'); } };
          fail('before'); const value = execute(session.working ?? data, sql, input.values); fail('after'); return Response.json(value);
        } catch (error) { errors.push(error.message); return Response.json({ error: error.message }, { status: 500 }); }
      },
    },
  }] }));
  reset();
  return { reset, event, statements, errors, budgetKeys, get data() { return data; }, get modelCalls() { return modelCalls; },
    get externalRequests() { return externalRequests; }, set duringModel(value) { duringModel = value; },
    set failModel(value) { failModel = value; }, set modelResponse(value) { modelResponse = value; },
    set failure(value) { failure = value; },
    async deliver(value = event()) { return (await runtime.dispatchFetch('https://fixture.invalid/queue', {
      method: 'POST', body: JSON.stringify(value) })).json(); },
    dispose: () => runtime.dispose(),
  };
}
