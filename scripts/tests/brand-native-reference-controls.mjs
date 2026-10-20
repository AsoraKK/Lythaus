import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import path from 'node:path';
import {compareApprovedArtwork} from './brand-reference.mjs';
import {containedWordmarkRect} from './brand-artwork-pixels.mjs';

export async function verifyNativeArtworkReference({browser,engine,origin,approved,output,PNG}){
 const context=await browser.newContext({viewport:{width:320,height:200},locale:'en-US'});
 const page=await context.newPage(),results=[];
 try{
  await page.goto(origin+'/brand/lythaus-v1/lythaus-wordmark-black.e450176663e0.svg');
  for(const theme of ['light','dark']){
   const file=theme==='light'?'lythaus-wordmark-black.e450176663e0.svg':'lythaus-wordmark-white.5ba0451347e2.svg';
   const url=origin+'/brand/lythaus-v1/'+file,asset=approved.web_copy_map.find(entry=>entry.public_url===new URL(url).pathname);
   assert.ok(asset);
   const response=await context.request.get(url);assert.equal(response.status(),200);
   assert.equal(createHash('sha256').update(await response.body()).digest('hex'),asset.sha256);
   for(const slotWidth of [32*470.28944891/130.6866688,133.8125])for(const change of ['none','blank','wrong-color','wrong-symbol','compressed']){
    await page.setContent(`<body style="margin:0;background:${theme==='light'?'#f0f5f8':'#11110f'}"><img style="position:absolute;left:29.3286px;top:16px;width:${slotWidth}px;height:32px;object-fit:contain" src="${url}"></body>`);
    const image=page.locator('img');await image.evaluate(image=>image.decode());
    const imageBox=await image.boundingBox(),rect=containedWordmarkRect(imageBox);
    await image.evaluate(async(image,{change,origin,theme})=>{
     if(change==='blank')image.style.opacity='0';
     if(change==='wrong-color')image.src=origin+'/brand/lythaus-v1/'+(theme==='light'?'lythaus-wordmark-white.5ba0451347e2.svg':'lythaus-wordmark-black.e450176663e0.svg');
     if(change==='wrong-symbol')image.src=origin+'/brand/lythaus-v1/lythaus-symbol-square-black.6a1b6d025e69.svg';
     if(change==='compressed'){image.style.transformOrigin='left';image.style.transform='scaleX(0.6)';}
     await image.decode();
    },{change,origin,theme});
    const png=PNG.sync.read(await page.screenshot({path:path.join(output,`${engine}-native-reference-${theme}-${slotWidth}-${change}.png`)}));
    const compare=()=>compareApprovedArtwork(page,png,rect,url,PNG,'image',imageBox);
    if(change==='none')results.push({theme,slotWidth,change,status:'passed',fidelity:await compare()});
    else{
     await assert.rejects(compare,/Artwork fidelity:/,`${change} must not certify approved artwork`);
     results.push({theme,slotWidth,change,status:'rejected-as-required'});
    }
   }
  }
  await writeFile(path.join(output,`${engine}-native-reference-controls.json`),JSON.stringify({engine,results},null,2)+'\n');
 }finally{await context.close();}
}
