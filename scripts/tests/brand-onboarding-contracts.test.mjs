import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {prepareVisibleOnboardingSource,prepareOnboardingReference,onboardingImport,visibleImport,visibleInstall,referenceInstall} from './onboarding-visible-source.mjs';
import {prepareBrandLoginSource} from './brand-login-source.mjs';
import {originalCaptureEvents,onboardingCopy,waitForOriginalDwell,waitForSignedOutOnboardingHost,signedOutOnboardingHostReady,assertSignedOutHost,assertUntouchedPresentation,assertOnboardingLayout,onboardingPixels,assertOnboardingPaint,assertCompletedRefresh} from './brand-onboarding-contract.mjs';
import {refreshUrl,loginFixtureResponse} from './brand-login-transport.mjs';

test('detached component source preserves deployed main, router and login preparation',async()=>{
 const original=await readFile('lib/main.dart','utf8'),prepared=prepareVisibleOnboardingSource(original);
 assert.equal(prepared.replace('\n'+visibleImport,'').replace('\n'+onboardingImport,'').replace(visibleInstall,''),prepareBrandLoginSource(original));
 assert.doesNotMatch(original,/onboarding_visible|__presentOnboardingComponent/);
 const reference=await readFile('test/browser/approved_brand_entry.dart','utf8');
 assert.equal(prepareOnboardingReference(reference).replace('\n'+onboardingImport,'').replace(referenceInstall,''),reference);
});
test('component helpers introduce no app, Navigator, override, frame or focus stimulus',async()=>{
 for(const name of ['onboarding_visible_route.dart','onboarding_visible_probe.dart','onboarding_visible_geometry.dart']){
  const source=await readFile('test/browser/'+name,'utf8');
  assert.doesNotMatch(source,/scheduleFrame|addPostFrameCallback|ensureSemantics|markNeedsPaint|setState|Timer\(|Future\.delayed|overrideWith|GoRoute\(|Navigator\(|MaterialApp\(|Offstage\(|ProviderScope\(|dependOnInheritedWidgetOfExactType|requestFocus\(/);
 }
 const route=await readFile('test/browser/onboarding_visible_route.dart','utf8');
 assert.match(route,/transitionDuration: Duration.zero/);assert.match(route,/reverseTransitionDuration: Duration.zero/);assert.match(route,/requestFocus: false/);assert.match(route,/disableAnimations: true/);
 assert.match(route,/OnboardingIntroScreen/);assert.match(route,/Synthetic continuation completed/);assert.match(route,/Navigator\.of\(context\)\.push/);
});
const host=()=>({materialApps:1,navigators:1,navigatorId:7,auth:'signed-out',guest:false,pendingAuthenticatedWork:false,focusedEditable:false,semanticsEnabled:false});
test('a wakeup 0.1ms before the deadline cannot release an original capture',async()=>{
 for(const dwell of [250,5250]){
  const anchor=927.6000000000931,decisions=[];
  const page={waitForFunction:async(predicate,timing,options)=>{
   assert.deepEqual(timing,{anchor,dwell});assert.equal(options.polling,10);
   for(const now of [anchor+dwell-0.1,anchor+dwell+0.1]){
    const read=runInNewContext('('+predicate.toString()+')',{performance:{now:()=>now}});decisions.push(read(timing));
   }
   const exact=runInNewContext('('+predicate.toString()+')',{performance:{now:()=>dwell}});assert.equal(exact({anchor:0,dwell}),true);
  }};
  await waitForOriginalDwell(page,anchor,dwell);assert.deepEqual(decisions,[false,true]);
 }
 await assert.rejects(waitForOriginalDwell({},NaN,250));
});
test('guest, auth, app count, Navigator identity and pending work fail closed',()=>{
 assertSignedOutHost(host(),7);
 for(const [key,value] of Object.entries({materialApps:2,navigators:2,navigatorId:8,auth:'loading',guest:true,pendingAuthenticatedWork:true,focusedEditable:true}))assert.throws(()=>assertSignedOutHost({...host(),[key]:value},7));
});
test('onboarding capture readiness waits for the exact settled signed-out host',async()=>{
 const settled={...host(),componentRouteCurrent:true,componentRouteName:'diagnostic-onboarding-component'};
 const states=[
  {...settled,auth:'loading'},
  {...settled,guest:true},
  {...settled,pendingAuthenticatedWork:true},
  {...settled,focusedEditable:true},
  {...settled,navigatorId:8},
  {...settled,componentRouteCurrent:false},
  {...settled,componentRouteName:'other-route'},
  settled,
 ];
 const page={waitForFunction:async(predicate,navigatorId,options)=>{
  assert.equal(predicate.toString(),signedOutOnboardingHostReady.toString());
  assert.equal(navigatorId,7);assert.deepEqual(options,{polling:50,timeout:5000});
  const decisions=states.map(state=>runInNewContext('('+predicate.toString()+')(navigatorId)',{
   navigatorId,window:{__readVisibleHostState:()=>JSON.stringify(state)},
  }));
  assert.deepEqual(decisions,[false,false,false,false,false,false,false,true]);
 }};
 await waitForSignedOutOnboardingHost(page,7);
});
test('focusin and resize join input and scroll rejection through both original captures',()=>{
 const state={semanticsCount:0,layout:{semanticsEnabled:false},host:host(),activeInput:false,scroll:[0,0],observation:{events:[{type:'focusin',at:99}]}};
 assertUntouchedPresentation(state,100);
 for(const type of originalCaptureEvents)for(const at of [100,350,5350])assert.throws(()=>assertUntouchedPresentation({...state,observation:{events:[{type,at}]}},100),/No focusin, resize, input or scroll/);
 assert.throws(()=>assertUntouchedPresentation({...state,semanticsCount:1},100));
 assert.throws(()=>assertUntouchedPresentation({...state,scroll:[0,1]},100));
 assert.throws(()=>assertUntouchedPresentation({...state,activeInput:true},100));
});
function layout(condition){
 const brand={x:20.25,y:24.5,width:116.5,height:30};
 return {visibleAuthChoices:0,screens:[{bounds:{x:0,y:0,width:condition.width,height:960},brands:[brand],texts:Object.fromEntries(onboardingCopy.map((text,i)=>[text,{x:20.25,y:100+i*50,width:250,height:40}])),scale:condition.scale,theme:condition.theme,disableAnimations:true}]};
}
test('all six conditions preserve exact fractional geometry, copy and animation policy',()=>{
 for(const theme of ['light','dark'])for(const width of [320,390,1440]){
  const condition={theme,width,scale:width===320?2:1},original=layout(condition),screen=original.screens[0];
  assertOnboardingLayout(original,condition,structuredClone(screen));
  for(const [key,value] of Object.entries({theme:theme==='light'?'dark':'light',scale:3,disableAnimations:false}))assert.throws(()=>assertOnboardingLayout({...original,screens:[{...screen,[key]:value}]},condition,screen));
  const shifted=structuredClone(original);shifted.screens[0].brands[0].x+=0.001;
  assert.throws(()=>assertOnboardingLayout(shifted,condition,screen),/geometry exactly/);
  const missing=structuredClone(original);delete missing.screens[0].texts[onboardingCopy[3]];assert.throws(()=>assertOnboardingLayout(missing,condition,screen));
 }
});
test('blank original onboarding pixels fail closed independently of later captures',()=>{
 const png={width:320,height:960,data:Buffer.alloc(320*960*4,255)},screen=layout({width:320,scale:2,theme:'light'}).screens[0];
 const blank=onboardingPixels(png,screen);assert.throws(()=>assertOnboardingPaint(blank),/did not paint/);
 const painted={pixels:Object.fromEntries(Object.keys(blank.pixels).map(key=>[key,{nonblank:true}]))};assertOnboardingPaint(painted);
 for(const key of Object.keys(blank.pixels))assert.throws(()=>assertOnboardingPaint({pixels:{...painted.pixels,[key]:blank.pixels[key]}}),/did not paint/);
 assert.throws(()=>assertOnboardingPaint(blank),/did not paint/);
});
test('refresh must finish with exact body before a single presentation',()=>{
 const sha=createHash('sha256').update(JSON.stringify(loginFixtureResponse(refreshUrl,'POST').body)).digest('hex');
 const request={url:refreshUrl,method:'POST',status:401,requestEpochMs:1,fulfillStartEpochMs:2,fulfillCompleteEpochMs:3,finishedEpochMs:4,expectedBodySha256:sha};
 const health={responses:[{url:refreshUrl,status:401,sha256:sha}]};assertCompletedRefresh([request],health,5);
 for(const key of ['requestEpochMs','fulfillStartEpochMs','fulfillCompleteEpochMs','finishedEpochMs'])for(const value of [undefined,5,6])assert.throws(()=>assertCompletedRefresh([{...request,[key]:value}],health,5));
 for(const changed of [{url:refreshUrl+'?wrong=1'},{status:200},{expectedBodySha256:'wrong'}])assert.throws(()=>assertCompletedRefresh([{...request,...changed}],health,5));
 assert.throws(()=>assertCompletedRefresh([request,request],health,5));assert.throws(()=>assertCompletedRefresh([request],{responses:[{...health.responses[0],sha256:'wrong'}]},5));
});
