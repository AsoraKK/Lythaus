import assert from 'node:assert/strict';
import {prepareStaticOnboarding} from './onboarding-lifecycle-source.mjs';

export function prepareAnimationSource(original,disabled){
 assert.equal(typeof disabled,'boolean');
 const prepared=prepareStaticOnboarding(original);
 assert.equal(prepared.split('disableAnimations: true,').length,2,'Exactly one existing animation-policy setting');
 return disabled?prepared:prepared.replace('disableAnimations: true,','disableAnimations: false,');
}

export function prepareAnimationObserver(original){
 let source=original;
 const replace=(from,to)=>{assert.equal(source.split(from).length,2,`Unique observer adaptation: ${from}`);source=source.replace(from,to);};
 replace("'build/onboarding-lifecycle'","'build/onboarding-animation'");
 replace("['static-original','static-configured','static-host','production-host']","['animations-disabled','animations-enabled']");
 replace("[{theme:'light',width:320,scale:2},{theme:'light',width:390,scale:1},{theme:'light',width:1440,scale:1},{theme:'dark',width:320,scale:2}]","[{theme:'light',width:320,scale:2}]");
 replace("assets(resources['static-original-1'])","assets(resources['animations-disabled-1'])");
 replace('assert.equal(state.layout.screens[0].scale,scale);',"assert.equal(state.layout.screens[0].scale,scale);assert.equal(state.layout.screens[0].disableAnimations,kind==='animations-disabled');");
 replace('assert.equal(results.length,16);assert.equal(new Set(results.map(r=>r.name)).size,16);','assert.equal(results.length,2);assert.equal(new Set(results.map(r=>r.name)).size,2);');
 replace("limitations:'Diagnostic collection only. All four controls share a read-only layout getter; compiled bytes differ from the unchanged acceptance fixture. Original/configured isolates public build defines; configured/static-host isolates the visible wrapper; static-host/production-host changes the bootstrap, real router/provider lifecycle, offstage child and existing font configuration together. A painted production host is not a production onboarding route and does not identify the individual cause. No acceptance result is replaced.',","limitations:'Diagnostic only. Identical static-configured fixture, build flags and observer; only MediaQuery.disableAnimations changes. No hidden app or application API traffic. One light320/2x observation per policy, disabled then enabled, in each engine. The common read-only geometry getter changes compiled bytes versus acceptance. Results do not replace the unchanged required gate.',");
 return source;
}
