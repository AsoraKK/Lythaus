import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { fixtures } from './fixtures.mjs';
import { scriptedResponse, SYNTHETIC_ENDPOINT } from './harness.ts';

const require = createRequire(new URL('../../../../node_modules/wrangler/package.json', import.meta.url));
const { build } = require('esbuild');
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const root = fileURLToPath(new URL('../../../../', import.meta.url));

test('Workerd collects real adapter feedback through an outbound-denied fixture binding', { timeout: 60_000 }, async () => {
  const bundle = await build({ absWorkingDir: root, bundle: true, write: false,
    format: 'esm', platform: 'neutral', target: 'es2022', external: ['node:*'],
    stdin: { resolveDir: root, contents: `
      import { fixtures } from './packages/authenticity/evaluation/posting-feedback/fixtures.mjs';
      import { collectFixture, evaluateCorpus, SYNTHETIC_ENDPOINT } from './packages/authenticity/evaluation/posting-feedback/harness.ts';
      export default { async fetch() {
        const observations = [];
        for (const fixture of fixtures) {
          const transport = fixture.response === 'timeout' ? undefined : (input, init) => fetch(input, {
            ...init, headers: { ...init.headers, 'x-synthetic-case': fixture.familyId },
          });
          observations.push(await collectFixture(fixture, transport));
        }
        return Response.json(await evaluateCorpus(fixtures, observations));
      }};
    ` },
  });
  const calls = [];
  const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: 'evaluation-fixture',
    modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: '2026-08-01', compatibilityFlags: ['nodejs_compat'],
    outboundService: async request => {
      assert.equal(request.url, SYNTHETIC_ENDPOINT);
      assert.equal(request.method, 'POST');
      assert.equal(request.headers.get('authorization'), 'Bearer synthetic-fixture-only');
      const fixture = fixtures.find(row => row.familyId === request.headers.get('x-synthetic-case'));
      assert.ok(fixture);
      const input = await request.json();
      assert.equal(input.input, fixture.body);
      assert.equal(input.model, 'omni-moderation-latest');
      calls.push(fixture.familyId);
      return scriptedResponse(fixture);
    },
  }] }));
  try {
    const response = await mf.dispatchFetch('https://evaluation-fixture.test/');
    assert.equal(response.status, 200);
    const report = await response.json();
    assert.equal(report.observations.length, 32);
    assert.equal(report.externalRequests, 0);
    assert.equal(calls.length, 31);
    assert.equal(new Set(calls).size, 31);
    assert.equal(report.thresholdRecommendation.status, 'UNEVALUATED');
    for (const row of report.observations) {
      assert.equal(row.authority.publicationEligible, false);
      assert.equal(row.authorship.band, 'ABSTAIN');
    }
    assert.equal(report.observations.find(row => row.familyId === 'redirect').safety.httpStatus, 307);
    assert.equal(report.observations.find(row => row.familyId === 'outage').safety.failure, 'HTTP_SERVER_FAILURE');
    assert.equal(report.observations.find(row => row.familyId === 'model-drift').safety.responseModel, 'omni-moderation-unexpected-version');
  } finally { await mf.dispose(); }
});

test('Workerd image and video-frame safety feedback preserves category modality missingness', { timeout: 60_000 }, async () => {
  const endpoint = `${SYNTHETIC_ENDPOINT}/image-fixture`;
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/6s8AAAAASUVORK5CYII=';
  const bundle = await build({ absWorkingDir: root, bundle: true, write: false,
    format: 'esm', platform: 'neutral', target: 'es2022',
    stdin: { resolveDir: root, contents: `
      import { createOpenAIModerationProvider } from './packages/authenticity/src/openai-moderation.ts';
      export default { async fetch() {
        const provider = createOpenAIModerationProvider({ apiKey: 'synthetic-fixture-only', endpoint: ${JSON.stringify(endpoint)} });
        const bytes = Uint8Array.from(atob(${JSON.stringify(png)}), char => char.charCodeAt(0));
        const image = await provider.analyseImage({ caseId: '${fixtures[0].id}', bytes, mime: 'image/png' });
        const videoFrame = await provider.analyseVideoFrame({ caseId: '${fixtures[1].id}', frame: bytes, mime: 'image/png', frameTimestampMs: 123 });
        const unsupported = await provider.analyseImage({ caseId: '${fixtures[0].id}', bytes, mime: 'audio/wav' });
        return Response.json({ image, videoFrame, unsupported, audioMethodAvailable: 'analyseAudio' in provider });
      }};
    ` },
  });
  const imageCategories = new Set(['self-harm', 'self-harm/instructions', 'self-harm/intent', 'sexual', 'violence', 'violence/graphic']);
  const payloads = [];
  const mf = new Miniflare(convertV4MiniflareOptions({ workers: [{ name: 'image-evaluation-fixture',
    modules: true, script: bundle.outputFiles[0].text,
    compatibilityDate: '2026-08-01', compatibilityFlags: ['nodejs_compat'],
    outboundService: async request => {
      assert.equal(request.url, endpoint);
      payloads.push(await request.json());
      const response = await scriptedResponse({ response: 'ok' }).json();
      for (const category of Object.keys(response.results[0].categories)) {
        response.results[0].category_applied_input_types[category] = imageCategories.has(category) ? ['image'] : [];
        response.results[0].category_scores[category] = 0;
      }
      return Response.json(response);
    },
  }] }));
  try {
    const response = await mf.dispatchFetch('https://image-evaluation-fixture.test/');
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(payloads.length, 2);
    for (const payload of payloads) {
      assert.equal(payload.input[0].type, 'image_url');
      assert.equal(payload.input[0].image_url.url, `data:image/png;base64,${png}`);
    }
    for (const feedback of [result.image, result.videoFrame]) {
      assert.equal(feedback.result, 'ALLOW');
      assert.deepEqual(feedback.providerEvidence.categoryAppliedInputTypes.violence, ['image']);
      assert.deepEqual(feedback.providerEvidence.categoryAppliedInputTypes.harassment, []);
      assert.equal(feedback.providerEvidence.categoryScores.harassment, 0);
    }
    assert.equal(result.unsupported.providerEvidence.errorCategory, 'INVALID_MIME');
    assert.equal(result.audioMethodAvailable, false);
  } finally { await mf.dispose(); }
});
