import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
import {chromium,webkit} from 'playwright';
import {installFlutterEngineFonts} from './flutter-engine-font-fixture.mjs';
import {observeRenderHealth,assertRenderHealth} from './brand-render-health.mjs';
import {containedWordmarkRect} from './brand-artwork-pixels.mjs';
import {regionPixels} from './full-login-pixels.mjs';
import {compareApprovedArtwork} from './brand-reference.mjs';
import {assertLoginLayout,assertMatchingLoginLayout,loginFirstPaintPixels,assertLoginFirstPaintPixels} from './brand-login-first-paint.mjs';
import {refreshUrl,loginFixtureResponse,expectedRefreshConsole} from './brand-login-transport.mjs';

const engine=process.env.ONBOARDING_ENGINE??'chromium';assert.ok(['chromium','webkit'].includes(engine));
assert.equal(process.env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS,undefined);
const source=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const output=path.resolve('build/onboarding-visible',engine);await mkdir(output,{recursive:true});
const {PNG}=createRequire(import.meta.url)('playwright-core/lib/utilsBundle');
const approved=JSON.parse(await readFile('docs/brand/approved-v1/INTEGRATION-MANIFEST.json'));
const roots={static:path.resolve('build/onboarding-visible-static'),visible:path.resolve('build/onboarding-visible-production')};
const epochNow=()=>performance.timeOrigin+performance.now();
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function inventory(root,prefix=''){
 const files={};for(const item of await readdir(path.join(root,prefix),{withFileTypes:true})){
  const name=path.join(prefix,item.name);if(item.isDirectory())Object.assign(files,await inventory(root,name));
  else if(item.isFile())files[name]=hash(await readFile(path.join(root,name)));
 }return files;
}
const resources={};for(const [kind,root] of Object.entries(roots))resources[kind]=await inventory(root);
assert.equal(resources.static['main.dart.js'],'ea2c11f189ee59b36b4cb16f97cb1ec8f43fc05c95df8b8566ce73f32657ede9','Frozen PR1046 original-static diagnostic binary');
const assets=files=>Object.fromEntries(Object.entries(files).filter(([name])=>name.startsWith('assets/')||name.startsWith('canvaskit/')));
assert.deepEqual(assets(resources.static),assets(resources.visible));
await writeFile(path.join(output,'resources.json'),JSON.stringify({source,reviewHead:process.env.ONBOARDING_REVIEW_HEAD,resources,matchedAssetCount:Object.keys(assets(resources.static)).length},null,2)+'\n');
const types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm','.ttf':'font/ttf','.otf':'font/otf','.ico':'image/x-icon'};
const policyCopy=['Welcome to Lythaus','Before you post','Choose Human-authored or AI-assisted before posting.','AI-generated public content cannot be posted.','AI-assisted public text is limited to 249 user-perceived characters.','Disclosure conflicts may enter Under review.','Appeal outcomes are recorded by Lythaus.','This is an invite-only Alpha.','Continue'];
const results=[];
for(const kind of ['static','visible']){
 const real=kind==='visible',root=roots[kind];
 const server=createServer(async(req,res)=>{try{
  let file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);assert.ok(file===root||file.startsWith(root+path.sep));
  if(!path.extname(file))file=path.join(root,'index.html');
  res.writeHead(200,{'Content-Type':types[path.extname(file)]??'application/octet-stream','Access-Control-Allow-Origin':'*'}).end(await readFile(file));
 }catch{res.writeHead(404).end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 const browser=await ({chromium,webkit})[engine].launch({headless:true});
 const context=await browser.newContext({locale:'en-US',viewport:{width:320,height:960},colorScheme:'light',reducedMotion:'reduce',serviceWorkers:'block'});
 const health=await observeRenderHealth(context,origin),requests=[],blocked=[],expectedConsoleErrors=[],pageErrors=[];
 context.on('requestfinished',request=>{const record=requests.findLast(r=>r.url===request.url()&&r.method===request.method());if(record)record.finishedEpochMs=epochNow();});
 context.on('page',page=>{
  page.on('pageerror',error=>pageErrors.push({message:error.message,stack:error.stack}));
  page.on('console',message=>{if(message.type()==='error'){const error={text:message.text(),url:message.location().url};if(real&&expectedRefreshConsole(error,requests))expectedConsoleErrors.push(error);}});
 });
 await context.addInitScript(()=>{
  window.__visibleObservation={firstFrameAt:null,events:[]};
  window.addEventListener('flutter-first-frame',()=>{window.__visibleObservation.firstFrameAt??=performance.now();});
  for(const name of ['pointerdown','keydown','wheel','scroll','resize','focusin'])window.addEventListener(name,event=>window.__visibleObservation.events.push({type:event.type,at:performance.now(),trusted:event.isTrusted}),true);
 });
 await context.route('**/*',async route=>{
  const request=route.request(),url=request.url(),method=request.method();if(new URL(url).origin===origin)return route.continue();
  const response=real&&url===refreshUrl&&loginFixtureResponse(url,method,request.headers()['access-control-request-method']);
  if(!response){blocked.push(url);return route.abort();}
  const record={url,method,status:response.status,requestEpochMs:epochNow(),expectedBodySha256:response.body===null?hash(''):hash(JSON.stringify(response.body))};requests.push(record);
  record.fulfillStartEpochMs=epochNow();
  await route.fulfill({status:response.status,contentType:'application/json',headers:{'access-control-allow-origin':origin,'access-control-allow-credentials':'true','access-control-allow-methods':'POST','access-control-allow-headers':request.headers()['access-control-request-headers']??'content-type'},body:response.body===null?'':JSON.stringify(response.body)});
  record.fulfillCompleteEpochMs=epochNow();
 });
 await installFlutterEngineFonts(context);const page=await context.newPage();
 const result={kind,engine,source,browser:browser.version(),theme:'light',width:320,scale:2,requests,blocked,expectedConsoleErrors,pageErrors,snapshots:[]};const images=[];
 const readState=stage=>page.evaluate(({stage,real})=>({now:performance.now(),epochMs:performance.timeOrigin+performance.now(),url:location.href,viewport:[innerWidth,innerHeight],scroll:[scrollX,scrollY],activeElement:document.activeElement?.tagName,activeInput:document.activeElement instanceof HTMLInputElement,semanticsCount:document.querySelectorAll('flt-semantics').length,layout:JSON.parse(window.__readOnboardingLayout()),login:stage==='login'?JSON.parse(window.__readBrandLoginLayout()):null,host:real?JSON.parse(window.__readVisibleHostState()):null,observation:structuredClone(window.__visibleObservation)}),{stage,real});
 const checkHealth=raw=>{
  const errors=[...raw.errors];for(const expected of expectedConsoleErrors){const index=errors.indexOf(expected.text);assert.ok(index>=0);errors.splice(index,1);}
  const checked={...raw,errors,responses:raw.responses.filter(r=>!(real&&r.url===refreshUrl&&r.status===401&&requests.some(q=>q.method==='POST'&&q.status===401)))};
  assertRenderHealth(checked);return checked;
 };
 async function capture(stage,dwell,anchor){
  await page.waitForTimeout(Math.max(0,anchor+dwell-await page.evaluate(()=>performance.now())));
  const before=await readState(stage),file=path.join(output,`${kind}-${stage}-${dwell}.png`);await page.screenshot({path:file});const after=await readState(stage);
  const bytes=await readFile(file),png=PNG.sync.read(bytes),rawHealth=await health(page);
  const snapshot={stage,dwell,anchor,before,after,pngSha256:hash(bytes),requests:structuredClone(requests),health:structuredClone(rawHealth)};result.snapshots.push(snapshot);images.push({snapshot,png});
  assert.ok(before.now-anchor>=dwell);checkHealth(rawHealth);
  for(const state of [before,after]){
   assert.equal(new URL(state.url).pathname,real?'/login':'/');assert.deepEqual(state.viewport,[320,960]);assert.deepEqual(state.scroll,[0,0]);assert.equal(state.activeInput,false);
   assert.equal(state.semanticsCount,0);assert.equal(state.layout.semanticsEnabled,false);
   assert.deepEqual(state.observation.events.filter(e=>['pointerdown','keydown','wheel','scroll'].includes(e.type)),[],'No input or scrolling before original captures');
   if(real){assert.equal(state.host.materialApps,1);assert.equal(state.host.navigators,1);assert.equal(state.host.focusedEditable,false);}
   if(stage==='login'){assertLoginLayout(state.login,2);assert.equal(state.layout.visibleAuthChoices,1);assert.equal(state.layout.screens.length,0);assert.equal(state.host.visibleLogin,1);}
   else{assert.equal(state.layout.visibleAuthChoices,0);assert.equal(state.layout.screens.length,1);const screen=state.layout.screens[0];assert.equal(screen.scale,2);assert.equal(screen.disableAnimations,true);assert.equal(screen.brands.length,1);for(const text of policyCopy)assert.ok(screen.texts[text],text);}
  }
  assert.deepEqual(before.layout,after.layout);
  if(stage==='login'){
   assertMatchingLoginLayout(before.login,after.login);Object.assign(snapshot,loginFirstPaintPixels(png,before.login));assertLoginFirstPaintPixels(snapshot);snapshot.painted=true;
  }else{
   const screen=before.layout.screens[0];snapshot.artwork=containedWordmarkRect(screen.brands[0]);snapshot.pixels={surface:regionPixels(png,{x:0,y:0,width:320,height:900}),brand:regionPixels(png,snapshot.artwork),heading:regionPixels(png,screen.texts['Welcome to Lythaus']),policyHeading:regionPixels(png,screen.texts['Before you post'])};
   if(real){assert.equal(before.host.componentRouteCurrent,true);assert.equal(before.host.visibleOnboarding,1);assert.equal(before.host.auth,'signed-out');assert.equal(before.host.pendingAuthenticatedWork,false);assert.equal(before.host.navigatorId,result.presentation.result.before.navigatorId);}
  }
 }
 try{
  await page.goto(origin+(real?'/login':'/?screen=onboarding&theme=light&scale=2'));
  await page.waitForFunction(()=>window.__visibleObservation.firstFrameAt!==null&&typeof window.__readOnboardingLayout==='function',null,{polling:50});
  const firstFrame=await page.evaluate(()=>window.__visibleObservation.firstFrameAt);result.firstFrameAt=firstFrame;
  if(real){
   await page.waitForFunction(()=>typeof window.__readBrandLoginLayout==='function'&&JSON.parse(window.__readBrandLoginLayout()).brands.length===1,null,{polling:50});
   for(const dwell of [250,5250])await capture('login',dwell,firstFrame);
   result.settledHost=await readState('login');const state=result.settledHost.host;
   assert.equal(state.auth,'signed-out');assert.equal(state.guest,false);assert.equal(state.pendingAuthenticatedWork,false);assert.equal(state.visibleLogin,1);assert.equal(state.navigators,1);assert.equal(state.materialApps,1);
   const post=requests.filter(r=>r.method==='POST');assert.equal(post.length,1);assert.equal(post[0].status,401);assert.ok(post[0].fulfillCompleteEpochMs&&post[0].finishedEpochMs);
   const raw=await health(page),response=raw.responses.filter(r=>r.url===refreshUrl&&r.status===401);assert.equal(response.length,1);assert.equal(response[0].sha256,post[0].expectedBodySha256);checkHealth(raw);
   result.completedTransport={request:structuredClone(post[0]),response:structuredClone(response[0])};
   result.presentation=await page.evaluate(()=>{const at=performance.now(),epochMs=performance.timeOrigin+at;return {at,epochMs,result:JSON.parse(window.__presentOnboardingComponent())};});
   assert.equal(result.presentation.result.accepted,true);assert.ok(post[0].finishedEpochMs<=result.presentation.epochMs);assert.ok(post[0].fulfillCompleteEpochMs<=result.presentation.epochMs);
   await page.waitForFunction(()=>JSON.parse(window.__readOnboardingLayout()).screens.length===1&&JSON.parse(window.__readVisibleHostState()).componentRouteCurrent===true,null,{polling:50});
   for(const dwell of [250,5250])await capture('onboarding',dwell,result.presentation.at);
  }else{
   await page.waitForFunction(()=>JSON.parse(window.__readOnboardingLayout()).screens.length===1,null,{polling:50});
   for(const dwell of [250,5250])await capture('onboarding',dwell,firstFrame);
  }
  // Reference pages and all interactions occur only after every original PNG.
  for(const {snapshot,png} of images){
   if(snapshot.pixels.brand.nonblank)try{snapshot.fidelity=await compareApprovedArtwork(page,png,snapshot.artwork,origin+'/assets/assets/brand/lythaus-v1/lythaus-wordmark-black.e450176663e0.svg',PNG);}catch(error){snapshot.fidelityError=error.message;}
   snapshot.rendered=Object.values(snapshot.pixels).every(p=>p.nonblank)&&!!snapshot.fidelity;
  }
  if(real){const before=await page.evaluate(()=>JSON.parse(window.__readVisibleHostState()));result.duplicatePresentation=await page.evaluate(()=>JSON.parse(window.__presentOnboardingComponent()));assert.deepEqual(result.duplicatePresentation,{accepted:false,reason:'already-presented'});assert.deepEqual(await page.evaluate(()=>JSON.parse(window.__readVisibleHostState())),before);}
  await page.locator('flt-semantics-placeholder').evaluate(element=>element.click());
  const brand=page.getByRole('img',{name:'Lythaus',exact:true});await brand.waitFor();assert.equal(await brand.count(),1);
  const semanticBox=await brand.boundingBox(),originalBox=result.snapshots.find(s=>s.stage==='onboarding').before.layout.screens[0].brands[0];
  for(const key of ['x','y','width','height'])assert.ok(Math.abs(semanticBox[key]-originalBox[key])<0.02,'Named image matches original '+key);
  for(const text of ['Welcome to Lythaus','Before you post'])await page.getByText(text,{exact:true}).waitFor();
  const icons=await page.locator('link[rel="icon"],link[rel="apple-touch-icon"]').evaluateAll(nodes=>nodes.map(n=>n.href));assert.equal(icons.length,4);result.icons=[];
  for(const url of icons){const expected=approved.web_copy_map.find(a=>a.public_url===new URL(url).pathname);assert.ok(expected);const response=await context.request.get(url);assert.equal(response.status(),200);const digest=hash(await response.body());assert.equal(digest,expected.sha256);result.icons.push({path:new URL(url).pathname,status:response.status(),sha256:digest});}
  await page.screenshot({path:path.join(output,`${kind}-after-semantics.png`)});
  const action=page.getByRole('button',{name:'Continue',exact:true});result.scroll=[];
  for(let attempt=0;attempt<12;attempt++){const rect=await action.boundingBox();result.scroll.push({attempt,rect});if(rect&&rect.y>=0&&rect.y+rect.height<940)break;await page.mouse.move(160,700);await page.mouse.wheel(0,400);await page.waitForTimeout(120);}
  const actionBox=await action.boundingBox();assert.ok(actionBox&&actionBox.y>=0&&actionBox.y+actionBox.height<940,'Continue is reachable through ordinary scrolling');
  await action.click();await page.getByText('Synthetic continuation completed',{exact:true}).waitFor();
  await page.screenshot({path:path.join(output,`${kind}-continue-marker.png`)});
  result.continuation={marker:'Synthetic continuation completed',url:page.url(),host:real?await page.evaluate(()=>JSON.parse(window.__readVisibleHostState())):null};
  if(real){assert.equal(result.continuation.host.visibleMarker,1);assert.equal(result.continuation.host.navigatorId,result.presentation.result.before.navigatorId);assert.equal(result.continuation.host.navigators,1);assert.equal(result.continuation.host.auth,'signed-out');assert.equal(new URL(page.url()).pathname,'/login');}
  assert.equal(requests.filter(r=>r.method==='POST').length,real?1:0);assert.deepEqual(blocked,[]);assert.deepEqual(pageErrors,[]);result.health=await health(page);result.checkedHealth=checkHealth(result.health);
  result.presentationPassed=result.snapshots.filter(s=>s.stage==='onboarding').every(s=>s.rendered);
  if(real)assert.ok(result.presentationPassed&&result.snapshots.filter(s=>s.stage==='login').every(s=>s.rendered),'Both saved login and component captures must meet original fidelity and pixel thresholds');
  result.status='observed';
 }catch(error){result.status='failed';result.error=error.message;result.health=await health(page).catch(e=>({error:e.message}));}
 finally{results.push(result);await writeFile(path.join(output,kind+'.json'),JSON.stringify(result,null,2)+'\n');await context.close();await browser.close();await new Promise(resolve=>server.close(resolve));console.log(JSON.stringify({engine,kind,status:result.status,error:result.error,presentationPassed:result.presentationPassed,snapshots:result.snapshots.map(s=>({stage:s.stage,dwell:s.dwell,rendered:s.rendered,pixels:s.pixels}))}));}
}
const layouts=results.flatMap(r=>r.snapshots.filter(s=>s.stage==='onboarding').map(s=>s.before.layout.screens[0]));
const matchingGeometry=layouts.length===4&&layouts.every(layout=>JSON.stringify(layout)===JSON.stringify(layouts[0]));
await writeFile(path.join(output,'results.json'),JSON.stringify({source,reviewHead:process.env.ONBOARDING_REVIEW_HEAD,engine,results,matchingGeometry,limitations:'One light320/2x component-presentation comparison per engine. Real login is visibly painted and signed-out transport completes before a fixture-only zero-transition imperative route on the existing Navigator. The original static reference remains recorded; no shipping onboarding GoRoute or cold-start success is claimed. Existing render-health instrumentation is retained, including its RAF heartbeat and canvas-context wrapper; that heartbeat is not a Flutter-frame count. No acceptance gate is changed.'},null,2)+'\n');
assert.equal(results.length,2);assert.ok(matchingGeometry,'Exact static/component geometry at both untouched capture times');assert.deepEqual(results.filter(r=>r.status!=='observed').map(r=>({kind:r.kind,error:r.error})),[]);
