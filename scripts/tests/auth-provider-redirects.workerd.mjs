import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(new URL('../../node_modules/wrangler/package.json', import.meta.url));
const { build } = require('esbuild');
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const root = fileURLToPath(new URL('../../', import.meta.url));
const events = ['message.delivered', 'message.deferred', 'message.bounced', 'message.failed', 'message.rejected', 'message.complained'];
const fixtures = {
  coordinator: { file: 'apps/lythaus-auth-acceptance-coordinator/src/index.ts', symbol: 'lifecycleSubscription',
    origin: 'https://api.cloudflare.com', error: 'cloudflare_lifecycle_observation_unavailable',
    env: { CLOUDFLARE_ACCOUNT_ID: '00000000000000000000000000000000', CLOUDFLARE_EMAIL_LIFECYCLE_READ_TOKEN: 'synthetic-api-token' },
    expression: 'lifecycleSubscription(env)' },
  turnstile: { file: 'apps/lythaus-public-api/src/index.ts', symbol: 'verifyTurnstile',
    origin: 'https://challenges.cloudflare.com', error: 'turnstile_unavailable',
    env: { ENVIRONMENT: 'production', TURNSTILE_REQUIRED: 'true', TURNSTILE_SECRET_KEY: 'synthetic-siteverify-secret', TURNSTILE_EXPECTED_HOSTNAMES: 'app.lythaus.test' },
    expression: "verifyTurnstile(env, 'synthetic-client-proof', 'account_signup')" },
};

async function runtime(kind) {
  const fixture = fixtures[kind];
  const bundle = await build({ absWorkingDir: root, bundle: true, write: false,
    format: 'esm', platform: 'node', target: 'es2022',
    banner: { js: "import {createRequire} from 'node:module'; const require=createRequire('/bundle/worker.mjs');" },
    external: ['cloudflare:*', 'pg-native', ...builtinModules, ...builtinModules.map(name => `node:${name}`)],
    plugins: [{ name: 'private-runtime-fixture', setup(builder) {
      builder.onResolve({ filter: /^private-runtime-fixture$/ }, () => ({ path: path.join(root, fixture.file), namespace: 'private-runtime-fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'private-runtime-fixture' }, args => ({
        contents: `${readFileSync(args.path, 'utf8')}\nexport { ${fixture.symbol} };`,
        loader: 'ts', resolveDir: path.dirname(args.path),
      }));
    } }],
    stdin: { resolveDir: root, contents: `
      import { ${fixture.symbol} } from 'private-runtime-fixture';
      const env = ${JSON.stringify(fixture.env)};
      export default { async fetch() {
        try { return Response.json({ accepted: true, result: await ${fixture.expression} }); }
        catch(error) { return Response.json({ accepted: false, error: error.message }, { status: 503 }); }
      }};
    ` },
  });
  let mode = 'normal';
  let calls = [];
  const payload = stage => kind === 'turnstile'
    ? { success: mode !== 'denied', hostname: mode === 'drift' ? 'wrong.invalid' : 'app.lythaus.test', action: mode === 'wrong-action' ? 'verification_resend' : 'account_signup' }
    : { success: mode !== 'denied', result: stage === 'queues'
      ? [{ queue_name: 'lythaus-email-lifecycle-dev', queue_id: 'synthetic-queue' }]
      : [{ destination: { queue_id: 'synthetic-queue' }, source: { type: 'email.sending', domain: 'mail.lythaus.co' }, enabled: mode !== 'drift', events }] };
  const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: `provider-${kind}`,
    modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: '2026-07-27', compatibilityFlags: ['nodejs_compat'],
    outboundService: async request => {
      const url = new URL(request.url);
      const target = url.hostname === 'redirect-target.invalid' || url.pathname.startsWith('/redirect-target/');
      const stage = url.pathname.includes('queues') ? 'queues' : 'subscriptions';
      const body = await request.text();
      calls.push({ origin: url.origin, target, method: request.method,
        authorizationForwarded: request.headers.get('authorization') === 'Bearer synthetic-api-token',
        credentialBodyForwarded: body.includes('synthetic-siteverify-secret') && body.includes('synthetic-client-proof') });
      assert.ok(target || url.origin === fixture.origin);
      if (target) return Response.json(payload(stage));
      assert.equal(request.method, kind === 'coordinator' ? 'GET' : 'POST');
      if (kind === 'coordinator') assert.equal(request.headers.get('authorization'), 'Bearer synthetic-api-token');
      else {
        assert.equal(request.headers.get('content-type'), 'application/json');
        const input = JSON.parse(body);
        assert.equal(input.secret, 'synthetic-siteverify-secret');
        assert.equal(input.response, 'synthetic-client-proof');
        assert.match(input.idempotency_key, /^[0-9a-f-]{36}$/);
      }
      const redirectHere = kind === 'turnstile' || !mode.endsWith('-subscriptions') || stage === 'subscriptions';
      if (mode.startsWith('redirect') && redirectHere) {
        const status = Number(/^redirect(\d+)/.exec(mode)?.[1] ?? 307);
        const location = mode.includes('relative') ? `/redirect-target/${stage}` : `https://redirect-target.invalid/${stage}`;
        return Response.json(payload(stage), { status, headers: mode.includes('no-location') ? {} : { location } });
      }
      if (mode === 'http503') return new Response(null, { status: 503 });
      if (mode === 'invalid-json') return new Response('<html>synthetic gateway error</html>');
      if (mode === 'fixture-handler-error') throw new Error('synthetic private transport detail');
      return Response.json(payload(stage));
    },
  }] }));
  return { mf, async observe(scenario) {
    mode = scenario; calls = [];
    const response = await mf.dispatchFetch('https://local.test/');
    return { response, result: await response.json(), calls };
  } };
}

