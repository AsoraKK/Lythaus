import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { chromium, webkit } from 'playwright';
import { localAuthBrowserServer } from '../../../scripts/tests/local-auth-browser-server.mjs';

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

for (const [engine, type] of Object.entries({ chromium, webkit })) {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 844 }]) {
    test(`${engine} ${viewport.width}: single password journey retains mailbox setup and explicit sign-in`, async t => {
      const initialPassword = 'synthetic signup password', setupPassword = 'synthetic mailbox password';
      const token = 'a'.repeat(64), calls = [], errors = [], consoleErrors = [];
      let verified = false, session = false;
      const fixture = await localAuthBrowserServer(async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.hostname === 'lythaus.co') {
          let file = path.resolve(dist, '.' + url.pathname);
          assert.ok(file === dist || file.startsWith(dist + path.sep));
          if (!path.extname(file)) file = path.join(file, 'index.html');
          let content = await readFile(file);
          if (file.endsWith('.html')) content = Buffer.from(content.toString().replace(/data-turnstile-site-key(?:="[^"]*")?/g, 'data-turnstile-site-key="1x00000000000000000000AA"'));
          const contentType = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.png': 'image/png', '.ico': 'image/x-icon' }[path.extname(file)] ?? 'application/octet-stream';
          return route.fulfill({ contentType, body: content });
        }
        if (url.hostname === 'app.lythaus.co') return route.fulfill({ contentType: 'text/html', body: `<title>Local authenticated app fixture</title><main id="session">Restoring session</main><script>fetch('https://api.lythaus.co/api/auth/refresh',{method:'POST',credentials:'include',headers:{'content-type':'application/json','x-lythaus-auth-transport':'cookie-v1'},body:'{}'}).then(r=>{document.querySelector('#session').textContent=r.ok?'Session restored':'Sign-in required';});</script>` });
        if (url.hostname !== 'api.lythaus.co') return route.abort();
        const requestHeaders = await request.allHeaders();
        const headers = { 'access-control-allow-origin': requestHeaders.origin ?? 'https://lythaus.co',
          'access-control-allow-credentials': 'true', 'access-control-allow-methods': 'POST,OPTIONS',
          'access-control-allow-headers': 'content-type,idempotency-key,x-lythaus-auth-transport' };
        if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
        const body = request.postDataJSON();
        calls.push({ path: url.pathname, body, headers: requestHeaders });
        assert.equal(Object.hasOwn(body, 'passwordConfirmation'), false);
        let status = 200, result;
        if (url.pathname.endsWith('/email/verify')) {
          assert.deepEqual(body, { token, password: setupPassword });
          verified = true;
          result = { state: 'verified' };
        } else if (body.mode === 'register') {
          assert.equal(body.turnstileToken, 'local-fixture:account_signup');
          status = body.password === 'synthetic compromised password' ? 400 : 202;
          result = status === 400 ? { error: 'password_compromised' } : { state: 'verification_required' };
        } else if (body.mode === 'login') {
          session = verified && body.password === setupPassword;
          status = session ? 200 : 401;
          if (session) headers['set-cookie'] = `__Host-lythaus_refresh=${'f'.repeat(48)}; Path=/; HttpOnly; Secure; SameSite=Strict`;
          result = session ? { accessToken: 'synthetic-only', sessionTransport: 'cookie-v1', expiresIn: 900 } : { error: 'invalid_credentials' };
        } else {
          assert.equal(url.pathname, '/api/auth/refresh');
          status = session && requestHeaders.cookie?.includes('__Host-lythaus_refresh=') ? 200 : 401;
          result = { accessToken: 'synthetic-refreshed', sessionTransport: 'cookie-v1' };
        }
        return route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(result) });
      });
      t.after(() => fixture.close());
      const browser = await type.launch({ headless: true, proxy: { server: fixture.proxy } });
      t.after(() => browser.close());
      const context = await browser.newContext({ viewport, ignoreHTTPSErrors: true, serviceWorkers: 'block' });
      await context.route('https://challenges.cloudflare.com/**', route => route.abort());
      await context.addInitScript(() => {
        const widgets = new Map(); let sequence = 0;
        window.turnstile = { render: (_target, options) => { const id = sequence++; widgets.set(id, options); return id; },
          execute: id => queueMicrotask(() => widgets.get(id).callback(`local-fixture:${widgets.get(id).action}`)), reset: () => {}, remove: id => widgets.delete(id) };
      });
      const page = await context.newPage();
      page.setDefaultTimeout(8000);
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') consoleErrors.push({ text: message.text(), url: message.location().url }); });
      const open = async (route, title) => {
        await page.goto('https://lythaus.co' + route);
        assert.ok((await page.title()).includes(title));
        assert.ok(await page.locator('main').innerText());
        assert.equal(await page.locator('astro-error-overlay,vite-error-overlay').count(), 0);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      };
      const screenshot = async name => {
        if (!process.env.AUTH_QA_DIR) return;
        await mkdir(process.env.AUTH_QA_DIR, { recursive: true });
        await page.screenshot({ path: path.join(process.env.AUTH_QA_DIR, `${engine}-${viewport.width}-single-${name}.png`) });
      };
      await open('/signup', 'Create your account');
      await screenshot('signup');
      assert.equal(await page.locator('input[name="passwordConfirmation"]').count(), 0);
      assert.equal(await page.locator('input[required]').count(), 2);
      await page.locator('#signup-email').fill('synthetic@example.invalid');
      await page.locator('#signup-password').fill('synthetic compromised password');
      await page.getByRole('button', { name: 'Create account', exact: true }).click();
      await page.locator('[data-signup-status]').filter({ hasText: 'Choose a different password' }).waitFor();
      assert.equal(await page.locator('#signup-password').isVisible(), true);
      assert.equal(await page.locator('[data-signup-status]').evaluate(element => element === document.activeElement), true);
      await page.locator('#signup-password').fill(initialPassword);
      await page.getByRole('button', { name: 'Create account', exact: true }).click();
      await page.locator('[data-signup-check-email]').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#signup-password').inputValue(), '');
      assert.equal((await context.cookies('https://api.lythaus.co')).length, 0);
      const beforeProof = calls.length;
      await open(`/verify-email#token=${token}`, 'Confirm your email');
      assert.equal(page.url(), 'https://lythaus.co/verify-email');
      assert.equal(calls.length, beforeProof, 'Opening proof must not redeem it');
      await screenshot('verification');
      assert.equal(await page.locator('input[name="passwordConfirmation"]').count(), 0);
      assert.equal(await page.locator('input[required]').count(), 1);
      await page.locator('#verification-password').fill(setupPassword);
      await page.getByRole('button', { name: 'Verify email and finish setup', exact: true }).click();
      await page.locator('[data-email-verification-signin]').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#verification-password').inputValue(), '');
      assert.equal((await context.cookies('https://api.lythaus.co')).length, 0, 'Setup must not sign in');
      assert.equal(calls.some(call => call.body.mode === 'login'), false);
      await page.locator('[data-email-verification-signin]').click();
      await page.waitForURL('https://lythaus.co/sign-in');
      assert.equal(await page.locator('input[required]').count(), 2);
      await page.locator('#sign-in-email').fill('synthetic@example.invalid');
      await page.locator('#sign-in-password').fill(initialPassword);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.locator('[data-sign-in-status][data-state="error"]').waitFor();
      assert.equal(page.url(), 'https://lythaus.co/sign-in');
      assert.equal((await context.cookies('https://api.lythaus.co')).length, 0, 'Mismatched sign-in must not create a session');
      await page.locator('#sign-in-password').fill(setupPassword);
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.waitForURL('https://app.lythaus.co/');
      await page.locator('#session').filter({ hasText: 'Session restored' }).waitFor();
      assert.equal(calls.filter(call => call.path.endsWith('/email/verify')).length, 1);
      assert.equal(calls.find(call => call.body.mode === 'login').headers['x-lythaus-auth-transport'], 'cookie-v1');
      const [cookie] = await context.cookies('https://api.lythaus.co');
      assert.equal(cookie.httpOnly, true); assert.equal(cookie.secure, true); assert.equal(cookie.sameSite, 'Strict');
      const other = await browser.newContext({ viewport, ignoreHTTPSErrors: true, serviceWorkers: 'block' });
      const otherPage = await other.newPage();
      await otherPage.goto('https://app.lythaus.co/');
      await otherPage.locator('#session').filter({ hasText: 'Sign-in required' }).waitFor();
      assert.deepEqual(errors, []);
      assert.ok(consoleErrors.every(error => error.url.startsWith('https://api.lythaus.co/') && /status of (400|401)/.test(error.text)), JSON.stringify(consoleErrors));
    });

    test(`${engine} ${viewport.width}: single password validation, reveal, back, reload and repeated submission`, async t => {
      const browser = await type.launch({ headless: true });
      t.after(() => browser.close());
      const context = await browser.newContext({ viewport });
      await context.route('https://challenges.cloudflare.com/**', route => route.abort());
      await context.addInitScript(() => {
        let options;
        window.turnstile = { render: (_target, config) => { options = config; return 'signup'; },
          execute: () => queueMicrotask(() => options.callback('local-fixture:account_signup')), reset: () => {} };
      });
      const page = await context.newPage();
      page.setDefaultTimeout(8000);
      const errors = [], requests = [];
      page.on('pageerror', error => errors.push(error.message));
      let release;
      await page.route('https://api.lythaus.co/**', async route => {
        if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204,
          headers: { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true',
            'access-control-allow-methods': 'POST,OPTIONS', 'access-control-allow-headers': 'content-type,idempotency-key,x-lythaus-auth-transport' } });
        requests.push(route.request().postDataJSON());
        await new Promise(resolve => { release = resolve; });
        const body = requests.at(-1), login = body.mode === 'login';
        await route.fulfill({ status: login ? 401 : body.mode === 'register' ? 202 : 200, contentType: 'application/json',
          headers: { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true' },
          body: JSON.stringify(login ? { error: 'invalid_credentials' } : { state: body.mode === 'register' ? 'verification_required' : 'verified' }) });
      });
      for (const [route, id, statusSelector, submitName] of [
        ['/signup', 'signup-password', '[data-signup-status]', 'Create account'],
        [`/verify-email#token=${'a'.repeat(64)}`, 'verification-password', '[data-email-verification-status]', 'Verify email and finish setup'],
        ['/sign-in', 'sign-in-password', '[data-sign-in-status]', 'Sign in'],
      ]) {
        await page.goto(origin + route);
        const password = page.locator(`#${id}`), toggle = page.locator(`button[aria-controls="${id}"]`);
        const status = page.locator(statusSelector), submit = page.locator('form.auth-form button[type="submit"]');
        assert.equal(await submit.innerText(), submitName);
        const before = requests.length;
        assert.equal(await page.locator('input[name="passwordConfirmation"]').count(), 0);
        assert.equal(await page.locator('input[name="password"]').count(), 1);
        if (id !== 'verification-password') {
          await page.locator('input[type="email"]').fill('invalid-address');
          await submit.click();
          await status.filter({ hasText: 'valid email' }).waitFor();
          assert.equal(requests.length, before);
          await page.locator('input[type="email"]').fill('synthetic@example.invalid');
        }
        for (const invalid of id === 'sign-in-password' ? [''] : ['', 'short', 'x'.repeat(129)]) {
          await password.fill(invalid);
          await submit.click();
          await status.filter({ hasText: id === 'sign-in-password' ? 'Enter your password' : '15' }).waitFor();
          assert.equal(requests.length, before);
          assert.equal(await password.getAttribute('aria-invalid'), 'true');
          assert.equal(await status.getAttribute('aria-live'), 'polite');
          assert.equal(await status.evaluate(element => element === document.activeElement), true);
        }
        const chosen = id === 'sign-in-password' ? 'historical12' : '🙂'.repeat(128);
        await password.fill(chosen);
        await password.focus();
        await page.keyboard.press('Tab');
        assert.equal(await toggle.evaluate(element => element === document.activeElement), true);
        const revealLabel = await toggle.getAttribute('aria-label');
        assert.ok(revealLabel.startsWith('Show '));
        await page.keyboard.press('Enter');
        assert.equal(await password.getAttribute('type'), 'text');
        assert.equal(await toggle.getAttribute('aria-label'), revealLabel.replace('Show ', 'Hide '));
        assert.equal(requests.length, before, 'Reveal must not submit the form');
        await page.keyboard.press('Space');
        assert.equal(await password.getAttribute('type'), 'password');
        assert.equal(await password.inputValue(), chosen);
        const bounds = await toggle.boundingBox();
        assert.ok(bounds && bounds.width >= 44 && bounds.height >= 44 && bounds.x >= 0 && bounds.x + bounds.width <= viewport.width);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
        const pending = page.waitForRequest(request => request.url().startsWith('https://api.lythaus.co/') && request.method() === 'POST');
        await submit.click();
        await pending;
        assert.equal(await submit.isDisabled(), true);
        await page.locator('form.auth-form').evaluate(form => { form.requestSubmit(); form.requestSubmit(); });
        await page.waitForTimeout(100);
        assert.equal(requests.length, before + 1, 'In-flight submission must be unique');
        assert.equal(requests.at(-1).password, chosen);
        assert.equal(Object.hasOwn(requests.at(-1), 'passwordConfirmation'), false);
        release();
        await page.locator(`${statusSelector}[data-state="${id === 'sign-in-password' ? 'error' : 'success'}"]`).waitFor();
        if (id === 'sign-in-password') assert.match(await status.innerText(), /We could not sign you in/);
        if (id !== 'sign-in-password') {
          assert.equal(await password.inputValue(), '');
          await page.locator('form.auth-form').evaluate(form => form.requestSubmit());
          assert.equal(requests.length, before + 1, 'Completed setup must not repeat');
        }
        const completed = requests.length;
        await page.goto(origin + (id === 'sign-in-password' ? '/signup' : '/sign-in'));
        await page.goBack();
        await page.reload();
        assert.equal(requests.length, completed, 'Back/reload must not send credentials or redeem proof');
        assert.equal(await page.locator('input[name="passwordConfirmation"]').count(), 0);
        assert.equal(await password.getAttribute('type'), 'password');
        assert.equal(await page.locator(`button[aria-controls="${id}"]`).count(), 1);
        if (id === 'verification-password') {
          assert.equal(await password.isVisible(), false);
          assert.equal(await submit.isDisabled(), true);
        }
        assert.equal(await page.evaluate(chosen => JSON.stringify([localStorage, sessionStorage]).includes(chosen), chosen), false);
      }
      assert.deepEqual(errors, []);
    });
  }
}

