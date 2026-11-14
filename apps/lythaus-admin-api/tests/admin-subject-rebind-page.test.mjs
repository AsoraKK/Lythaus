import assert from 'node:assert/strict';
import vm from 'node:vm';
import test from 'node:test';
import {rebindConfirmationPage,SUBJECT_REBIND_CONFIRMATION} from '../src/solo-recovery/subject-rebind.ts';

const expected={sourceSha:'a'.repeat(40),workerVersionId:'01900000-0000-7000-8000-000000000002'};
const reply=(status,body,version=expected)=>({ok:status>=200&&status<300,headers:{get:key=>({
  'content-type':'application/json','x-lythaus-source-sha':version.sourceSha,'x-lythaus-worker-version':version.workerVersionId,
})[key]},json:async()=>body});
test('confirmation page reconciles response loss with safe reads and never repeats a write',async()=>{
  const html=await rebindConfirmationPage({status:'approved_ready',reviewPacket:expected},true).text();
  const script=html.match(/<script nonce="[a-f0-9]+">([\s\S]*?)<\/script>/)[1];
  for(const scenario of [
    {post:reply(200,{status:'rebound'}),health:reply(200,{status:'ok'}),read:reply(200,{items:[]}),verified:true},
    {post:reply(409,{}),health:reply(200,{status:'ok'}),read:reply(200,{items:[]}),verified:true},
    {post:new Error('connection_lost'),health:reply(200,{status:'ok'}),read:reply(200,{items:[]}),verified:true},
    {post:reply(404,{}),health:reply(403,{}),verified:false},
    {post:new Error('connection_lost'),health:new Error('read_unavailable'),verified:false},
    {post:reply(409,{}),health:reply(200,{status:'ok'}),read:new Error('read_unavailable'),verified:true,readVerified:false},
    {post:reply(200,{}),health:reply(200,{status:'ok'}),read:reply(200,{status:'ok'}),verified:true,readVerified:false},
    {post:reply(200,{}),health:reply(200,{status:'ok'}),read:reply(403,{error:'admin_role_required'}),verified:true,readVerified:false},
    {post:reply(200,{}),health:reply(200,{status:'ok'},{...expected,sourceSha:'b'.repeat(40)}),verified:false},
    {post:reply(200,{}),health:reply(200,{status:'ok'}),read:reply(200,{items:[]},{...expected,workerVersionId:'other'}),verified:true,readVerified:false},
  ]){
    const button={disabled:false,onclick:null},status={textContent:''},link={hidden:true},requests=[];
    vm.runInNewContext(script,{document:{getElementById:id=>({confirm:button,status,continue:link}[id]??null)},
      location:{pathname:'/api/admin/recovery/subject-rebind'},fetch:async(path,options)=>{
        requests.push({path,...options});
        if(options.method!=='POST')assert.ok(['/api/admin/health','/api/admin/moderation/cases'].includes(path));
        const value=options.method==='POST'?scenario.post:path==='/api/admin/health'?scenario.health:scenario.read;
        if(value instanceof Error)throw value;return value;
      }});
    await button.onclick();
    assert.equal(button.disabled,true);assert.equal(link.hidden,!scenario.verified);
    assert.equal(requests.filter(row=>row.method==='POST').length,1);
    assert.deepEqual(JSON.parse(requests[0].body),{confirmation:SUBJECT_REBIND_CONFIRMATION});
    assert.ok(requests.slice(1).every(row=>row.method===undefined&&row.cache==='no-store'));
    assert.equal(status.textContent.includes('not applied'),false);
    assert.equal(status.textContent.includes('safe admin read are verified'),scenario.readVerified??scenario.verified);
  }
});
