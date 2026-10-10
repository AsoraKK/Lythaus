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
            const deliveryState = nextTransactionalEmailState({ category, attemptCount: 1 }).state;
            return Response.json({ accepted: false, category, deliveryState }, { status: 503 });
          }
        }};
      `,
    },
  });

  const calls = [];
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
          return new Response(null, { status: 307, headers: { location: redirectUrl } });
        }
        if (url.href === redirectUrl) return Response.json({ messageId: 'synthetic-redirected-acceptance' });
        throw new Error('unexpected synthetic outbound URL');
      },
    }],
  }));

  try {
    const response = await miniflare.dispatchFetch('https://jobs.test/');
    const result = await response.json();
    const targets = calls.filter(call => call.url === redirectUrl);
    assert.equal(targets.length, 0, JSON.stringify({
      redirectTargetCalls: targets.length,
      redirectedMessageContainsRecipient: targets.some(call => call.body.includes('synthetic@example.invalid')),
      redirectedMessageContainsProof: targets.some(call => call.body.includes('synthetic-proof')),
      accepted: result.accepted,
      messageId: result.messageId,
    }));
    assert.equal(response.status, 503);
    assert.deepEqual(result, { accepted: false, category: 'unknown', deliveryState: 'failed' });
    assert.equal(calls.filter(call => call.url === providerUrl).length, 1);
    assert.ok(calls[0].body.includes('synthetic@example.invalid'));
    assert.ok(calls[0].body.includes('synthetic-proof'));
  } finally {
    await miniflare.dispose();
  }
});
