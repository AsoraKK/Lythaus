import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {observeFullLoginBrand,artworkCall,neutralCall} from './full-login-source.mjs';
test('full-login control changes only the artwork draw call',async()=>{
 const source=await readFile('lib/design_system/widgets/lyth_brand.dart','utf8');
 const direct=observeFullLoginBrand(source),neutral=observeFullLoginBrand(source,true);
 assert.equal(neutral.replace(neutralCall,artworkCall),direct);
 for(const contract of ['applyBoxFit(BoxFit.contain, bounds.size, size)','Semantics(','height: height','width: height * aspectRatio','canvas.save();','canvas.restore();']){
  assert.ok(direct.includes(contract));assert.ok(neutral.includes(contract));
 }
 assert.ok(!source.includes('_fullLoginProbeEvent'),'Production source stays uninstrumented');
});
test('source drift or ambiguous draw call stops fixture preparation',()=>{
 assert.throws(()=>observeFullLoginBrand('unrecognized source'));
 assert.throws(()=>observeFullLoginBrand(artworkCall+artworkCall));
});
