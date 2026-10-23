import {chromium,webkit} from 'playwright';
import {installFlutterEngineFonts} from './tests/flutter-engine-font-fixture.mjs';
import {loginFixtureResponse,expectedRefreshConsole,refreshUrl} from './tests/brand-login-transport.mjs';
import {assertLoginLayout,assertMatchingLoginLayout,loginFirstPaintPixels,assertLoginFirstPaintPixels} from './tests/brand-login-first-paint.mjs';
import {regionPixels} from './tests/full-login-pixels.mjs';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import path from 'node:path';
const {PNG}=createRequire(import.meta.url)('playwright-core/lib/utilsBundle');
const root=path.resolve(process.env.STARTUP_BUILD ?? 'build/web');
const provenanceBytes=await readFile(path.join(root,'startup-build-provenance.json'));
const provenance=JSON.parse(provenanceBytes);
assert.equal(provenance.candidateSha,process.env.STARTUP_CANDIDATE_SHA,'An exact candidate SHA is required');
for(const [file,expected] of Object.entries(provenance.files)) {
 assert.equal(createHash('sha256').update(await readFile(path.join(root,file))).digest('hex'),expected,`Rendered build changed: ${file}`);
}
const buildIdentity={candidateSha:provenance.candidateSha,sourceTree:provenance.sourceTree,
 compiledFromSha:provenance.compiledFromSha,
 mainSha256:provenance.files['main.dart.js'],provenanceSha256:createHash('sha256').update(provenanceBytes).digest('hex')};
