import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
import {chromium,webkit} from 'playwright';
import {installFlutterEngineFonts} from './flutter-engine-font-fixture.mjs';
import {containedWordmarkRect} from './brand-artwork-pixels.mjs';
import {regionPixels} from './full-login-pixels.mjs';
import {compareApprovedArtwork} from './brand-reference.mjs';
import {refreshUrl,loginFixtureResponse,expectedRefreshConsole} from './brand-login-transport.mjs';

const engine=process.env.ONBOARDING_ENGINE??'chromium';assert.ok(['chromium','webkit'].includes(engine));
assert.equal(process.env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS,undefined,'Host validation must not be bypassed');
const source=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const output=path.resolve('build/onboarding-lifecycle',engine);await mkdir(output,{recursive:true});
const {PNG}=createRequire(import.meta.url)('playwright-core/lib/utilsBundle');
const variants=['static-original','static-configured','static-host','production-host'];
const conditions=[{theme:'light',width:320,scale:2},{theme:'light',width:390,scale:1},{theme:'light',width:1440,scale:1},{theme:'dark',width:320,scale:2}];
const roots={};for(const kind of variants)roots[kind]=kind==='production-host'?[1,2].map(scale=>path.resolve(`build/onboarding-production-${scale}`)):[path.resolve('build/onboarding-'+kind)];
async function inventory(root,prefix=''){
 const files={};for(const item of await readdir(path.join(root,prefix),{withFileTypes:true})){
  const name=path.join(prefix,item.name);if(item.isDirectory())Object.assign(files,await inventory(root,name));
  else if(item.isFile())files[name]=createHash('sha256').update(await readFile(path.join(root,name))).digest('hex');
 }return files;
}
const resources={};for(const [kind,paths] of Object.entries(roots))for(const [index,root] of paths.entries())resources[kind+'-'+(index+1)]=await inventory(root);
const assets=files=>Object.fromEntries(Object.entries(files).filter(([name])=>name.startsWith('assets/')||name.startsWith('canvaskit/')));
for(const files of Object.values(resources))assert.deepEqual(assets(files),assets(resources['static-original-1']),'Assets and CanvasKit must match');
await writeFile(path.join(output,'resources.json'),JSON.stringify({source,reviewHead:process.env.ONBOARDING_REVIEW_HEAD,resources,matchedAssetCount:Object.keys(assets(resources['static-original-1'])).length},null,2)+'\n');
const types={'.html':'text/html','.js':'text/javascript','.json':'application/json','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.wasm':'application/wasm','.ttf':'font/ttf','.otf':'font/otf','.ico':'image/x-icon'};
const results=[];
// Rotate control order across the four conditions; no host is always last.
for(const [conditionIndex,condition] of conditions.entries())for(const kind of [...variants.slice(conditionIndex),...variants.slice(0,conditionIndex)]){
 const {width,theme,scale}=condition,real=kind==='production-host';
 const root=roots[kind][real?scale-1:0],name=`${kind}-${theme}-${width}`;
 const server=createServer(async(req,res)=>{try{
  let file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  assert.ok(file===root||file.startsWith(root+path.sep));if(!path.extname(file))file=path.join(root,'index.html');
  res.writeHead(200,{'Content-Type':types[path.extname(file)]??'application/octet-stream','Access-Control-Allow-Origin':'*'}).end(await readFile(file));
 }catch{res.writeHead(404).end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 // Every observation gets a fresh browser process, not only a fresh context.
 const browser=await ({chromium,webkit})[engine].launch({headless:true});
 const context=await browser.newContext({locale:'en-US',viewport:{width,height:960},colorScheme:theme,reducedMotion:'reduce',serviceWorkers:'block'});
 const health={responses:[],failed:[],consoleErrors:[],pageErrors:[],crashes:0},pending=[],blocked=[],requests=[];
 context.on('response',response=>{const item={url:response.url(),status:response.status()};health.responses.push(item);pending.push(response.body().then(bytes=>{item.sha256=createHash('sha256').update(bytes).digest('hex');}).catch(error=>{item.bodyError=error.message;}));});
 context.on('requestfailed',request=>health.failed.push({url:request.url(),error:request.failure()?.errorText}));
 context.on('page',page=>{
  page.on('pageerror',error=>health.pageErrors.push({message:error.message,stack:error.stack}));page.on('crash',()=>health.crashes++);
  page.on('console',message=>{if(message.type()==='error')health.consoleErrors.push({text:message.text(),url:message.location().url});});
 });
 await context.addInitScript(()=>{
  window.__onboardingObservation={firstFrameAt:null,errors:[],rejections:[]};
  window.addEventListener('flutter-first-frame',()=>{window.__onboardingObservation.firstFrameAt??=performance.now();});
  window.addEventListener('error',event=>window.__onboardingObservation.errors.push({message:event.message,error:String(event.error),stack:event.error?.stack,filename:event.filename,line:event.lineno}));
  window.addEventListener('unhandledrejection',event=>window.__onboardingObservation.rejections.push(String(event.reason)));
 });
 await context.route('**/*',route=>{
  const request=route.request(),url=request.url(),method=request.method();
  if(new URL(url).origin===origin)return route.continue();
  const response=real&&url===refreshUrl&&loginFixtureResponse(url,method,request.headers()['access-control-request-method']);
  if(response){requests.push({url,method,status:response.status});return route.fulfill({status:response.status,contentType:'application/json',headers:{'access-control-allow-origin':origin,'access-control-allow-credentials':'true','access-control-allow-methods':'POST','access-control-allow-headers':request.headers()['access-control-request-headers']??'content-type'},body:response.body===null?'':JSON.stringify(response.body)});}
  blocked.push(url);return route.abort();
 });
 await installFlutterEngineFonts(context);const page=await context.newPage();
 const result={name,kind,...condition,source,engine,browser:browser.version(),snapshots:[],blocked,requests};const images=[];
 const observe=()=>page.evaluate(()=>({now:performance.now(),url:location.href,semanticsCount:document.querySelectorAll('flt-semantics').length,
  layout:JSON.parse(window.__readOnboardingLayout()),observation:window.__onboardingObservation,readyState:document.readyState,visibility:document.visibilityState}));
 try{
  await page.goto(origin+(real?'/login':`/?screen=onboarding&theme=${theme}&scale=${scale}`));
  await page.waitForFunction(()=>window.__onboardingObservation.firstFrameAt!==null&&typeof window.__readOnboardingLayout==='function'&&JSON.parse(window.__readOnboardingLayout()).screens.length===1,null,{polling:50});
  result.firstFrameAt=await page.evaluate(()=>window.__onboardingObservation.firstFrameAt);
  for(const dwell of [250,5250]){
   await page.waitForTimeout(Math.max(0,result.firstFrameAt+dwell-await page.evaluate(()=>performance.now())));
   const before=await observe();
   const file=path.join(output,`${name}-${dwell}.png`);await page.screenshot({path:file});
   const after=await observe();const bytes=await readFile(file),png=PNG.sync.read(bytes);await Promise.all(pending);
   const snapshot={dwell,before,after,pngSha256:createHash('sha256').update(bytes).digest('hex'),health:structuredClone(health)};
   result.snapshots.push(snapshot);images.push({snapshot,png});
   assert.ok(before.now-result.firstFrameAt>=dwell,'Complete fixed dwell');
   for(const state of [before,after]){
    assert.equal(new URL(state.url).pathname,real?'/login':'/','Existing host URL; no onboarding route is invented');
    assert.equal(state.semanticsCount,0);assert.equal(state.layout.semanticsEnabled,false);assert.equal(state.layout.visibleAuthChoices,0,'The visible surface is onboarding, never login');
    assert.equal(state.layout.screens.length,1);assert.equal(state.layout.screens[0].brands.length,1);assert.equal(state.layout.screens[0].scale,scale);
    assert.equal(state.readyState,'complete');assert.equal(state.visibility,'visible');assert.deepEqual(state.observation.errors,[]);assert.deepEqual(state.observation.rejections,[]);
   }
   assert.deepEqual(before.layout,after.layout,'Saved image retains its exact fractional geometry');
  }
  assert.deepEqual(blocked,[]);assert.deepEqual(health.failed,[]);assert.deepEqual(health.pageErrors,[]);assert.equal(health.crashes,0);
  assert.deepEqual(health.consoleErrors.filter(error=>!expectedRefreshConsole(error,requests)),[]);
  assert.deepEqual(health.responses.filter(r=>(r.status<200||r.status>=400)&&!(real&&r.url===refreshUrl&&r.status===401)),[]);
  assert.equal(requests.filter(r=>r.method==='POST').length,real?1:0);
  // References are created only after both original no-interaction captures.
  for(const {snapshot,png} of images){
   const screen=snapshot.before.layout.screens[0];snapshot.artwork=containedWordmarkRect(screen.brands[0]);
   snapshot.pixels={surface:regionPixels(png,{x:0,y:0,width,height:900}),brand:regionPixels(png,snapshot.artwork),
    heading:regionPixels(png,screen.texts['Welcome to Lythaus']),policyHeading:regionPixels(png,screen.texts['Before you post'])};
   const svg=theme==='dark'?'lythaus-wordmark-white.5ba0451347e2.svg':'lythaus-wordmark-black.e450176663e0.svg';
   if(snapshot.pixels.brand.nonblank)try{snapshot.fidelity=await compareApprovedArtwork(page,png,snapshot.artwork,origin+'/assets/assets/brand/lythaus-v1/'+svg,PNG);}catch(error){snapshot.fidelityError=error.message;}
   snapshot.rendered=Object.values(snapshot.pixels).every(p=>p.nonblank)&&!!snapshot.fidelity;
  }
  result.status='observed';
 }catch(error){result.status='protocol-failed';result.error=error.message;result.health=structuredClone(health);}
 finally{
  results.push(result);await writeFile(path.join(output,name+'.json'),JSON.stringify(result,null,2)+'\n');
  await context.close();await browser.close();await new Promise(resolve=>server.close(resolve));
  console.log(JSON.stringify({engine,name,status:result.status,error:result.error,snapshots:result.snapshots.map(s=>({dwell:s.dwell,rendered:s.rendered,pixels:s.pixels,fidelity:s.fidelity??s.fidelityError}))}));
 }
}
const comparisons=conditions.map(condition=>{
 const rows=results.filter(r=>r.theme===condition.theme&&r.width===condition.width);
 const layouts=rows.map(r=>r.snapshots[0]?.before.layout.screens[0]);
 return {...condition,matchingInitialLayouts:layouts.every(layout=>JSON.stringify(layout)===JSON.stringify(layouts[0])),variants:rows.map(r=>({kind:r.kind,status:r.status,error:r.error,outcomes:r.snapshots.map(s=>({dwell:s.dwell,rendered:s.rendered}))}))};
});
await writeFile(path.join(output,'results.json'),JSON.stringify({source,reviewHead:process.env.ONBOARDING_REVIEW_HEAD,engine,results,comparisons,
 limitations:'Diagnostic collection only. All four controls share a read-only layout getter; compiled bytes differ from the unchanged acceptance fixture. Original/configured isolates public build defines; configured/static-host isolates the visible wrapper; static-host/production-host changes the bootstrap, real router/provider lifecycle, offstage child and existing font configuration together. A painted production host is not a production onboarding route and does not identify the individual cause. No acceptance result is replaced.',
},null,2)+'\n');
assert.equal(results.length,16);assert.equal(new Set(results.map(r=>r.name)).size,16);
assert.deepEqual(results.filter(r=>r.status!=='observed').map(r=>({name:r.name,error:r.error})),[],'All controlled observations must complete; blank pixels remain explicit diagnostic outcomes');
