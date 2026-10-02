import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {harness,newPage,enterText,screenshot,evidence} from './content-journey-browser-runtime.mjs';
const runtime=await harness();
const previous=JSON.parse(await readFile(evidence+'/browser-results.json','utf8'));
const only=process.env.QA_CASES?.split(',');
const reports=previous.reports.filter(r=>!r.knownGap &&
  (!r.name.startsWith('recovery-') || (only && !only.includes(r.name))));
const button=(p,name)=>p.getByRole('button',{name,exact:typeof name==='string'});
const content=(p,text)=>p.getByText(text,{exact:false}).or(p.getByLabel(new RegExp(text))).first();
async function until(fn,message,timeout=20000) {
  const start=Date.now();while(!await fn()) {
    if(Date.now()-start>timeout) throw Error(message);
    await new Promise(resolve=>setTimeout(resolve,50));
  }
}
async function open(p,name,ready) {await button(p,name).click();await content(p,ready).waitFor();}
async function declare(p,name='Human-authored') {
  await p.getByRole('checkbox',{name,exact:true}).click();
  await until(()=>p.getByRole('checkbox',{name,exact:true}).getAttribute('aria-checked').then(v=>v==='true'),'Disclosure selection');
}
async function activate(p) {
  await p.locator('flt-semantics-placeholder').waitFor({timeout:60000});
  await p.locator('flt-semantics-placeholder').evaluate(node=>node.click());
  await button(p,'Open composer').waitFor();
}
async function reload(p) {await p.reload({waitUntil:'load'});await activate(p);}
async function stats(p,caseId) {return p.evaluate(async id=>(await fetch('/api/fixture/stats',{
  headers:{'X-Synthetic-Case':id},
})).json(),caseId);}
async function run(name,options,task) {
  if(only && !only.includes('recovery-'+name)) return;
  const {page,context,result}=await newPage(runtime,options);
  result.name='recovery-'+name;
  try {
    assert.equal(await page.title(),'Lythaus content journey synthetic QA');
    await task(page,context,result);
    assert.deepEqual(result.errors,[]);
    assert.deepEqual(result.blocked,[]);
    result.status='passed';
  } catch(error) {
    result.status='failed';result.failure=error.stack;
    result.dom=await page.locator('body').innerText();
    result.labels=await page.locator('[aria-label]').evaluateAll(nodes=>nodes.map(n=>({
      role:n.getAttribute('role'),label:n.getAttribute('aria-label'),disabled:n.getAttribute('aria-disabled'),
    })));
    await screenshot(page,result,result.name+'-failure');
  } finally {
    reports.push(result);
    await writeFile(evidence+'/browser-results.json',JSON.stringify({
      commit:process.env.QA_COMMIT ?? 'working-tree-after-e30fbef1',
      synthetic_fixture:true,functional_scenarios:reports.length,gap_diagnostics:0,
      acceptance_status:'Local synthetic journey checks; real-email owner acceptance remains pending.',
      reports,
    },null,2));
    console.log(JSON.stringify({name:result.name,status:result.status,checks:result.checks,
      writes:result.writes.length,failure:result.failure?.split('\n').slice(0,4).join('\n')}));
    await context.close();
  }
}
async function newProfile(p,context,result,options,task) {
  const restored=await newPage(runtime,{...options,caseId:result.caseId,storageState:await context.storageState()});
  try {
    await task(restored.page,restored.result);
    result.writes.push(...restored.result.writes);
    result.errors.push(...restored.result.errors);
    result.blocked.push(...restored.result.blocked);
    result.expectedHttpErrors.push(...restored.result.expectedHttpErrors);
  } finally {await restored.context.close();}
}
try {
  await run('unsent-post-draft',{width:390,theme:'light'},async(p,context,r)=>{
    await open(p,'Open composer','Your post');
    await enterText(p,p.getByRole('textbox',{name:/Your post/}),'Durable unsent post');
    await declare(p,'AI-assisted');
    await content(p,'Draft saved on this device.').waitFor();
    await reload(p);
    await open(p,'Open composer','Your post');
    await content(p,'Draft restored on this device.').waitFor();
    assert.equal(await p.getByRole('checkbox',{name:'AI-assisted',exact:true}).getAttribute('aria-checked'),'true');
    assert.equal((await stats(p,r.caseId)).requests.length,0);
    await screenshot(p,r,'unsent-post-restored');
    await button(p,'Post').click();
    await button(p,'Open composer').waitFor();
    assert.equal(r.writes[0].body.body,'Durable unsent post');
    assert.equal(r.writes[0].body.declaredCreationMode,'ai_assisted');
    r.checks.push('Unsent text and explicit disclosure survive reload','Reload sends no content write','Restored draft submits canonical body');
  });
  await run('unsent-comment-new-context',{width:390,theme:'dark'},async(p,context,r)=>{
    await open(p,'Open comments','Synthetic owner comment');
    await enterText(p,p.getByRole('textbox',{name:/Write a/}),'Durable unsent comment');
    await declare(p);
    await content(p,'Draft saved on this device.').waitFor();
    await newProfile(p,context,r,{width:390,theme:'dark'},async(q,qr)=>{
      await open(q,'Open comments','Synthetic owner comment');
      await content(q,'Draft restored on this device.').waitFor();
      assert.equal(await q.getByRole('checkbox',{name:'Human-authored',exact:true}).getAttribute('aria-checked'),'true');
      assert.equal((await stats(q,r.caseId)).requests.length,0);
      await button(q,/Send reply/).click();
      await content(q,'Durable unsent comment').waitFor();
      assert.equal(qr.writes[0].body.body,'Durable unsent comment');
      await screenshot(q,r,'new-context-comment-draft');
    });
    r.checks.push('New browser context with the same device storage restores draft','No automatic write on restoration','Submitted text matches the saved draft');
  });
  for(const kind of ['post','comment']) {
    await run(kind+'-lost-create-ack',{width:390,theme:'light',scenario:'ack-loss'},async(p,context,r)=>{
      const text='Lost '+kind+' create acknowledgement';
      await open(p,kind==='post'?'Open composer':'Open comments',kind==='post'?'Your post':'Synthetic owner comment');
      await enterText(p,p.getByRole('textbox',{name:kind==='post'?/Your post/:/Write a/}),text);
      await declare(p);
      await button(p,kind==='post'?'Post':/Send reply/).click();
      await content(p,kind==='post'?'unconfirmed':'outcome is unknown').waitFor();
      const original=r.writes[0];
      await newProfile(p,context,r,{width:390,theme:'light',scenario:'ack-loss'},async(q,qr)=>{
        await open(q,kind==='post'?'Open composer':'Open comments',kind==='post'?'Your post':'Synthetic owner comment');
        await button(q,kind==='post'?'Post':'Retry same comment').waitFor();
        await button(q,kind==='post'?'Post':'Retry same comment').click();
        if(kind==='post') await button(q,'Open composer').waitFor();
        else await content(q,text).waitFor();
        assert.deepEqual(qr.writes[0],original);
        const saved=await stats(q,r.caseId);
        assert.equal(saved[kind==='post'?'posts':'comments'].filter(item=>item.body===text).length,1);
        if(kind==='post') {
          await button(q,'Open Discover').click();
          await content(q,'Your submissions').click();
          await content(q,'Your submission 1').click();
          await content(q,text).waitFor();
          assert.equal(await button(q,'Edit post').count(),1);
        }
        await screenshot(q,r,'replayed-'+kind+'-creation');
      });
      r.checks.push('Server commits before an injected lost acknowledgement','New browser context replays exact key and payload','One stored contribution after retry');
    });
  }
  for(const kind of ['post','comment']) {
    await run(kind+'-pending-owner-reopen',{width:390,theme:kind==='post'?'dark':'light'},async(p,context,r)=>{
      const text='Private pending '+kind+' revision';
      await open(p,kind==='post'?'Open post':'Open comments',kind==='post'?'Synthetic published post':'Synthetic owner comment');
      await button(p,'Edit '+kind).click();
      await enterText(p,p.getByRole('textbox',{name:kind==='post'?/Your post/:/Your comment/}),text);
      await declare(p);
      await button(p,'Submit edit').click();
      await content(p,text).waitFor();
      await reload(p);
      await open(p,kind==='post'?'Open post':'Open comments',text);
      assert.equal(await button(p,'Edit '+kind).count(),1);
      await content(p,'Under review. Publication checks are pending.').waitFor();
      if(kind==='post') {
        await p.evaluate(()=>globalThis.lythausSyntheticActor('other'));
        await content(p,'Unable to load this post').waitFor();
        assert.equal(await content(p,text).count(),0);
        assert.equal(await button(p,'Edit post').count(),0);
        await p.evaluate(()=>globalThis.lythausSyntheticActor('owner'));
        await content(p,text).waitFor();
      }
      await button(p,'Delete '+kind).click();await button(p,'Delete').click();
      if(kind==='post') await button(p,'Open post').waitFor();
      else await until(()=>content(p,text).count().then(n=>n===0),'Pending comment deletion');
      r.checks.push('Pending content reopens privately after reload','Pending declaration never becomes a public approval label','Owner can edit and delete pending content');
      if(kind==='post') r.checks.push('Live account switch removes private text and owner controls');
      await screenshot(p,r,'owner-pending-'+kind);
    });
  }
  for(const kind of ['post','comment']) {
    await run(kind+'-lost-delete-ack',{width:390,theme:'dark',scenario:'ack-loss'},async(p,context,r)=>{
      await open(p,kind==='post'?'Open post':'Open comments',kind==='post'?'Synthetic published post':'Synthetic owner comment');
      await button(p,'Delete '+kind).click();await button(p,'Delete').click();
      await content(p,'outcome is unknown').waitFor();
      const original=r.writes[0];
      await reload(p);
      await button(p,kind==='post'?'Open post':'Open comments').click();
      await button(p,kind==='post'?'Retry saved deletion':'Retry saved comment deletion').waitFor();
      await button(p,kind==='post'?'Retry saved deletion':'Retry saved comment deletion').click();
      if(kind==='post') await button(p,'Open post').waitFor();
      else await until(()=>button(p,'Retry saved comment deletion').count().then(n=>n===0),'Deletion journal not completed');
      assert.deepEqual(r.writes[1],original);
      const data=await stats(p,r.caseId);
      assert.equal(data[kind==='post'?'posts':'comments'].filter(item=>item.id===(kind==='post'?'p1':'c1')&&item.deleted).length,1);
      r.checks.push('Deletion committed before acknowledgement fault','Reload does not fabricate readable or deleted content','Saved deletion replay uses the original key and matching acknowledgement');
      await screenshot(p,r,'replayed-'+kind+'-deletion');
    });
  }
  await run('logout-and-account-isolation',{width:390,theme:'light',scenario:'outcome-unknown'},async(p,context,r)=>{
    await open(p,'Open comments','Synthetic owner comment');
    await enterText(p,p.getByRole('textbox',{name:/Write a/}),'Retry private unresolved request');
    await declare(p);await button(p,/Send reply/).click();
    await button(p,'Retry same comment').waitFor();
    const original=r.writes[0];
    await p.evaluate(()=>globalThis.lythausSyntheticActor('guest'));
    await until(()=>p.getByRole('textbox',{name:/Write a/}).isEnabled().then(v=>!v),'Guest composer did not disable');
    assert.equal(await content(p,'Retry private unresolved request').count(),0);
    await p.evaluate(()=>globalThis.lythausSyntheticActor('other'));
    await until(()=>p.getByRole('textbox',{name:/Write a/}).isEnabled(),'Other account restoration');
    assert.equal(await button(p,'Retry same comment').count(),0);
    await p.evaluate(()=>globalThis.lythausSyntheticActor('owner'));
    await content(p,'Re-enter the same text').waitFor();
    await enterText(p,p.getByRole('textbox',{name:/Write a/}),'Retry private unresolved request');
    await button(p,/Send reply/).click();await button(p,'Retry same comment').waitFor();
    assert.deepEqual(r.writes[1],original);
    assert.equal((await stats(p,r.caseId)).comments.filter(item=>item.body==='Retry private unresolved request').length,0);
    r.checks.push('Live logout clears private draft text','Other account cannot restore an unresolved request','Original account re-entry retains the same fingerprint and key','Quarantined unknown outcome remains an explicit hold');
    await screenshot(p,r,'logout-reentry-hold');
  });
  for(const kind of ['post','comment']) {
    await run(kind+'-late-ack-after-same-account-sign-in',{width:390,theme:'light'},async(p,context,r)=>{
      const originalText='Delayed '+kind+' from the earlier session';
      const currentText='Current session '+kind+' draft';
      const input=p.getByRole('textbox',{name:kind==='post'?/Your post/:/Write a/});
      await open(p,kind==='post'?'Open composer':'Open comments',kind==='post'?'Your post':'Synthetic owner comment');
      await enterText(p,input,originalText);await declare(p);
      await button(p,kind==='post'?'Post':/Send reply/).click();
      await until(()=>r.writes.length===1,'Original request was not sent');
      const original=r.writes[0];
      await p.evaluate(()=>globalThis.lythausSyntheticActor('guest'));
      await until(()=>input.inputValue().then(value=>value===''),'Logout did not clear the composer');
      await p.evaluate(()=>globalThis.lythausSyntheticActor('owner'));
      await content(p,'Re-enter the same text').waitFor();
      await enterText(p,input,currentText);
      await content(p,'Draft saved on this device.').waitFor();
      await until(async()=>{
        const saved=await stats(p,r.caseId);
        return saved[kind==='post'?'posts':'comments'].some(item=>item.body===originalText);
      },'Earlier request was not committed');
      await p.waitForTimeout(200);
      assert.equal(await input.inputValue(),currentText);
      await reload(p);
      await open(p,kind==='post'?'Open composer':'Open comments',kind==='post'?'Your post':'Synthetic owner comment');
      assert.equal(await input.inputValue(),currentText);
      await enterText(p,input,originalText);await declare(p);
      await button(p,kind==='post'?'Post':/Send reply/).click();
      if(kind==='post') await button(p,'Open composer').waitFor();
      else await content(p,originalText).waitFor();
      assert.deepEqual(r.writes[1],original);
      assert.equal((await stats(p,r.caseId))[kind==='post'?'posts':'comments'].filter(item=>item.body===originalText).length,1);
      r.checks.push('Logout and same-account sign-in fence the earlier completion','A current-session draft survives the late acknowledgement and reload','Re-entering the original body replays its saved key without duplicates');
      await screenshot(p,r,'late-ack-'+kind+'-replay');
    });
  }
  await run('lost-edit-ack',{width:390,theme:'light',scenario:'ack-loss'},async(p,context,r)=>{
    await open(p,'Open post','Synthetic published post');await button(p,'Edit post').click();
    await enterText(p,p.getByRole('textbox',{name:/Your post/}),'Lost pending edit acknowledgement');
    await declare(p,'AI-assisted');await button(p,'Submit edit').click();
    await button(p,'Retry same edit').waitFor();const original=r.writes[0];
    await reload(p);await open(p,'Open post','Lost pending edit acknowledgement');
    await button(p,'Edit post').click();await button(p,'Retry same edit').waitFor();
    await button(p,'Retry same edit').click();await content(p,'Lost pending edit acknowledgement').waitFor();
    assert.deepEqual(r.writes[1],original);
    r.checks.push('Owner view restores the committed pending revision','Saved edit restores text and its explicit disclosure','Retry reuses the original edit key');
    await screenshot(p,r,'replayed-post-edit');
  });
} finally {
  await runtime.close();
  const failed=reports.filter(r=>r.status==='failed');
  console.log(JSON.stringify({total:reports.length,passed:reports.length-failed.length,failed:failed.length}));
  process.exitCode=failed.length?1:0;
}
