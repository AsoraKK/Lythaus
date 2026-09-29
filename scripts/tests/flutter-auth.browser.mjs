import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { chromium, webkit } from 'playwright';
import { localAuthBrowserServer } from './local-auth-browser-server.mjs';

const build=path.resolve('build/web');
const mime={'.html':'text/html','.js':'application/javascript','.json':'application/json','.wasm':'application/wasm','.ttf':'font/ttf','.otf':'font/otf','.png':'image/png'};
const user={id:'018f0000-0000-7000-8000-000000000001',email:'synthetic@example.invalid',role:'user',tier:'bronze',subscription_tier:'free',reputation_score:0,created_at:'2026-08-01T00:00:00Z',last_login_at:'2026-08-01T00:00:00Z'};
for(const [name,engine] of Object.entries({chromium,webkit})) for(const width of [1440,390]) {
  test(`${name} ${width}: actual Flutter release login, recovery navigation, cookie restore and logout`,async t=>{
    const errors=[],calls=[],failedRequests=[];let session=false,verificationRequired=false,userinfoUnavailable=false,complete=false;
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
        if(session&&requestHeaders.cookie?.includes('__Host-lythaus_refresh=')){body={accessToken:'local-refreshed-fixture',sessionTransport:'cookie-v1',expiresIn:900};}
        else{status=401;body={error:'refresh_token_invalid'};}
      } else if(url.pathname.endsWith('/auth/userinfo')){status=userinfoUnavailable?503:200;body=userinfoUnavailable?{error:'userinfo_unavailable'}:user;}
      else if(url.pathname.endsWith('/auth/logout')){session=false;headers['set-cookie']='__Host-lythaus_refresh=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';body={state:'signed_out'};}
      else if(url.pathname===`/api/users/${user.id}`)body={user:{id:user.id,displayName:'Synthetic acceptance',trustPassportVisibility:'private',reputationScore:0}};
      else if(!['/api/feed/discover','/api/subscription/status','/api/custom-feeds','/api/users/me/reputation','/api/reputation/me'].includes(url.pathname)){
        status=404;body={error:'route_not_found'};
      }
      return route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(body)});
    });
    const browser=await engine.launch({headless:true,proxy:{server:fixture.proxy}});
    const context=await browser.newContext({viewport:{width,height:1000},serviceWorkers:'block',ignoreHTTPSErrors:true});
    const page=await context.newPage();page.setDefaultTimeout(15000);
    t.after(async()=>{try{if(!complete&&!page.isClosed())t.diagnostic(JSON.stringify({calls,errors,failedRequests,screen:await page.locator('flt-semantics').allTextContents(),storageKeys:await page.evaluate(()=>Object.keys(localStorage))}));}finally{await browser.close();await fixture.close();}});
    page.on('pageerror',error=>errors.push(error.message));
    page.on('requestfailed',request=>failedRequests.push({path:new URL(request.url()).pathname,method:request.method(),error:request.failure()?.errorText}));
    async function openApp(route='/') {
      await page.goto('https://app.lythaus.co'+route);
      await page.locator('flt-semantics-placeholder').waitFor({timeout:60000});
      await page.locator('flt-semantics-placeholder').evaluate(node=>node.click());
    }
    await openApp();
    await page.getByRole('button',{name:'Sign in with email',exact:true}).waitFor({timeout:60000});
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
      t.diagnostic(JSON.stringify({calls,errors,screen:await page.locator('flt-semantics').allTextContents(),fields:await page.locator('input').evaluateAll(nodes=>nodes.map(node=>({type:node.type,length:node.value.length})))}));throw error;
    });
    verificationRequired=false;userinfoUnavailable=true;await submit();
    await page.getByRole('button',{name:'Sign in with email',exact:true}).waitFor({state:'visible'});
    assert.equal(await page.getByRole('textbox',{name:'Email',exact:true}).inputValue(),user.email);
    await page.locator('flt-semantics').getByText('Authentication is temporarily unavailable. Please try again.',{exact:true}).waitFor();
    userinfoUnavailable=false;await submit();
    await page.getByText('No posts yet',{exact:true}).waitFor();
    const cookies=await context.cookies('https://api.lythaus.co');
    assert.ok(cookies.some(cookie=>cookie.name==='__Host-lythaus_refresh'&&cookie.httpOnly&&cookie.secure&&cookie.sameSite==='Strict'),JSON.stringify(cookies.map(({name,domain,httpOnly,secure,sameSite})=>({name,domain,httpOnly,secure,sameSite}))));
    const keys=await page.evaluate(()=>Object.keys(localStorage));
    assert.ok(!keys.some(key=>/^(jwt|refreshToken|userData)$/.test(key)));
    const before=calls.filter(call=>call.path.endsWith('/auth/refresh')).length;
    await openApp();
    await page.getByText('No posts yet',{exact:true}).waitFor();
    assert.ok(calls.filter(call=>call.path.endsWith('/auth/refresh')).length>before);
    if(width<700)await page.getByRole('button',{name:/^Profile(?:\b|$)/}).click();
    await page.getByRole('button',{name:'Settings',exact:true}).click();
    await page.getByText('Account security',{exact:true}).click();
    await page.getByRole('button',{name:'Sign out of all sessions',exact:true}).click();
    await page.getByRole('button',{name:'Sign in with email',exact:true}).waitFor();
    await openApp();
    await page.getByRole('button',{name:'Sign in with email',exact:true}).waitFor();
    assert.equal(session,false);
    assert.equal((await context.cookies('https://api.lythaus.co')).some(cookie=>cookie.name==='__Host-lythaus_refresh'),false);
    const blockedEngineFonts=errors.filter(message=>/^\/fonts\.gstatic\.com\/s\/roboto\//.test(message));
    assert.deepEqual(errors.filter(message=>!blockedEngineFonts.includes(message)),[]);
    if(blockedEngineFonts.length)t.diagnostic('Known Flutter engine Roboto fallback requests blocked by the offline fixture; bundled Manrope renders the UI.');
    complete=true;
  });
}
