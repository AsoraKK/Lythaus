import assert from 'node:assert/strict';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import path from 'node:path';
import {installFlutterEngineFonts} from './flutter-engine-font-fixture.mjs';
import {observeRenderHealth,assertRenderHealth} from './brand-render-health.mjs';
import {compareApprovedArtwork} from './brand-reference.mjs';
import {assertLoginLayout,assertMatchingLoginLayout,loginFirstPaintPixels,assertLoginFirstPaintPixels} from './brand-login-first-paint.mjs';
import {refreshUrl,loginFixtureResponse,expectedRefreshConsole} from './brand-login-transport.mjs';
import {originalCaptureEvents,onboardingCopy,waitForOriginalDwell,assertSignedOutHost,assertUntouchedPresentation,assertOnboardingLayout,onboardingPixels,assertOnboardingPaint,assertCompletedRefresh} from './brand-onboarding-contract.mjs';

const {PNG}=createRequire(import.meta.url)('playwright-core/lib/utilsBundle');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const epochNow=()=>performance.timeOrigin+performance.now();
export async function onboardingInventory(root,prefix=''){
 const files={};for(const item of await readdir(path.join(root,prefix),{withFileTypes:true})){
  const name=path.join(prefix,item.name);
  if(item.isDirectory())Object.assign(files,await onboardingInventory(root,name));
  else if(item.isFile())files[name]=hash(await readFile(path.join(root,name)));
 }return files;
}
async function observedContext(browser,origin,condition,real){
 const context=await browser.newContext({locale:'en-US',viewport:{width:condition.width,height:960},colorScheme:condition.theme,reducedMotion:'reduce',serviceWorkers:'block'});
 const health=await observeRenderHealth(context,origin),requests=[],blocked=[],expectedConsoleErrors=[],pageErrors=[];
 context.on('requestfinished',request=>{const record=requests.findLast(r=>r.url===request.url()&&r.method===request.method());if(record)record.finishedEpochMs=epochNow();});
 context.on('page',page=>{
  page.on('pageerror',error=>pageErrors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'){const error={text:message.text(),url:message.location().url};if(real&&expectedRefreshConsole(error,requests))expectedConsoleErrors.push(error);}});
 });
 await context.addInitScript(events=>{
  window.__onboardingObservation={firstFrameAt:null,events:[]};
  window.addEventListener('flutter-first-frame',()=>{window.__onboardingObservation.firstFrameAt??=performance.now();});
  for(const name of events)window.addEventListener(name,event=>window.__onboardingObservation.events.push({type:event.type,at:performance.now(),trusted:event.isTrusted}),true);
 },originalCaptureEvents);
 await context.route('**/*',async route=>{
  const request=route.request(),url=request.url(),method=request.method();if(new URL(url).origin===origin)return route.continue();
  const response=real&&url===refreshUrl&&loginFixtureResponse(url,method,request.headers()['access-control-request-method']);
  if(!response){blocked.push(url);return route.abort();}
  const record={url,method,status:response.status,requestEpochMs:epochNow(),expectedBodySha256:hash(response.body===null?'':JSON.stringify(response.body))};requests.push(record);
  record.fulfillStartEpochMs=epochNow();
  await route.fulfill({status:response.status,contentType:'application/json',headers:{'access-control-allow-origin':origin,'access-control-allow-credentials':'true','access-control-allow-methods':'POST','access-control-allow-headers':request.headers()['access-control-request-headers']??'content-type'},body:response.body===null?'':JSON.stringify(response.body)});
  record.fulfillCompleteEpochMs=epochNow();
 });
 await installFlutterEngineFonts(context);
 const page=await context.newPage();
 const checkHealth=raw=>{
  const errors=[...raw.errors];for(const expected of expectedConsoleErrors){assert.ok(expectedRefreshConsole(expected,requests));const index=errors.indexOf(expected.text);assert.ok(index>=0);errors.splice(index,1);}
  const checked={...raw,errors,responses:raw.responses.filter(r=>!(real&&r.url===refreshUrl&&r.status===401&&requests.some(q=>q.url===refreshUrl&&q.method==='POST'&&q.status===401)))};
  assertRenderHealth(checked);assert.deepEqual(blocked,[]);assert.deepEqual(pageErrors,[]);return checked;
 };
 return {context,page,health,checkHealth,requests,blocked,expectedConsoleErrors,pageErrors};
}
const readState=(page,stage,real)=>page.evaluate(({stage,real})=>({now:performance.now(),epochMs:performance.timeOrigin+performance.now(),url:location.href,viewport:[innerWidth,innerHeight],scroll:[scrollX,scrollY],activeElement:document.activeElement?.tagName,activeInput:document.activeElement instanceof HTMLInputElement,semanticsCount:document.querySelectorAll('flt-semantics').length,layout:JSON.parse(window.__readOnboardingLayout()),login:stage==='login'?JSON.parse(window.__readBrandLoginLayout()):null,host:real?JSON.parse(window.__readVisibleHostState()):null,observation:structuredClone(window.__onboardingObservation)}),{stage,real});
async function originalCapture(observation,condition,result,stage,dwell,anchor,output,name,real,reference){
 const {page,health,checkHealth}=observation;
 await waitForOriginalDwell(page,anchor,dwell);
 const before=await readState(page,stage,real),file=path.join(output,`${name}-${stage}-${dwell}.png`);
 await page.screenshot({path:file});const after=await readState(page,stage,real),bytes=await readFile(file),png=PNG.sync.read(bytes),raw=await health(page);
 const snapshot={stage,dwell,anchor,before,after,pngSha256:hash(bytes),health:structuredClone(raw)};result.snapshots.push(snapshot);
 assert.ok(before.now-anchor>=dwell);checkHealth(raw);
 assert.equal(png.width,condition.width);assert.equal(png.height,960);
 for(const state of [before,after]){
  assert.equal(new URL(state.url).pathname,real?'/login':'/');assert.deepEqual(state.viewport,[condition.width,960]);assert.deepEqual(state.scroll,[0,0]);assert.equal(state.activeInput,false);
  assert.equal(state.semanticsCount,0);assert.equal(state.layout.semanticsEnabled,false);
  if(real)assertSignedOutHost(state.host,result.presentation?.result.before.navigatorId);
  if(stage==='login'){assertLoginLayout(state.login,condition.scale);assert.equal(state.layout.visibleAuthChoices,1);assert.equal(state.layout.screens.length,0);assert.equal(state.host.visibleLogin,1);}
  else{
   assertOnboardingLayout(state.layout,condition,reference);
   if(real){assertUntouchedPresentation(state,result.presentation.at);assert.equal(state.host.visibleOnboarding,1);assert.equal(state.host.visibleLogin,0);assert.equal(state.host.componentRouteCurrent,true);assert.equal(state.host.componentRouteName,'diagnostic-onboarding-component');}
  }
 }
 assert.deepEqual(before.layout,after.layout);
 if(stage==='login'){assertMatchingLoginLayout(before.login,after.login);Object.assign(snapshot,loginFirstPaintPixels(png,before.login));assertLoginFirstPaintPixels(snapshot);}
 else{Object.assign(snapshot,onboardingPixels(png,before.layout.screens[0]));if(real)assertOnboardingPaint(snapshot);}
 snapshot.painted=Object.values(snapshot.pixels).every(p=>p.nonblank);
 return {snapshot,png};
}
async function staticReference(browser,origin,condition,output,name){
 const observation=await observedContext(browser,origin,condition,false);
 const result={scope:'Original cold-static geometry reference, not component acceptance',snapshots:[]};
 try{
  await observation.page.goto(`${origin}/?screen=onboarding&theme=${condition.theme}&scale=${condition.scale}`);
  await observation.page.waitForFunction(()=>window.__onboardingObservation.firstFrameAt!==null&&typeof window.__readOnboardingLayout==='function'&&JSON.parse(window.__readOnboardingLayout()).screens.length===1,null,{polling:50});
  const anchor=await observation.page.evaluate(()=>window.__onboardingObservation.firstFrameAt);
  for(const dwell of [250,5250])await originalCapture(observation,condition,result,'onboarding',dwell,anchor,output,name+'-static-reference',false);
  assert.deepEqual(result.snapshots[0].before.layout,result.snapshots[1].before.layout);
  return result;
 }finally{await writeFile(path.join(output,name+'-static-reference.json'),JSON.stringify(result,null,2)+'\n');await observation.context.close();}
}
export async function runOnboardingCase({browser,engine,origin,referenceOrigin,theme,width,scale,output,source,approved}){
 const name=`${engine}-onboarding-${theme}-${width}`,condition={theme,width,scale};
 const result={screen:'onboarding',...condition,source,scope:'Actual component in a visibly painted settled signed-out app; cold startup and shipping journey deferred',status:'pending',snapshots:[]};
 let observation;
 try{
  result.reference=await staticReference(browser,referenceOrigin,condition,output,name);
  const reference=result.reference.snapshots[0].before.layout.screens[0];
  observation=await observedContext(browser,origin,condition,true);
  const {context,page,health,checkHealth,requests,blocked,pageErrors,expectedConsoleErrors}=observation;
  Object.assign(result,{requests,blocked,pageErrors,expectedConsoleErrors});
  await page.goto(origin+'/login');
  await page.waitForFunction(()=>window.__onboardingObservation.firstFrameAt!==null&&typeof window.__readBrandLoginLayout==='function'&&JSON.parse(window.__readBrandLoginLayout()).brands.length===1,null,{polling:50});
  const firstFrame=await page.evaluate(()=>window.__onboardingObservation.firstFrameAt),images=[];
  result.firstFrameAt=firstFrame;
  for(const dwell of [250,5250])images.push(await originalCapture(observation,condition,result,'login',dwell,firstFrame,output,name,true));
  result.settledHost=await readState(page,'login',true);assertSignedOutHost(result.settledHost.host);
  assert.equal(result.settledHost.host.visibleLogin,1);assert.equal(result.settledHost.host.semanticsEnabled,false);
  result.completedTransport=assertCompletedRefresh(requests,await health(page));
  result.presentation=await page.evaluate(()=>{const at=performance.now(),epochMs=performance.timeOrigin+at;return {at,epochMs,result:JSON.parse(window.__presentOnboardingComponent())};});
  assert.equal(result.presentation.result.accepted,true);assertSignedOutHost(result.presentation.result.before);
  assertCompletedRefresh(requests,await health(page),result.presentation.epochMs);
  await page.waitForFunction(()=>JSON.parse(window.__readOnboardingLayout()).screens.length===1&&JSON.parse(window.__readVisibleHostState()).componentRouteCurrent===true,null,{polling:50});
  for(const dwell of [250,5250])images.push(await originalCapture(observation,condition,result,'onboarding',dwell,result.presentation.at,output,name,true,reference));
  const originalsCompleted=await readState(page,'onboarding',true);assertUntouchedPresentation(originalsCompleted,result.presentation.at);assertSignedOutHost(originalsCompleted.host,result.presentation.result.before.navigatorId);
  for(const {snapshot,png} of images){
   if(snapshot.stage==='login')assertLoginFirstPaintPixels(snapshot);else assertOnboardingPaint(snapshot);
   const file=theme==='dark'?'lythaus-wordmark-white.5ba0451347e2.svg':'lythaus-wordmark-black.e450176663e0.svg';
   snapshot.fidelity=await compareApprovedArtwork(page,png,snapshot.artwork,origin+'/assets/assets/brand/lythaus-v1/'+file,PNG);
  }
  const beforeDuplicate=await readState(page,'onboarding',true);assertSignedOutHost(beforeDuplicate.host,result.presentation.result.before.navigatorId);
  result.duplicatePresentation=await page.evaluate(()=>JSON.parse(window.__presentOnboardingComponent()));assert.deepEqual(result.duplicatePresentation,{accepted:false,reason:'already-presented'});
  assert.deepEqual(await page.evaluate(()=>JSON.parse(window.__readVisibleHostState())),beforeDuplicate.host);
  await page.locator('flt-semantics-placeholder').evaluate(element=>element.click());
  const brand=page.getByRole('img',{name:'Lythaus',exact:true});await brand.waitFor();assert.equal(await brand.count(),1);
  result.semanticBox=await brand.boundingBox();const originalBox=result.snapshots.find(s=>s.stage==='onboarding').before.layout.screens[0].brands[0];
  for(const key of ['x','y','width','height'])assert.ok(Math.abs(result.semanticBox[key]-originalBox[key])<0.02,'Named image matches original '+key);
  for(const text of onboardingCopy)await page.getByText(text,{exact:true}).waitFor();
  const iconUrls=await page.locator('link[rel="icon"],link[rel="apple-touch-icon"]').evaluateAll(nodes=>nodes.map(n=>n.href));assert.equal(iconUrls.length,4);result.icons=[];
  for(const url of iconUrls){const expected=approved.web_copy_map.find(a=>a.public_url===new URL(url).pathname);assert.ok(expected);const response=await context.request.get(url);assert.equal(response.status(),200);const digest=hash(await response.body());assert.equal(digest,expected.sha256);result.icons.push({path:new URL(url).pathname,status:response.status(),sha256:digest});}
  result.afterSemantics=await readState(page,'onboarding',true);assertSignedOutHost(result.afterSemantics.host,result.presentation.result.before.navigatorId);
  await page.screenshot({path:path.join(output,name+'-after-semantics.png')});
  const action=page.getByRole('button',{name:'Continue',exact:true});result.scroll=[];
  for(let attempt=0;attempt<12;attempt++){
   const rect=await action.boundingBox(),host=await page.evaluate(()=>JSON.parse(window.__readVisibleHostState()));assertSignedOutHost(host,result.presentation.result.before.navigatorId);result.scroll.push({attempt,rect,host});
   if(rect&&rect.y>=0&&rect.y+rect.height<940)break;await page.mouse.move(width/2,700);await page.mouse.wheel(0,400);await page.waitForTimeout(120);
  }
  const actionBox=await action.boundingBox();assert.ok(actionBox&&actionBox.y>=0&&actionBox.y+actionBox.height<940,'Continue is reachable through bounded ordinary scrolling');
  await action.click();await page.getByText('Synthetic continuation completed',{exact:true}).waitFor();
  const markerObservedAt=await page.evaluate(()=>performance.now());await page.waitForTimeout(350);
  await page.waitForFunction(()=>{const state=JSON.parse(window.__readVisibleHostState());return state.visibleMarker===1&&state.visibleOnboarding===0;},null,{polling:50,timeout:2000});
  const markerFile=path.join(output,name+'-continue-marker.png');await page.screenshot({path:markerFile});
  result.continuation={marker:'Synthetic continuation completed',markerObservedAt,capturedAt:await page.evaluate(()=>performance.now()),pngSha256:hash(await readFile(markerFile)),state:await readState(page,'marker',true)};
  const final=result.continuation.state;assertSignedOutHost(final.host,result.presentation.result.before.navigatorId);assert.equal(final.host.visibleLogin,0);assert.equal(final.host.visibleOnboarding,0);assert.equal(final.host.visibleMarker,1);assert.equal(new URL(final.url).pathname,'/login');
  result.health=await health(page);result.checkedHealth=checkHealth(result.health);assertCompletedRefresh(requests,result.health,result.presentation.epochMs);
  result.status='passed';
 }catch(error){result.status='failed';result.error=error.message;}
 finally{
  if(observation){result.health=await observation.health(observation.page).catch(error=>({observationError:error.message}));await observation.context.close();}
  await writeFile(path.join(output,name+'-component-evidence.json'),JSON.stringify(result,null,2)+'\n');
 }
 return result;
}
