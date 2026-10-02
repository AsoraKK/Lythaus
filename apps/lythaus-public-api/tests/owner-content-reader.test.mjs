import assert from 'node:assert/strict';
import test from 'node:test';
import { handleOwnerContentRead, ownerCommentQuery, ownerPostQuery, presentOwnerContent } from '../src/owner-content-reader.ts';

const actorId = '0192c000-0000-7000-8000-000000000001';
const id = '0192c000-0000-7000-8000-000000000002';
const other = '0192c000-0000-7000-8000-000000000003';
const row = (changes={}) => ({ id, authorId:actorId, body:'Synthetic pending body', declaredCreationMode:'human',
  moderationState:'under_review', deleted:false, visibility:'private', postId:other, parentId:null, depth:0,
  createdAt:'2026-10-02T00:00:00Z',updatedAt:'2026-10-02T00:00:00Z',...changes });
const request = (path='/api/posts/'+id+'/owner-view',method='GET') => new Request('https://api.lythaus.test'+path,{method});
const dependencies = (rows=[row()],changes={}) => ({
  authenticate:async()=>({userId:actorId}), query:async()=>({rows}),
  respond:(body,status)=>Response.json(body,{status,headers:{'cache-control':'private, no-store','vary':'Origin, Authorization'}}),
  ...changes,
});

test('known-ID owner reads include pending post bodies and private response headers',async()=>{
  let read;
  const response=await handleOwnerContentRead(request(),dependencies(undefined,{query:async(sql,values)=>{read={sql,values};return{rows:[row({privateModerationSignal:'not exposed'})]};}}));
  assert.equal(response.status,200);
  assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.equal(response.headers.get('vary'),'Origin, Authorization');
  assert.deepEqual(read,{sql:ownerPostQuery,values:[id,actorId]});
  const body=await response.json();
  assert.equal(body.post.body,'Synthetic pending body');
  assert.equal(body.post.moderationState,'under_review');
  assert.equal(body.post.privateModerationSignal,undefined);
  assert.equal(body.post.publicLabel,undefined);
});

test('comment view binds comment author rather than parent post author',async()=>{
  const response=await handleOwnerContentRead(request('/api/comments/'+id+'/owner-view'),dependencies([row({parentId:other,depth:1})],{
    query:async(sql,values)=>{assert.equal(sql,ownerCommentQuery);assert.deepEqual(values,[id,actorId]);return{rows:[row({parentId:other,depth:1,parentBody:'foreign private body'})]};},
  }));
  const body=await response.json();
  assert.equal(response.status,200);
  assert.equal(body.comment.parentId,other);
  assert.equal(body.comment.depth,1);
  assert.equal(body.comment.parentBody,undefined);
  assert.equal(body.comment.visibility,undefined);
});

test('guests are rejected before content query',async()=>{
  const response=await handleOwnerContentRead(request(),dependencies([],{authenticate:async()=>{throw new Error('authentication_required');},query:async()=>assert.fail('guest queried body')}));
  assert.equal(response.status,401);
  assert.equal(response.headers.get('cache-control'),'private, no-store');
});

test('missing, foreign, deleted, blocked and unsupported content share not-found semantics',async()=>{
  for(const item of [undefined,row({authorId:other}),row({deleted:true}),row({moderationState:'blocked'}),row({declaredCreationMode:'ai_generated'}),row({body:null})]){
    for(const kind of ['post','comment']){
      assert.throws(()=>presentOwnerContent(kind,item,actorId),new RegExp(kind+'_not_found'));
      const response=await handleOwnerContentRead(request('/api/'+kind+'s/'+id+'/owner-view'),dependencies(item?[item]:[]));
      assert.equal(response.status,404);
      assert.deepEqual(await response.json(),{error:kind+'_not_found'});
    }
  }
});

test('allowed revisions remain readable, and queries exclude deleted and inactive authors',()=>{
  assert.equal(presentOwnerContent('post',row({moderationState:'allowed'}),actorId).moderationState,'allowed');
  for(const sql of [ownerPostQuery,ownerCommentQuery]){
    assert.match(sql,/author\.status = 'active'/);
    assert.match(sql,/author_id = \$2::uuid/);
    assert.match(sql,/deleted_at IS NULL/);
    assert.match(sql,/moderation_state IN \('allowed', 'under_review'\)/);
  }
  assert.doesNotMatch(ownerCommentQuery,/post\.author_id = \$2/);
});

test('public and mutation routes are left to the existing dispatcher',async()=>{
  for(const req of [request('/api/posts/'+id),request('/api/posts/'+id+'/comments'),request('/api/comments/'+id),request(undefined,'PUT')]){
    assert.equal(await handleOwnerContentRead(req,dependencies([],{authenticate:async()=>assert.fail('public route authenticated')})),undefined);
  }
});

test('malformed IDs never reach SQL, while backend failure stays a generic private error',async()=>{
  for(const path of ['/api/posts/not-a-uuid/owner-view','/api/comments/%ZZ/owner-view']){
    const response=await handleOwnerContentRead(request(path),dependencies([],{query:async()=>assert.fail('invalid ID reached SQL')}));
    assert.equal(response.status,404);
  }
  const response=await handleOwnerContentRead(request(),dependencies([],{query:async()=>{throw new Error('private query detail');}}));
  assert.equal(response.status,500);
  assert.doesNotMatch(JSON.stringify(await response.json()),/private query detail/);
});
