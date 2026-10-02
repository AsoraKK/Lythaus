import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { harness, newPage, enterText, screenshot, evidence } from './content-journey-browser-runtime.mjs';

const runtime = await harness();
const only = process.env.QA_CASES?.split(',');
const reports = only ? JSON.parse(await readFile(evidence+'/browser-results.json','utf8')).reports.filter(r=>!only.includes(r.name)) : [];
const button = (page, name) => page.getByRole('button', { name, exact: typeof name === 'string' });
const content = (page, text, options = {}) => page.getByText(text, {exact:false})
  .or(page.getByLabel(new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).first();
const tick = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
async function until(fn, message, timeout = 15000) {
  const start = Date.now();
  while (!(await fn())) {
    if (Date.now() - start > timeout) throw new Error(message);
    await new Promise(resolve => setTimeout(resolve, 40));
  }
}
async function open(page, name, ready) {
  await button(page, name).click();
  await content(page,ready, { exact: true }).waitFor();
}
async function declare(page, name = 'Human-authored') {
  await page.getByRole('checkbox', { name, exact: true }).click();
  await until(() => page.getByRole('checkbox', {name,exact:true}).getAttribute('aria-checked').then(x=>x==='true'), 'Declaration did not select');
}
function verifyBody(write, body, declaration = 'human', parentId) {
  assert.equal(write.body.body, body);
  assert.equal(write.body.declaredCreationMode, declaration);
  assert.ok(write.key.length > 10);
  assert.ok(!('text' in write.body));
  if (parentId !== undefined) assert.equal(write.body.parentId ?? null, parentId);
}
async function run(name, options, task) {
  if (only && !only.includes(name)) return;
  const {page,context,result} = await newPage(runtime, options);
  result.name = name;
  result.scenario = options.scenario ?? '';
  result.identity = {url: page.url(), title: await page.title()};
  try {
    assert.equal(result.identity.title, 'Lythaus content journey synthetic QA');
    assert.ok((await page.locator('body').innerText()).includes('Synthetic journey QA'));
    await task(page,result);
    await tick(page);
    assert.deepEqual(result.errors, [], 'Browser console/page errors');
    assert.deepEqual(result.blocked, [], 'Unexpected external request');
    result.status = 'passed';
  } catch (error) {
    result.status = 'failed';
    result.failure = error.stack;
    result.dom = await page.locator('body').innerText();
    result.labels = await page.locator('[aria-label]').evaluateAll(nodes=>nodes.map(n=>({role:n.getAttribute('role'),label:n.getAttribute('aria-label'),disabled:n.getAttribute('aria-disabled')})));
    await screenshot(page,result,name+'-failure');
  } finally {
    reports.push(result);
    await writeFile(evidence+'/browser-results.json', JSON.stringify({commit:process.env.QA_COMMIT ?? 'local-working-tree',synthetic_fixture:true,functional_scenarios:reports.length,gap_diagnostics:0,acceptance_status:'Local synthetic checks; real-email owner acceptance remains pending.',reports},null,2));
    console.log(JSON.stringify({name,width:result.width,theme:result.theme,actor:result.actor,status:result.status,checks:result.checks,writes:result.writes.length,failure:result.failure?.split('\n').slice(0,4).join('\n')}));
    await context.close();
  }
}

try {
  for (const width of [390,1024]) for (const theme of ['light','dark']) {
    await run('composer', {width,theme}, async (page,result) => {
      await button(page,'Open composer').click();
      await button(page,'Post').waitFor();
      assert.equal(await button(page,'Post').isEnabled(),false);
      assert.equal(await page.getByRole('checkbox').count(),2);
      await screenshot(page,result,'composer-empty');
      await enterText(page,page.getByRole('textbox',{name:/Your post/}),'Delayed synthetic post');
      await tick(page);
      assert.equal(await button(page,'Post').isEnabled(),false);
      await declare(page);
      await until(()=>button(page,'Post').isEnabled(),'Post did not enable');
      await screenshot(page,result,'composer-filled');
      const field = await page.getByRole('textbox',{name:/Your post/}).boundingBox();
      assert.ok(field.y > 65 && field.y+field.height < 900);
      await button(page,'Post').evaluate(node=>{node.click();node.click();});
      await button(page,'Open composer').waitFor();
      await content(page,'Post submitted. Publication checks are pending.',{exact:true}).waitFor();
      assert.equal(result.writes.length,1);
      verifyBody(result.writes[0],'Delayed synthetic post');
      assert.equal(result.writes[0].method,'POST');
      assert.equal(result.writes[0].path,'/api/posts');
      result.checks.push('Nonblank page with expected identity','Floating label visible in screenshot','Explicit declaration required; generated option absent','Double submit sends one canonical request','Pending creation feedback');
      await screenshot(page,result,'post-created-pending');
    });
    await run('comments-crud', {width,theme}, async (page,result) => {
      await open(page,'Open comments','Synthetic owner comment');
      await content(page,'Synthetic other comment',{exact:true}).waitFor();
      assert.equal(await button(page,'Edit comment').count(),1);
      assert.equal(await button(page,'Delete comment').count(),1);
      await screenshot(page,result,'comments-read');
      await button(page,'Edit comment').click();
      await page.getByRole('textbox',{name:/Your comment/}).waitFor();
      assert.equal(await page.getByRole('checkbox',{name:'Human-authored',exact:true}).getAttribute('aria-checked'),'false');
      await enterText(page,page.getByRole('textbox',{name:/Your comment/}),'Synthetic edited comment');
      await declare(page,'AI-assisted');
      await button(page,'Submit edit').click();
      await content(page,'Synthetic edited comment',{exact:true}).waitFor();
      await content(page,'Under review. Publication checks are pending.',{exact:true}).waitFor();
      verifyBody(result.writes[0],'Synthetic edited comment','ai_assisted');
      assert.equal(result.writes[0].method,'PUT');
      assert.equal(result.writes[0].path,'/api/comments/c1');
      await screenshot(page,result,'comment-edited-pending');
      await button(page,'Delete comment').click();
      await content(page,'Delete comment?',{exact:true}).waitFor();
      await button(page,'Cancel').click();
      assert.equal(result.writes.length,1);
      await button(page,'Delete comment').click();
      await button(page,'Delete').click();
      await until(()=>content(page,'Synthetic edited comment',{exact:true}).count().then(c=>c===0),'Deleted comment still rendered');
      await until(()=>Promise.resolve(result.writes.length===2),'Deletion console record not received');
      assert.equal(result.writes.length,2);
      assert.equal(result.writes[1].method,'DELETE');
      assert.equal(result.writes[1].path,'/api/comments/c1');
      result.checks.push('Canonical read bodies','Only owner controls rendered','Fresh edit declaration; canonical PUT; pending feedback','Cancel deletion sends no request','Matching delete acknowledgement removes item');
      await screenshot(page,result,'comment-deleted');
    });
    await run('post-crud', {width,theme}, async (page,result) => {
      await open(page,'Open post','Synthetic published post');
      await button(page,'Edit post').click();
      await page.getByRole('textbox',{name:/Your post/}).waitFor();
      assert.equal(await page.getByRole('checkbox',{name:'Human-authored',exact:true}).getAttribute('aria-checked'),'false');
      await enterText(page,page.getByRole('textbox',{name:/Your post/}),'Synthetic edited post');
      await declare(page);
      await button(page,'Submit edit').click();
      await content(page,'Synthetic edited post',{exact:true}).waitFor();
      await content(page,'Under review. Publication checks are pending.',{exact:true}).waitFor();
      assert.equal(await button(page,'Edit post').count(),1);
      verifyBody(result.writes[0],'Synthetic edited post');
      assert.equal(result.writes[0].method,'PUT');
      assert.equal(result.writes[0].path,'/api/posts/p1');
      await screenshot(page,result,'post-edited-pending');
      await button(page,'Delete post').click();
      await content(page,'Delete post?',{exact:true}).waitFor();
      await button(page,'Cancel').click();
      assert.equal(result.writes.length,1);
      await button(page,'Delete post').click();
      await button(page,'Delete').click();
      await button(page,'Open post').waitFor();
      assert.equal(result.writes.length,2);
      assert.equal(result.writes[1].method,'DELETE');
      assert.equal(result.writes[1].path,'/api/posts/p1');
      result.checks.push('Owned published post read','Fresh explicit edit declaration','Partial PUT ack preserves author controls; pending feedback','Cancel sends no deletion; acknowledged deletion returns');
      await screenshot(page,result,'post-deleted');
    });
  }
  await run('reply-and-retry',{width:390,theme:'light'},async(page,result)=>{
    await open(page,'Open comments','Synthetic owner comment');
    await button(page,'Reply').nth(1).click();
    await content(page,'Replying to @other',{exact:true}).waitFor();
    await enterText(page,page.getByRole('textbox',{name:/Write a reply/}),'Retry canonical child body');
    await declare(page);
    await button(page,/Send reply/).click();
    await button(page,'Retry same comment').waitFor();
    assert.equal(result.writes.length,1);
    verifyBody(result.writes[0],'Retry canonical child body','human','c2');
    assert.equal(await page.getByRole('textbox',{name:/Write a reply/}).isEnabled(),false);
    assert.equal(await page.getByRole('textbox',{name:/Write a reply/}).inputValue(),'Retry canonical child body');
    assert.equal(await page.getByRole('checkbox',{name:'Human-authored',exact:true}).isEnabled(),false);
    await screenshot(page,result,'reply-uncertain');
    await button(page,'Retry').click();
    await content(page,'Retry canonical child body',{exact:true}).waitFor();
    assert.equal(result.writes.length,2);
    assert.deepEqual(result.writes[1],result.writes[0]);
    assert.equal(await button(page,'Reply').count(),2);
    await content(page,'Under review. Publication checks are pending.',{exact:true}).waitFor();
    result.checks.push('Reply sends parentId and unchanged body without mention prefix','Uncertain response locks draft/declaration','Banner Retry replays same request/key','One-level reply; pending state visible');
    await screenshot(page,result,'reply-retried-pending');
  });
  await run('comment-inflight',{width:390,theme:'dark'},async(page,result)=>{
    await open(page,'Open comments','Synthetic owner comment');
    await enterText(page,page.getByRole('textbox',{name:/Write a reply/}),'Delayed single comment');
    await declare(page);
    await button(page,/Send reply/).evaluate(node=>{node.click();node.click();});
    await until(()=>Promise.resolve(result.writes.length===1),'Comment request not sent');
    await button(page,'Back').click();
    assert.equal(await button(page,'Open comments').count(),0);
    await content(page,'Delayed single comment',{exact:true}).waitFor();
    assert.equal(result.writes.length,1);
    verifyBody(result.writes[0],'Delayed single comment','human',null);
    result.checks.push('Duplicate/inflight click sends one comment','Back during request leaves screen in place','Root comment canonical parentId null');
    await screenshot(page,result,'comment-inflight-completed');
  });
  await run('delete-denied-retry',{width:390,theme:'light',scenario:'deny-delete'},async(page,result)=>{
    await open(page,'Open comments','Synthetic owner comment');
    await button(page,'Delete comment').click();
    await button(page,'Delete').click();
    await button(page,'Retry').waitFor();
    await content(page,'Synthetic owner comment',{exact:true}).waitFor();
    assert.equal(result.writes.length,1);
    await screenshot(page,result,'delete-denied');
    await button(page,'Retry').click();
    await until(()=>content(page,'Synthetic owner comment',{exact:true}).count().then(n=>n===0),'Retry deletion not completed');
    await until(()=>Promise.resolve(result.writes.length===2),'Retry deletion console record not received');
    assert.equal(result.writes.length,2);
    assert.notEqual(result.writes[0].key,result.writes[1].key);
    result.checks.push('Definitive 403 preserves item/error','Retry targets deletion; definitive failure releases key');
  });
  for (const actor of ['other','guest']) {
    await run('owner-permissions',{width:390,theme:'light',actor},async(page,result)=>{
      await open(page,'Open post','Synthetic published post');
      assert.equal(await button(page,'Edit post').count(),0);
      assert.equal(await button(page,'Delete post').count(),0);
      await screenshot(page,result,'post-permissions-'+actor);
      await button(page,'Back').click();
      await open(page,'Open comments','Synthetic owner comment');
      assert.equal(await button(page,'Edit comment').count(),actor==='other'?1:0);
      assert.equal(await button(page,'Delete comment').count(),actor==='other'?1:0);
      await screenshot(page,result,'comment-permissions-'+actor);
      if(actor==='guest') {
        assert.equal(await page.getByRole('textbox',{name:/Write a reply/}).isEnabled(),false);
        assert.equal(await button(page,/Send reply/).isEnabled(),false);
        await content(page,'Sign in to comment.',{exact:true}).waitFor();
        assert.equal(result.writes.length,0);
      }
      result.checks.push('Foreign post owner actions absent','Comment actions scoped to current owner','No foreign mutation invoked');
    });
  }
  await run('discover-edit',{width:1024,theme:'dark'},async(page,result)=>{
    await button(page,'Open Discover').click();
    await content(page,'Synthetic published post',{exact:true}).first().waitFor();
    await screenshot(page,result,'discover-read');
    await button(page,'Post actions').click();
    await content(page,'Edit post',{exact:true}).click();
    await page.getByRole('textbox',{name:/Your post/}).waitFor();
    await enterText(page,page.getByRole('textbox',{name:/Your post/}),'Synthetic Discover edit');
    await declare(page);
    await button(page,'Submit edit').click();
    await content(page,'Edit submitted. Publication checks are pending.',{exact:true}).waitFor();
    assert.equal(result.writes.length,1);
    verifyBody(result.writes[0],'Synthetic Discover edit');
    await until(()=>content(page,'Synthetic published post',{exact:true}).count().then(n=>n===0),'Discover item not refreshed');
    result.checks.push('Discover renders source-backed card','Feed owner action uses shared declared editor','Successful pending edit refreshes public feed');
    await screenshot(page,result,'discover-edit-pending');
  });
  await run('appeal-trust-status',{width:390,theme:'light',scenario:'appeal'},async(page,result)=>{
    await button(page,'Open Discover').click();
    await content(page,'Synthetic published post').waitFor();
    await content(page,'Under appeal').waitFor();
    await content(page,'Moderation: warn').waitFor();
    await content(page,'Appeal: open').waitFor();
    assert.equal(await content(page,'No extra signals').count(),0);
    assert.equal(await content(page,'Moderation: none').count(),0);
    assert.equal(result.writes.length,0);
    result.checks.push('Actual social feed service and notifier retain parsed trust metadata','Unresolved moderation and open appeal remain visible','No default no-extra-signals approval or content write');
    await screenshot(page,result,'appeal-trust-status');
  });
} finally {
  await runtime.close();
  const failures = reports.filter(r=>r.status==='failed');
  console.log(JSON.stringify({total:reports.length,passed:reports.length-failures.length,failed:failures.length,knownGaps:reports.filter(r=>r.knownGap).map(r=>({name:r.name,gap:r.knownGap}))}));
  process.exitCode = failures.length ? 1 : 0;
}
