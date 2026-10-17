// Two full-login variants, once each; observe before and after semantics only.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {chromium,webkit} from 'playwright';
import {installFlutterEngineFonts} from './flutter-engine-font-fixture.mjs';
import {observeRenderHealth,assertRenderHealth} from './brand-render-health.mjs';
import {containedWordmarkRect} from './brand-artwork-pixels.mjs';
import {compareApprovedArtwork} from './brand-reference.mjs';
import {regionPixels} from './full-login-pixels.mjs';
import {assertStartupOrder} from './full-login-startup-contract.mjs';
const {PNG}=createRequire(import.meta.url)('playwright-core/lib/utilsBundle');
const output=path.resolve(process.env.BRAND_DIAGNOSTIC_OUTPUT);
const builds=JSON.parse(process.env.BRAND_DIAGNOSTIC_BUILDS);
const engine=process.env.FULL_LOGIN_ENGINE??'webkit';
assert.ok(['webkit','chromium'].includes(engine));
assert.deepEqual(builds.map(build=>build.name),['baseline-renderer','candidate']);
await mkdir(output,{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.ttf':'font/ttf','.otf':'font/otf','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const results=[];
for(const build of [...builds].reverse()){
 const neutral=build.name==='baseline-renderer',name=neutral?'neutral-placeholder':'direct-brand';
 const root=path.resolve(build.root);
 const server=createServer(async(req,res)=>{try{
  let file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  assert.ok(file===root||file.startsWith(root+path.sep));
  if(!path.extname(file))file=path.join(file,'index.html');
  res.writeHead(200,{'Content-Type':types[path.extname(file)]??'application/octet-stream','Access-Control-Allow-Origin':'*'}).end(await readFile(file));
 }catch{res.writeHead(404).end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const browser=await ({webkit,chromium})[engine].launch({headless:true});
 const context=await browser.newContext({locale:'en-US',viewport:{width:320,height:960},colorScheme:'light',reducedMotion:'reduce'});
 const health=await observeRenderHealth(context,origin);
 await context.addInitScript(()=>{
  const state=window.__fullLogin={events:[],counts:{},renderBoxes:[],semanticsMutations:0};
  window.__fullLoginProbeEvent=(name,detail,extra)=>{
   state.counts[name]=(state.counts[name]??0)+1;
   if(name==='renderBoxes')state.renderBoxes=JSON.parse(detail);
   else if(state.events.length<500)state.events.push({name,detail,extra,at:performance.now()});
  };
  new MutationObserver(records=>{for(const record of records)if(record.target.nodeName.startsWith('FLT-'))state.semanticsMutations++;})
   .observe(document,{subtree:true,childList:true,attributes:true});
 });
 const blocked=[];
 await context.route('**/*',route=>{
  if(new URL(route.request().url()).origin===origin)return route.continue();
  blocked.push(route.request().url());return route.abort();
 });
 await installFlutterEngineFonts(context);
 const page=await context.newPage();
 const result={name,source:build.sha,engine,browser:browser.version(),snapshots:[]};
 const captured=[];
 const readProbe=()=>page.evaluate(()=>({
  ...window.__fullLogin,scroll:{x:scrollX,y:scrollY},
  semantics:[...document.querySelectorAll('flt-semantics')].map(e=>({role:e.getAttribute('role'),label:e.getAttribute('aria-label'),text:e.textContent?.slice(0,400)})),
 }));
 async function capture(phase,time,semanticsEnabled){
  const initialProbe=await readProbe();
  let bounds;
  if(semanticsEnabled){
   bounds={brand:await page.getByRole('img',{name:'Lythaus',exact:true}).boundingBox(),
    email:await page.getByRole('textbox',{name:'Email',exact:true}).boundingBox(),
    password:await page.getByRole('textbox',{name:'Password',exact:true}).boundingBox()};
  }else{
   const boxes=initialProbe.renderBoxes.filter(b=>b.kind==='customPaint'&&b.x===24&&b.y===32&&b.width===272&&b.height===40);
   assert.equal(boxes.length,1,'Find original brand slot from Dart layout before semantics');
   const {x,y,width,height}=boxes[0];bounds={brand:{x,y,width,height}};
  }
  const captureStartedAt=await page.evaluate(()=>performance.now());
  const png=PNG.sync.read(await page.screenshot({path:path.join(output,`${name}-${phase}-${time}.png`)}));
  const captureCompletedAt=await page.evaluate(()=>performance.now());
  const artwork=containedWordmarkRect(bounds.brand);
  const form={x:24,y:bounds.brand.y+bounds.brand.height+16,width:272,height:900-(bounds.brand.y+bounds.brand.height+16)};
  const pixels={brand:regionPixels(png,artwork),form:regionPixels(png,form),surface:regionPixels(png,{x:0,y:0,width:320,height:900})};
  const snapshot={phase,time,captureStartedAt,captureCompletedAt,bounds,artwork,form,pixels,probe:await readProbe(),health:await health(page)};
  snapshot.classification=!pixels.form.nonblank&&!(neutral?pixels.brand.neutralFill:pixels.brand.nonblank)?'full-login-regions-blank':'some-login-regions-painted';
  result.snapshots.push(snapshot);captured.push({snapshot,png});
 }
 try{
  await page.goto(origin+'/?screen=login&theme=light&scale=2');
  // No accessibility query or semantics activation until a Dart frame and its
  // read-only layout snapshot exist. The initial screenshot precedes the click.
  await page.waitForFunction(()=>window.__fullLogin?.counts['frame:end']>0&&window.__fullLogin.renderBoxes.length>0);
  await page.evaluate(()=>{
   const label=document.createElement('div');label.textContent='LOCAL SYNTHETIC BRAND QA';
   label.style.cssText='position:fixed;bottom:0;right:0;z-index:99999;background:#111;color:#fff;padding:4px;font:10px sans-serif;pointer-events:none';document.body.append(label);
  });
  await capture('before-semantics',0,false);
  result.activationAt=await page.locator('flt-semantics-placeholder').evaluate(element=>{
   const at=performance.now();element.click();return at;
  });
  const start=Date.now();
  const brand=page.getByRole('img',{name:'Lythaus',exact:true});await brand.waitFor();
  assert.equal(await brand.count(),1);
  for(const time of [250,5250]){
   await page.waitForTimeout(Math.max(0,time-(Date.now()-start)));
   await capture('after-semantics',time,true);
  }
  assertStartupOrder(result);
  assert.deepEqual(blocked,[]);
  for(const snapshot of result.snapshots){
   assertRenderHealth(snapshot.health);
   assert.equal(snapshot.bounds.brand.height,40);
   assert.equal(snapshot.bounds.brand.width,272);
   assert.ok(snapshot.probe.counts['brand:paint']>0,'Brand painter invoked');
  }
  // Native SVG references are rendered only after every observed capture.
  if(!neutral)for(const {snapshot,png} of captured)try{
   snapshot.fidelity=await compareApprovedArtwork(page,png,snapshot.artwork,origin+'/assets/assets/brand/lythaus-v1/lythaus-wordmark-black.e450176663e0.svg',PNG);
  }catch(error){snapshot.fidelityError=error.message;}
 }catch(error){result.error=error.message;result.health=await health(page).catch(e=>({unavailable:e.message}));
  await page.screenshot({path:path.join(output,name+'-error.png')}).catch(()=>{});
 }finally{
  results.push(result);await context.close();await browser.close();server.close();
  await writeFile(path.join(output,'full-login-results.json'),JSON.stringify({results,hostValidationSkipped:process.env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS??null},null,2));
 }
}
const geometry=result=>result.snapshots.at(-1)?.probe.renderBoxes.map(({kind,x,y,width,height})=>({kind,x,y,width,height}));
const summary={
 results:results.map(result=>({name:result.name,error:result.error,activationAt:result.activationAt,
  snapshots:result.snapshots.map(s=>({phase:s.phase,time:s.time,classification:s.classification,formPainted:s.pixels.form.nonblank,brandPainted:s.pixels.brand.nonblank,placeholderPainted:s.pixels.brand.neutralFill,frames:s.probe.counts['frame:end']}))})),
 matchingLastRenderGeometry:JSON.stringify(geometry(results[0]))===JSON.stringify(geometry(results[1])),
 matchingLastControlBounds:JSON.stringify(results[0].snapshots.at(-1)?.bounds)===JSON.stringify(results[1].snapshots.at(-1)?.bounds),
 caution:'Delayed-semantics diagnosis only. No resize, forced Dart repaint, geometry or renderer change. A passing sample does not clear the unchanged failed required gate or prove mechanism.',
};
await writeFile(path.join(output,'full-login-summary.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary));
assert.ok(results.every(result=>!result.error),'Both ordered observations must complete; inspect retained errors');
assert.equal(summary.matchingLastRenderGeometry,true,'Direct/placeholder layout must match');
assert.equal(summary.matchingLastControlBounds,true,'Direct/placeholder semantic bounds must match');
