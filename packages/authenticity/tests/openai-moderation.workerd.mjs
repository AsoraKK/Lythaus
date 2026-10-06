import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const require = createRequire(new URL('../../../node_modules/wrangler/package.json', import.meta.url));
const { build } = require('esbuild');
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const root = fileURLToPath(new URL('../../../', import.meta.url));
const endpoint = 'https://moderation.synthetic.invalid/v1/moderations';

test('native Workerd moderation fetch rejects provider redirects', { timeout: 60_000 }, async () => {
  const bundle = await build({ absWorkingDir: root, bundle: true, write: false,
    format: 'esm', platform: 'neutral', target: 'es2022',
    stdin: { resolveDir: root, contents: `
      import { createOpenAIModerationProvider } from './packages/authenticity/src/openai-moderation.ts';
      export default { async fetch() {
        const provider = createOpenAIModerationProvider({
          apiKey: 'synthetic-moderation-key',
          endpoint: ${JSON.stringify(endpoint)},
        });
        const result = await provider.analyseText({ text: 'synthetic moderation fixture' });
        return Response.json({ result: result.result, reasonCodes: result.reasonCodes, evidence: result.providerEvidence });
      }};
    ` },
  });
  const calls = [];
  const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: 'moderation',
    modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: '2026-08-01', compatibilityFlags: ['nodejs_compat'],
    outboundService: async request => {
      calls.push({ url: request.url, method: request.method, authorization: request.headers.get('authorization') });
      if (request.url === endpoint) return new Response(null, { status: 307,
        headers: { location: 'https://redirect-target.synthetic.invalid/collect' } });
      return Response.json({ model: 'omni-moderation-latest', results: [{ flagged: false,
        categories: {}, category_scores: {}, category_applied_input_types: {} }] });
    },
  }] }));
  try {
    const response = await mf.dispatchFetch('https://moderation.test/');
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.result, 'PROVIDER_FAILURE');
    assert.deepEqual(result.reasonCodes, ['OPENAI_MODERATION_HTTP_FAILURE']);
    assert.equal(result.evidence.httpStatus, 307);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], { url: endpoint, method: 'POST', authorization: 'Bearer synthetic-moderation-key' });
  } finally { await mf.dispose(); }
});
