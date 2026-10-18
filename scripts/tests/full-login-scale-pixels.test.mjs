import {test} from 'node:test';
import assert from 'node:assert/strict';
import {headingReferences,matchesScaleGeometry,scalePixels} from './full-login-scale-pixels.mjs';
test('wrong scale and blank geometry cannot count as the matched production scene',()=>{
 assert.ok(matchesScaleGeometry(headingReferences[1],1));
 assert.ok(matchesScaleGeometry(headingReferences[2],2));
 assert.ok(!matchesScaleGeometry(headingReferences[1],2));
 assert.ok(!matchesScaleGeometry(headingReferences[2],1));
 assert.ok(!matchesScaleGeometry([],1));
 const blank={width:320,height:960,data:Buffer.alloc(320*960*4,255)};
 const result=scalePixels(blank,1);
 assert.equal(result.surface.nonblank,false);assert.equal(result.form.nonblank,false);
 assert.equal(result.artwork,null);assert.equal(result.geometryMatches,false);
});
test('geometry checks reject translated or resized text outside one raster pixel',()=>{
 const shifted=structuredClone(headingReferences[2]);shifted[1].top+=4;
 assert.equal(matchesScaleGeometry(shifted,2),false);
 const resized=structuredClone(headingReferences[1]);resized[1].right+=8;
 assert.equal(matchesScaleGeometry(resized,1),false);
});
