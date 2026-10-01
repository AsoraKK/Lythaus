import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, webkit } from 'playwright';

const dist=path.resolve(import.meta.dirname,'../dist');
let server, origin;
before(async()=>{
  await readFile(path.join(dist,'signup/index.html'));
  server=createServer(async(req,res)=>{
    const pathname=new URL(req.url,'http://localhost').pathname;
    let file=path.resolve(dist,'.'+pathname);
    if(file!==dist&&!file.startsWith(dist+path.sep)){res.writeHead(403).end();return;}
    if(!path.extname(file)) file=path.join(file,'index.html');
    try{
      let content=await readFile(file);
      if(file.endsWith('.html')) content=Buffer.from(content.toString().replace(/data-turnstile-site-key(?:="[^"]*")?/g,'data-turnstile-site-key="1x00000000000000000000AA"'));
      const type={'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml','.ttf':'font/ttf','.png':'image/png','.ico':'image/x-icon'}[path.extname(file)]??'application/octet-stream';
      res.writeHead(200,{'content-type':type,'cache-control':'no-store','referrer-policy':'no-referrer'}).end(content);
    }catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  origin=`http://127.0.0.1:${server.address().port}`;
});
after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));});

for(const [engine,type] of Object.entries({chromium,webkit})) for(const viewport of [{width:1440,height:1000},{width:390,height:844}]) {
  test(`${engine} ${viewport.width}: rendered auth controls, recovery, fragments, errors and keyboard submission`,async t=>{
    const browser=await type.launch({headless:true});t.after(()=>browser.close());
    const context=await browser.newContext({viewport});
    const page=await context.newPage();
    page.setDefaultTimeout(8000);
    const failures=[], requests=[];
    page.on('pageerror',error=>failures.push(error.message));
    await page.addInitScript(()=>{
      const widgets=new Map();let sequence=0;
      window.turnstile={render:(_target,options)=>{const id=sequence++;widgets.set(id,options);return id;},
        execute:id=>queueMicrotask(()=>widgets.get(id).callback(`local-fixture:${widgets.get(id).action}`)),reset:()=>{},remove:id=>widgets.delete(id)};
    });
    let loginStatus=400, verifyCount=0, resetCount=0, proxyError=false, resetRequestError=false;
    const resetReference='3b8a5c5c-07c8-4b55-a0a5-7a66235648cc';
    await page.route('https://api.lythaus.co/**',async route=>{
      const request=route.request();const body=request.postDataJSON();
      requests.push({url:request.url(),body,headers:request.headers()});
      if(proxyError){await route.fulfill({status:502,contentType:'text/html',body:'<h1>Temporary gateway failure</h1>'});return;}
      let status=202, result={state:'verification_required'};
      if(request.url().endsWith('/email')&&body.mode==='login'){
        status=loginStatus;result=status===200?{accessToken:'synthetic-only',sessionTransport:'cookie-v1',expiresIn:900}:{error:'email_verification_required'};
      }else if(request.url().endsWith('/email/verify')){
        status=verifyCount++===0?200:400;result=status===200?{state:'verified'}:{error:'verification_token_invalid'};
      }else if(request.url().endsWith('/password/reset/request')) {
        status=resetRequestError?429:202;
        result=resetRequestError?{error:'rate_limit_exceeded',correlationId:resetReference}:{state:'reset_if_eligible',correlationId:resetReference};
      }
      else if(request.url().endsWith('/password/reset/complete')){
        status=resetCount++===0?200:400;result=status===200?{state:'password_reset_completed'}:{error:'reset_token_invalid'};
      }
      await route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':origin,'access-control-allow-credentials':'true'},body:JSON.stringify(result)});
    });
    await page.route('https://app.lythaus.co/**',route=>route.fulfill({contentType:'text/html',body:'<title>Local app handoff fixture</title><main>App handoff reached</main>'}));
    const navigate=async(route,title)=>{
      await page.goto(origin+route);
      assert.ok((await page.title()).includes(title));
      assert.ok(await page.locator('main').innerText());
      assert.equal(await page.locator('astro-error-overlay,vite-error-overlay').count(),0);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No horizontal overflow');
    };
    await navigate('/sign-in','Sign in');
    assert.equal(await page.getByRole('link',{name:'Forgot password?',exact:true}).count(),1);
    await page.locator('#sign-in-email').fill('synthetic@example.invalid');
    await page.locator('#sign-in-password').fill('historical12');
    await page.locator('#sign-in-password').press('Enter');
    await page.locator('[data-sign-in-status]').filter({hasText:'needs to be verified'}).waitFor();
    assert.equal(requests.at(-1).body.password,'historical12');
    await page.getByRole('button',{name:'Resend verification email',exact:true}).click();
    await page.locator('[data-sign-in-status]').filter({hasText:'accepted'}).waitFor();
    assert.equal(requests.at(-1).body.turnstileToken,'local-fixture:verification_resend');
    await page.getByRole('link',{name:'Forgot password?',exact:true}).click();
    await page.locator('#reset-email').fill('synthetic@example.invalid');
    await page.getByRole('button',{name:'Send reset link',exact:true}).click();
    await page.locator('[data-reset-status]').filter({hasText:'accepted'}).waitFor();
    assert.equal(requests.at(-1).body.turnstileToken,'local-fixture:password_reset_request');
    assert.ok(requests.at(-1).headers['idempotency-key']);
    assert.ok((await page.locator('[data-reset-status]').innerText()).includes(`Support reference: ${resetReference}`));
    resetRequestError=true;
    await page.getByRole('button',{name:'Send reset link',exact:true}).click();
    await page.locator('[data-reset-status]').filter({hasText:'Too many requests'}).waitFor();
    assert.ok((await page.locator('[data-reset-status]').innerText()).includes(`Support reference: ${resetReference}`));
    resetRequestError=false;
    await navigate('/signup','Create your account');
    await page.locator('#signup-email').fill('synthetic@example.invalid');
    await page.locator('#signup-password').fill('🙂'.repeat(8));
    await page.locator('#signup-password-confirmation').fill('🙂'.repeat(8));
    const before=requests.length;
    await page.getByRole('button',{name:'Create account',exact:true}).click();
    await page.locator('[data-signup-status]').filter({hasText:'15'}).waitFor();
    assert.equal(requests.length,before);
    await page.locator('#signup-password').fill('🙂'.repeat(15));
    await page.locator('#signup-password-confirmation').fill('🙂'.repeat(15));
    await page.getByRole('button',{name:'Create account',exact:true}).click();
    await page.locator('[data-signup-check-email]').waitFor({state:'visible'});
    assert.equal(requests.at(-1).body.password,'🙂'.repeat(15));
    const token='a'.repeat(64);
    const beforeGet=requests.length;
    await navigate(`/verify-email#token=${token}`,'Confirm your email');
    await page.waitForURL(origin+'/verify-email');
    assert.equal(requests.length,beforeGet,'Opening an email must not redeem it');
    await page.locator('input[name=password]').fill('synthetic chosen password');
    await page.locator('input[name=passwordConfirmation]').fill('synthetic chosen password');
    await page.locator('button[type=submit]').click();
    await page.locator('[data-email-verification-status]').filter({hasText:'verified'}).waitFor();
    await navigate(`/verify-email#token=${token}`,'Confirm your email');
    await page.locator('input[name=password]').fill('synthetic chosen password');
    await page.locator('input[name=passwordConfirmation]').fill('synthetic chosen password');
    await page.locator('button[type=submit]').click();
    await page.locator('[data-email-verification-status]').filter({hasText:'already used'}).waitFor();
    await navigate(`/reset-password#token=${token}`,'Choose a new password');
    await page.waitForURL(origin+'/reset-password');
    await page.locator('#new-password').fill('synthetic new password');
    await page.locator('#new-password-confirmation').fill('synthetic new password');
    await page.getByRole('button',{name:'Set new password',exact:true}).click();
    await page.locator('[data-reset-status]').filter({hasText:'signed out'}).waitFor();
    await page.reload();
    assert.equal(await page.locator('[data-reset-submit]').isDisabled(),true,'Refresh without a bearer does not repeat the reset');
    if(process.env.AUTH_QA_DIR){await mkdir(process.env.AUTH_QA_DIR,{recursive:true});await page.screenshot({path:path.join(process.env.AUTH_QA_DIR,`${engine}-${viewport.width}-safe-recovery.png`),fullPage:true});}
    proxyError=true;
    await navigate('/sign-in','Sign in');
    await page.locator('#sign-in-email').fill('synthetic@example.invalid');
    await page.locator('#sign-in-password').fill('historical12');
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await page.locator('[data-sign-in-status]').filter({hasText:'unexpected response'}).waitFor();
    assert.equal(await page.getByRole('button',{name:'Sign in',exact:true}).isEnabled(),true);
    proxyError=false;loginStatus=200;
    await page.getByRole('button',{name:'Sign in',exact:true}).click();
    await page.waitForURL('https://app.lythaus.co/');
    assert.equal(requests.at(-1).headers['x-lythaus-auth-transport'],'cookie-v1');
    assert.deepEqual(failures,[]);
  });
}
