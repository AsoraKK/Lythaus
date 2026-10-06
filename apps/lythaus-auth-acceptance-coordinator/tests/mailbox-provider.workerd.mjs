import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(new URL('../../../node_modules/wrangler/package.json', import.meta.url));
const { build } = require('esbuild');
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const root = fileURLToPath(new URL('../../../', import.meta.url));
const dns = host => ({ Status: 0, Answer: [{ type: 15, data: `10 ${host}.` }] });

test('actual Workerd mailbox observation reaches DNS and rejects errors and redirects', { timeout: 60_000 }, async () => {
  const bundle = await build({ absWorkingDir: root, bundle: true, write: false,
    format: 'esm', platform: 'neutral', target: 'es2022',
    stdin: { resolveDir: root, contents: `
      import { observeMailboxProviders } from './apps/lythaus-auth-acceptance-coordinator/src/mailbox-provider.ts';
      export default { async fetch() {
        try {
          return Response.json(await observeMailboxProviders('fixture@first.invalid', 'fixture@second.invalid'));
        } catch(error) {
          return Response.json({ error: error.message }, { status: 503 });
        }
      }};
    ` },
  });
  let mode = 'normal';
  let calls = [];
  const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: 'mailbox-provider',
    modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: '2026-07-27', compatibilityFlags: ['nodejs_compat'],
    outboundService: async request => {
      calls.push(request.url);
      const url = new URL(request.url);
      const first = url.searchParams.get('name') === 'first.invalid';
      assert.equal(url.origin, 'https://cloudflare-dns.com');
      assert.equal(url.pathname, '/dns-query');
      assert.equal(url.searchParams.get('type'), 'MX');
      assert.ok(['first.invalid', 'second.invalid'].includes(url.searchParams.get('name')));
      assert.equal(request.method, 'GET');
      assert.equal(request.headers.get('accept'), 'application/dns-json');
      assert.equal(request.headers.has('authorization'), false);
      assert.equal(request.url.includes('fixture'), false);
      const body = dns(first ? 'smtp.google.com' : 'fixture.mail.protection.outlook.com');
      if (!first) return Response.json(body);
      if (/^redirect\d+$/.test(mode)) {
        const status = Number(mode.slice('redirect'.length));
        return Response.json(body, { status, headers: { location: 'https://must-not-follow.example.invalid/dns-query' } });
      }
      if (mode === 'relative-redirect') return Response.json(body, { status: 302, headers: { location: '/must-not-follow' } });
      if (mode === 'redirect-no-location') return Response.json(body, { status: 302 });
      if (mode === 'http503') return new Response(null, { status: 503 });
      if (mode === 'invalid-json') return new Response('<html>synthetic error</html>');
      if (mode === 'unknown-provider') return Response.json(dns('unknown.invalid'));
      if (mode === 'same-provider') return Response.json(dns('fixture.mail.protection.outlook.com'));
      if (mode === 'network-error') throw new Error('synthetic private network detail');
      return Response.json(body);
    },
  }] }));
  try {
    for (const scenario of ['normal', 'http503', 'invalid-json', 'unknown-provider', 'same-provider', 'network-error',
      'redirect301', 'redirect302', 'redirect303', 'redirect307', 'redirect308', 'relative-redirect', 'redirect-no-location']) {
      mode = scenario;
      calls = [];
      const response = await mf.dispatchFetch('https://local.test/');
      const result = await response.json();
      assert.equal(calls.length, 2, `${scenario}: native DNS calls=${calls.length}, result=${JSON.stringify(result)}`);
      assert.deepEqual(calls.map(value => new URL(value).searchParams.get('name')).sort(), ['first.invalid', 'second.invalid']);
      assert.ok(calls.every(value => new URL(value).origin === 'https://cloudflare-dns.com'));
      if (scenario === 'normal') {
        assert.equal(response.status, 200);
        assert.equal(result.source, 'dns_mx_observation');
        assert.equal(result.initial, 'google');
        assert.equal(result.resend, 'microsoft');
        assert.ok(Number.isFinite(Date.parse(result.observedAt)));
        assert.equal(/fixture|invalid|@/.test(JSON.stringify(result)), false);
      } else {
        assert.equal(response.status, 503);
        assert.deepEqual(result, { error: scenario === 'same-provider'
          ? 'acceptance_second_mail_provider_required' : 'acceptance_mailbox_provider_unknown' });
      }
    }
  } finally { await mf.dispose(); }
});
