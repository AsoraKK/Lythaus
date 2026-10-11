import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(new URL('../../../node_modules/wrangler/package.json', import.meta.url));
const { build } = require('esbuild');
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const root = fileURLToPath(new URL('../../../', import.meta.url));
const providerUrl = 'https://email-provider.synthetic.invalid/send';
const redirectUrl = 'https://redirect-target.synthetic.invalid/collect';

test('native Jobs email fallback rejects redirects before forwarding message contents', { timeout: 60_000 }, async () => {
  const bundle = await build({
    absWorkingDir: root,
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'neutral',
    target: 'es2022',
    plugins: [{
      name: 'synthetic-database-binding',
      setup(builder) {
        builder.onResolve({ filter: /^@lythaus\/db$/ }, () => ({ path: 'database', namespace: 'synthetic' }));
        builder.onLoad({ filter: /.*/, namespace: 'synthetic' }, () => ({
          contents: 'export const lockAuthDelivery = () => {}; export const query = () => {}; export const transaction = () => {};',
          loader: 'js',
        }));
      },
    }],
    stdin: {
      resolveDir: root,
      contents: `
        import { nextTransactionalEmailState } from '@lythaus/contracts';
        import { sendTransactionalEmail, emailProviderFailureCategory } from './apps/lythaus-jobs/src/transactional-email-runtime.ts';
        const env = {
          EMAIL_PROVIDER_MODE: 'fallback',
          EMAIL_PROVIDER_URL: ${JSON.stringify(providerUrl)},
          EMAIL_PROVIDER_TOKEN: 'synthetic-provider-token',
          EMAIL_FROM: 'no-reply@mail.lythaus.test',
        };
        const message = {
          to: 'synthetic@example.invalid',
          subject: 'Synthetic verification',
          html: '<a href="https://lythaus.co/verify-email?token=synthetic-proof">Verify</a>',
          text: 'https://lythaus.co/verify-email?token=synthetic-proof',
        };
        export default { async fetch() {
          try {
            const accepted = await sendTransactionalEmail(env, message);
            return Response.json({ accepted: true, messageId: accepted.messageId });
          } catch (error) {
            const category = emailProviderFailureCategory(error).category;
            const retry = nextTransactionalEmailState({ category, attemptCount: 1 });
            return Response.json({ accepted: false, status: error.status, category,
              deliveryState: retry.state, retryScheduled: retry.nextAttemptAt !== null }, { status: 503 });
          }
        }};
      `,
    },
  });

  const calls = [];
  let scenario;
  const miniflare = new Miniflare(convertV4MiniflareOptions({
    workers: [{
      name: 'jobs-email-fallback',
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: '2026-08-01',
      compatibilityFlags: ['nodejs_compat'],
      outboundService: async request => {
        const url = new URL(request.url);
        calls.push({
          url: url.href,
          method: request.method,
          authorization: request.headers.get('authorization'),
          body: await request.clone().text(),
        });
        if (url.href === providerUrl) {
          return Response.json({ code: scenario.providerCode }, {
            status: scenario.status,
            headers: scenario.redirect ? { location: redirectUrl } : {},
          });
        }
        if (url.href === redirectUrl) return Response.json({ messageId: 'synthetic-redirected-acceptance' });
        throw new Error('unexpected synthetic outbound URL');
      },
    }],
  }));

  try {
    const scenarios = [
      ...[301, 302, 303, 307, 308].map(status => ({
        status,
        providerCode: 'E_RATE_LIMIT_EXCEEDED',
        redirect: true,
        category: 'unknown',
        deliveryState: 'failed',
        retryScheduled: false,
      })),
      { status: 429, providerCode: 'E_RATE_LIMIT_EXCEEDED', redirect: false,
        category: 'transient', deliveryState: 'queued', retryScheduled: true },
      { status: 503, providerCode: 'E_INTERNAL_SERVER_ERROR', redirect: false,
        category: 'transient', deliveryState: 'queued', retryScheduled: true },
    ];
    for (const item of scenarios) {
      scenario = item;
      calls.length = 0;
      const response = await miniflare.dispatchFetch('https://jobs.test/');
      const result = await response.json();
      const targets = calls.filter(call => call.url === redirectUrl);
      assert.equal(targets.length, 0, JSON.stringify({
        status: item.status,
        redirectTargetCalls: targets.length,
        redirectedMessageContainsRecipient: targets.some(call => call.body.includes('synthetic@example.invalid')),
        redirectedMessageContainsProof: targets.some(call => call.body.includes('synthetic-proof')),
        result,
      }));
      assert.equal(response.status, 503, `status ${item.status}`);
      assert.deepEqual(result, {
        accepted: false,
        status: item.status,
        category: item.category,
        deliveryState: item.deliveryState,
        retryScheduled: item.retryScheduled,
      }, `status ${item.status}`);
      assert.equal(calls.filter(call => call.url === providerUrl).length, 1, `status ${item.status}`);
      assert.ok(calls[0].body.includes('synthetic@example.invalid'));
      assert.ok(calls[0].body.includes('synthetic-proof'));
    }
  } finally {
    await miniflare.dispose();
  }
});
