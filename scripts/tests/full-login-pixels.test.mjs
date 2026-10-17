import {test} from 'node:test';
import assert from 'node:assert/strict';
import {regionPixels} from './full-login-pixels.mjs';
test('DOM overlay elsewhere cannot certify a white Flutter control',()=>{
 const png={width:20,height:20,data:Buffer.alloc(20*20*4,255)};
 for(let i=0;i<20*4;i++)png.data[i]=0;
 assert.equal(regionPixels(png,{x:0,y:5,width:20,height:10}).nonblank,false);
});
test('neutral control requires both expected colors, not any solid fill',()=>{
 const png={width:20,height:20,data:Buffer.alloc(20*20*4,255)};
 const rect={x:0,y:0,width:20,height:20};
 assert.equal(regionPixels(png,rect).neutralFill,false);
 for(let i=0;i<png.data.length;i+=4)for(let c=0;c<3;c++)png.data[i+c]=128;
 assert.equal(regionPixels(png,rect).neutralFill,false);
 for(let y=0;y<20;y++)for(let x=10;x<20;x++)for(let c=0;c<3;c++)png.data[(y*20+x)*4+c]=192;
 assert.equal(regionPixels(png,rect).neutralFill,true);
 assert.equal(regionPixels(png,rect).nonblank,false);
});
