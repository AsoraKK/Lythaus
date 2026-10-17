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
import {installPresentationProbe} from './frame-presentation-probe.mjs';
import {assertNoSemanticsDwell} from './frame-dwell-contract.mjs';
import {containedWordmarkRect} from './brand-artwork-pixels.mjs';
import {compareApprovedArtwork} from './brand-reference.mjs';
import {regionPixels} from './full-login-pixels.mjs';
const {PNG}=createRequire(import.meta.url)('playwright-core/lib/utilsBundle');
const output=path.resolve(process.env.FRAME_DIAGNOSTIC_OUTPUT),engine=process.env.FULL_LOGIN_ENGINE??'webkit';
const source=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
assert.ok(['chromium','webkit'].includes(engine));
await mkdir(output,{recursive:true});
const roots={direct:path.resolve(process.env.FRAME_DIRECT_ROOT),required:path.resolve(process.env.FRAME_REQUIRED_ROOT),real:path.resolve(process.env.FRAME_REAL_APP_ROOT)};
const sources={direct:process.env.FRAME_DIRECT_SOURCE??source,required:process.env.FRAME_REQUIRED_SOURCE??source,real:process.env.FRAME_REAL_APP_SOURCE??source};
async function inventory(root,prefix=''){
 const result={};
 for(const entry of await readdir(path.join(root,prefix),{withFileTypes:true})){
  const file=path.join(prefix,entry.name);
  if(entry.isDirectory())Object.assign(result,await inventory(root,file));
  else if(entry.isFile())result[file]=createHash('sha256').update(await readFile(path.join(root,file))).digest('hex');
 }return result;
}
const resources={};for(const [name,root] of Object.entries(roots))resources[name]=await inventory(root);
await writeFile(path.join(output,'resources.json'),JSON.stringify({source,reviewHead:process.env.DIAGNOSTIC_REVIEW_HEAD,
 construction:'Wait and one-frame arms use the identical direct root and all compiled bytes. Uninstrumented required fixture and immutable real app are separately inventoried controls, not asserted identical apps.',roots,sources,resources},null,2));
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.ttf':'font/ttf','.otf':'font/otf','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const cases=[
 {name:'direct-wait-only',arm:'wait-only',root:roots.direct,instrumented:true},
 {name:'direct-one-frame',arm:'one-frame',root:roots.direct,instrumented:true},
 {name:'required-uninstrumented',arm:'wait-only',root:roots.required,instrumented:false},
 {name:'real-app-uninstrumented',arm:'wait-only',root:roots.real,instrumented:false,real:true},
];
const results=[];
for(const config of cases){
 const {name,root,instrumented}=config;
 const server=createServer(async(req,res)=>{try{
  let file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  assert.ok(file===root||file.startsWith(root+path.sep));
  if(!path.extname(file))file=path.join(root,'index.html');
  res.writeHead(200,{'Content-Type':types[path.extname(file)]??'application/octet-stream','Access-Control-Allow-Origin':'*'}).end(await readFile(file));
 }catch{res.writeHead(404).end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await ({webkit,chromium})[engine].launch({headless:true});
 // Only the real-app smoke blocks service workers so its synthetic auth route
 // cannot be bypassed. Its service-worker lifecycle is therefore not certified.
 const context=await browser.newContext({locale:'en-US',viewport:{width:320,height:960},colorScheme:'light',reducedMotion:'reduce',serviceWorkers:config.real?'block':'allow'});
 const health=await observeRenderHealth(context,origin);
 await installPresentationProbe(context,instrumented);
 await context.addInitScript(()=>{
  const state=window.__fullLogin={events:[],counts:{},renderBoxes:[]};
  window.__fullLoginProbeEvent=(name,detail,extra)=>{
   state.counts[name]=(state.counts[name]??0)+1;
   if(name==='renderBoxes')state.renderBoxes=JSON.parse(detail);
   else if(state.events.length<500)state.events.push({name,detail,extra,at:performance.now()});
  };
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
 const result={name,arm:config.arm,instrumented,source:config.real?sources.real:instrumented?sources.direct:sources.required,engine,browser:browser.version(),snapshots:[],
  configuration:config.real?'Unmodified release app, fresh signed-out context, default text scale; API refresh fulfilled locally as 401, service workers blocked. No production API traffic.':'Original full login, 320x960/light/2x, no semantics activation.',syntheticResponses,blocked};
 const captured=[];
 async function capture(time){
  const captureStartedAt=await page.evaluate(()=>performance.now());
  const png=PNG.sync.read(await page.screenshot({path:path.join(output,`${name}-${time}.png`)}));
  const captureCompletedAt=await page.evaluate(()=>performance.now());
  const state=await page.evaluate(()=>({probe:window.__fullLogin,presentation:window.__presentation,semanticsCount:document.querySelectorAll('flt-semantics').length,semanticsPlaceholderCount:document.querySelectorAll('flt-semantics-placeholder').length,url:location.href}));
  const pixels={surface:regionPixels(png,{x:0,y:0,width:320,height:900})};
  let artwork;
  if(!config.real){
   const slot={x:24,y:32,width:272,height:40};
   if(instrumented)assert.equal(state.probe.renderBoxes.filter(b=>b.kind==='customPaint'&&b.x===24&&b.y===32&&b.width===272&&b.height===40).length,1);
   artwork=containedWordmarkRect(slot);pixels.brand=regionPixels(png,artwork);pixels.form=regionPixels(png,{x:24,y:88,width:272,height:812});
  }
  const snapshot={time,captureStartedAt,captureCompletedAt,...state,pixels,artwork,health:structuredClone(await health(page))};
  result.snapshots.push(snapshot);captured.push({snapshot,png});
 }
 try{
  await page.goto(origin+(config.real?'/':'/?screen=login&theme=light&scale=2'));
  if(instrumented)await page.waitForFunction(()=>window.__fullLogin?.counts['frame:end']>0&&window.__fullLogin.renderBoxes.length>0);
  else{
   await page.waitForFunction(()=>window.__presentation.firstFrameAt!==null);
   assert.equal(await page.evaluate(()=>typeof window.__scheduleFullLoginDiagnosticFrame),'undefined','Control has no diagnostic Dart frame hook');
  }
  await page.evaluate(()=>{
   const label=document.createElement('div');label.textContent='LOCAL SYNTHETIC BRAND QA';
   label.style.cssText='position:fixed;bottom:0;right:0;z-index:99999;background:#111;color:#fff;padding:4px;font:10px sans-serif;pointer-events:none';document.body.append(label);
  });
  if(instrumented){
   await capture(0);result.anchorAt=result.snapshots[0].captureCompletedAt;
   if(config.arm==='one-frame')result.frameRequestedAt=await page.evaluate(()=>{
    const at=performance.now();window.__scheduleFullLoginDiagnosticFrame();return at;
   });
  }else result.anchorAt=await page.evaluate(()=>window.__presentation.firstFrameAt);
  for(const time of [250,5250]){
   const now=await page.evaluate(()=>performance.now());await page.waitForTimeout(Math.max(0,result.anchorAt+time-now));
   await capture(time);
  }
  assertNoSemanticsDwell(result);assert.deepEqual(blocked,[]);
  for(const snapshot of result.snapshots){
   assert.deepEqual(snapshot.presentation.errors,[]);
   if(config.real){
    const allowed401=syntheticResponses.some(r=>r.status===401);
    const h=snapshot.health;
    assertRenderHealth({...h,responses:h.responses.filter(r=>!(r.status===401&&syntheticResponses.some(s=>s.url===r.url))),
     errors:h.errors.filter(e=>!(allowed401&&/401/.test(e)))});
   }else assertRenderHealth(snapshot.health);
  }
  if(!config.real)for(const {snapshot,png} of captured)try{
   snapshot.fidelity=await compareApprovedArtwork(page,png,snapshot.artwork,origin+'/assets/assets/brand/lythaus-v1/lythaus-wordmark-black.e450176663e0.svg',PNG);
  }catch(error){snapshot.fidelityError=error.message;}
 }catch(error){result.error=error.message;result.health=structuredClone(await health(page).catch(e=>({unavailable:e.message})));
  await page.screenshot({path:path.join(output,name+'-error.png')}).catch(()=>{});
 }finally{
  results.push(result);await context.close();await browser.close();server.close();
  await writeFile(path.join(output,'frame-results.json'),JSON.stringify({source,results,hostValidationSkipped:process.env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS??null},null,2));
 }
}
const summary={results:results.map(r=>({name:r.name,error:r.error,arm:r.arm,snapshots:r.snapshots.map(s=>({time:s.time,semantics:s.semanticsCount,frames:s.probe.counts['frame:end']??null,
 paintCalls:s.probe.counts['brand:paint']??null,requests:s.probe.counts['diagnosticFrame:request']??0,surfacePainted:s.pixels.surface.nonblank,brandPainted:s.pixels.brand?.nonblank}))})),
 caution:'One sample per arm/control. No semantics activation; only one diagnostic scheduleFrame in its designated arm. Real app uses its own unmodified startup and default scale, with locally fulfilled signed-out auth and blocked service workers. No production fix or gate change.'};
await writeFile(path.join(output,'frame-summary.json'),JSON.stringify(summary,null,2));console.log(JSON.stringify(summary));
assert.ok(results.every(r=>!r.error),'All fixed observations and isolation contracts must complete');
