import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {prepareStaticOnboarding,prepareProductionOnboarding,staticGeometryImport,productionGeometryImport,hostImport,hostBuilder,install} from './onboarding-lifecycle-source.mjs';
import {wrappedRunApp,originalRunApp} from './full-login-scale-source.mjs';
test('static comparison preserves the original fixture outside documented observation/presentation',async()=>{
 const source=await readFile('test/browser/approved_brand_entry.dart','utf8');
 for(const hosted of [false,true]){
  const prepared=prepareStaticOnboarding(source,hosted);
  assert.equal(prepared.replace('\n'+hostImport,'').replace('\n'+staticGeometryImport,'').replace(install,'')
   .replace('          child: OnboardingLifecycleHost(child: child!),','          child: child!,'),source);
 }
});
test('production host retains original bootstrap/router/provider lifecycle exactly',async()=>{
 const source=await readFile('lib/main.dart','utf8');
 const prepared=prepareProductionOnboarding(source);
 assert.equal(prepared.replace('\n'+hostImport,'').replace('\n'+productionGeometryImport,'').replace(install,'')
  .replace(hostBuilder,'').replace(wrappedRunApp,originalRunApp),source);
});
test('diagnostic helpers have no frame, repaint, auth-transition or semantics activation hooks',async()=>{
 for(const file of ['onboarding_lifecycle_host.dart','onboarding_lifecycle_geometry.dart']){
  const source=await readFile('test/browser/'+file,'utf8');
  assert.doesNotMatch(source,/scheduleFrame|addPostFrameCallback|ensureSemantics|markNeedsPaint|setState|Timer\(|Future\.delayed|authStateProvider|GoRoute\(/);
 }
 const host=await readFile('test/browser/onboarding_lifecycle_host.dart','utf8');
 assert.match(host,/Offstage\(child: child\)/);assert.match(host,/OnboardingIntroScreen\(/);
 assert.match(host,/Synthetic continuation completed/);assert.match(host,/Navigator\.of\(context\)\.push/);
});
