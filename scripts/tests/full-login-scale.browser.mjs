import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
import {chromium,webkit} from 'playwright';
import {installFlutterEngineFonts} from './flutter-engine-font-fixture.mjs';
import {compareApprovedArtwork} from './brand-reference.mjs';
import {scalePixels,headingReferences} from './full-login-scale-pixels.mjs';
const {PNG}=createRequire(import.meta.url)('playwright-core/lib/utilsBundle');
const output=path.resolve(process.env.SCALE_DIAGNOSTIC_OUTPUT),engine=process.env.FULL_LOGIN_ENGINE??'webkit';
const source=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
assert.ok(['chromium','webkit'].includes(engine));await mkdir(output,{recursive:true});
const cases=[
 {name:'static-1x',scale:1,root:path.resolve(process.env.SCALE_STATIC_ROOT),source:process.env.SCALE_STATIC_SOURCE??source},
 {name:'production-wrapped-1x',scale:1,real:true,root:path.resolve(process.env.SCALE_PRODUCTION_ONE_ROOT),source:process.env.SCALE_PRODUCTION_SOURCE??source},
 {name:'production-wrapped-2x',scale:2,real:true,root:path.resolve(process.env.SCALE_PRODUCTION_TWO_ROOT),source:process.env.SCALE_PRODUCTION_SOURCE??source},
];
async function inventory(root,prefix=''){
 const result={};
 for(const entry of await readdir(path.join(root,prefix),{withFileTypes:true})){
  const file=path.join(prefix,entry.name);
  if(entry.isDirectory())Object.assign(result,await inventory(root,file));
  else if(entry.isFile())result[file]=createHash('sha256').update(await readFile(path.join(root,file))).digest('hex');
 }return result;
}
const resources={};for(const c of cases)resources[c.name]=await inventory(c.root);
const assets=files=>Object.fromEntries(Object.entries(files).filter(([name])=>name.startsWith('assets/')||name.startsWith('canvaskit/')));
for(const c of cases.slice(1))assert.deepEqual(assets(resources[c.name]),assets(resources['static-1x']),'All Flutter assets and engine files must match');
await writeFile(path.join(output,'resources.json'),JSON.stringify({source,reviewHead:process.env.DIAGNOSTIC_REVIEW_HEAD,cases,resources,
 matchedAssets:Object.keys(assets(resources['static-1x'])).length,headingReferences,
 referenceSource:'f27ce7f6 run 39074924193, real-app-uninstrumented-5250.png at 1x and direct-one-frame-5250.png at 2x; row bounds only, tolerance one raster pixel.',
},null,2));
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.ttf':'font/ttf','.otf':'font/otf','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const results=[];
for(const config of cases){
 const {name,root,scale}=config;
 const server=createServer(async(req,res)=>{try{
  let file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  assert.ok(file===root||file.startsWith(root+path.sep));
  if(!path.extname(file))file=path.join(root,'index.html');
  res.writeHead(200,{'Content-Type':types[path.extname(file)]??'application/octet-stream','Access-Control-Allow-Origin':'*'}).end(await readFile(file));
 }catch{res.writeHead(404).end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await ({webkit,chromium})[engine].launch({headless:true});
 const context=await browser.newContext({locale:'en-US',viewport:{width:320,height:960},colorScheme:'light',reducedMotion:'reduce',serviceWorkers:'block'});
 const health={responses:[],failed:[],consoleErrors:[],pageErrors:[],crashes:0},pending=[];
 context.on('response',response=>{
  const record={url:response.url(),status:response.status()};health.responses.push(record);
  pending.push(response.body().then(body=>{record.sha256=createHash('sha256').update(body).digest('hex');}).catch(error=>{record.bodyError=error.message;}));
 });
 context.on('requestfailed',request=>health.failed.push({url:request.url(),error:request.failure()?.errorText}));
 context.on('page',page=>{
  page.on('pageerror',error=>health.pageErrors.push(error.message));page.on('crash',()=>health.crashes++);
  page.on('console',message=>{if(message.type()==='error')health.consoleErrors.push({text:message.text(),location:message.location()});});
 });
 // The framework DOM notification is only the shared timing milestone. There
 // are no Dart/GL hooks, frame requests, RAF loops or canvas method wrappers.
 await context.addInitScript(()=>{
  window.__scaleObservation={firstFrameAt:null,errors:[],rejections:[]};
  window.addEventListener('flutter-first-frame',()=>{window.__scaleObservation.firstFrameAt??=performance.now();});
  window.addEventListener('error',e=>window.__scaleObservation.errors.push(e.message));
  window.addEventListener('unhandledrejection',e=>window.__scaleObservation.rejections.push(String(e.reason)));
 });
 const blocked=[],syntheticResponses=[];
 await context.route('**/*',route=>{
  const request=route.request(),url=new URL(request.url());
  if(url.origin===origin)return route.continue();
  if(config.real&&url.href==='https://api.lythaus.co/api/auth/refresh'&&['POST','OPTIONS'].includes(request.method())){
   const status=request.method()==='OPTIONS'?204:401;syntheticResponses.push({url:url.href,method:request.method(),status});
   return route.fulfill({status,contentType:'application/json',body:status===204?'':JSON.stringify({error:{code:'SESSION_EXPIRED',message:'Synthetic signed-out diagnostic'}}),
    headers:{'access-control-allow-origin':origin,'access-control-allow-credentials':'true','access-control-allow-methods':'POST, OPTIONS','access-control-allow-headers':request.headers()['access-control-request-headers']??'content-type,x-csrf-token'}});
  }
  blocked.push(request.url());return route.abort();
 });
 await installFlutterEngineFonts(context);
 const page=await context.newPage();
 const result={name,scale,source:config.source,engine,browser:browser.version(),snapshots:[],syntheticResponses,blocked};
 const captured=[];
 try{
  await page.goto(origin+(config.real?'/':'/login?screen=login&theme=light&scale=1'));
  await page.waitForFunction(()=>window.__scaleObservation.firstFrameAt!==null);
  result.anchorAt=await page.evaluate(()=>window.__scaleObservation.firstFrameAt);
  await page.evaluate(()=>{
   const label=document.createElement('div');label.textContent='LOCAL SYNTHETIC BRAND QA';
   label.style.cssText='position:fixed;bottom:0;right:0;z-index:99999;background:#111;color:#fff;padding:4px;font:10px sans-serif;pointer-events:none';document.body.append(label);
  });
  for(const time of [250,5250]){
   const now=await page.evaluate(()=>performance.now());await page.waitForTimeout(Math.max(0,result.anchorAt+time-now));
   const captureStartedAt=await page.evaluate(()=>performance.now());
   const png=PNG.sync.read(await page.screenshot({path:path.join(output,`${name}-${time}.png`)}));
   const captureCompletedAt=await page.evaluate(()=>performance.now());
   await Promise.all(pending);
   const state=await page.evaluate(()=>({url:location.href,title:document.title,semanticsCount:document.querySelectorAll('flt-semantics').length,
    observation:window.__scaleObservation,diagnosticFrameHook:typeof window.__scheduleFullLoginDiagnosticFrame,
    readyState:document.readyState,visibility:document.visibilityState}));
   const snapshot={time,captureStartedAt,captureCompletedAt,...state,pixels:scalePixels(png,scale),health:structuredClone(health)};
   result.snapshots.push(snapshot);captured.push({snapshot,png});
  }
  assert.deepEqual(blocked,[]);assert.equal(result.snapshots.length,2);
  for(const s of result.snapshots){
   assert.ok(s.captureStartedAt-result.anchorAt>=s.time,'The complete fixed dwell must elapse');
   assert.equal(new URL(s.url).pathname,'/login');assert.equal(s.title,config.real?'Lythaus':'');
   assert.equal(s.semanticsCount,0);assert.equal(s.diagnosticFrameHook,'undefined');
   assert.equal(s.readyState,'complete');assert.equal(s.visibility,'visible');
   assert.deepEqual(s.observation.errors,[]);assert.deepEqual(s.observation.rejections,[]);
   assert.equal(s.health.crashes,0);assert.deepEqual(s.health.failed,[]);assert.deepEqual(s.health.pageErrors,[]);
   const expected401=entry=>config.real&&entry.url==='https://api.lythaus.co/api/auth/refresh'&&entry.status===401;
   assert.deepEqual(s.health.responses.filter(r=>(r.status<200||r.status>=400)&&!expected401(r)),[]);
   assert.deepEqual(s.health.consoleErrors.filter(e=>!(config.real&&e.location.url==='https://api.lythaus.co/api/auth/refresh'&&/401/.test(e.text))),[]);
  }
  if(config.real)assert.equal(syntheticResponses.filter(r=>r.method==='POST'&&r.status===401).length,1);
  else assert.deepEqual(syntheticResponses,[]);
  // References are rendered only after all fixed no-interaction observations.
  for(const {snapshot,png} of captured){
   if(snapshot.pixels.artwork)try{
    snapshot.fidelity=await compareApprovedArtwork(page,png,snapshot.pixels.artwork,origin+'/assets/assets/brand/lythaus-v1/lythaus-wordmark-black.e450176663e0.svg',PNG);
   }catch(error){snapshot.fidelityError=error.message;}
   snapshot.renderAccepted=!!(snapshot.pixels.surface.nonblank&&snapshot.pixels.form.nonblank&&snapshot.pixels.brand?.nonblank&&snapshot.pixels.geometryMatches&&snapshot.fidelity);
  }
 }catch(error){result.error=error.message;result.health=structuredClone(health);await page.screenshot({path:path.join(output,name+'-error.png')}).catch(()=>{});
 }finally{
  results.push(result);await context.close();await browser.close();server.close();
  await writeFile(path.join(output,'scale-results.json'),JSON.stringify({source,results,hostValidationSkipped:process.env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS??null},null,2));
 }
}
const summary={results:results.map(r=>({name:r.name,scale:r.scale,error:r.error,snapshots:r.snapshots.map(s=>({time:s.time,url:s.url,semantics:s.semanticsCount,
 surfacePainted:s.pixels.surface.nonblank,formPainted:s.pixels.form.nonblank,brandPainted:s.pixels.brand?.nonblank??false,geometryMatches:s.pixels.geometryMatches,fidelity:s.fidelity??s.fidelityError,renderAccepted:s.renderAccepted}))})),
 caution:'Three fresh observations only. No semantics, interaction, frame hooks or artificial auth transitions. Same first-frame DOM milestone and fixed 250/5250 ms dwell. Synthetic signed-out response; service workers blocked. Diagnostic pixel outcomes do not replace the unchanged required gate.'};
await writeFile(path.join(output,'scale-summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
assert.ok(results.every(r=>!r.error),'All observations and isolation checks must complete; pixel failures remain visible outcomes');
