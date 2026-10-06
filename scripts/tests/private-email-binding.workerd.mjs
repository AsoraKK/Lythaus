import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire, builtinModules } from 'node:module';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../../node_modules/wrangler/package.json', import.meta.url));
const { build } = require('esbuild');
const { Miniflare, convertV4MiniflareOptions } = require('miniflare');
const root = fileURLToPath(new URL('../../', import.meta.url));

test('native workerd signs and verifies scoped dispatch hints without external network',async()=>{
  const bundle=await build({absWorkingDir:root,
    stdin:{resolveDir:root,contents:`import {createTransactionalEmailDispatchMessage,verifyTransactionalEmailDispatchMessage} from './packages/security/src/transactional-email-dispatch.ts';export default {async fetch(request,env){const input=await request.json();const message=await createTransactionalEmailDispatchMessage(input.id,env.FIXTURE_KEY);return Response.json({valid:!!await verifyTransactionalEmailDispatchMessage(message,env.FIXTURE_KEY),tampered:!!await verifyTransactionalEmailDispatchMessage({...message,outboxId:input.otherId},env.FIXTURE_KEY),fields:Object.keys(message).sort()});}};`},
    bundle:true,write:false,format:'esm',platform:'node',target:'es2022'});
  let outbound=0;
  const mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'dispatch-crypto',modules:true,
    compatibilityDate:'2026-08-01',compatibilityFlags:['nodejs_compat'],
    script:bundle.outputFiles[0].text,
    bindings:{FIXTURE_KEY:randomBytes(32).toString('base64')},outboundService:()=>{outbound++;return new Response(null,{status:403});},
  }]}));
  try {
    const response=await mf.dispatchFetch('https://fixture.invalid/sign',{method:'POST',body:JSON.stringify({id:'01900000-0000-7000-8000-000000000001',otherId:'01900000-0000-7000-8000-000000000002'})});
    assert.equal(response.status,200);
    assert.deepEqual(await response.json(),{valid:true,tampered:false,fields:['outboxId','signature','type']});
    assert.equal(outbound,0);
  }finally{await mf.dispose();}
});

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
    const supportInput = JSON.stringify({ actorId: version, email: 'synthetic-support@example.invalid' });
    const privateSupport = await mf.dispatchFetch('https://api.lythaus.test/keeper-account-support/lookup', { method: 'POST', body: supportInput });
    assert.equal(privateSupport.status, 503);
    assert.deepEqual(await privateSupport.json(), { error: 'account_support_unavailable', workerVersion: version });
    const anonymousSupport = await publicWorker.fetch('https://api.lythaus.test/keeper-account-support/lookup', { method: 'POST', body: supportInput });
    assert.notEqual(anonymousSupport.status, 200);
    const anonymousBody = await anonymousSupport.text();
    assert.ok(!anonymousBody.includes('workerVersion'));
    assert.ok(!anonymousBody.includes('account_support_unavailable'));
  } finally { await mf.dispose(); }
});
