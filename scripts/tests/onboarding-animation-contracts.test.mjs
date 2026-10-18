import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {prepareAnimationSource,prepareAnimationObserver} from './onboarding-animation-source.mjs';
import {prepareStaticOnboarding} from './onboarding-lifecycle-source.mjs';

test('static controls differ by exactly one animation-policy literal',async()=>{
 const original=await readFile('test/browser/approved_brand_entry.dart','utf8');
 const disabled=prepareAnimationSource(original,true),enabled=prepareAnimationSource(original,false);
 assert.equal(disabled,prepareStaticOnboarding(original));
 assert.equal(enabled.replace('disableAnimations: false,','disableAnimations: true,'),disabled);
 assert.doesNotMatch(enabled,/OnboardingLifecycleHost/);
});
test('missing or ambiguous animation policy is rejected',()=>{
 assert.throws(()=>prepareAnimationSource('void main() {}',false));
 assert.throws(()=>prepareAnimationSource('disableAnimations: true, disableAnimations: true,',false));
});
test('observer changes only names, condition count, policy assertion and limitations',async()=>{
 const original=await readFile('scripts/tests/onboarding-lifecycle.browser.mjs','utf8');
 const observed=prepareAnimationObserver(original);
 assert.match(observed,/assert\.equal\(results.length,2\)/);
 assert.match(observed,/disableAnimations,kind==='animations-disabled'/);
 for(const fragment of ["for(const dwell of [250,5250])","null,{polling:50}","semanticsCount,0","compareApprovedArtwork(page,png,snapshot.artwork","snapshots:result.snapshots.map"]){assert.ok(observed.includes(fragment));}
 assert.throws(()=>prepareAnimationObserver(original.replace("'build/onboarding-lifecycle'","'unexpected-output'")));
});
