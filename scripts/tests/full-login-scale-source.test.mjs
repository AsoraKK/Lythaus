import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {originalRunApp,wrappedRunApp,wrapProductionTextScale} from './full-login-scale-source.mjs';
test('scale twin keeps the entire production bootstrap and router outside its root wrapper',async()=>{
 const source=await readFile('lib/main.dart','utf8'),wrapped=wrapProductionTextScale(source);
 assert.equal(wrapped.replace(wrappedRunApp,originalRunApp),source);
 assert.ok(wrapped.includes('await crashReporting.initialize();'));
 assert.ok(wrapped.includes('MaterialApp.router('));
 assert.ok(!source.includes('DIAGNOSTIC_TEXT_SCALE'));
 assert.doesNotMatch(wrappedRunApp,/scheduleFrame|postFrame|ensureSemantics|markNeedsPaint|authState/);
});
test('unknown or ambiguous production root cannot silently build a different fixture',()=>{
 assert.throws(()=>wrapProductionTextScale('unknown root'));
 assert.throws(()=>wrapProductionTextScale(originalRunApp+originalRunApp));
});
