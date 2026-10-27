import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import sharp from 'sharp';
import {artworkFidelity,containedWordmarkRect} from './brand-artwork-pixels.mjs';
import {assertRenderHealth,assertFlutterFixtureReady} from './brand-render-health.mjs';
import {brandPresentation,containedBrandRect,selectedIconAssets} from './brand-presentation-contract.mjs';
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
test('consumer shell uses square LH while auth and onboarding retain monochrome wordmarks',()=>{
  for(const theme of ['light','dark']){
    assert.deepEqual(brandPresentation('shell',theme),{kind:'symbol',file:'lythaus-symbol-square-warm.fb697a91817f.svg',foreground:'#F5F3EE'});
    for(const screen of ['login','onboarding'])assert.deepEqual(brandPresentation(screen,theme),{kind:'wordmark',file:'lythaus-wordmark-white.5ba0451347e2.svg',foreground:'#F5F3EE'});
    assert.equal(brandPresentation('admin',theme).foreground,null);
    assert.match(brandPresentation('admin',theme).file,theme==='dark'?/wordmark-white/:/wordmark-black/);
  }
  const box={x:10,y:20,width:36,height:36};
  assert.deepEqual(containedBrandRect(box,'symbol'),box);
  assert.deepEqual(containedBrandRect({x:0,y:0,width:48,height:48},'symbol',true),{x:12,y:12,width:24,height:24});
  assert.deepEqual(containedBrandRect({x:0,y:0,width:272,height:36},'symbol'),{x:118,y:0,width:36,height:36});
  assert.throws(()=>containedBrandRect(box,'wordmark',true));
  assert.throws(()=>brandPresentation('unknown','dark'));
});
test('a canonical wordmark cannot certify the shell LH symbol',async()=>{
  const render=async file=>{
    const source=readFileSync('assets/brand/lythaus-v1/'+file,'utf8').replace(/fill="#[0-9A-Fa-f]{6}"/g,'fill="#F5F3EE"');
    const {data,info}=await sharp(Buffer.from(source)).resize(36,36,{fit:'contain',background:'#242321'}).flatten({background:'#242321'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    return {data,width:info.width,height:info.height};
  };
  const symbol=await render(brandPresentation('shell','dark').file),wordmark=await render(brandPresentation('login','dark').file);
  artworkFidelity(symbol,symbol,[36,35,33]);
  assert.throws(()=>artworkFidelity(symbol,wordmark,[36,35,33]),/Artwork fidelity/);
  assert.throws(()=>artworkFidelity(wordmark,symbol,[36,35,33]),/Artwork fidelity/);
});
test('consumer icon selection uses derived hashes while admin keeps approved originals',()=>{
  const approved=JSON.parse(readFileSync('docs/brand/approved-v1/INTEGRATION-MANIFEST.json'));
  const derived=JSON.parse(readFileSync('docs/brand/four-colour/manifest.json'));
  assert.equal(selectedIconAssets('admin',approved,derived),approved.web_copy_map);
  for(const screen of ['login','onboarding','shell']){
    const selected=selectedIconAssets(screen,approved,derived);
    assert.equal(selected.length,8);
    for(const asset of selected){
      assert.ok(asset.public_url.startsWith('/icons/lythaus-four-colour/'));
      assert.equal(asset.sha256,derived.entries.find(entry=>entry.path==='web'+asset.public_url).sha256);
      assert.equal(approved.web_copy_map.some(original=>original.public_url===asset.public_url),false);
    }
  }
});
for(const [name,draw] of [['blank',()=>false],['button border',(x,y)=>x<2||y<2||x>37||y>37],['wrong icon',(x,y)=>Math.abs(x-y)<3],['solid fill',()=>true]])
  test(name+' cannot certify artwork',()=>assert.throws(()=>artworkFidelity(png(draw),reference,[255,255,255])));
test('network and context failures fail health assertions',()=>{
  const good={crashes:0,errors:[],failed:[],responses:[{status:200}],page:{events:[],frames:10,readyState:'complete'}};
  assertRenderHealth(good);
  for(const bad of [{responses:[{status:404}]},{failed:[{error:'reset'}]},{crashes:1},{page:{...good.page,events:[{name:'webglcontextlost'}]}},{page:{...good.page,frames:0}}])assert.throws(()=>assertRenderHealth({...good,...bad}));
});
test('browser heartbeat or PNG download alone cannot certify Flutter/image readiness',()=>{
  const ready={frames:1,paints:{rectangle:1,text:1},image:{decoded:true,frameReady:true}};
  assertFlutterFixtureReady(ready);
  for(const state of [{frames:10}, {...ready,image:{decoded:true}}, {...ready,image:{frameReady:true}},
    {...ready,image:{...ready.image,error:'decode failed'}}, {...ready,frames:0}])
    assert.throws(()=>assertFlutterFixtureReady(state));
  assertFlutterFixtureReady({...ready,image:{}},false);
});
