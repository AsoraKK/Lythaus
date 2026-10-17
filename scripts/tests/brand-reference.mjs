import {artworkFidelity} from './brand-artwork-pixels.mjs';
import assert from 'node:assert/strict';

export async function compareApprovedArtwork(page, png, rect, url, PNG) {
  const x=Math.floor(rect.x), y=Math.floor(rect.y);
  const width=Math.ceil(rect.x+rect.width)-x, height=Math.ceil(rect.y+rect.height)-y;
  assert.ok(x>=0&&y>=0&&x+width<=png.width&&y+height<=png.height,
    `Artwork crop outside screenshot: ${JSON.stringify({rect,width,height,image:[png.width,png.height]})}`);
  const actual=new PNG({width,height});
  PNG.bitblt(png,actual,x,y,width,height,0,0);
  const frequencies=new Map();
  for(let i=0;i<actual.data.length;i+=4){const color=actual.data.readUInt32BE(i);frequencies.set(color,(frequencies.get(color)??0)+1);}
  const dominant=[...frequencies].sort((a,b)=>b[1]-a[1])[0][0];
  const background=[dominant>>>24,(dominant>>>16)&255,(dominant>>>8)&255];
  const referencePage=await page.context().newPage();
  try {
    await referencePage.setViewportSize({width:Math.max(320,width),height:Math.max(200,height)});
    await referencePage.setContent('<canvas id="reference"></canvas>');
    await referencePage.evaluate(async({url,width,height,rect,x,y,background})=>{
      const canvas=document.querySelector('canvas');canvas.width=width;canvas.height=height;
      document.body.style.cssText='margin:0';
      const ctx=canvas.getContext('2d');ctx.fillStyle=`rgb(${background.join(',')})`;ctx.fillRect(0,0,width,height);
      const image=new Image();image.crossOrigin='anonymous';image.src=url;await image.decode();
      ctx.drawImage(image,rect.x-x,rect.y-y,rect.width,rect.height);
    },{url,width,height,rect,x,y,background});
    const reference=PNG.sync.read(await referencePage.locator('canvas').screenshot());
    return artworkFidelity(actual,reference,background);
  } finally {await referencePage.close();await page.bringToFront();}
}
