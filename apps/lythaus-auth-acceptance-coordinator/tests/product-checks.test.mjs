import assert from 'node:assert/strict';
import test from 'node:test';
import { OWNER_PRODUCT_CASES, runOwnerProductChecks } from '../src/product-checks.ts';

function fixture({ fail='', privacyExisting=false, invalidPrivacy=false, badRotation=false }={}) {
  let loggedOut=false, refreshes=0;
  const seen=[];
  const result=(status,body)=>({response:new Response(null,{status}),body});
  return {
    seen,
    input:{runId:'synthetic-run',userId:'synthetic-user',accessToken:'synthetic-access',observeTime:async()=>new Date().toISOString(),
      login:async()=>result(fail==='login'?401:200,{accessToken:'synthetic-second-access',refreshToken:'synthetic-refresh'}),
      call:async(path,method,body,headers)=>{
        seen.push({path,method});
        if(fail===`${method} ${path}`)return result(503,{});
        if(path==='/api/auth/userinfo')return result(200,{id:'synthetic-user',email:'synthetic@example.invalid'});
        if(path==='/api/users/me')return result(loggedOut?401:200,{});
        if(path==='/api/posts') {assert.equal(headers['idempotency-key'],'synthetic-run');return result(201,{data:{postId:'synthetic-post'}});}
        if(path==='/api/flags') {assert.equal(body.contentId,'synthetic-post');return result(201,{});}
        if(path==='/api/privacy/requests')return privacyExisting?result(429,{error:'privacy_request_active'}):result(202,{});
        if(path==='/api/privacy/requests?requestType=export')return result(200,{request:{requestType:invalidPrivacy?'delete':'export',state:'completed'}});
        if(path==='/api/auth/refresh')return ++refreshes===1?result(200,{refreshToken:badRotation?'synthetic-refresh':'synthetic-replacement'}):result(401,{error:'refresh_token_reuse'});
        if(path==='/api/auth/logout'){loggedOut=true;return result(200,{});}
        throw new Error('Unexpected candidate route');
      },
    },
  };
}

test('fixed Keeper checks exercise all existing credentialed ADR-003 cases without exporting credentials',async()=>{
  for(const privacyExisting of [false,true]){
    const {input,seen}=fixture({privacyExisting});
    const evidence=await runOwnerProductChecks(input);
    assert.deepEqual(evidence.map(x=>x.id).sort(),[...OWNER_PRODUCT_CASES].sort());
    assert.ok(evidence.every(x=>Object.keys(x).sort().join(',')==='completedAt,id'));
    assert.ok(!JSON.stringify(evidence).includes('synthetic'));
    assert.equal(seen.filter(x=>x.path==='/api/auth/refresh').length,2);
    assert.ok(seen.findIndex(x=>x.path==='/api/auth/refresh')<seen.findIndex(x=>x.path==='/api/auth/logout'));
  }
});

test('no product failure, unchanged refresh or private export conflict is counted as passed',async()=>{
  for(const fail of ['login','GET /api/auth/userinfo','GET /api/users/me','PATCH /api/users/me','POST /api/posts','POST /api/flags','POST /api/privacy/requests','POST /api/auth/refresh','POST /api/auth/logout']){
    await assert.rejects(()=>runOwnerProductChecks(fixture({fail}).input),/acceptance_product_/);
  }
  await assert.rejects(()=>runOwnerProductChecks(fixture({badRotation:true}).input),/refresh_failed/);
  await assert.rejects(()=>runOwnerProductChecks(fixture({privacyExisting:true,invalidPrivacy:true}).input),/privacy_status_failed/);
});
