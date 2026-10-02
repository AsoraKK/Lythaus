import assert from 'node:assert/strict';
const initial=()=>({
  posts:[{id:'p1',authorId:'owner',body:'Synthetic published post',declaredCreationMode:'human',
    moderationState:'allowed',publicLabel:'Human-authored',createdAt:'2026-10-01T00:00:00Z'}],
  comments:['owner','other'].map((actor,i)=>({id:'c'+(i+1),postId:'p1',authorId:actor,
    body:'Synthetic '+actor+' comment',parentId:null,declaredCreationMode:'human',
    moderationState:'allowed',createdAt:'2026-10-01T00:00:00Z'})),
  requests:[],replay:new Map(),processing:new Map(),denied:false,attempts:new Map(),
});
export function contentFixture() {
  const cases=new Map();
  return async function handle(request,response) {
    const path=new URL(request.url,'http://localhost').pathname;
    if(!path.startsWith('/api/')) return false;
    const caseId=request.headers['x-synthetic-case'] ?? 'default';
    if(!cases.has(caseId)) cases.set(caseId,initial());
    const state=cases.get(caseId),method=request.method;
    const actor=request.headers.authorization?.replace(/^Bearer synthetic-/,'') ?? 'guest';
    const scenario=request.headers['x-synthetic-scenario'] ?? '';
    if(scenario==='appeal') Object.assign(state.posts[0],{
      authorUsername:'owner', trustStatus:'under_appeal', hasAppeal:true,
      timeline:{created:'complete',mediaChecked:'none',moderation:'warn',appeal:'open'},
      proofSignalsProvided:true,verifiedContextBadgeEligible:false,featuredEligible:false,
    });
    let text=''; for await(const part of request) { text+=part; assert.ok(text.length<32768); }
    const body=text ? JSON.parse(text) : {};
    const key=request.headers['idempotency-key'] ?? '';
    const send=(data,status=200)=>{
      response.writeHead(status,{'content-type':'application/json','cache-control':'private, no-store',
        'vary':'Authorization','x-synthetic-fixture':'true'}).end(JSON.stringify(data));
      return true;
    };
    if(method==='GET' && path==='/api/fixture/stats') return send({
      requests:state.requests,posts:state.posts,comments:state.comments,
    });
    if(method!=='GET') {
      state.requests.push({method,path,body,key,actor});
      if(actor==='guest') return send({error:'unauthorized'},401);
      if(method==='DELETE' && scenario==='deny-delete' && !state.denied) {
        state.denied=true; return send({error:'forbidden'},403);
      }
      const fingerprint=JSON.stringify({method,path,body});
      const existing=state.replay.get(actor+':'+key);
      if(existing) {
        if(existing.fingerprint!==fingerprint) return send({error:'idempotency_key_conflict'},409);
        return send(existing.data,existing.status);
      }
      if(state.processing.has(actor+':'+key)) return send({error:'idempotency_in_progress'},409);
      state.processing.set(actor+':'+key,fingerprint);
      if((body.body ?? '').startsWith('Delayed')) await new Promise(resolve=>setTimeout(resolve,900));
      if((body.body ?? '').startsWith('Retry')) {
        const attempts=(state.attempts.get(key) ?? 0)+1; state.attempts.set(key,attempts);
        if(attempts===1 || scenario==='outcome-unknown') { state.processing.delete(actor+':'+key); return send({
          error:scenario==='outcome-unknown'?'idempotency_outcome_unknown':'idempotency_in_progress',
        },409); }
      }
    }
    const postId=path.match(/^\/api\/posts\/([^/]+)/)?.[1];
    const commentId=path.match(/^\/api\/comments\/([^/]+)/)?.[1];
    const post=state.posts.find(item=>item.id===postId);
    const comment=state.comments.find(item=>item.id===commentId);
    if(method==='GET') {
      if(path==='/api/feed/discover') return send({items:state.posts.filter(item=>!item.deleted && item.moderationState==='allowed')});
      if(path.endsWith('/owner-view')) {
        const item=commentId?comment:post;
        if(actor==='guest') return send({error:'unauthorized'},401);
        if(!item || item.authorId!==actor || item.deleted || !['allowed','under_review'].includes(item.moderationState))
          return send({error:commentId?'comment_not_found':'post_not_found'},404);
        const {publicLabel,...privateItem}=item;
        return send({[commentId?'comment':'post']:privateItem});
      }
      if(path.endsWith('/comments')) return send({
        items:post && !post.deleted && post.moderationState==='allowed'
          ? state.comments.filter(item=>item.postId===postId && item.moderationState==='allowed') : [],nextCursor:null,
      });
      return post && !post.deleted && post.moderationState==='allowed'
        ? send({post}) : send({error:'post_not_found'},404);
    }
    let data,status=200;
    if(method==='POST' && path==='/api/posts') {
      const item={id:'new-post',authorId:actor,...body,moderationState:'under_review',createdAt:'2026-10-02T00:00:00Z'};
      state.posts.push(item); data={...item,content:item.body,
        authorship:{authorshipLabel:'Under review',declaredAuthorship:item.declaredCreationMode,
          reviewState:'pending',classificationState:'unavailable'}}; status=201;
    } else if(method==='POST' && path.endsWith('/comments')) {
      const item={id:'new-'+state.comments.length,authorId:actor,postId,...body,
        parentId:body.parentId ?? null,moderationState:'under_review',createdAt:'2026-10-02T00:00:00Z'};
      state.comments.push(item); data={...item}; status=201;
    } else if((method==='PUT' || method==='DELETE') && (commentId?comment:post)?.authorId===actor) {
      const item=commentId?comment:post;
      if(method==='PUT') {
        Object.assign(item,body,{moderationState:'under_review'}); delete item.publicLabel;
        data=commentId?{...item}:{post:{...item}};
      } else {
        item.deleted=true; item.body=commentId?null:item.body;
        data={[commentId?'commentId':'postId']:item.id,deleted:true};
      }
    } else { state.processing.delete(actor+':'+key); return send({error:'forbidden'},403); }
    state.processing.delete(actor+':'+key);
    state.replay.set(actor+':'+key,{fingerprint:JSON.stringify({method,path,body}),data,status});
    if(scenario==='ack-loss') return send({error:'synthetic_acknowledgement_lost'},503);
    return send(data,status);
  };
}
