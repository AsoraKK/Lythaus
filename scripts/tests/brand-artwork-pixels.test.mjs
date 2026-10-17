import {test} from 'node:test';
import assert from 'node:assert/strict';
import {artworkFidelity,containedWordmarkRect} from './brand-artwork-pixels.mjs';
import {assertRenderHealth} from './brand-render-health.mjs';
const png=draw=>{const data=Buffer.alloc(40*40*4,255);for(let y=0;y<40;y++)for(let x=0;x<40;x++)if(draw(x,y))for(let c=0;c<3;c++)data[(y*40+x)*4+c]=0;return {width:40,height:40,data};};
const reference=png((x,y)=>(x>=8&&x<13&&y>=8&&y<32)||(y>=27&&y<32&&x>=8&&x<31));
test('identical artwork passes',()=>artworkFidelity(reference,reference,[255,255,255]));
test('stretched 272x40 login box preserves centered wordmark pixels',()=>{
  const rect=containedWordmarkRect({x:0,y:0,width:272,height:40});
  assert.ok(rect.width>143.9&&rect.width<144);
  assert.equal(rect.height,40);
  assert.equal(rect.x+rect.width/2,136);
  const x=Math.floor(rect.x),width=Math.ceil(rect.x+rect.width)-x;
  const expected={width,height:40,data:Buffer.alloc(width*40*4,255)};
  const container=Buffer.alloc(272*40*4,255);
  for(let y=6;y<34;y++)for(let col=6;col<width-6;col++)if(col%17<5||y>28){
    for(let c=0;c<3;c++){
      expected.data[(y*width+col)*4+c]=0;
      container[(y*272+x+col)*4+c]=0;
    }
  }
  const actual={width,height:40,data:Buffer.alloc(width*40*4)};
  for(let y=0;y<40;y++)container.copy(actual.data,y*width*4,(y*272+x)*4,(y*272+x+width)*4);
  artworkFidelity(actual,expected,[255,255,255]);
});
test('width-limited container centers wordmark vertically',()=>{
  const rect=containedWordmarkRect({x:10,y:20,width:100,height:100});
  assert.equal(rect.width,100);
  assert.equal(rect.x,10);
  assert.ok(rect.height>27&&rect.height<28);
  assert.equal(rect.y+rect.height/2,70);
});
for(const [name,draw] of [['blank',()=>false],['button border',(x,y)=>x<2||y<2||x>37||y>37],['wrong icon',(x,y)=>Math.abs(x-y)<3],['solid fill',()=>true]])
  test(name+' cannot certify artwork',()=>assert.throws(()=>artworkFidelity(png(draw),reference,[255,255,255])));
test('network and context failures fail health assertions',()=>{
  const good={crashes:0,errors:[],failed:[],responses:[{status:200}],page:{events:[],frames:10,readyState:'complete'}};
  assertRenderHealth(good);
  for(const bad of [{responses:[{status:404}]},{failed:[{error:'reset'}]},{crashes:1},{page:{...good.page,events:[{name:'webglcontextlost'}]}},{page:{...good.page,frames:0}}])assert.throws(()=>assertRenderHealth({...good,...bad}));
});
