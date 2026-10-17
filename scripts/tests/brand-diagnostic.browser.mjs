// Bounded diagnostic, not a replacement for any release gate.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import path from 'node:path';
import {webkit,chromium} from 'playwright';
import {installFlutterEngineFonts} from './flutter-engine-font-fixture.mjs';
import {observeRenderHealth,assertRenderHealth} from './brand-render-health.mjs';
import {compareApprovedArtwork} from './brand-reference.mjs';
const {PNG}=createRequire(import.meta.url)('playwright-core/lib/utilsBundle');
const output=path.resolve(process.env.BRAND_DIAGNOSTIC_OUTPUT??'build/brand-diagnostic-evidence');
const builds=JSON.parse(process.env.BRAND_DIAGNOSTIC_BUILDS);
const engine=process.env.BRAND_BROWSER??'webkit', headed=process.env.BRAND_DIAGNOSTIC_HEADED==='1';
await mkdir(output,{recursive:true});
const types={'.js':'text/javascript','.html':'text/html','.wasm':'application/wasm','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.ttf':'font/ttf','.otf':'font/otf'};
async function inventory(root,prefix='') {
  const result={};
  for(const entry of await readdir(path.join(root,prefix),{withFileTypes:true})){
    const name=path.join(prefix,entry.name);
    if(entry.isDirectory())Object.assign(result,await inventory(root,name));
    else if(entry.isFile())result[name]=createHash('sha256').update(await readFile(path.join(root,name))).digest('hex');
  }return result;
}
const results=[];
for(const build of builds){
 const root=path.resolve(build.root);
 const server=createServer(async(req,res)=>{try{
   let file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
   assert.ok(file.startsWith(root+path.sep));if(!path.extname(file))file=path.join(file,'index.html');
   res.writeHead(200,{'content-type':types[path.extname(file)]??'application/octet-stream','access-control-allow-origin':'*'}).end(await readFile(file));
 }catch{res.writeHead(404).end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 try{for(const noBrand of [false,true]){
  const browserType=engine==='webkit'?webkit:chromium;
  const browserServer=await browserType.launchServer({headless:!headed});
  const browser=await browserType.connect(browserServer.wsEndpoint());
  const context=await browser.newContext({locale:'en-US',viewport:{width:390,height:960},colorScheme:'dark',reducedMotion:'reduce'});
  const health=await observeRenderHealth(context,origin);
  await installFlutterEngineFonts(context);
  await context.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{
    const dom=document.createElement('div');dom.id='dom-control';dom.style.cssText='position:fixed;z-index:9999;top:0;left:0;width:40px;height:40px;background:rgb(255,0,0)';document.body.append(dom);
    const canvas=document.createElement('canvas');canvas.id='canvas-control';canvas.width=40;canvas.height=40;canvas.style.cssText='position:fixed;z-index:9999;top:0;left:50px';document.body.append(canvas);
    const ctx=canvas.getContext('2d');ctx.fillStyle='rgb(0,0,255)';ctx.fillRect(0,0,40,40);
  }));
  const page=await context.newPage();const name=build.name+(noBrand?'-no-brand':'-brand');
  const result={name,source:build.sha,engine,headed,browser:browser.version(),regions:{},browserPid:browserServer.process().pid};
  try{
   await page.goto(origin+'/?noBrand='+(noBrand?'1':'0')+'&screen=onboarding&theme=dark&scale=1');
   await page.locator('flt-semantics-placeholder').evaluate(e=>e.click());
   await page.getByRole('img',{name:'diagnostic-rectangle',exact:true}).waitFor();
   const first=await health(page);await page.waitForTimeout(1000);
   const png=PNG.sync.read(await page.screenshot({path:path.join(output,name+'.png')}));
   if(headed)execFileSync('import',['-window','root',path.join(output,name+'-desktop.png')]);
   for(const [label,x,color] of [['dom',20,[255,0,0]],['canvas2d',70,[0,0,255]]]){
     const i=(20*png.width+x)*4;result.regions[label]=color.every((v,c)=>png.data[i+c]===v);
   }
   for(const region of ['rectangle','text',...(!noBrand?['direct-brand','production-brand','svg','image']:[])]){
    let rect=await page.getByRole('img',{name:'diagnostic-'+region,exact:true}).boundingBox();
    let ink=0;
    for(let y=Math.ceil(rect.y);y<rect.y+rect.height;y++)for(let x=Math.ceil(rect.x);x<rect.x+rect.width;x++){
      const i=(y*png.width+x)*4;if([0,1,2].some(c=>png.data[i+c]<200))ink++;
    }
    result.regions[region]={ink,painted:ink>=16};
    if(['direct-brand','production-brand','svg'].includes(region)){
      const width=rect.height*470.28944891/130.6866688;rect={...rect,x:rect.x+(rect.width-width)/2,width};
      try{result.regions[region].fidelity=await compareApprovedArtwork(page,png,rect,origin+'/assets/assets/brand/lythaus-v1/lythaus-wordmark-black.e450176663e0.svg',PNG);}
      catch(error){result.regions[region].fidelityError=error.message;}
    }
   }
   result.health=await health(page);result.live=result.health.page.frames>first.page.frames;
   assertRenderHealth(result.health);assert.ok(result.live);
   result.classification=!result.regions.rectangle.painted&&!result.regions.text.painted?'whole-Flutter-loss':
    !noBrand&&!result.regions['production-brand'].painted?'brand-only-loss':'controls-painted';
  }catch(error){result.error=error.message;result.health=await health(page).catch(e=>({unavailable:e.message}));}
  finally{
    result.processAlive=browserServer.process().exitCode===null;
    result.processExitCode=browserServer.process().exitCode;
    results.push(result);await browser.close();await browserServer.close();
  }
 }}finally{server.close();}
 await writeFile(path.join(output,build.name+'-resource-hashes.json'),JSON.stringify(await inventory(root),null,2));
}
await writeFile(path.join(output,'results.json'),JSON.stringify({results,
 launcher:webkit.executablePath(),hostValidationSkipped:process.env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS??null,
 libraryPath:process.env.LD_LIBRARY_PATH??null,platform:process.platform,arch:process.arch,
},null,2));
console.log(JSON.stringify(results.map(({name,classification,error})=>({name,classification,error}))));
