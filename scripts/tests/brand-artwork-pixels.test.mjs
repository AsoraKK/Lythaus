import {test} from 'node:test';
import assert from 'node:assert/strict';
import {artworkFidelity} from './brand-artwork-pixels.mjs';
import {assertRenderHealth} from './brand-render-health.mjs';
const png=draw=>{const data=Buffer.alloc(40*40*4,255);for(let y=0;y<40;y++)for(let x=0;x<40;x++)if(draw(x,y))for(let c=0;c<3;c++)data[(y*40+x)*4+c]=0;return {width:40,height:40,data};};
const reference=png((x,y)=>(x>=8&&x<13&&y>=8&&y<32)||(y>=27&&y<32&&x>=8&&x<31));
test('identical artwork passes',()=>artworkFidelity(reference,reference,[255,255,255]));
for(const [name,draw] of [['blank',()=>false],['button border',(x,y)=>x<2||y<2||x>37||y>37],['wrong icon',(x,y)=>Math.abs(x-y)<3],['solid fill',()=>true]])
  test(name+' cannot certify artwork',()=>assert.throws(()=>artworkFidelity(png(draw),reference,[255,255,255])));
test('network and context failures fail health assertions',()=>{
  const good={crashes:0,errors:[],failed:[],responses:[{status:200}],page:{events:[],frames:10,readyState:'complete'}};
  assertRenderHealth(good);
  for(const bad of [{responses:[{status:404}]},{failed:[{error:'reset'}]},{crashes:1},{page:{...good.page,events:[{name:'webglcontextlost'}]}},{page:{...good.page,frames:0}}])assert.throws(()=>assertRenderHealth({...good,...bad}));
});
