import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { chromium, webkit } from 'playwright';
import { localAuthBrowserServer } from './local-auth-browser-server.mjs';
import { installFlutterEngineFonts } from './flutter-engine-font-fixture.mjs';
import { classifyExpectedProtectedReturnDiscoverCancellation, createAuthRequestLifecycle } from './auth-request-lifecycle.mjs';
import './auth-request-lifecycle.test.mjs';
import { freshOwnerReadFence } from './fresh-owner-read.mjs';
import './fresh-owner-read.test.mjs';

const build=path.resolve(process.env.AUTH_WEB_ARTIFACT_DIR??'build/web');
assert.match(await readFile(path.join(build,'flutter_bootstrap.js'),'utf8'), /"useLocalCanvasKit":true/,
  'The canonical release must bundle its renderer; browser acceptance must not depend on an external CDN');
const mime={'.html':'text/html','.css':'text/css','.js':'application/javascript','.json':'application/json','.wasm':'application/wasm','.ttf':'font/ttf','.otf':'font/otf','.png':'image/png'};
const user={id:'018f0000-0000-7000-8000-000000000001',email:'synthetic@example.invalid',role:'user',tier:'bronze',subscription_tier:'free',reputation_score:0,created_at:'2026-08-01T00:00:00Z',last_login_at:'2026-08-01T00:00:00Z'};
const scenarios=Object.entries({chromium,webkit}).flatMap(([name,engine])=>[1440,390].map(width=>({name,engine,width,ownerResponseDelayMs:0})));
scenarios.push({name:'webkit',engine:webkit,width:390,ownerResponseDelayMs:2000});
for(const {name,engine,width,ownerResponseDelayMs} of scenarios) {
  test(`${name} ${width}: actual Flutter release login, recovery navigation, cookie restore and logout${ownerResponseDelayMs?' [controlled pending owner response]':''}`,{timeout:120000},async t=>{
    const lifecycle=createAuthRequestLifecycle({ownerId:user.id});
    const errors=[],pageErrors=[],calls=[],failedRequests=[];let session=false,verificationRequired=false,userinfoUnavailable=false,complete=false;
    let refreshInFlight=0,maximumRefreshInFlight=0,signOutTransitionOpen=false;
    let delayNextOwnerResponse=false;
    const recordPageError=(target,error)=>{
      const detail={pageErrorIndex:pageErrors.length,name:error.name,message:error.message,
        stack:error.stack?.slice(0,3000),pageId:lifecycle.identifyPage(target),path:new URL(target.url()).pathname};
      errors.push(error.message);pageErrors.push(detail);lifecycle.record('uncaught_page_error',detail);
    };
    const fixture=await localAuthBrowserServer(async route=>{
      const req=route.request(),url=new URL(req.url());
      const requestHeaders=await req.allHeaders();
      if(url.hostname==='app.lythaus.co') {
        let file=path.resolve(build,'.'+url.pathname);
        assert.ok(file===build||file.startsWith(build+path.sep));
        if(!path.extname(file))file=path.join(build,'index.html');
        try{return await route.fulfill({contentType:mime[path.extname(file)]??'application/octet-stream',body:await readFile(file)});}
        catch{return route.fulfill({status:404,body:'Local artifact missing'});}
      }
      if(url.hostname==='lythaus.co')return route.fulfill({contentType:'text/html',body:`<title>Local recovery navigation</title><main>${url.pathname}</main>`});
      if(url.hostname!=='api.lythaus.co')return route.abort();
      lifecycle.server(req);
      assert.ok(!url.pathname.startsWith('/api/api/'),'Canonical API prefix must not be duplicated');
      calls.push({path:url.pathname,method:req.method(),hasRefreshCookie:requestHeaders.cookie?.includes('__Host-lythaus_refresh=')??false,preflightHeaders:requestHeaders['access-control-request-headers']});
      const headers={'access-control-allow-origin':'https://app.lythaus.co','access-control-allow-credentials':'true','access-control-allow-methods':'GET,POST,PUT,PATCH,DELETE,OPTIONS','access-control-allow-headers':'Authorization, Content-Type, Idempotency-Key, X-Correlation-ID, X-Device-Rooted, X-Device-Emulator, X-Device-Debug, X-Live-Test-Mode, X-Lythaus-Auth-Transport'};
      if(req.method()==='OPTIONS'){
        assert.ok(!requestHeaders['access-control-request-headers']?.includes('user-agent'),'Web clients must not set a custom User-Agent');
        return route.fulfill({status:204,headers});
      }
      let status=200,body={items:[],hasMore:false,nextCursor:null};
      if(url.pathname.endsWith('/auth/email')){
        const payload=req.postDataJSON();assert.equal(payload.password,'historical12');
        if(verificationRequired){status=400;body={error:'email_verification_required'};}
        else{session=true;headers['set-cookie']='__Host-lythaus_refresh='+ 'f'.repeat(48)+'; Path=/; HttpOnly; Secure; SameSite=Strict';body={accessToken:'local-access-fixture',sessionTransport:'cookie-v1',expiresIn:900};}
      } else if(url.pathname.endsWith('/auth/refresh')) {
        refreshInFlight++;
        maximumRefreshInFlight=Math.max(maximumRefreshInFlight,refreshInFlight);
        await new Promise(resolve=>setTimeout(resolve,75));
        if(session&&requestHeaders.cookie?.includes('__Host-lythaus_refresh=')){body={accessToken:'local-refreshed-fixture',sessionTransport:'cookie-v1',expiresIn:900};}
        else{status=401;body={error:'refresh_token_invalid'};}
        refreshInFlight--;
      } else if(url.pathname.endsWith('/auth/userinfo')){status=userinfoUnavailable?503:200;body=userinfoUnavailable?{error:'userinfo_unavailable'}:user;}
      else if(url.pathname.endsWith('/auth/logout')){session=false;lifecycle.record('session_revoked');headers['set-cookie']='__Host-lythaus_refresh=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';body={state:'signed_out'};}
      else if(url.pathname===`/api/users/${user.id}`)body={user:{id:user.id,displayName:'Synthetic acceptance',trustPassportVisibility:'private',reputationScore:0}};
      else if(url.pathname==='/api/users/me')body={user:{id:user.id,displayName:'Synthetic acceptance',trustPassportVisibility:'private',moderationState:'allowed',publicVisibility:false,reputationScore:0}};
      else if(url.pathname==='/api/reputation/me'){
        assert.ok(session);
        assert.match(requestHeaders.authorization,/^Bearer local-(?:access|refreshed)-fixture$/);
        body={userId:user.id,level:0,reputationLevel:0,levelName:'New',
          reputationStatus:'active',reputationBand:'new',policyVersion:'reputation-v2.0.0',
          pillars:{accountability:0,contribution:0,conduct:0,sourcing:0,authenticity:0,reviewReliability:0},
          promotionBlockers:[],evaluatedAt:null};
      } else if(url.pathname==='/api/rewards/me/monthly'){
        assert.ok(session);
        assert.match(requestHeaders.authorization,/^Bearer local-(?:access|refreshed)-fixture$/);
        await new Promise(resolve=>setTimeout(resolve,150));
        body={state:'pending',reasonCode:'approval_unavailable',effectiveMonth:null,
          currentLevel:null,sourceMonth:null,sourceScore:null,
          snapshot:{state:'unavailable',reasonCode:'approval_unavailable'},
          selection:{state:'unavailable',reasonCode:'approval_unavailable'}};
      } else if(!['/api/feed/discover','/api/subscription/status','/api/custom-feeds','/api/users/me/reputation'].includes(url.pathname)){
        status=404;body={error:'route_not_found'};
      }
      if(delayNextOwnerResponse&&req.method()==='GET'&&url.pathname==='/api/users/me'){
        delayNextOwnerResponse=false;
        lifecycle.record('controlled_owner_response_latency',{delayMs:ownerResponseDelayMs});
        await new Promise(resolve=>setTimeout(resolve,ownerResponseDelayMs));
      }
      lifecycle.server(req,status);
      return route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(body)});
    });
    let browser;
    try {
      browser=await engine.launch({headless:true,proxy:{server:fixture.proxy},
        ...(name==='webkit'&&process.env.WEBKIT_EXECUTABLE?{executablePath:process.env.WEBKIT_EXECUTABLE}:{})});
    } catch(error) {
      await fixture.close();
      throw error;
    }
    const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block',ignoreHTTPSErrors:true});
    await lifecycle.install(context);
    await installFlutterEngineFonts(context);
    const page=await context.newPage();page.setDefaultTimeout(15000);
    t.after(async()=>{lifecycle.record('teardown_start');try{if(!complete&&!page.isClosed()){
      if(process.env.AUTH_QA_DIR){await mkdir(process.env.AUTH_QA_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.AUTH_QA_DIR,`flutter-${name}-${width}-failure.png`)});}
      t.diagnostic(JSON.stringify({synthetic:true,calls:calls.map(({path,method})=>({path:path.replaceAll(user.id,'{synthetic-owner}'),method})),pageErrorCount:errors.length,pageErrors,failedRequests:failedRequests.map(({path,method,error,expectedSignOutCancellation})=>({path:path.replaceAll(user.id,'{synthetic-owner}'),method,error:['Load request cancelled','net::ERR_ABORTED','net::ERR_FAILED'].includes(error)?error:'other_network_failure',expectedSignOutCancellation})),urlPath:new URL(page.url()).pathname}));
    }}finally{await browser.close();await fixture.close();lifecycle.record('teardown_finished');t.diagnostic(JSON.stringify({authRequestLifecycle:{engine:name,width,scenario:ownerResponseDelayMs?'controlled_pending_owner_response':'baseline',ownerResponseDelayMs,head:process.env.GITHUB_SHA??'local',fixtureBase:'f0e497af4d8b5c1471e17fd4b35d0c0520a09e37',complete,...lifecycle.snapshot()}}));}});
    page.on('pageerror',error=>recordPageError(page,error));
    page.on('requestfailed',request=>{
      const url=new URL(request.url()),error=request.failure()?.errorText;
      const expectedSignOutCancellation=signOutTransitionOpen&&request.method()==='GET'
        &&url.origin==='https://api.lythaus.co'
        &&url.pathname===`/api/users/${user.id}`
        &&error==='Load request cancelled';
      failedRequests.push({path:url.pathname,method:request.method(),error,expectedSignOutCancellation});
    });
    async function openApp(route='/',target=page) {
      await target.goto('https://app.lythaus.co'+route);
      await target.locator('flt-semantics-placeholder').waitFor({timeout:60000});
      await target.locator('flt-semantics-placeholder').evaluate(node=>node.click());
    }
    async function openSettingsFromReadyProfile() {
      await page.getByRole('button',{name:/^Profile(?:\b|$)/}).click();
      if(width<700){
        await page.getByLabel(/Reputation New, new, active/).waitFor();
        await page.getByLabel(/^Monthly level pending/).waitFor();
      }
      await page.getByRole('button',{name:'Open settings',exact:true}).waitFor();
      await page.getByRole('button',{name:'Open settings',exact:true}).click();
      await page.waitForURL(url=>url.pathname==='/settings');
    }
    await openApp();
    await page.getByRole('button',{name:'Sign in with email',exact:true}).waitFor({timeout:60000});
    const recoveryBox=await page.getByRole('button',{name:'Forgot password?',exact:true}).boundingBox();
    assert.ok(recoveryBox&&recoveryBox.x>=0&&recoveryBox.x+recoveryBox.width<=width,
      'Recovery semantics must remain inside the actual viewport, including WebKit');
    assert.equal(await page.title(),'Lythaus');
    if(process.env.AUTH_QA_DIR){await mkdir(process.env.AUTH_QA_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.AUTH_QA_DIR,`flutter-${name}-${width}-entry.png`)});}
    await page.getByRole('button',{name:'Forgot password?',exact:true}).click();
    await page.waitForURL('https://lythaus.co/forgot-password');
    await openApp();
    await page.getByRole('button',{name:'Resend verification email',exact:true}).click();
    await page.waitForURL('https://lythaus.co/resend-verification');
    await openApp();
    const enterText=async(field,value)=>{
      await field.click();
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await field.press('ControlOrMeta+A');await field.press('Backspace');
      await field.pressSequentially(value,{delay:20});
      assert.equal(await field.inputValue(),value);
    };
    const submit=async()=>{
      const email=page.getByRole('textbox',{name:'Email',exact:true});
      await enterText(email,user.email);
      const password=page.locator('input[type=password]');
      await enterText(password,'historical12');
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await password.press('Enter');
    };
    verificationRequired=true;await submit();
    await page.locator('flt-semantics').getByText('Verify your email before signing in. Use Resend verification email if you need a new link.',{exact:true}).waitFor().catch(async error=>{
      t.diagnostic(JSON.stringify({synthetic:true,phase:'verification_notice',callCount:calls.length,pageErrorCount:errors.length,fields:await page.locator('input').evaluateAll(nodes=>nodes.map(node=>({type:node.type,length:node.value.length})))}));throw error;
    });
    verificationRequired=false;userinfoUnavailable=true;await submit();
    await page.getByRole('button',{name:'Sign in with email',exact:true}).waitFor({state:'visible'});
    assert.equal(await page.getByRole('textbox',{name:'Email',exact:true}).inputValue(),user.email);
    await page.locator('flt-semantics').getByText('Authentication is temporarily unavailable. Please try again.',{exact:true}).waitFor();
    userinfoUnavailable=false;await submit();
    await page.locator('flt-semantics').getByText('No public posts yet',{exact:true}).waitFor();
    const cookies=await context.cookies('https://api.lythaus.co');
    assert.ok(cookies.some(cookie=>cookie.name==='__Host-lythaus_refresh'&&cookie.httpOnly&&cookie.secure&&cookie.sameSite==='Strict'),JSON.stringify(cookies.map(({name,domain,httpOnly,secure,sameSite})=>({name,domain,httpOnly,secure,sameSite}))));
    const keys=await page.evaluate(()=>Object.keys(localStorage));
    assert.ok(!keys.some(key=>/^(jwt|refreshToken|userData)$/.test(key)));
    const before=calls.filter(call=>call.path.endsWith('/auth/refresh')).length;
    lifecycle.phase('cookie_restore');
    await openApp();
    await page.locator('flt-semantics').getByText('No public posts yet',{exact:true}).waitFor();
    assert.ok(calls.filter(call=>call.path.endsWith('/auth/refresh')).length>before);
    const secondTab=await context.newPage();secondTab.setDefaultTimeout(30000);
    lifecycle.phase('two_tab_restore');
    secondTab.on('pageerror',error=>recordPageError(secondTab,error));
    await Promise.all([openApp(),openApp('/',secondTab)]);
    await Promise.all([
      page.locator('flt-semantics').getByText('No public posts yet',{exact:true}).waitFor(),
      secondTab.locator('flt-semantics').getByText('No public posts yet',{exact:true}).waitFor(),
    ]);
    assert.equal(maximumRefreshInFlight,1,'Same-origin tabs must serialize refresh instead of racing a rotating cookie');
    lifecycle.phase('settings_entry');
    await openSettingsFromReadyProfile();
    await page.getByText('Account security',{exact:true}).click();
    await page.waitForURL(url=>url.pathname==='/settings/security');
    await page.getByRole('button',{name:'Sign out of all sessions',exact:true}).waitFor();
    lifecycle.phase('browser_back');
    await page.goBack();
    await page.waitForURL(url=>url.pathname==='/settings');
    await page.getByText('Account security',{exact:true}).waitFor();
    lifecycle.phase('browser_forward');
    await page.goForward();
    await page.waitForURL(url=>url.pathname==='/settings/security');
    await page.getByRole('button',{name:'Sign out of all sessions',exact:true}).waitFor();
    const securityLocation=new URL(page.url());
    lifecycle.phase('security_reload');
    delayNextOwnerResponse=ownerResponseDelayMs>0;
    const ownerReady=await freshOwnerReadFence(page,{navigationUrl:'https://app.lythaus.co'+securityLocation.pathname+securityLocation.search,
      ownerId:user.id,semanticReady:async()=>{
        await page.waitForURL(url=>url.pathname==='/settings/security');
        await page.getByRole('button',{name:'Sign out of all sessions',exact:true}).waitFor();
        const back=page.getByRole('button',{name:'Back',exact:true});
        await back.waitFor();
        if(!await back.isEnabled())throw new Error('Security Back action is not ready');
      }});
    t.after(()=>ownerReady.dispose());
    await openApp(securityLocation.pathname+securityLocation.search);
    await page.waitForURL(url=>url.pathname==='/settings/security');
    await page.getByRole('button',{name:'Sign out of all sessions',exact:true}).waitFor();
    const readiness=await ownerReady.ready();
    lifecycle.record('fresh_owner_body_and_semantics_ready',{
      documentNavigationStartedAtEpochMs:readiness.documentNavigationStartedAtEpochMs,
      documentInitializedAtEpochMs:readiness.documentInitializedAtEpochMs,
      ownerRequestStartedAtEpochMs:readiness.ownerRequestStartedAtEpochMs,
    });
    for(let revisit=0;revisit<2;revisit++){
      lifecycle.phase('security_back');
      await page.getByRole('button',{name:'Back',exact:true}).click();
      await page.waitForURL(url=>url.pathname==='/settings');
      await page.getByText('Preferences',{exact:true}).waitFor();
      await page.mouse.move(width-20,900);
      lifecycle.phase('settings_back');
      await page.getByRole('button',{name:'Back',exact:true}).click();
      await page.waitForURL(url=>url.pathname==='/'&&(width>=700||url.searchParams.get('tab')==='profile'));
      lifecycle.phase('settings_revisit');
      await openSettingsFromReadyProfile();
      await page.getByText('Account security',{exact:true}).click();
      await page.waitForURL(url=>url.pathname==='/settings/security');
    }
    lifecycle.phase('logout_armed');
    signOutTransitionOpen=true;
    const logoutReply=page.waitForResponse(response=>response.url()==='https://api.lythaus.co/api/auth/logout'
      &&response.request().method()==='POST'&&response.status()===200);
    await page.getByRole('button',{name:'Sign out of all sessions',exact:true}).click();
    await (await logoutReply).finished();
    lifecycle.record('logout_response_finished');
    await page.getByRole('button',{name:'Sign in with email',exact:true}).waitFor();
    await secondTab.getByRole('button',{name:'Sign in with email',exact:true}).waitFor();
    lifecycle.record('both_tabs_signed_out');
    signOutTransitionOpen=false;
    lifecycle.phase('protected_return');
    lifecycle.record('protected_return_navigation_requested',{path:'/settings/security'});
    await openApp('/settings/security');
    await page.getByRole('button',{name:'Sign in with email',exact:true}).waitFor();
    assert.equal(new URL(page.url()).searchParams.get('returnTo'),'/settings/security');
    assert.equal(session,false);
    assert.equal((await context.cookies('https://api.lythaus.co')).some(cookie=>cookie.name==='__Host-lythaus_refresh'),false);
    const expectedPageErrorIndexes=classifyExpectedProtectedReturnDiscoverCancellation(lifecycle.snapshot());
    assert.deepEqual(pageErrors.filter((_,index)=>!expectedPageErrorIndexes.has(index)),[]);
    if(expectedPageErrorIndexes.size)t.diagnostic(JSON.stringify({expectedProtectedReturnDiscoverCancellations:
      [...expectedPageErrorIndexes].map(index=>pageErrors[index])}));
    lifecycle.record('revocation_and_protected_return_assertions_passed');
    assert.deepEqual(failedRequests.filter(request=>request.path==='/api/feed/discover'
      &&['Load request cancelled','net::ERR_ABORTED','net::ERR_FAILED'].includes(request.error)),[],
      'real Discover request cancellations remain fatal, including after logout');
    assert.deepEqual(failedRequests.filter(request=>!request.expectedSignOutCancellation),[]);
    if(failedRequests.length)t.diagnostic(JSON.stringify({expectedSignOutCancellations:failedRequests}));
    complete=true;
  });
}

