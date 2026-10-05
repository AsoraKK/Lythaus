import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(new URL('../../../node_modules/wrangler/package.json', import.meta.url));
const { build } = require('esbuild');
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const root = fileURLToPath(new URL('../../../', import.meta.url));
const password = 'synthetic workerd screening fixture';
const digest = createHash('sha1').update(password).digest('hex').toUpperCase();

test('native Worker fetch screens padded ranges and rejects redirects and upstream failures', { timeout: 60_000 }, async () => {
  const bundle = await build({ absWorkingDir: root, bundle: true, write: false,
    format: 'esm', platform: 'neutral', target: 'es2022',
    stdin: { resolveDir: root, contents: `
      import { requireUncompromisedPassword, passwordScreeningFailureLogFields } from './apps/lythaus-public-api/src/auth-password-screen.ts';
      import { classifyPublicError } from './apps/lythaus-public-api/src/auth-runtime-policy.ts';
      export default { async fetch(request) {
        try {
          const timeout = request.headers.get('x-synthetic-timeout') === 'true' ? 20 : 5000;
          const result = await requireUncompromisedPassword(${JSON.stringify(password)}, fetch, timeout);
          return Response.json({accepted: result === ${JSON.stringify(password)}});
        } catch(error) {
          const failure = classifyPublicError(error);
          return Response.json({error: failure.exposedCode, ...passwordScreeningFailureLogFields(error)}, {status: failure.status});
        }
      }};
    ` },
  });
  let calls = 0, mode = 'padded';
  const padded = `${digest.slice(5)}:0\r\n` + Array.from({length:999}, (_, index) => `${index.toString(16).toUpperCase().padStart(35,'0')}:0`).join('\r\n');
  const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: 'screening',
    modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: '2026-07-27', compatibilityFlags: ['nodejs_compat'],
    outboundService: async request => {
      calls += 1;
      assert.equal(request.url, `https://api.pwnedpasswords.com/range/${digest.slice(0,5)}`);
      assert.equal(request.method, 'GET');
      assert.equal(request.headers.get('Add-Padding'), 'true');
      assert.equal(request.headers.get('User-Agent'), 'Lythaus-password-screening');
      if (mode === 'compromised') return new Response(`${digest.slice(5)}:1`);
      if (mode.startsWith('http')) return new Response('', { status: Number(mode.slice(4)),
        headers: { location: 'https://must-not-follow.example.invalid/' } });
      if (mode === 'invalid') return new Response('<html>synthetic gateway failure</html>');
      if (mode === 'oversized') return new Response('x'.repeat(262145));
      if (mode === 'timeout') await new Promise(resolve => setTimeout(resolve, 100));
      if (mode === 'body-timeout') return new Response(new ReadableStream({ start(controller) {
        setTimeout(() => { try { controller.enqueue(new TextEncoder().encode(padded)); controller.close(); } catch {} }, 100);
      } }));
      return new Response(padded);
    },
  }] }));
  try {
    for (const scenario of ['padded', 'compromised', 'http302', 'http307', 'http308', 'http403', 'http503', 'invalid', 'oversized', 'timeout', 'body-timeout']) {
      mode = scenario;
      const previousCalls = calls;
      const response = await mf.dispatchFetch('https://local.test/', {
        headers: { 'x-synthetic-timeout': String(scenario.includes('timeout')) },
      });
      const result = await response.json();
      assert.equal(calls - previousCalls, 1, `${scenario}: exactly one mocked request, with no redirect follow`);
      if (scenario === 'padded') {
        assert.equal(response.status, 200);
        assert.deepEqual(result, {accepted:true});
      } else if (scenario === 'compromised') {
        assert.equal(response.status, 400);
        assert.deepEqual(result, {error:'password_compromised'});
      } else {
        assert.equal(response.status, 503);
        assert.deepEqual(result, {error:'password_screening_unavailable',
          passwordScreeningFailureReason: scenario.startsWith('http') ? 'http_status' : scenario.includes('timeout') ? 'timeout' : 'invalid_body',
          ...(scenario.startsWith('http') ? {passwordScreeningHttpStatus:Number(scenario.slice(4))} : {}),
        });
      }
    }
  } finally { await mf.dispose(); }
});
