// Three exact full-login variants, once each; no resize or retry-to-green.
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
const {PNG}=createRequire(import.meta.url)('playwright-core/lib/utilsBundle');
const output=path.resolve(process.env.BRAND_DIAGNOSTIC_OUTPUT);
const builds=JSON.parse(process.env.BRAND_DIAGNOSTIC_BUILDS);
const engine=process.env.FULL_LOGIN_ENGINE??'webkit';
assert.ok(['webkit','chromium'].includes(engine));
assert.deepEqual(builds.map(build=>build.name),['direct-brand','pinned-svg','neutral-placeholder']);
await mkdir(output,{recursive:true});
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.ttf':'font/ttf','.otf':'font/otf','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const results=[];
for(const build of builds){
 const name=build.name,neutral=name==='neutral-placeholder';
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
 const page=await context.newPage();const result={name,source:build.sha,engine,browser:browser.version(),snapshots:[],
  svgReadiness:name==='pinned-svg'?'Not instrumented; blank sample does not establish SVG compositing regression.':'Not applicable to this renderer'};
 try{
  await page.goto(origin+'/?screen=login&theme=light&scale=2');
  await page.locator('flt-semantics-placeholder').evaluate(element=>element.click());
  const brand=page.getByRole('img',{name:'Lythaus',exact:true});await brand.waitFor();
  assert.equal(await brand.count(),1);
  await page.waitForTimeout(300);
  await page.evaluate(()=>{
   const label=document.createElement('div');label.textContent='LOCAL SYNTHETIC BRAND QA';
   label.style.cssText='position:fixed;bottom:0;right:0;z-index:99999;background:#111;color:#fff;padding:4px;font:10px sans-serif;pointer-events:none';document.body.append(label);
  });
  const start=Date.now();let lastPng,lastRect;
  for(const time of [250,5250]){
   await page.waitForTimeout(Math.max(0,time-(Date.now()-start)));
   await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   const png=PNG.sync.read(await page.screenshot({path:path.join(output,name+'-'+time+'.png')}));
   const bounds={brand:await brand.boundingBox(),email:await page.getByRole('textbox',{name:'Email',exact:true}).boundingBox(),password:await page.getByRole('textbox',{name:'Password',exact:true}).boundingBox()};
   const artwork=containedWordmarkRect(bounds.brand);
   // This form crop excludes the brand slot and the DOM QA overlay. Empty
   // editable interiors alone do not establish that the form is blank.
   const form={x:24,y:bounds.brand.y+bounds.brand.height+16,width:272,height:900-(bounds.brand.y+bounds.brand.height+16)};
   const pixels={brand:regionPixels(png,artwork),form:regionPixels(png,form),surface:regionPixels(png,{x:0,y:0,width:320,height:900})};
   const probe=await page.evaluate(()=>({
    ...window.__fullLogin,scroll:{x:scrollX,y:scrollY},
    semantics:[...document.querySelectorAll('flt-semantics')].map(e=>({role:e.getAttribute('role'),label:e.getAttribute('aria-label'),text:e.textContent?.slice(0,400)})),
   }));
   result.snapshots.push({time,bounds,artwork,form,pixels,probe,health:await health(page)});
   lastPng=png;lastRect=artwork;
  }
  const last=result.snapshots.at(-1);
  assertRenderHealth(last.health);assert.deepEqual(blocked,[]);
  assert.ok(last.probe.counts['frame:end']>0&&last.probe.counts['paintFlush:end']>0&&last.probe.counts['semanticsFlush:end']>0,'Full Flutter pipeline boundaries observed');
  assert.equal(last.bounds.brand.height,40,'Original 40px login brand slot');
  assert.equal(last.bounds.brand.width,272,'Original stretched login slot width');
  if(name!=='pinned-svg')assert.ok(last.probe.counts['brand:paint']>0,'Actual brand painter invoked');
  if(!neutral)try{
   result.fidelity=await compareApprovedArtwork(page,lastPng,lastRect,origin+'/assets/assets/brand/lythaus-v1/lythaus-wordmark-black.e450176663e0.svg',PNG);
  }catch(error){result.fidelityError=error.message;}
  result.classification=!last.pixels.form.nonblank&&!(neutral?last.pixels.brand.neutralFill:last.pixels.brand.nonblank)?'full-login-regions-blank':'some-login-regions-painted';
 }catch(error){result.error=error.message;result.health=await health(page).catch(e=>({unavailable:e.message}));
  await page.screenshot({path:path.join(output,name+'-error.png')}).catch(()=>{});
 }finally{
  results.push(result);await context.close();await browser.close();server.close();
  await writeFile(path.join(output,'full-login-results.json'),JSON.stringify({results,hostValidationSkipped:process.env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS??null},null,2));
 }
}
const [direct,svg,neutral]=results;
const geometry=result=>result.snapshots.at(-1)?.probe.renderBoxes.map(({kind,x,y,width,height})=>({kind,x,y,width,height}));
const summary={
 direct:direct.classification,svg:svg.classification,neutral:neutral.classification,
 matchingLastRenderGeometry:JSON.stringify(geometry(direct))===JSON.stringify(geometry(neutral)),
 matchingLastControlBounds:results.every(result=>JSON.stringify(result.snapshots.at(-1)?.bounds)===JSON.stringify(direct.snapshots.at(-1)?.bounds)),
 caution:'Once per variant at two fixed times, before resize/forced repaint. Pipeline callbacks do not certify GPU completion. No SVG readiness callback is instrumented. Instrumented direct must reproduce the required uninstrumented failure before attribution.',
};
await writeFile(path.join(output,'full-login-summary.json'),JSON.stringify(summary,null,2));
console.log(JSON.stringify(summary));
assert.ok(results.every(result=>!result.error),'All three observations must complete; inspect retained errors');
assert.equal(summary.matchingLastControlBounds,true,'Original login bounds must match across all variants');
assert.equal(summary.matchingLastRenderGeometry,true,'Direct/placeholder layout must remain identical');
