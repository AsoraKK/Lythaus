import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {prepareVisibleOnboardingSource,onboardingImport,visibleImport,visibleInstall} from './onboarding-visible-source.mjs';
import {prepareBrandLoginSource} from './brand-login-source.mjs';

test('visible fixture preserves the original real login bootstrap and router',async()=>{
 const original=await readFile('lib/main.dart','utf8');
 const prepared=prepareVisibleOnboardingSource(original);
 assert.equal(prepared.replace('\n'+visibleImport,'').replace('\n'+onboardingImport,'').replace(visibleInstall,''),prepareBrandLoginSource(original));
 assert.doesNotMatch(prepared,/OnboardingLifecycleHost|onboarding_lifecycle_host/);
});
test('navigation helper has no added app, Navigator, provider override or frame stimulus',async()=>{
 for(const name of ['onboarding_visible_route.dart','onboarding_visible_probe.dart']){
  const source=await readFile('test/browser/'+name,'utf8');
  assert.doesNotMatch(source,/scheduleFrame|addPostFrameCallback|ensureSemantics|markNeedsPaint|setState|Timer\(|Future\.delayed|overrideWith|GoRoute\(|Navigator\(|MaterialApp\(|Offstage\(|ProviderScope\(/);
 }
 const route=await readFile('test/browser/onboarding_visible_route.dart','utf8');
 assert.match(route,/transitionDuration: Duration.zero/);assert.match(route,/requestFocus: false/);assert.match(route,/disableAnimations: true/);
 assert.match(route,/Synthetic continuation completed/);assert.match(route,/Navigator\.of\(context\)\.push/);
});
