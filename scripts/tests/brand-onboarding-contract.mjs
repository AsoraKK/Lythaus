import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {containedWordmarkRect} from './brand-artwork-pixels.mjs';
import {regionPixels} from './full-login-pixels.mjs';
import {refreshUrl,loginFixtureResponse} from './brand-login-transport.mjs';

export const originalCaptureEvents=['pointerdown','pointerup','mousedown','mouseup','touchstart','touchend','keydown','keyup','beforeinput','input','change','wheel','scroll','resize','focusin'];
export const onboardingCopy=['Welcome to Lythaus','The authentic social network. Curated feeds, credible voices, and calm interactions.','Before you post','Choose Human-authored or AI-assisted before posting.','AI-generated public content cannot be posted.','AI-assisted public text is limited to 249 user-perceived characters.','Disclosure conflicts may enter Under review.','Appeal outcomes are recorded by Lythaus.','This is an invite-only Alpha.','Continue'];
export async function waitForOriginalDwell(page,anchor,dwell){
 assert.ok(Number.isFinite(anchor)&&Number.isFinite(dwell)&&anchor>=0&&dwell>=0);
 await page.waitForFunction(({anchor,dwell})=>performance.now()-anchor>=dwell,{anchor,dwell},{polling:10});
}
export function assertSignedOutHost(host,navigatorId){
 assert.equal(host.materialApps,1);assert.equal(host.navigators,1);
 assert.equal(host.auth,'signed-out');assert.equal(host.guest,false,'Guest must remain false throughout component acceptance');
 assert.equal(host.pendingAuthenticatedWork,false);assert.equal(host.focusedEditable,false);
 if(navigatorId!==undefined)assert.equal(host.navigatorId,navigatorId);
}
export function signedOutLoginHostReady(){
 const host=JSON.parse(window.__readVisibleHostState());
 for(const [key,expected] of Object.entries({materialApps:1,navigators:1,visibleLogin:1,visibleOnboarding:0,visibleMarker:0,guest:false,focusedEditable:false,semanticsEnabled:false,presented:false})){
  if(host[key]!==expected)throw new Error(`Login readiness failed: ${key}=${host[key]}`);
 }
 if(host.auth!=='loading'&&host.auth!=='signed-out')throw new Error(`Login readiness failed: auth=${host.auth}`);
 if(typeof host.pendingAuthenticatedWork!=='boolean')throw new Error(`Login readiness failed: pendingAuthenticatedWork=${host.pendingAuthenticatedWork}`);
 return host.auth==='signed-out'&&host.pendingAuthenticatedWork===false;
}
export async function waitForSignedOutLoginHost(page){
 await page.waitForFunction(signedOutLoginHostReady,null,{polling:50,timeout:5000});
}
export function signedOutOnboardingHostReady(navigatorId){
 const host=JSON.parse(window.__readVisibleHostState());
 if(host.materialApps!==1)throw new Error(`Onboarding readiness failed: materialApps=${host.materialApps}`);
 if(host.navigators!==1)throw new Error(`Onboarding readiness failed: navigators=${host.navigators}`);
 if(host.guest!==false)throw new Error(`Onboarding readiness failed: guest=${host.guest}`);
 if(host.pendingAuthenticatedWork!==false)throw new Error(`Onboarding readiness failed: pendingAuthenticatedWork=${host.pendingAuthenticatedWork}`);
 if(host.focusedEditable!==false)throw new Error(`Onboarding readiness failed: focusedEditable=${host.focusedEditable}`);
 if(host.navigatorId!==navigatorId)throw new Error(`Onboarding readiness failed: navigatorId=${host.navigatorId}`);
 if(host.componentRouteCurrent!==true)throw new Error(`Onboarding readiness failed: componentRouteCurrent=${host.componentRouteCurrent}`);
 if(host.componentRouteName!=='diagnostic-onboarding-component')throw new Error(`Onboarding readiness failed: componentRouteName=${host.componentRouteName}`);
 if(host.auth==='signed-out')return true;
 if(host.auth==='loading')return false;
 throw new Error(`Onboarding readiness failed: auth=${host.auth}`);
}
export async function waitForSignedOutOnboardingHost(page,navigatorId){
 await page.waitForFunction(signedOutOnboardingHostReady,navigatorId,{polling:50,timeout:5000});
}
export function originalCaptureTiming(anchor,captureStartedAt,captureFinishedAt){
 assert.ok(Number.isFinite(anchor)&&Number.isFinite(captureStartedAt)&&Number.isFinite(captureFinishedAt));
 assert.ok(captureStartedAt>=anchor);assert.ok(captureFinishedAt>=captureStartedAt);
 return {actualDwellMs:captureStartedAt-anchor,captureStartedAt,captureFinishedAt};
}
export function assertUntouchedPresentation(state,presentationAt){
 assert.equal(state.semanticsCount,0);assert.equal(state.layout.semanticsEnabled,false);assert.equal(state.host.semanticsEnabled,false);
 assert.equal(state.activeInput,false);assert.deepEqual(state.scroll,[0,0]);
 assert.deepEqual(state.observation.events.filter(event=>event.at>=presentationAt&&originalCaptureEvents.includes(event.type)),[],
  'No focusin, resize, input or scroll between presentation and original captures');
}
export function assertOnboardingLayout(layout,{scale,theme,width},reference){
 assert.equal(layout.visibleAuthChoices,0);assert.equal(layout.screens.length,1);
 const screen=layout.screens[0];assert.equal(screen.scale,scale);assert.equal(screen.theme,theme);assert.equal(screen.disableAnimations,true);
 assert.equal(screen.bounds.width,width);assert.equal(screen.bounds.height,960);assert.equal(screen.brands.length,1);
 for(const text of onboardingCopy)assert.ok(screen.texts[text],text);
 for(const rect of [screen.bounds,...screen.brands,...Object.values(screen.texts)])assert.ok(Object.values(rect).every(Number.isFinite)&&rect.width>0&&rect.height>0,'Finite nonempty fractional geometry');
 if(reference)assert.deepEqual(screen,reference,'Component geometry exactly matches the original static reference');
 return screen;
}
export function onboardingPixels(png,screen){
 const artwork=containedWordmarkRect(screen.brands[0]);
 return {artwork,pixels:{surface:regionPixels(png,{x:0,y:0,width:png.width,height:900}),brand:regionPixels(png,artwork),heading:regionPixels(png,screen.texts['Welcome to Lythaus']),policyHeading:regionPixels(png,screen.texts['Before you post'])}};
}
export function assertOnboardingPaint(snapshot){
 for(const [region,pixels] of Object.entries(snapshot.pixels))assert.ok(pixels.nonblank,`${region} did not paint in original onboarding PNG`);
}
export function assertCompletedRefresh(requests,health,presentationEpochMs=Infinity){
 const post=requests.filter(r=>r.method==='POST');assert.equal(post.length,1,'Exactly one real signed-out refresh');
 const request=post[0];assert.equal(request.url,refreshUrl);assert.equal(request.status,401);
 for(const key of ['requestEpochMs','fulfillStartEpochMs','fulfillCompleteEpochMs','finishedEpochMs'])assert.ok(Number.isFinite(request[key])&&request[key]<presentationEpochMs,`${key} must complete before presentation`);
 const expected=createHash('sha256').update(JSON.stringify(loginFixtureResponse(refreshUrl,'POST').body)).digest('hex');
 assert.equal(request.expectedBodySha256,expected);
 const responses=health.responses.filter(r=>r.url===refreshUrl&&r.status===401);assert.equal(responses.length,1);assert.equal(responses[0].sha256,expected);
 return {request:structuredClone(request),response:structuredClone(responses[0])};
}