for (const [engine, type] of Object.entries({ chromium, webkit })) {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 844 }]) {
    test(`${engine} ${viewport.width}: accepted signup shows only waiting and deliberate resend actions`, async t => {
      const browser = await type.launch({ headless: true });
      t.after(() => browser.close());
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.clock.install();
      await page.route('https://challenges.cloudflare.com/**', route => route.abort());
      await page.addInitScript(() => {
        let options;
        window.turnstile = {
          render: (_target, config) => { options = config; return 'signup'; },
          execute: () => queueMicrotask(() => options.callback(`local-fixture:${options.action}`)),
          reset: () => {}, remove: () => {},
        };
      });
      const requests = [];
      await page.route('https://api.lythaus.co/**', route => {
        requests.push(route.request().postDataJSON());
        return route.fulfill({ status: 202, contentType: 'application/json',
          headers: { 'access-control-allow-origin': origin }, body: JSON.stringify({ state: 'verification_required' }) });
      });
      await page.goto(origin + '/signup');
      await page.locator('#signup-email').fill('synthetic@example.invalid');
      await page.locator('#signup-password').fill('synthetic chosen password');
      await page.getByRole('button', { name: 'Create account', exact: true }).click();
      await page.locator('[data-signup-check-email]').waitFor({ state: 'visible' });
      assert.equal(await page.locator('#signup-email').isVisible(), false);
      assert.equal(await page.locator('#signup-password').isVisible(), false);
      assert.equal(await page.locator('#signup-password-confirmation').count(), 0);
      assert.equal(await page.locator('[data-signup-submit]').isVisible(), false);
      assert.equal(await page.locator('#signup-password').inputValue(), '');
      if (process.env.AUTH_QA_DIR) {
        await mkdir(process.env.AUTH_QA_DIR, { recursive: true });
        await page.screenshot({ path: path.join(process.env.AUTH_QA_DIR, `${engine}-${viewport.width}-signup-waiting.png`) });
      }
      const resend = page.getByRole('button', { name: 'Resend verification email', exact: true });
      assert.equal(await resend.isDisabled(), true);
      await page.locator('form').evaluate(form => form.requestSubmit());
      assert.equal(requests.length, 1);
      await page.clock.fastForward(29_000);
      assert.equal(await resend.isDisabled(), true);
      await page.clock.fastForward(2_000);
      assert.equal(await resend.isEnabled(), true);
      assert.equal(await page.locator('#signup-turnstile').isVisible(), true, 'Resend must retain a visible interactive challenge container');
      await resend.click();
      await page.locator('[data-signup-status]').filter({ hasText: 'delivery is not confirmed yet' }).waitFor();
      assert.deepEqual(requests[1], { mode: 'resend_verification', email: 'synthetic@example.invalid', turnstileToken: 'local-fixture:verification_resend' });
      assert.equal(await resend.isDisabled(), true);
      assert.equal(await page.locator('#signup-password').isVisible(), false);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      assert.deepEqual(errors, []);
    });

    test(`${engine} ${viewport.width}: verification leads to same-site sign-in and app cookie restoration`, async t => {
      const requests = [];
      let session = false;
      let interruptedVerification = false;
      const fixture = await localAuthBrowserServer(async route => {
        const request = route.request(), url = new URL(request.url());
        if (url.hostname === 'lythaus.co') {
          let file = path.resolve(dist, '.' + url.pathname);
          assert.ok(file === dist || file.startsWith(dist + path.sep));
          if (!path.extname(file)) file = path.join(file, 'index.html');
          const contentType = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.png': 'image/png', '.ico': 'image/x-icon' }[path.extname(file)] ?? 'application/octet-stream';
          try { return route.fulfill({ contentType, body: await readFile(file) }); }
          catch { return route.fulfill({ status: 404, body: 'Local fixture missing' }); }
        }
        if (url.hostname === 'app.lythaus.co') {
          return route.fulfill({ contentType: 'text/html', body: `<title>Local cookie handoff fixture</title><main id="session">Restoring session</main><script>fetch('https://api.lythaus.co/api/auth/refresh',{method:'POST',credentials:'include',headers:{'content-type':'application/json','x-lythaus-auth-transport':'cookie-v1'},body:'{}'}).then(r=>{document.querySelector('#session').textContent=r.ok?'Session restored':'Sign-in required';});</script>` });
        }
        if (url.hostname !== 'api.lythaus.co') return route.abort();
        const requestHeaders = await request.allHeaders();
        const headers = { 'access-control-allow-origin': requestHeaders.origin ?? 'https://lythaus.co',
          'access-control-allow-credentials': 'true', 'access-control-allow-methods': 'POST,OPTIONS',
          'access-control-allow-headers': 'content-type,idempotency-key,x-lythaus-auth-transport' };
        if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
        const body = request.postDataJSON();
        requests.push({ path: url.pathname, body, transport: requestHeaders['x-lythaus-auth-transport'], idempotencyKey: requestHeaders['idempotency-key'], hasCookie: requestHeaders.cookie?.includes('__Host-lythaus_refresh=') ?? false });
        if (url.pathname.endsWith('/email/verify')) {
          const expired = body.token === 'b'.repeat(64);
          if (!expired && !interruptedVerification) {
            interruptedVerification = true;
            return route.fulfill({ status: 502, contentType: 'application/json', headers, body: JSON.stringify({ error: 'request_failed' }) });
          }
          return route.fulfill({ status: expired ? 400 : 200, contentType: 'application/json', headers,
            body: JSON.stringify(expired ? { error: 'verification_token_invalid' } : { state: 'verified' }) });
        }
        if (url.pathname.endsWith('/email') && body.mode === 'login') {
          session = true;
          headers['set-cookie'] = `__Host-lythaus_refresh=${'f'.repeat(48)}; Path=/; HttpOnly; Secure; SameSite=Strict`;
          return route.fulfill({ contentType: 'application/json', headers, body: JSON.stringify({ accessToken: 'synthetic-only', sessionTransport: 'cookie-v1', expiresIn: 900 }) });
        }
        assert.equal(url.pathname, '/api/auth/refresh');
        return route.fulfill({ status: session && requestHeaders.cookie?.includes('__Host-lythaus_refresh=') ? 200 : 401,
          contentType: 'application/json', headers, body: JSON.stringify({ accessToken: 'synthetic-refreshed', sessionTransport: 'cookie-v1' }) });
      });
      t.after(() => fixture.close());
      const browser = await type.launch({ headless: true, proxy: { server: fixture.proxy } });
      t.after(() => browser.close());
      const context = await browser.newContext({ viewport, ignoreHTTPSErrors: true, serviceWorkers: 'block' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const token = 'a'.repeat(64);
      await page.goto(`https://lythaus.co/verify-email#token=${'b'.repeat(64)}`);
      await page.waitForURL('https://lythaus.co/verify-email');
      assert.equal(requests.length, 0, 'GET must not redeem a verification link');
      await page.locator('#verification-password').fill('synthetic chosen password');
      await page.getByRole('button', { name: 'Verify email and finish setup', exact: true }).click();
      await page.locator('[data-email-verification-status]').filter({ hasText: 'already used' }).waitFor();
      assert.equal(await page.locator('#verification-password').isVisible(), false);
      assert.equal(await page.locator('#verification-password').inputValue(), '');
      assert.equal(await page.locator('#verification-password-confirmation').count(), 0);
      const beforeReplacement = requests.length;
      await page.evaluate(token => { window.location.hash = new URLSearchParams({ token }).toString(); }, token);
      await page.waitForURL('https://lythaus.co/verify-email');
      await page.locator('#verification-password').waitFor({ state: 'visible' });
      assert.equal(requests.length, beforeReplacement, 'Opening a replacement link must not redeem it');
      await page.locator('#verification-password').fill('synthetic chosen password');
      await page.getByRole('button', { name: 'Verify email and finish setup', exact: true }).click();
      await page.locator('[data-email-verification-status][data-state="error"]').waitFor();
      assert.equal(await page.locator('#verification-password').isVisible(), true, 'An uncertain result keeps deliberate retry available');
      assert.equal(await page.locator('#verification-password').inputValue(), 'synthetic chosen password');
      assert.equal(requests.length, 2, 'An uncertain response must not automatically retry');
      await page.getByRole('button', { name: 'Verify email and finish setup', exact: true }).click();
      const signIn = page.locator('[data-email-verification-signin]');
      await signIn.waitFor({ state: 'visible' });
      assert.equal(await signIn.getAttribute('href'), '/sign-in');
      assert.equal(await page.locator('#verification-password').inputValue(), '');
      assert.equal(await page.locator('#verification-password').isVisible(), false);
      assert.equal(await page.locator('#verification-password-confirmation').count(), 0);
      const signInBounds = await signIn.boundingBox();
      assert.ok(signInBounds && signInBounds.y >= 0 && signInBounds.y + signInBounds.height <= viewport.height, 'Completed verification must show sign-in within the viewport');
      assert.equal(requests[1].idempotencyKey, undefined, 'Mailbox-proof setup does not use intake idempotency');
      assert.equal(requests[2].idempotencyKey, undefined);
      assert.deepEqual(requests[1].body, requests[2].body, 'Deliberate retry carries the same mailbox proof and chosen password');
      assert.equal((await context.cookies('https://api.lythaus.co')).length, 0, 'Verification must not create a session');
      if (process.env.AUTH_QA_DIR) {
        await mkdir(process.env.AUTH_QA_DIR, { recursive: true });
        await page.screenshot({ path: path.join(process.env.AUTH_QA_DIR, `${engine}-${viewport.width}-verified-signin.png`) });
      }
      await signIn.click();
      await page.waitForURL('https://lythaus.co/sign-in');
      await page.locator('#sign-in-email').fill('synthetic@example.invalid');
      await page.locator('#sign-in-password').fill('synthetic chosen password');
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await page.waitForURL('https://app.lythaus.co/');
      await page.locator('#session').filter({ hasText: 'Session restored' }).waitFor();
      assert.equal(requests.find(request => request.body.mode === 'login').transport, 'cookie-v1');
      assert.equal(requests.find(request => request.path.endsWith('/auth/refresh')).hasCookie, true);
      assert.equal(page.url().includes(token), false);
      const [cookie] = await context.cookies('https://api.lythaus.co');
      assert.equal(cookie.httpOnly, true);
      assert.equal(cookie.secure, true);
      assert.equal(cookie.sameSite, 'Strict');
      const otherBrowser = await browser.newContext({ viewport, ignoreHTTPSErrors: true });
      const otherPage = await otherBrowser.newPage();
      await otherPage.goto('https://app.lythaus.co/');
      await otherPage.locator('#session').filter({ hasText: 'Sign-in required' }).waitFor();
      assert.equal(requests.at(-1).hasCookie, false, 'Another browser must not inherit the owner session');
      assert.deepEqual(errors, []);
    });
  }
}

for (const [engine, type] of Object.entries({ chromium, webkit })) {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }, { width: 320, height: 844 }]) {
    test(`${engine} ${viewport.width}: screening outage exposes only a safe support reference`, async t => {
      const browser = await type.launch({ headless: true });
      t.after(() => browser.close());
      const page = await browser.newPage({ viewport });
      page.setDefaultTimeout(8000);
      await page.route('https://challenges.cloudflare.com/**', route => route.abort());
      await page.addInitScript(() => {
        let options;
        window.turnstile = {
          render: (_target, config) => { options = config; return 'signup'; },
          execute: () => queueMicrotask(() => options.callback('local-fixture:account_signup')),
          reset: () => {},
        };
      });
      let requests = 0, reference = '3b8a5c5c-07c8-4b55-a0a5-7a66235648cc', headerReference;
      await page.route('https://api.lythaus.co/**', route => {
        requests += 1;
        return route.fulfill({ status: 503, contentType: 'application/json',
          headers: { 'access-control-allow-origin': origin, 'access-control-expose-headers': 'x-correlation-id', ...(headerReference ? { 'x-correlation-id': headerReference } : {}) },
          body: JSON.stringify({ error: 'password_screening_unavailable', ...(reference ? { correlationId: reference } : {}) }),
        });
      });
      await page.goto(origin + '/signup');
      await page.locator('#signup-email').fill('synthetic@example.invalid');
      await page.locator('#signup-password').fill('synthetic chosen password');
      const submit = page.getByRole('button', { name: 'Create account', exact: true });
      const status = page.locator('[data-signup-status]');
      const attempt = async () => {
        await submit.click();
        await status.filter({ hasText: 'We cannot safely check new passwords right now.' }).waitFor();
        assert.equal(await submit.isEnabled(), true);
        assert.equal(await submit.getAttribute('aria-busy'), 'false');
        assert.equal(await page.locator('[data-signup-check-email]').isVisible(), false);
        assert.equal(await page.locator('#signup-password').getAttribute('aria-invalid'), null);
      };
      await attempt();
      assert.match(await status.innerText(), /Reference: 3b8a5c5c-07c8-4b55-a0a5-7a66235648cc\./);
      assert.equal(requests, 1, 'The error must not automatically retry the request');
      for (const unsafe of ['synthetic@example.invalid', 'synthetic chosen password', '<script>unsafe</script>']) {
        reference = unsafe;
        await attempt();
        assert.doesNotMatch(await status.innerText(), /Reference:|synthetic|<script>/);
      }
      reference = undefined;
      headerReference = '57b98e96-7109-4a9b-a716-77ca7c5fc8dd';
      await attempt();
      assert.match(await status.innerText(), /Reference: 57b98e96-7109-4a9b-a716-77ca7c5fc8dd\./);
      headerReference = 'synthetic@example.invalid';
      await attempt();
      assert.doesNotMatch(await status.innerText(), /Reference:|synthetic/);
    });

    test(`${engine} ${viewport.width}: resend cooldown expiry and failure recovery`, async t => {
      const browser = await type.launch({ headless: true });
      t.after(() => browser.close());
      const page = await browser.newPage({ viewport });
      page.setDefaultTimeout(8000);
      await page.clock.install();
      await page.route('https://challenges.cloudflare.com/**', route => route.abort());
      await page.addInitScript(() => {
        let options;
        const fixture = window.resendChallenge = { mode: 'pending', executions: 0, resets: 0,
          complete: () => options.callback(`local-fixture:${options.action}:${fixture.executions}`) };
        window.turnstile = {
          render: (_target, config) => { options = config; return 'resend'; },
          execute: () => {
            fixture.executions += 1;
            if (fixture.mode === 'success') queueMicrotask(fixture.complete);
            if (fixture.mode === 'error') queueMicrotask(() => options['error-callback']());
            if (fixture.mode === 'expired') queueMicrotask(() => options['expired-callback']());
          },
          reset: () => { fixture.resets += 1; },
        };
      });
      const requests = [], failures = [];
      page.on('pageerror', error => failures.push(error.message));
      let responseMode = 'hold', receiveFirst;
      const firstRoute = new Promise(resolve => { receiveFirst = resolve; });
      const reply = (route, status = 202, body = { state: 'verification_required' }) => route.fulfill({
        status, contentType: 'application/json', headers: { 'access-control-allow-origin': origin }, body: JSON.stringify(body),
      });
      await page.route('https://api.lythaus.co/**', async route => {
        requests.push({ url: route.request().url(), body: route.request().postDataJSON(), headers: route.request().headers() });
        if (responseMode === 'hold') { receiveFirst(route); return; }
        if (responseMode === 'timeout') return;
        if (responseMode === 'rejected') return reply(route, 429, { error: 'rate_limit_exceeded' });
        if (responseMode === 'network') return route.abort('failed');
        return reply(route);
      });
      await page.goto(origin + '/resend-verification');
      if (viewport.width === 320) await page.addStyleTag({ content: 'html { font-size: 200%; }' });
      const submit = page.getByRole('button', { name: 'Resend verification email', exact: true });
      const status = page.locator('[data-verification-status]');
      await page.getByLabel('Email address', { exact: true }).fill('synthetic@example.invalid');
      await submit.click();
      const button = page.locator('[data-verification-submit]');
      assert.equal(await button.isDisabled(), true);
      assert.equal(await button.getAttribute('aria-busy'), 'true');
      await page.locator('form').evaluate(form => form.requestSubmit());
      assert.equal(await page.evaluate(() => window.resendChallenge.executions), 1, 'Duplicate submission must not request another challenge');
      await page.clock.fastForward(31_000);
      assert.equal(await button.isDisabled(), true, 'An outstanding challenge keeps submission disabled');
      assert.equal(requests.length, 0);
      await page.evaluate(() => window.resendChallenge.complete());
      const pendingRequest = await firstRoute;
      assert.equal(await button.isDisabled(), true, 'An outstanding API request keeps submission disabled');
      await reply(pendingRequest);
      await status.filter({ hasText: 'delivery is not confirmed yet' }).waitFor();
      assert.equal(await button.isDisabled(), true);
      assert.equal(await button.getAttribute('aria-busy'), 'false');
      assert.equal(await status.evaluate(element => element === document.activeElement), true);
      assert.equal(requests[0].url, 'https://api.lythaus.co/api/auth/email');
      assert.equal(requests[0].body.mode, 'resend_verification');
      assert.ok(requests[0].headers['idempotency-key']);
      assert.equal(requests[0].headers.referer, undefined);
      await page.clock.fastForward(29_000);
      assert.equal(await button.isDisabled(), true, 'The cooldown remains enforced before expiry');
      await page.clock.fastForward(2_000);
      assert.equal(await button.isEnabled(), true, 'Cooldown expiry must restore resend eligibility');
      assert.equal(await page.locator('[data-verification-cooldown]').innerText(), '');

      responseMode = 'success';
      await submit.click();
      await page.clock.fastForward(31_000);
      assert.equal(await button.isDisabled(), true, 'An expired timer must not enable the next pending challenge');
      await page.evaluate(() => window.resendChallenge.complete());
      await status.filter({ hasText: 'delivery is not confirmed yet' }).waitFor();
      assert.equal(requests.length, 2);
      assert.notEqual(requests[1].body.turnstileToken, requests[0].body.turnstileToken, 'A second request needs a fresh challenge');
      assert.notEqual(requests[1].headers['idempotency-key'], requests[0].headers['idempotency-key']);
      assert.equal(await page.evaluate(() => window.resendChallenge.resets), 2);
      await page.clock.fastForward(31_000);

      await page.evaluate(() => { window.resendChallenge.mode = 'success'; });
      for (const mode of ['rejected', 'network', 'timeout']) {
        responseMode = mode;
        const pending = mode === 'timeout' ? page.waitForRequest('https://api.lythaus.co/api/auth/email') : undefined;
        await submit.click();
        if (pending) {
          await pending;
          await page.clock.fastForward(20_001);
        }
        await page.locator('[data-verification-status][data-state="error"]').waitFor();
        assert.equal(await button.isEnabled(), true);
        assert.equal(await button.getAttribute('aria-busy'), 'false');
        assert.match(await status.innerText(), mode === 'rejected' ? /Too many requests/ : mode === 'timeout' ? /took too long/ : /could not send/);
      }
      const beforeChallengeFailures = requests.length;
      for (const mode of ['error', 'expired', 'pending']) {
        await page.evaluate(mode => { window.resendChallenge.mode = mode; }, mode);
        await submit.click();
        if (mode === 'pending') {
          assert.equal(await button.isDisabled(), true);
          await page.clock.fastForward(120_001);
        }
        await page.locator('[data-verification-status][data-state="error"]').waitFor();
        assert.equal(await button.isEnabled(), true);
        assert.match(await status.innerText(), mode === 'pending' ? /took too long/ : /could not verify/);
        assert.equal(requests.length, beforeChallengeFailures, 'Failed challenges must not reach the API');
      }
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      assert.deepEqual(failures, []);
    });

    test(`${engine} ${viewport.width}: password toggle accessible action follows visibility`, async t => {
      const browser = await type.launch({ headless: true });
      t.after(() => browser.close());
      const page = await browser.newPage({ viewport });
      page.setDefaultTimeout(8000);
      await page.route('https://challenges.cloudflare.com/**', route => route.abort());
      const token = 'a'.repeat(64);
      for (const [route, fields] of [
        ['/sign-in', [['sign-in-password', 'password', 'current-password']]],
        ['/signup', [['signup-password', 'password', 'new-password']]],
        [`/reset-password#token=${token}`, [['new-password', 'new password', 'new-password'], ['new-password-confirmation', 'confirm new password', 'new-password']]],
        [`/verify-email#token=${token}`, [['verification-password', 'set your password', 'new-password']]],
      ]) {
        await page.goto(origin + route);
        if (viewport.width === 320) await page.addStyleTag({ content: 'html { font-size: 200%; }' });
        for (const [id, label, autocomplete] of fields) {
          const input = page.locator(`#${id}`);
          const toggle = page.locator(`button[aria-controls="${id}"]`);
          await input.fill('synthetic chosen password');
          await input.focus();
          await page.keyboard.press('Tab');
          assert.equal(await toggle.evaluate(element => element === document.activeElement), true);
          assert.equal(await toggle.getAttribute('aria-label'), `Show ${label}`);
          assert.equal(await toggle.getAttribute('aria-pressed'), null);
          await page.keyboard.press('Enter');
          assert.equal(await input.getAttribute('type'), 'text');
          assert.equal(await toggle.getAttribute('aria-label'), `Hide ${label}`);
          assert.equal(await toggle.getAttribute('aria-pressed'), null);
          assert.equal(await toggle.innerText(), 'Hide');
          assert.equal(await toggle.evaluate(element => element === document.activeElement), true);
          await page.keyboard.press('Space');
          assert.equal(await input.getAttribute('type'), 'password');
          assert.equal(await toggle.getAttribute('aria-label'), `Show ${label}`);
          assert.equal(await toggle.getAttribute('aria-pressed'), null);
          assert.equal(await input.getAttribute('autocomplete'), autocomplete);
          assert.equal(await input.inputValue(), 'synthetic chosen password');
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
      }
    });
  }
}

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
    const before=requests.length;
    await page.getByRole('button',{name:'Create account',exact:true}).click();
    await page.locator('[data-signup-status]').filter({hasText:'15'}).waitFor();
    assert.equal(requests.length,before);
    await page.locator('#signup-password').fill('🙂'.repeat(15));
    await page.getByRole('button',{name:'Create account',exact:true}).click();
    await page.locator('[data-signup-check-email]').waitFor({state:'visible'});
    assert.equal(requests.at(-1).body.password,'🙂'.repeat(15));
    const token='a'.repeat(64);
    const beforeGet=requests.length;
    await navigate(`/verify-email#token=${token}`,'Confirm your email');
    await page.waitForURL(origin+'/verify-email');
    assert.equal(requests.length,beforeGet,'Opening an email must not redeem it');
    await page.locator('input[name=password]').fill('synthetic chosen password');
    await page.locator('button[type=submit]').click();
    await page.locator('[data-email-verification-status]').filter({hasText:'verified'}).waitFor();
    await navigate(`/verify-email#token=${token}`,'Confirm your email');
    await page.locator('input[name=password]').fill('synthetic chosen password');
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
