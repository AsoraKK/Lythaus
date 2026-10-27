import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';

const approved={
  symbol:['lythaus-symbol-white.8e20f9650ccb.svg','8e20f9650ccb88053ff757e2b18cbd2b618e5a0e922bc61288c27e09ab3c6436'],
  wordmark:['lythaus-wordmark-white.5ba0451347e2.svg','5ba0451347e24615f10bfc362b84285767f51eea3621cc702f64e93ff0047ff7'],
};

export async function approvedStaticSource(kind){
  assert.ok(Object.hasOwn(approved,kind));
  const [file,expected]=approved[kind];
  const bytes=await readFile(new URL('../../../assets/brand/lythaus-v1/'+file,import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),expected);
  return bytes.toString();
}

export async function staticBrandReference(page,kind,bounds,clip){
  const source=await approvedStaticSource(kind),reference=await page.context().newPage();
  try{
    await reference.setViewportSize({width:Math.max(320,clip.width),height:Math.max(200,clip.height)});
    await reference.setContent(`<style>
      body{margin:0;background:#242321}
      svg{display:block;position:absolute;left:${bounds.x-clip.x}px;top:${bounds.y-clip.y}px;width:${bounds.width}px;height:${bounds.height}px}
      svg,svg *{fill:#F5F3EE}
    </style>${source}`);
    return await reference.screenshot({clip:{x:0,y:0,width:clip.width,height:clip.height}});
  }finally{await reference.close();await page.bringToFront();}
}
