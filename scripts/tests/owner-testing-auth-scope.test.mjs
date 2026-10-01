import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { verifyOwnerTestingAuthScope, assertOwnerTestingScopedKeys } from '../ci/verify-owner-testing-auth-scope.mjs';
import { classifyScopedKeyBindings, TRANSACTIONAL_EMAIL_KEY } from '../ci/prepare-scoped-worker-secrets.mjs';

test('owner testing rejects a present or unobserved authenticity receipt before deployment', () => {
  for (const value of ['true', undefined, '', 'unknown']) assert.throws(() => verifyOwnerTestingAuthScope({
    OWNER_TESTING_DEPLOYMENT:'true', AUTHENTICITY_BETA_RELEASE_RECEIPT_PRESENT:value,
  }), /confirmed_absence/);
  assert.deepEqual(verifyOwnerTestingAuthScope({ OWNER_TESTING_DEPLOYMENT:'true', AUTHENTICITY_BETA_RELEASE_RECEIPT_PRESENT:'false' }), {
    status:'VERIFIED', ownerTesting:true, authenticityReleaseReceiptPresent:false,
    infrastructureMode:'verify_existing', scopedKeyMode:'preserve_only',
  });
  assert.deepEqual(verifyOwnerTestingAuthScope({ OWNER_TESTING_DEPLOYMENT:'false', AUTHENTICITY_BETA_RELEASE_RECEIPT_PRESENT:'true' }), { status:'NOT_APPLICABLE' });
});

test('owner testing cannot bootstrap encryption keys or touch coordinator keys', () => {
  const keys = new Set([TRANSACTIONAL_EMAIL_KEY]);
  const existing = classifyScopedKeyBindings({ publicNames:keys, jobsNames:keys, coordinatorManaged:false });
  assert.doesNotThrow(() => assertOwnerTestingScopedKeys(existing,true));
  const missing = classifyScopedKeyBindings({ publicNames:new Set(), jobsNames:new Set(), coordinatorManaged:false });
  assert.throws(() => assertOwnerTestingScopedKeys(missing,true), /existing_email_keys/);
  assert.doesNotThrow(() => assertOwnerTestingScopedKeys(missing,false));
  const coordinator = classifyScopedKeyBindings({ publicNames:keys, jobsNames:keys, coordinatorManaged:true });
  assert.throws(() => assertOwnerTestingScopedKeys(coordinator,true), /deferred_coordinator/);
});

function runProvider(script, scenario, args = []) {
  const directory = mkdtempSync(path.join(tmpdir(),'lythaus-owner-scope-'));
  const output = path.join(directory,'evidence.json');
  const calls = path.join(directory,'calls.jsonl');
  const fixture = `
    import fs from 'node:fs';
    const scenario=${JSON.stringify(scenario)};
    globalThis.fetch=async(input,options={})=>{
      const url=new URL(input),method=options.method??'GET';
      fs.appendFileSync(${JSON.stringify(calls)},JSON.stringify({path:url.pathname,method})+'\\n');
      if(method!=='GET')throw new Error('fixture_detected_provider_mutation');
      let result;
      if(url.pathname.includes('/challenges/widgets')) {
        const widget={name:'Lythaus Website Waitlist',sitekey:'0x4AAAAAAER5TLZUccZt2P0c',mode:'managed',
          domains:scenario==='widget-drift'?['unapproved.invalid']:['admin.lythaus.co','lythaus.co','www.lythaus.co'],
          secret:'synthetic-only'};
        result=url.search?(scenario==='missing-widget'?[]:[widget]):widget;
      } else if(url.pathname.endsWith('/queues')) {
        result=[{id:'synthetic-lifecycle',queue_name:'lythaus-email-lifecycle-dev'},
          {id:'synthetic-dlq',queue_name:'lythaus-email-lifecycle-dlq-dev'}];
        if(scenario==='missing-queue')result=result.slice(0,1);
      } else if(url.pathname.endsWith('/event_subscriptions/subscriptions')) {
        result=scenario==='missing-subscription'?[]:[{id:'synthetic-subscription',name:'lythaus-email-lifecycle-mail-lythaus-co',
          enabled:scenario!=='disabled-subscription',
          destination:{type:'queues.queue',queue_id:'synthetic-lifecycle'},
          source:{type:'email.sending',zone_id:'7bc572c8b7cd3c00be9c655176c29382',domain:'mail.lythaus.co'},
          events:scenario==='events-drift'?['message.delivered']:['message.delivered','message.deferred','message.bounced','message.failed','message.rejected','message.complained']}];
      } else throw new Error('fixture_detected_unexpected_endpoint');
      return Response.json({success:true,result});
    };
  `;
  const result = spawnSync(process.execPath,['--import',`data:text/javascript,${encodeURIComponent(fixture)}`,script,...args],{
    encoding:'utf8', timeout:10000, env:{ ...process.env, OWNER_TESTING_DEPLOYMENT:'true',
      CLOUDFLARE_API_TOKEN:'synthetic-only', CLOUDFLARE_ACCOUNT_ID:'e5b7ae46e04698f507b7e4b3d4ef1af0',
      CLOUDFLARE_ZONE_ID:'7bc572c8b7cd3c00be9c655176c29382',
      TURNSTILE_SECRET_FILE:path.join(directory,'synthetic-secret.json'), TURNSTILE_EVIDENCE_PATH:output,
      CLOUDFLARE_EMAIL_LIFECYCLE_OUTPUT:output },
  });
  try {
    const requests=readFileSync(calls,'utf8').trim().split('\n').map(JSON.parse);
    assert.ok(requests.length>0);
    assert.ok(requests.every(request=>request.method==='GET'),'Owner testing must not issue provider writes');
    assert.doesNotMatch(result.stderr ?? '',/fixture_detected_provider_mutation/);
    return { status:result.status, stderr:result.stderr, ...(result.status===0?{evidence:JSON.parse(readFileSync(output,'utf8'))}:{}) };
  } finally { rmSync(directory,{recursive:true,force:true}); }
}