const timeoutCase=process.env.TIMEOUT_CASE==='1';
const immediateCase=process.env.IMMEDIATE_CASE==='1';
const failureCase=process.env.FAILURE_CASE==='1';
const authenticatedCase=process.env.AUTHENTICATED_CASE==='1';
const externalCase=process.env.EXTERNAL_CASE==='1';
const inviteCase=(process.env.STARTUP_ENTRY??'').startsWith('/invite/');
const output=path.resolve(process.env.STARTUP_EVIDENCE ?? 'build/startup-evidence')+(timeoutCase?'-timeout':'');await mkdir(output,{recursive:true});
const types={'.html':'text/html','.css':'text/css','.js':'text/javascript','.json':'application/json','.wasm':'application/wasm','.ttf':'font/ttf','.otf':'font/otf','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const server=createServer(async(req,res)=>{try{let file=path.join(root,new URL(req.url,'http://localhost').pathname);if(!path.extname(file))file=path.join(root,'index.html');res.writeHead(200,{'content-type':types[path.extname(file)]??'application/octet-stream'}).end(await readFile(file));}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
const results=[];
try {for(const [engine,type] of Object.entries({webkit,chromium})) {
 if(timeoutCase&&engine!=='webkit')continue;
 const browser=await type.launch({headless:true});
 try {for(const [width,height,theme] of [[390,844,'dark'],[1440,960,'light']]) {
  if(timeoutCase&&width!==390)continue;
  const context=await browser.newContext({viewport:{width,height},colorScheme:theme,reducedMotion:'reduce',serviceWorkers:'block'});
  const result={...buildIdentity,name:`${engine}-${width}-${theme}`,errors:[],blocked:[],requests:[],captures:[]};let release;const held=new Promise(r=>release=r);
  let failedDownload=false;
  if(immediateCase)release();
  try {
   await context.route('**/*',async route=>{
    const request=route.request(),url=request.url(),method=request.method();
    if(new URL(url).origin===origin) {
     if(failureCase&&!failedDownload&&/\/flutter_bootstrap(?:\.[a-f0-9]{16})?\.js$/.test(url)) {failedDownload=true;return route.abort();}
     return route.continue();
    }
    if(externalCase&&['https://lythaus.co/forgot-password','https://lythaus.co/resend-verification'].includes(url)) {
     return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Synthetic hosted journey boundary</title><main>Local navigation fixture; no email operation.</main>'});
    }
    let response=loginFixtureResponse(url,method,request.headers()['access-control-request-method']);
    if(authenticatedCase&&url===refreshUrl&&method==='POST') response={method:'POST',status:200,body:{accessToken:'synthetic-local-only',sessionTransport:'cookie-v1'}};
    if(authenticatedCase&&url==='https://api.lythaus.co/api/auth/userinfo') response={method:'GET',status:200,body:method==='OPTIONS'?null:{id:'synthetic-user',email:'synthetic@example.invalid',role:'user',createdAt:'2026-01-01T00:00:00Z',lastLoginAt:'2026-01-01T00:00:00Z'}};
    if(authenticatedCase&&url==='https://api.lythaus.co/api/users/me') response={method:'GET',status:200,body:method==='OPTIONS'?null:{user:{id:'synthetic-user',displayName:'Synthetic startup fixture',trustPassportVisibility:'private',moderationState:'allowed',publicVisibility:false,reputationScore:0}}};
    if(authenticatedCase&&new URL(url).origin==='https://api.lythaus.co'&&['/api/subscription/status','/api/custom-feeds','/api/users/me/reputation'].includes(new URL(url).pathname)) response={method:'GET',status:200,body:method==='OPTIONS'?null:{items:[],hasMore:false,nextCursor:null}};
    if(!response){result.blocked.push(url);return route.abort();}
    result.requests.push({url,method,status:response.status});
    if(url===refreshUrl&&method==='POST')await held;
    return route.fulfill({status:response.status,contentType:'application/json',headers:{'access-control-allow-origin':origin,'access-control-allow-credentials':'true','access-control-allow-methods':response.method,'access-control-allow-headers':request.headers()['access-control-request-headers']??'content-type'},body:response.body===null?'':JSON.stringify(response.body)});
   });
   await installFlutterEngineFonts(context);
   await context.addInitScript(()=>{window.__frameAt=null;window.addEventListener('flutter-first-frame',()=>window.__frameAt??=performance.now());});
   const page=await context.newPage();page.on('pageerror',e=>result.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!(failureCase&&/\/flutter_bootstrap(?:\.[a-f0-9]{16})?\.js$/.test(m.location().url))&&!expectedRefreshConsole({text:m.text(),url:m.location().url},result.requests))result.errors.push(m.text());});
   const entry = process.env.STARTUP_ENTRY ?? '/login';
   await page.goto(origin+entry);
   if(failureCase) {
    await page.getByRole('button',{name:'Try again',exact:true}).waitFor();
    assert.match(await page.getByRole('status').textContent(),/could not open/);
    await page.screenshot({path:`${output}/${result.name}-download-failure.png`});
    await page.getByRole('button',{name:'Try again',exact:true}).click();
    await page.waitForFunction(()=>window.__frameAt!==null);
    assert.equal(new URL(page.url()).pathname,new URL(entry,origin).pathname);
    result.retryPreservedEntry=true;
   } else await page.waitForFunction(()=>window.__frameAt!==null);
   const anchor=await page.evaluate(()=>window.__frameAt);
   for(const delay of immediateCase?[]:[250,5250]) {
    await page.waitForTimeout(Math.max(0,anchor+delay-await page.evaluate(()=>performance.now())));
    assert.equal(await page.locator('flt-semantics').count(),0);
    assert.equal(await page.locator('flutter-view').evaluate(e=>e.inert),true);
    const logo=await page.locator('#lythaus-startup img').boundingBox();
    const text=await page.locator('#lythaus-startup p').boundingBox();
    const bytes=await page.screenshot({path:`${output}/${result.name}-pending-${delay}.png`});const png=PNG.sync.read(bytes);
    const pixels={brand:regionPixels(png,logo),status:regionPixels(png,text)};assertLoginFirstPaintPixels({pixels});
    result.captures.push({stage:'pending-document-fallback',delay,pixels,semantics:0,sha256:createHash('sha256').update(bytes).digest('hex')});
   }
   if(!timeoutCase)release();
   await page.locator('#lythaus-startup').waitFor({state:'detached',timeout:30000});
   result.naturalTimeout=timeoutCase;
   await page.waitForTimeout(250);
   assert.equal(await page.locator('flutter-view').evaluate(e=>e.inert),false);
   if(authenticatedCase&&!inviteCase) {
    assert.equal(new URL(page.url()).pathname,'/','Restored session must reach the signed-in home destination');
    assert.equal(await page.locator('flt-semantics').count(),0);
    const bytes=await page.screenshot({path:`${output}/${result.name}-signed-in-before-semantics.png`});
    const pixels={home:regionPixels(PNG.sync.read(bytes),{x:0,y:0,width,height})};
    assertLoginFirstPaintPixels({pixels});
    result.captures.push({stage:'signed-in-before-semantics',pixels,sha256:createHash('sha256').update(bytes).digest('hex')});
    await page.locator('flt-semantics-placeholder').evaluate(e=>e.click());
    await page.getByRole('button',{name:/^Profile(?:\b|$)/}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Sign in with email',exact:true}).count(),0);
    assert.ok(result.requests.some(r=>r.url==='https://api.lythaus.co/api/auth/userinfo'&&r.method==='GET'&&r.status===200));
    result.authenticatedDestination=page.url();
   } else if(inviteCase) {
    assert.equal(await page.locator('flt-semantics').count(),0);
    const bytes=await page.screenshot({path:`${output}/${result.name}-invite-before-semantics.png`});
    const pixels={invite:regionPixels(PNG.sync.read(bytes),{x:0,y:0,width,height})};
    assertLoginFirstPaintPixels({pixels});
    result.captures.push({stage:'invite-before-semantics',pixels,sha256:createHash('sha256').update(bytes).digest('hex')});
    assert.equal(new URL(page.url()).pathname,new URL(entry,origin).pathname);
    await page.locator('flt-semantics-placeholder').evaluate(e=>e.click());
    await page.getByRole('textbox',{name:'Invite code',exact:true}).waitFor();
    await page.getByRole('textbox',{name:'Invite code',exact:true}).click();
    await page.keyboard.press('End');
    await page.keyboard.insertText('-DRAFT');
    assert.equal(await page.locator('#lythaus-startup').count(),0);
   } else {
   const before=await page.evaluate(()=>JSON.parse(window.__readBrandLoginLayout()));assertLoginLayout(before,1);assert.equal(await page.locator('flt-semantics').count(),0);
   const bytes=await page.screenshot({path:`${output}/${result.name}-ready-before-semantics.png`});
   const after=await page.evaluate(()=>JSON.parse(window.__readBrandLoginLayout()));assertMatchingLoginLayout(before,after);
   const measured=loginFirstPaintPixels(PNG.sync.read(bytes),before);assertLoginFirstPaintPixels(measured);
   result.captures.push({stage:'ready-flutter-before-semantics',...measured,sha256:createHash('sha256').update(bytes).digest('hex')});
   result.readyEditing=await page.evaluate(()=>JSON.parse(window.__readBrandLoginEditing()));
   assert.equal(result.readyEditing.email[0].readOnly,false);
   await page.waitForTimeout(5000);
   const settledBytes=await page.screenshot({path:`${output}/${result.name}-ready-settled-before-semantics.png`});
   const settledPixels=loginFirstPaintPixels(PNG.sync.read(settledBytes),before);
   assertLoginFirstPaintPixels(settledPixels);
   result.captures.push({stage:'ready-settled-before-semantics',...settledPixels,sha256:createHash('sha256').update(settledBytes).digest('hex')});
   await page.locator('flt-semantics-placeholder').evaluate(e=>e.click());await page.getByRole('button',{name:'Sign in with email',exact:true}).waitFor();
   await page.getByRole('textbox',{name:'Email',exact:true}).click();await page.waitForTimeout(300);await page.keyboard.insertText('draft@example.invalid');
   await page.waitForFunction(()=>JSON.parse(window.__readBrandLoginEditing()).email[0].hasExpectedDraft);
   }
   assert.equal(await page.locator('#lythaus-startup').count(),0);
   const destination = page.url();
   await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent('pageshow', {persisted:true}));
    document.dispatchEvent(new Event('visibilitychange'));
   });
   await page.waitForTimeout(100);
   assert.equal(await page.locator('#lythaus-startup').count(),0);
   assert.equal(page.url(), destination);
   if (entry.includes('returnTo=')) assert.equal(new URL(page.url()).searchParams.get('returnTo'), new URL(entry, origin).searchParams.get('returnTo'));
   if(externalCase) {
    result.externalJourneys=[];
    for(const [label,target] of [['Forgot password?','https://lythaus.co/forgot-password'],['Resend verification email','https://lythaus.co/resend-verification']]) {
     if(label.startsWith('Resend'))await page.getByText('Verification & invites',{exact:true}).click();
     await page.getByRole('button',{name:label,exact:true}).click();
     await page.waitForURL(target);
     await page.goBack();
     await page.waitForURL(destination);
     await page.waitForFunction(()=>!document.getElementById('lythaus-startup')&&JSON.parse(window.__readBrandLoginEditing()).email[0].readOnly===false);
     if(await page.locator('flt-semantics-placeholder').count())await page.locator('flt-semantics-placeholder').evaluate(e=>e.click());
     await page.getByRole('button',{name:'Sign in with email',exact:true}).waitFor();
     assert.equal(await page.locator('#lythaus-startup').count(),0);
     result.externalJourneys.push({target,returnedTo:page.url(),syntheticHostedBoundary:true});
    }
   }
   assert.deepEqual(result.blocked,[]);assert.deepEqual(result.errors,[]);result.passed=true;
  }catch(e){result.error=e.message;result.passed=false;}
  finally{release();results.push(result);await context.close();await writeFile(`${output}/results.json`,JSON.stringify(results,null,2));console.log(JSON.stringify(result));}
 }}finally{await browser.close();}
}}finally{server.close();}
assert.ok(results.every(r=>r.passed),'Document fallback and unchanged ready-form pixel checks must pass');