for(const [engineName,engine] of Object.entries({chromium,webkit})) for(const control of [
  {name:'Access-Control-Allow-Origin',omitted:'access-control-allow-origin'},
  {name:'Access-Control-Allow-Credentials',omitted:'access-control-allow-credentials'},
]) {
  test(`${engineName}: missing ${control.name} keeps a real Discover XHR failure fatal`,{timeout:30000},async t=>{
    const lifecycle=createAuthRequestLifecycle({ownerId:user.id});
    const requests=[],pageErrors=[];
    const waitForSnapshot=async predicate=>{
      const deadline=Date.now()+5000;
      while(Date.now()<deadline){
        const snapshot=lifecycle.snapshot();
        if(predicate(snapshot))return snapshot;
        await new Promise(resolve=>setTimeout(resolve,10));
      }
      throw new Error('Timed out waiting for the browser lifecycle collector');
    };
    const fixture=await localAuthBrowserServer(async route=>{
      const req=route.request(),url=new URL(req.url()),requestHeaders=await req.allHeaders();
      if(url.hostname==='app.lythaus.co')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>CORS negative control</title>'});
      if(url.hostname==='api.lythaus.co'&&url.pathname==='/api/feed/discover'){
        lifecycle.server(req);
        const headers={'access-control-allow-origin':'https://app.lythaus.co','access-control-allow-credentials':'true'};
        delete headers[control.omitted];
        requests.push({method:req.method(),origin:requestHeaders.origin??null,status:200,
          allowOrigin:headers['access-control-allow-origin']??null,
          allowCredentials:headers['access-control-allow-credentials']??null});
        lifecycle.server(req,200);
        return route.fulfill({status:200,headers:{...headers,'content-type':'application/json'},body:'{"items":[],"hasMore":false,"nextCursor":null}'});
      }
      return route.fulfill({status:404,body:'not found'});
    });
    let browser;
    try {
      browser=await engine.launch({headless:true,proxy:{server:fixture.proxy},
        ...(engineName==='webkit'&&process.env.WEBKIT_EXECUTABLE?{executablePath:process.env.WEBKIT_EXECUTABLE}:{})});
      const context=await browser.newContext({serviceWorkers:'block',ignoreHTTPSErrors:true});
      await lifecycle.install(context);
      const page=await context.newPage();
      page.on('pageerror',error=>{
        const detail={pageErrorIndex:pageErrors.length,name:error.name,message:error.message,
          pageId:lifecycle.identifyPage(page),path:new URL(page.url()).pathname};
        pageErrors.push(detail);lifecycle.record('uncaught_page_error',detail);
      });
      await page.goto('https://app.lythaus.co/login');
      lifecycle.phase('protected_return');
      const result=await page.evaluate(()=>new Promise(resolve=>{
        const xhr=new XMLHttpRequest();
        xhr.open('GET','https://api.lythaus.co/api/feed/discover?limit=25');
        xhr.withCredentials=true;
        let outcome;
        xhr.addEventListener('error',()=>{outcome={event:'error',readyState:xhr.readyState,status:xhr.status};});
        xhr.addEventListener('loadend',()=>resolve(outcome));
        xhr.send();
      }));
      assert.deepEqual(result,{event:'error',readyState:4,status:0});
      const snapshot=await waitForSnapshot(snapshot=>snapshot.events.some(event=>event.type==='xhr_loadend'
        &&event.path==='/api/feed/discover'&&event.xhrStatus===0));
      const discoverEvents=snapshot.events.filter(event=>event.path==='/api/feed/discover');
      assert.deepEqual(requests,[{method:'GET',origin:'https://app.lythaus.co',status:200,
        allowOrigin:control.omitted==='access-control-allow-origin'?null:'https://app.lythaus.co',
        allowCredentials:control.omitted==='access-control-allow-credentials'?null:'true'}]);
      assert.ok(discoverEvents.some(event=>event.type==='request_start'),JSON.stringify(discoverEvents));
      assert.ok(discoverEvents.some(event=>event.type==='server_request'),JSON.stringify(discoverEvents));
      assert.ok(discoverEvents.some(event=>event.type==='server_response'&&event.status===200),JSON.stringify(discoverEvents));
      assert.ok(discoverEvents.some(event=>event.type==='xhr_error'&&event.xhrReadyState===4&&event.xhrStatus===0),JSON.stringify(discoverEvents));
      assert.ok(discoverEvents.some(event=>event.type==='xhr_loadend'&&event.xhrReadyState===4&&event.xhrStatus===0),JSON.stringify(discoverEvents));
      assert.deepEqual([...classifyExpectedProtectedReturnDiscoverCancellation(snapshot)],[]);
      const accepted=classifyExpectedProtectedReturnDiscoverCancellation(snapshot);
      assert.deepEqual(pageErrors.filter((_,index)=>!accepted.has(index)),pageErrors,
        'no CORS page error may be marked as an expected navigation cancellation');
    } finally {
      await browser?.close();
      await fixture.close();
    }
  });
}

