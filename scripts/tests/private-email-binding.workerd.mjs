import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire, builtinModules } from 'node:module';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../../node_modules/wrangler/package.json', import.meta.url));
const { build } = require('esbuild');
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const root = fileURLToPath(new URL('../../', import.meta.url));

test('actual Public bundle exposes private named capability only through a service binding', async () => {
  const bundle = await build({ absWorkingDir: root, entryPoints: ['apps/lythaus-public-api/src/worker.ts'],
    bundle: true, write: false, format: 'esm', platform: 'node', target: 'es2022',
    banner: { js: "import {createRequire} from 'node:module'; const require=createRequire('/bundle/worker.mjs');" },
    external: ['cloudflare:*', 'pg-native', ...builtinModules, ...builtinModules.map(name => `node:${name}`)],
  });
  const version = '01900000-0000-7000-8000-000000000001';
  const deny = () => new Response(null, { status: 403 });
  const mf = new Miniflare(convertV4MiniflareOptions({ workers: [
    { name: 'caller', modules: true, compatibilityDate: '2026-08-01',
      script: 'export default {fetch(request,env){return env.PRIVATE.fetch(request)}};',
      serviceBindings: { PRIVATE: { name: 'public', entrypoint: 'AuthEmailEnvelope' } }, outboundService: deny },
    { name: 'public', modules: true, script: bundle.outputFiles[0].text,
      compatibilityDate: '2026-08-01', compatibilityFlags: ['nodejs_compat'], outboundService: deny,
      bindings: { ENVIRONMENT:'local', EXPECTED_HOSTNAMES:'api.lythaus.test', DB_APP_FRESH:{},
        PII_ENCRYPTION_KEY_V1:randomBytes(32).toString('base64'), PII_HMAC_KEY_V1:randomBytes(32).toString('base64'),
        AUTH_PASSWORD_PEPPER_V1:randomBytes(32).toString('base64'), TRANSACTIONAL_EMAIL_ENCRYPTION_KEY_V1:randomBytes(32).toString('base64'),
        WORKER_VERSION:{id:version,tag:'synthetic-local-test'} } },
  ] }));
  try {
    const response = await mf.dispatchFetch('https://api.lythaus.test/keeper-email', { method:'POST', body:JSON.stringify({operation:'probe'}) });
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{result:{bindingVerified:true},workerVersion:version});
    const publicWorker = await mf.getWorker('public');
    const anonymous = await publicWorker.fetch('https://api.lythaus.test/keeper-email', { method:'POST', body:JSON.stringify({operation:'probe'}) });
    assert.notEqual(anonymous.status,200);
    assert.ok(!(await anonymous.text()).includes('bindingVerified'));
  } finally { await mf.dispose(); }
});
