import assert from 'node:assert/strict';
import { createRequire, builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { version, otherVersion, release, rows } from './reputation-session-fixture.mjs';

const require = createRequire(new URL('../../../node_modules/wrangler/package.json', import.meta.url));
const { build } = require('esbuild');
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const root = fileURLToPath(new URL('../../../', import.meta.url));
const path = '/internal/readiness/jobs-reputation-session';
const headers = { authorization: 'Bearer synthetic-readiness',
  'Cloudflare-Workers-Version-Overrides': `lythaus-public-api-development="${otherVersion}", lythaus-jobs-development="${version}"` };
async function bundles(scenario = 'normal') {
  const pgFixture = { name: 'synthetic-pg', setup(plugin) {
    plugin.onResolve({ filter: /^pg$/ }, () => ({ path: 'pg', namespace: 'synthetic-pg' }));
    plugin.onLoad({ filter: /.*/, namespace: 'synthetic-pg' }, () => ({ contents: `
      export const trace=[]; let index=0;
      const rows=${JSON.stringify(rows)};
      export class Client {
        constructor(){trace.push('client')}
        on(){return this} removeListener(){return this}
        async connect(){trace.push('connect')}
        async query(sql){trace.push(sql);
          if(sql==='BEGIN READ ONLY')return {command:'BEGIN',rows:[]};
          if(sql==='ROLLBACK')return {command:'ROLLBACK',rows:[]};
          if(${JSON.stringify(scenario)}==='timeout')return new Promise(()=>{});
          const row={...rows[index++ % rows.length],secret:'SYNTHETIC_CREDENTIAL'};
          if(${JSON.stringify(scenario)}==='restriction' && 'usersUpdate' in row)row.usersUpdate=true;
          return {command:'SELECT',rows:[row]};
        }
        async end(){trace.push('end')}
      }
      export default {Client};`, loader: 'js' }));
  } };
  const common = { absWorkingDir: root, bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2022',
    plugins: [pgFixture], banner: { js: "import {createRequire} from 'node:module';const require=createRequire('/bundle/worker.mjs');" },
    external: ['cloudflare:*', 'pg-native', ...builtinModules, ...builtinModules.map(name => `node:${name}`)],
  };
  const [publicResult, jobsResult] = await Promise.all([
    build({ ...common, entryPoints: ['apps/lythaus-public-api/src/index.ts'] }),
    build({ ...common, stdin: { resolveDir: root, contents: `
      import jobs from './apps/lythaus-jobs/src/index.ts'; import {trace} from 'pg';
      export default {fetch(request,env){
        if(new URL(request.url).pathname==='/__synthetic_trace')return Response.json(trace);
        if(${JSON.stringify(scenario)}==='redirect')return new Response(null,{status:307,headers:{location:'https://unrelated.synthetic.invalid/collect'}});
        return jobs.fetch(request,env);
      }};` } }),
  ]);
  return { publicScript: publicResult.outputFiles[0].text, jobsScript: jobsResult.outputFiles[0].text };
}
function fixture(scripts, flags = { public: 'true', jobs: 'true' }) {
  let outbound = 0;
  const deny = () => { outbound++; return new Response(null, { status: 403 }); };
  const mf = new Miniflare(convertV4MiniflareOptions({ workers: [
    { name: 'public', modules: true, script: scripts.publicScript, compatibilityDate: '2026-08-01',
      compatibilityFlags: ['nodejs_compat'], outboundService: deny, serviceBindings: { JOBS_COMPATIBILITY: 'jobs' },
      bindings: { EXPECTED_HOSTNAMES: 'api.lythaus.test', ENVIRONMENT: 'local',
        DATABASE_READINESS_TOKEN: 'synthetic-readiness', WORKER_VERSION: { id: otherVersion, tag: release },
        ...(flags.public ? { JOBS_REPUTATION_SESSION_DIAGNOSTIC_ENABLED: flags.public } : {}) } },
    { name: 'jobs', modules: true, script: scripts.jobsScript, compatibilityDate: '2026-08-01',
      compatibilityFlags: ['nodejs_compat'], outboundService: deny,
      bindings: { DATABASE_READINESS_TOKEN: 'synthetic-readiness', WORKER_VERSION: { id: version, tag: release },
        DB_JOBS_FRESH: { connectionString: 'postgres://synthetic:SYNTHETIC_CREDENTIAL@fixture.psdb.cloud/postgres?sslmode=verify-full' },
        ...(flags.jobs ? { JOBS_REPUTATION_SESSION_DIAGNOSTIC_ENABLED: flags.jobs } : {}) } },
  ] }));
  return { mf, get outbound() { return outbound; } };
}

test('actual Public and Jobs bundles preserve authorization across the private service binding', { timeout: 60_000 }, async t => {
  const f = fixture(await bundles());
  try {
    const jobs = await f.mf.getWorker('jobs');
    for (const authorization of [undefined, 'Bearer member-token', 'Bearer synthetic-wrong', 'Basic synthetic-readiness']) {
      await t.test(`anonymous/member/wrong scheme denied: ${authorization ?? 'missing'}`, async () => {
        const supplied = { ...headers }; if (authorization) supplied.authorization = authorization; else delete supplied.authorization;
        for (const response of [await f.mf.dispatchFetch('https://api.lythaus.test' + path, { headers: supplied }),
          await jobs.fetch('https://lythaus-jobs.internal' + path, { headers: supplied })]) assert.equal(response.status, 404);
      });
    }
    assert.deepEqual(await (await jobs.fetch('https://fixture.invalid/__synthetic_trace')).json(), []);
    await t.test('wrong method query and missing version cannot start a diagnostic', async () => {
      assert.equal((await f.mf.dispatchFetch('https://api.lythaus.test' + path, { method: 'POST', headers })).status, 404);
      assert.equal((await f.mf.dispatchFetch('https://api.lythaus.test' + path + '?sql=SELECT', { headers })).status, 400);
      assert.equal((await f.mf.dispatchFetch('https://api.lythaus.test' + path, { headers: { authorization: headers.authorization } })).status, 409);
      assert.deepEqual(await (await jobs.fetch('https://fixture.invalid/__synthetic_trace')).json(), []);
    });
    await t.test('pinned authorized request observes only mocked catalog metadata and confirms rollback', async () => {
      const response = await f.mf.dispatchFetch('https://api.lythaus.test/api' + path, { headers });
      if (response.status !== 200) {
        const direct = await jobs.fetch('https://lythaus-jobs.internal' + path, { headers });
        assert.equal(response.status, 200, JSON.stringify({ bridge: await response.json(),
          directStatus: direct.status, direct: await direct.json(),
          trace: await (await jobs.fetch('https://fixture.invalid/__synthetic_trace')).json() }));
      }
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      const body = await response.json();
      assert.equal(body.jobsWorkerVersionId, version); assert.equal(body.publicWorkerVersionId, otherVersion);
      assert.equal(body.receipt.status, 'observed'); assert.equal(body.receipt.prerequisitesMet, true);
      assert.equal(body.receipt.rollbackConfirmed, true); assert.ok(!JSON.stringify(body).includes('SYNTHETIC_CREDENTIAL'));
      const trace = await (await jobs.fetch('https://fixture.invalid/__synthetic_trace')).json();
      assert.deepEqual(trace.slice(0, 3), ['client', 'connect', 'BEGIN READ ONLY']);
      assert.deepEqual(trace.slice(-2), ['ROLLBACK', 'end']);
      assert.equal(trace.filter(sql => sql.startsWith('SELECT')).length, 4);
      assert.ok(!trace.includes('COMMIT'));
    });
    assert.equal(f.outbound, 0);
  } finally { await f.mf.dispose(); }
});

test('actual bundle proposal stays off when either diagnostic flag is missing', { timeout: 60_000 }, async () => {
  const scripts = await bundles();
  for (const flags of [{ public: undefined, jobs: 'true' }, { public: 'true', jobs: undefined }]) {
    const f = fixture(scripts, flags);
    try {
      const response = await f.mf.dispatchFetch('https://api.lythaus.test' + path, { headers });
      assert.notEqual(response.status, 200);
      const jobs = await f.mf.getWorker('jobs');
      assert.deepEqual(await (await jobs.fetch('https://fixture.invalid/__synthetic_trace')).json(), []);
      assert.equal(f.outbound, 0);
    } finally { await f.mf.dispose(); }
  }
});

test('actual binding receipt preserves a failed privilege prerequisite', { timeout: 60_000 }, async () => {
  const f = fixture(await bundles('restriction'));
  try {
    const response = await f.mf.dispatchFetch('https://api.lythaus.test' + path, { headers });
    assert.equal(response.status, 200); const body = await response.json();
    assert.equal(body.receipt.prerequisitesMet, false); assert.equal(body.receipt.metadata.usersUpdate, true);
    assert.equal(f.outbound, 0);
  } finally { await f.mf.dispose(); }
});

test('actual Workerd diagnostic timeout attempts rollback and closes without an observed receipt', { timeout: 60_000 }, async () => {
  const f = fixture(await bundles('timeout'));
  try {
    const response = await f.mf.dispatchFetch('https://api.lythaus.test' + path, { headers });
    assert.equal(response.status, 503); const body = await response.json();
    assert.equal(body.receipt.status, 'unavailable'); assert.equal(body.receipt.diagnosticCode, 'timeout');
    const jobs = await f.mf.getWorker('jobs');
    const trace = await (await jobs.fetch('https://fixture.invalid/__synthetic_trace')).json();
    assert.deepEqual(trace.slice(-2), ['ROLLBACK', 'end']); assert.ok(!trace.includes('COMMIT'));
    assert.equal(f.outbound, 0);
  } finally { await f.mf.dispose(); }
});

test('actual private bridge rejects redirects without forwarding the readiness token elsewhere', { timeout: 60_000 }, async () => {
  const f = fixture(await bundles('redirect'));
  try {
    const response = await f.mf.dispatchFetch('https://api.lythaus.test' + path, { headers });
    assert.equal(response.status, 503); assert.deepEqual(await response.json(), { error: 'diagnostic_unavailable' });
    assert.equal(f.outbound, 0);
  } finally { await f.mf.dispose(); }
});
