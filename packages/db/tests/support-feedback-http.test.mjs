import assert from 'node:assert/strict';
import test from 'node:test';
import { handleSupportFeedbackRequest, isSupportFeedbackPath } from '../src/support-feedback-http.ts';

function setup(service, readBody=async request=>request.json()) {
  const calls=[];
  const handle=(request,channel='member')=>handleSupportFeedbackRequest({request,service,channel,
    respond:(body,status)=>{calls.push({body,status});return Response.json(body,{status,headers:{'cache-control':'private, no-store'}});},
    readBody,
  });
  return {handle,calls};
}

function service() {
  const calls=[];
  const result=(name,value={})=>{calls.push({name,value});return Promise.resolve(value);};
  return {calls,service:{
    supportOptions:(...args)=>result('supportOptions',args[1]),
    submit:(request,body)=>result('submit',{kind:body.kind,replayed:false}),
    memberList:(request,kind,options)=>result('memberList',{kind,options}),
    ownerQueue:(request,kind,options)=>result('ownerQueue',{kind,options}),
    memberDetail:(request,kind,id,options)=>result('memberDetail',{kind,id,options}),
    ownerDetail:(request,kind,id,options)=>result('ownerDetail',{kind,id,options}),
    memberReply:(request,kind,id,body)=>result('memberReply',{kind,id,body,replayed:false}),
    ownerReply:(request,kind,id,body)=>result('ownerReply',{kind,id,body,replayed:false}),
    ownerNote:(request,kind,id,body)=>result('ownerNote',{kind,id,body,replayed:false}),
    ownerEvidence:(request,kind,id,body)=>result('ownerEvidence',{kind,id,body,replayed:false}),
    ownerDecision:(request,kind,id,body)=>result('ownerDecision',{kind,id,body,replayed:false}),
  }};
}

function req(method,path,body) {
  return new Request(`https://api.lythaus.co${path}`,{method,headers:body===undefined?{}:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
}

test('problem and suggestion list routes remain separate, bounded and private',async()=>{
  const f=service(),{handle,calls:responses}=setup(f.service);
  const problem=await handle(req('GET','/api/support/problems?limit=3'));
  const suggestion=await handle(req('GET','/api/support/suggestions?limit=2&cursor=abc'));
  assert.equal(problem.status,200);assert.equal(suggestion.status,200);
  assert.deepEqual(f.calls.map(x=>x),[
    {name:'memberList',value:{kind:'problem',options:{limit:3}}},
    {name:'memberList',value:{kind:'suggestion',options:{limit:2,cursor:'abc'}}},
  ]);
  assert.equal(problem.headers.get('cache-control'),'private, no-store');
  assert.equal(responses[0].status,200);
});

test('submission route enforces its kind and maps replay status without leaking service errors',async()=>{
  const f=service(),{handle,calls}=setup(f.service);
  const mismatched=await handle(req('POST','/api/support/problems',{kind:'suggestion'}));
  assert.equal(mismatched.status,400);assert.equal(calls[0].body.error,'support_input_invalid');
  assert.equal(f.calls.length,0);
  const created=await handle(req('POST','/api/support/suggestions',{kind:'suggestion'}));
  assert.equal(created.status,201);assert.equal(f.calls[0].name,'submit');
  assert.equal(await isSupportFeedbackPath('/api/support/problems','member'),true);
  assert.equal(await isSupportFeedbackPath('/api/support/problems/abc/messages','member'),true);
  assert.equal(await isSupportFeedbackPath('/api/support/problems/abc/private','member'),false);
  const faulty=setup({...f.service,memberList:async()=>{throw new Error('PRIVATE_SENTINEL');}});
  const failed=await faulty.handle(req('GET','/api/support/problems?limit=1'));
  assert.equal(failed.status,503);assert.deepEqual(await failed.json(),{error:'support_unavailable'});
});

test('member detail and reply allow only public messages with an explicit request kind',async()=>{
  const f=service(),{handle}=setup(f.service),id='018f0000-0000-7000-8000-000000000001';
  await handle(req('GET',`/api/support/problems/${id}?messageBefore=7`));
  await handle(req('POST',`/api/support/problems/${id}/messages`,{expectedRevision:2,message:'A reply'}));
  assert.deepEqual(f.calls.map(x=>x.name),['memberDetail','memberReply']);
  assert.equal(f.calls[0].value.kind,'problem');assert.equal(f.calls[0].value.options.messageBefore,7);
  assert.equal(f.calls[1].value.id,id);
  const invalid=await handle(req('GET',`/api/support/problems/${id}?noteBefore=2`));
  assert.equal(invalid.status,400);
});

test('owner routes keep each private action inside the owner service channel',async()=>{
  const f=service(),{handle}=setup(f.service),id='018f0000-0000-7000-8000-000000000002';
  await handle(req('GET','/api/admin/support/options'),'owner');
  await handle(req('GET','/api/admin/support/suggestions?limit=5'),'owner');
  await handle(req('GET',`/api/admin/support/suggestions/${id}?noteBefore=4`),'owner');
  await handle(req('POST',`/api/admin/support/suggestions/${id}/messages`,{expectedRevision:1,message:'Owner reply'}),'owner');
  await handle(req('POST',`/api/admin/support/suggestions/${id}/notes`,{expectedRevision:2,text:'Private note'}),'owner');
  await handle(req('POST',`/api/admin/support/suggestions/${id}/evidence`,{expectedRevision:3,type:'usefulness',description:'Evidence'}),'owner');
  await handle(req('POST',`/api/admin/support/suggestions/${id}/decision`,{expectedRevision:4,state:'accepted',reason:'useful',memberMessage:'Accepted',evidenceIds:[]}),'owner');
  assert.deepEqual(f.calls.map(x=>x.name),['supportOptions','ownerQueue','ownerDetail','ownerReply','ownerNote','ownerEvidence','ownerDecision']);
  assert.equal(f.calls[1].value.kind,'suggestion');assert.equal(f.calls[2].value.options.noteBefore,4);
  const member=await handle(req('POST',`/api/support/suggestions/${id}/notes`,{text:'not supported'}));
  assert.equal(member.status,404);
});

test('owner collection routes cannot submit member requests',async()=>{
  const f=service(),{handle}=setup(f.service);
  const response=await handle(req('POST','/api/admin/support/problems',{kind:'problem'}),'owner');
  assert.equal(response.status,405);
  assert.deepEqual(f.calls,[]);
});

test('bounded JSON reader errors retain client status and safe code',async()=>{
  for(const [code,status] of [['invalid_json',400],['request_too_large',413]]){
    const {handle}=setup(service().service,async()=>{throw new Error(code);});
    const response=await handle(req('POST','/api/support/problems',{kind:'problem'}));
    assert.equal(response.status,status);
    assert.deepEqual(await response.json(),{error:code});
  }
});

test('missing policy or schema returns an honest unavailable response',async()=>{
  const {handle,calls}=setup(null);
  const response=await handle(req('GET','/api/support/problems?limit=2'));
  assert.equal(response.status,503);assert.equal(calls[0].body.error,'support_unavailable');
});