for (const kind of ['coordinator', 'turnstile']) {
  test(`actual Workerd ${kind} rejects redirects without forwarding credentials or accepting target success`, { timeout: 60_000 }, async () => {
    const fixture = await runtime(kind);
    try {
      const failures = [];
      const scenarios = ['normal', 'redirect307', 'redirect308', 'redirect301', 'redirect302', 'redirect303',
        'redirect307-relative', 'redirect307-no-location', 'http503', 'invalid-json', 'fixture-handler-error', 'denied', 'drift',
        ...(kind === 'coordinator' ? ['redirect307-subscriptions'] : ['wrong-action'])];
      for (const scenario of scenarios) {
        const { result, calls } = await fixture.observe(scenario);
        const targets = calls.filter(call => call.target);
        try {
          assert.equal(targets.length, 0, JSON.stringify({ kind, scenario, accepted: result.accepted,
            redirectTargets: targets.length, authorizationForwarded: targets.some(call => call.authorizationForwarded),
            credentialBodyForwarded: targets.some(call => call.credentialBodyForwarded) }));
          assert.equal(result.accepted, scenario === 'normal', `${kind}/${scenario}`);
          if (scenario === 'normal') {
            assert.equal(calls.length, kind === 'coordinator' ? 2 : 1);
            assert.equal(result.result[kind === 'coordinator' ? 'status' : 'hostname'], kind === 'coordinator' ? 'enabled' : 'app.lythaus.test');
          } else if (scenario.startsWith('redirect')) {
            assert.equal(calls.length, scenario.endsWith('-subscriptions') ? 2 : 1);
            assert.equal(result.error, fixtures[kind].error);
          } else assert.ok(typeof result.error === 'string' && !result.error.includes('synthetic'));
        } catch (error) { failures.push(error.message); }
      }
      assert.deepEqual(failures, [], `${kind}: ${JSON.stringify(failures)}`);
    } finally { await fixture.mf.dispose(); }
  });
}