test('owner testing verifies an existing Turnstile widget without provider mutation', () => {
  const result=runProvider('scripts/cloudflare/waitlist-turnstile.mjs','matching',['ensure']);
  assert.equal(result.status,0,result.stderr);
  assert.equal(result.evidence.created,false);
});
for (const [scenario,reason] of [['missing-widget','requires_existing_turnstile'],['widget-drift','turnstile_configuration_drift']]) {
  test(`owner testing stops on ${scenario} before creating or updating Turnstile`,()=>{
    const result=runProvider('scripts/cloudflare/waitlist-turnstile.mjs',scenario,['ensure']);
    assert.notEqual(result.status,0);
    assert.match(result.stderr,new RegExp(reason));
  });
}
test('owner testing verifies exact existing email lifecycle infrastructure with GETs only',()=>{
  const result=runProvider('scripts/ci/provision-cloudflare-email-lifecycle.mjs','matching');
  assert.equal(result.status,0,result.stderr);
  assert.equal(result.evidence.infrastructureMode,'verify_existing');
});
for (const [scenario,reason] of [['missing-queue','requires_existing_queue'],['missing-subscription','requires_existing_email_lifecycle_subscription'],
  ['disabled-subscription','email_lifecycle_subscription_drift'],['events-drift','email_lifecycle_subscription_drift']]) {
  test(`owner testing stops on ${scenario} before creating or patching infrastructure`,()=>{
    const result=runProvider('scripts/ci/provision-cloudflare-email-lifecycle.mjs',scenario);
    assert.notEqual(result.status,0);
    assert.match(result.stderr,new RegExp(reason));
  });
}
test('both production entrypoints enforce the owner scope and exclude unrelated runtime activation',()=>{
  const canonical=readFileSync('.github/workflows/production-release.yml','utf8');
  const native=readFileSync('.github/workflows/native-workers-deploy.yml','utf8');
  for (const source of [canonical,native]) {
    assert.match(source,/AUTHENTICITY_BETA_RELEASE_RECEIPT_PRESENT: \$\{\{ vars\.AUTHENTICITY_BETA_RELEASE_RECEIPT_SHA256 != '' \}\}/);
    assert.match(source,/node scripts\/ci\/verify-owner-testing-auth-scope\.mjs/);
  }
  assert.ok(native.indexOf('verify-owner-testing-auth-scope.mjs')<native.indexOf('Provision or verify the real production Turnstile widget'));
  for (const name of ['Prepare approved authenticity runtime','Activate approved private authenticity cohort']) {
    const block=native.split(`- name: ${name}`)[1]?.split('\n      - name:')[0];
    assert.ok(block);
    assert.match(block,/if: inputs\.owner_testing_deployment != true &&/);
  }
});
