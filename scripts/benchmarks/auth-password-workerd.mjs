import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../../node_modules/wrangler/package.json', import.meta.url));
const { build } = require('esbuild');
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const root = fileURLToPath(new URL('../../', import.meta.url));
const bundle = await build({
  stdin: {
    contents: `import {hashPassword,verifyPassword,ARGON2ID_PROFILE} from './packages/security/src/index.ts';
      export default {async fetch() {
        const record=hashPassword('non-sensitive synthetic benchmark','local-synthetic-pepper');
        return Response.json({algorithm:record.algorithm,profile:ARGON2ID_PROFILE,
          valid:verifyPassword('non-sensitive synthetic benchmark',record,'local-synthetic-pepper'),
          wrongRejected:!verifyPassword('wrong synthetic fixture',record,'local-synthetic-pepper')});
      }};`,
    resolveDir: root, sourcefile: 'local-auth-benchmark.ts',
  },
  bundle: true, write: false, format: 'esm', platform: 'browser', target: 'es2022',
});
const mf = new Miniflare(convertV4MiniflareOptions({
  modules: true, script: bundle.outputFiles[0].text, compatibilityDate: '2026-08-01',
  outboundService: () => new Response(null, { status: 403 }),
}));
try {
  const measurements = [];
  for (let iteration = 0; iteration < 3; iteration++) {
    const start = performance.now();
    const response = await mf.dispatchFetch('http://local.test/');
    const proof = await response.json();
    assert.equal(proof.valid, true);
    assert.equal(proof.wrongRejected, true);
    measurements.push({ wallMs: Math.round(performance.now() - start), ...proof });
  }
  console.log(JSON.stringify({
    runtime: 'local workerd; wall time for hash and two verifications, not provider CPU certification',
    measurements,
  }));
} finally {
  await mf.dispose();
}