for(const [engineName,engine] of Object.entries({chromium,webkit})) {
  test(`${engineName}: post-logout Discover request_failed remains fatal in the lifecycle collector`,{timeout:30000},async t=>{
    const lifecycle=createAuthRequestLifecycle({ownerId:user.id});
    let discoverRequestFailed=false,releaseDiscoverResponse=null;
    const fixture=await localAuthBrowserServer(async route=>{
      const req=route.request(),url=new URL(req.url());
      if(url.hostname==='app.lythaus.co')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>Protected return cancellation control</title>'});
      if(url.hostname!=='api.lythaus.co')return route.abort();
      lifecycle.server(req);
      const headers={'access-control-allow-origin':'https://app.lythaus.co','access-control-allow-credentials':'true',
        'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'Content-Type'};
      if(req.method()==='OPTIONS')return route.fulfill({status:204,headers});
      if(req.method()==='POST'&&url.pathname==='/api/auth/logout'){
        lifecycle.server(req,200);
        return route.fulfill({status:200,headers:{...headers,'content-type':'application/json'},body:'{"state":"signed_out"}'});
      }
      if(req.method()==='GET'&&url.pathname==='/api/feed/discover'){
        await new Promise(resolve=>{
          const timer=setTimeout(resolve,5000);
          releaseDiscoverResponse=()=>{clearTimeout(timer);resolve();};
        });
        if(discoverRequestFailed)return;
        lifecycle.server(req,200);
        try{return await route.fulfill({status:200,headers:{...headers,'content-type':'application/json'},
          body:'{"items":[],"hasMore":false,"nextCursor":null}'});}
        catch(error){if(discoverRequestFailed)return;throw error;}
      }
      lifecycle.server(req,404);
      return route.fulfill({status:404,headers:{...headers,'content-type':'application/json'},body:'{"error":"not_found"}'});
    });
    let browser;
    try{
      browser=await engine.launch({headless:true,proxy:{server:fixture.proxy},
        ...(engineName==='webkit'&&process.env.WEBKIT_EXECUTABLE?{executablePath:process.env.WEBKIT_EXECUTABLE}:{})});
      const context=await browser.newContext({serviceWorkers:'block',ignoreHTTPSErrors:true});
      await lifecycle.install(context);
      context.on('requestfailed',request=>{
        if(new URL(request.url()).pathname==='/api/feed/discover'){
          discoverRequestFailed=true;
          releaseDiscoverResponse?.();
        }
      });
      const page=await context.newPage();
      await page.goto('https://app.lythaus.co/login');
      const logoutResponse=page.waitForResponse(response=>response.url()==='https://api.lythaus.co/api/auth/logout'
        &&response.request().method()==='POST'&&response.status()===200);
      assert.equal(await page.evaluate(()=>fetch('https://api.lythaus.co/api/auth/logout',
        {method:'POST',credentials:'include'}).then(response=>response.status)),200);
      await (await logoutResponse).finished();
      lifecycle.record('logout_response_finished');
      lifecycle.phase('protected_return');
      await page.evaluate(()=>{
        const xhr=new XMLHttpRequest();
        xhr.open('GET','https://api.lythaus.co/api/feed/discover?limit=25');
        xhr.withCredentials=true;
        window.__pendingDiscoverRequest=xhr;
        xhr.send();
      });
      const deadline=Date.now()+5000;
      while(Date.now()<deadline&&!lifecycle.snapshot().events.some(event=>event.type==='request_start'
        &&event.path==='/api/feed/discover'&&event.phase==='protected_return')
        &&!lifecycle.snapshot().events.some(event=>event.type==='server_request'
          &&event.path==='/api/feed/discover'&&event.phase==='protected_return'))await new Promise(resolve=>setTimeout(resolve,10));
      assert.ok(lifecycle.snapshot().events.some(event=>event.type==='request_start'
        &&event.path==='/api/feed/discover'&&event.phase==='protected_return'));
      lifecycle.record('protected_return_discover_xhr_abort_requested');
      await page.evaluate(()=>window.__pendingDiscoverRequest.abort());
      const failedAt=Date.now()+5000;
      let snapshot=lifecycle.snapshot();
      while(Date.now()<failedAt&&!snapshot.events.some(event=>event.type==='request_failed'
        &&event.path==='/api/feed/discover'&&event.phase==='protected_return')){
        await new Promise(resolve=>setTimeout(resolve,10));snapshot=lifecycle.snapshot();
      }
      const cancellations=snapshot.events.filter(event=>event.type==='request_failed'
        &&event.path==='/api/feed/discover'&&event.phase==='protected_return');
      assert.equal(cancellations.length,1,JSON.stringify(cancellations));
      assert.equal(cancellations[0].error,engineName==='webkit'?'Load request cancelled':'net::ERR_ABORTED',JSON.stringify(cancellations[0]));
      assert.ok(cancellations[0].sequence>snapshot.events.find(event=>event.type==='logout_response_finished').sequence);
      assert.ok(snapshot.events.some(event=>event.type==='xhr_abort'&&event.path==='/api/feed/discover'
        &&event.phase==='protected_return'));
      assert.deepEqual([...classifyExpectedProtectedReturnDiscoverCancellation(snapshot)],[],
        'real request_failed evidence is not an expected page-error cancellation');
      t.diagnostic(JSON.stringify({postLogoutDiscoverRequestFailure:{engine:engineName,error:cancellations[0].error,
        path:cancellations[0].path,phase:cancellations[0].phase,sequence:cancellations[0].sequence,
        source:'real browser requestfailed event captured by createAuthRequestLifecycle',acceptedByPageErrorClassifier:false}}));
    }finally{
      releaseDiscoverResponse?.();
      await browser?.close();
      await fixture.close();
    }
  });
}
