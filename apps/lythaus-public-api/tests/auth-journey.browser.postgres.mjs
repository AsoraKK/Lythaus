import assert from 'node:assert/strict';
import { after, mock, test } from 'node:test';
import { randomBytes } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { chromium, webkit } from 'playwright';
import { exportJWK, exportPKCS8, generateKeyPair } from 'jose';
import * as database from '@lythaus/db';
import * as telemetry from '@lythaus/observability';
import { hmacLookup, uuidv7 } from '@lythaus/security';
import { localAuthBrowserServer } from '../../../scripts/tests/local-auth-browser-server.mjs';

const connectionString = process.env.PLANETSCALE_PG17_TEST_DATABASE_URL;
const target = new URL(connectionString ?? 'file:///missing');
if (!['localhost', '127.0.0.1'].includes(target.hostname) || !target.pathname.startsWith('/lythaus_auth_test')) {
  throw new Error('Browser auth tests require an explicitly local disposable PostgreSQL database');
}
const web = path.resolve(process.env.AUTH_WEB_ARTIFACT_DIR ?? 'build/web');
const marketing = path.resolve('apps/marketing-site/dist');
await readFile(path.join(web, 'flutter_bootstrap.js'));
await readFile(path.join(marketing, 'signup/index.html'));
async function withClient(work, role) {
  const client = new pg.Client({ connectionString, ssl: false, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    await client.query("SET statement_timeout='5s'");
    if (role) {
      assert.ok(['lythaus_runtime', 'lythaus_jobs'].includes(role));
      await client.query(`SET ROLE ${role}`);
    }
    return await work(client);
  } finally { await client.end(); }
}
const sql = (text, values) => withClient(client => client.query(text, values));
mock.module('@lythaus/db', { namedExports: { ...database,
  query: (binding, text, values) => withClient(client => client.query(text, values), binding.role),
  transaction: (binding, work) => withClient(async client => {
    await client.query('BEGIN');
    try { const result = await work(client); await client.query('COMMIT'); return result; }
    catch (error) { await client.query('ROLLBACK'); throw error; }
  }, binding.role),
} });
const logs = [];
mock.module('@lythaus/observability', { namedExports: { ...telemetry, logEvent: event => logs.push(event) } });
const { default: worker } = await import('../src/index.ts');
const { relayTransactionalEmailOutbox } = await import('../../lythaus-jobs/src/transactional-email-runtime.ts');
const { privateKey, publicKey } = await generateKeyPair('ES256', { extractable: true });
const keyId = 'synthetic-browser-fixture';
const publicJwk = { ...await exportJWK(publicKey), kid: keyId, use: 'sig', alg: 'ES256' };
const realFetch = globalThis.fetch;
after(() => { globalThis.fetch = realFetch; });
globalThis.fetch = async (url, init) => {
  if (String(url).startsWith('https://api.pwnedpasswords.com/range/')) return new Response(`${'0'.repeat(35)}:0`);
  if (String(url) === 'https://challenges.cloudflare.com/turnstile/v0/siteverify') {
    const input = JSON.parse(init.body);
    return Response.json({ success: true, hostname: 'lythaus.co', action: input.response });
  }
  throw new Error('External network is prohibited in local browser auth fixtures');
};
const mime = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.json':'application/json',
  '.wasm':'application/wasm', '.ttf':'font/ttf', '.otf':'font/otf', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon' };
async function serveArtifact(route, root) {
  const pathname = new URL(route.request().url()).pathname;
  let file = path.resolve(root, '.' + pathname);
  assert.ok(file === root || file.startsWith(root + path.sep));
  if (!path.extname(file)) file = path.join(file, 'index.html');
  try { await route.fulfill({ contentType:mime[path.extname(file)] ?? 'application/octet-stream', body:await readFile(file) }); }
  catch { await route.fulfill({ status:404, body:'Missing local artifact' }); }
}
function messageToken(message) {
  const link = new URL(message.text.match(/https:\/\/\S+/)[0]);
  assert.equal(link.search, '');
  return new URLSearchParams(link.hash.slice(1)).get('token');
}

for (const [engineName, engine] of Object.entries({ chromium, webkit })) for (const width of [1440, 390]) {
  test(`${engineName} ${width}: real browser, API handler and PG17 signup, recovery and cookie handoff`, async t => {
    const mailbox = [], calls = [], errors = [], consoleErrors = [];
    const email = `browser-${uuidv7()}@example.invalid`;
    const password = 'synthetic mailbox owner passphrase';
    const nextPassword = 'synthetic changed mailbox passphrase';
    const fixtureIp = `2001:db8::${randomBytes(2).toString('hex')}`;
    const env = {
      ENVIRONMENT:'local', EXPECTED_HOSTNAMES:'api.lythaus.co',
      CORS_ALLOWED_ORIGINS:'https://lythaus.co,https://app.lythaus.co',
      WORKER_VERSION:{ id:uuidv7(), tag:'synthetic-local-browser' },
      DB_APP_FRESH:{ role:'lythaus_runtime' }, DB_JOBS_FRESH:{ role:'lythaus_jobs' },
      AUTH_PASSWORD_PEPPER_V1:randomBytes(32).toString('base64'),
      PII_ENCRYPTION_KEY_V1:randomBytes(32).toString('base64'), PII_HMAC_KEY_V1:randomBytes(32).toString('base64'),
      TRANSACTIONAL_EMAIL_ENCRYPTION_KEY_V1:randomBytes(32).toString('base64'),
      JWT_KEY_ID:keyId, JWT_PRIVATE_KEY:await exportPKCS8(privateKey), JWT_PUBLIC_JWKS:JSON.stringify({ keys:[publicJwk] }),
      TURNSTILE_REQUIRED:'true', TURNSTILE_SECRET_KEY:'synthetic-only', TURNSTILE_EXPECTED_HOSTNAMES:'lythaus.co',
      EMAIL_PROVIDER_MODE:'cloudflare', EMAIL_FROM:'no-reply@mail.lythaus.co',
      EMAIL_VERIFICATION_BASE_URL:'https://lythaus.co/verify-email?token=',
      EMAIL_PASSWORD_RESET_BASE_URL:'https://lythaus.co/reset-password?token=',
      EMAIL:{ send:async message => { const messageId=`synthetic-${uuidv7()}`; mailbox.push({ ...message,messageId }); return { messageId }; } },
    };
    let interruptRegistration = true, interruptRecovery = true, refreshInFlight = 0, maximumRefreshInFlight = 0;
    const fixture = await localAuthBrowserServer(async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.hostname === 'lythaus.co') return serveArtifact(route, marketing);
      if (url.hostname === 'app.lythaus.co') return serveArtifact(route, web);
      if (url.hostname !== 'api.lythaus.co') return route.abort();
      const headers = new Headers(await req.allHeaders());
      headers.set('cf-connecting-ip', fixtureIp);
      const isRefresh = req.method() === 'POST' && url.pathname.endsWith('/auth/refresh');
      if (isRefresh) { refreshInFlight++; maximumRefreshInFlight=Math.max(maximumRefreshInFlight,refreshInFlight); }
      let response;
      try {
        if (isRefresh) await new Promise(resolve => setTimeout(resolve,75));
        response = await worker.fetch(new Request(req.url(), { method:req.method(), headers,
          ...(!['GET','HEAD'].includes(req.method()) ? { body:req.postData() } : {}) }), env);
      } finally { if (isRefresh) refreshInFlight--; }
      const body = await response.text();
      const record = { path:url.pathname, method:req.method(), status:response.status,
        idempotencyKey:headers.get('idempotency-key'), cookiePresent:headers.has('cookie') };
      if (url.pathname.endsWith('/password/reset/request') && req.method()==='POST') record.supportReference=JSON.parse(body).correlationId;
      calls.push(record);
      if (req.method() === 'POST' && url.pathname.endsWith('/auth/email') && req.postDataJSON().mode === 'register' && interruptRegistration) {
        interruptRegistration=false;
        assert.equal(response.status,202,'Only interrupt after the real registration committed');
        return route.fulfill({ status:502, headers:Object.fromEntries(response.headers), contentType:'text/html', body:'Synthetic interrupted response' });
      }
      if (req.method() === 'POST' && url.pathname.endsWith('/password/reset/request') && interruptRecovery) {
        interruptRecovery=false;
        assert.equal(response.status,202,'Only interrupt after the real recovery committed');
        return route.abort();
      }
      return route.fulfill({ status:response.status, headers:Object.fromEntries(response.headers), body });
    });
    let browser, page, finished=false;
    t.after(async () => {
      try {
        if (!finished && page && !page.isClosed()) t.diagnostic(JSON.stringify({ calls,errors,consoleErrors,screen:await page.locator('flt-semantics,main').allTextContents() }));
      } finally { if (browser) await browser.close(); await fixture.close(); }
    });
    browser = await engine.launch({ headless:true, proxy:{ server:fixture.proxy },
      ...(engineName==='webkit' && process.env.WEBKIT_EXECUTABLE ? { executablePath:process.env.WEBKIT_EXECUTABLE } : {}) });
    const context = await browser.newContext({ viewport:{ width,height:1000 }, serviceWorkers:'block', ignoreHTTPSErrors:true });
    context.on('page',targetPage=>{
      targetPage.on('pageerror',error=>errors.push(error.message));
      targetPage.on('console',message=>{
        if(message.type()==='error') {
          let source;
          try { const url=new URL(message.location().url); source=url.origin+url.pathname; } catch { source='inline'; }
          consoleErrors.push({source,message:message.text()});
        }
      });
    });
    await context.addInitScript(() => {
      const widgets=new Map(); let sequence=0;
      window.turnstile={ render:(_target,options)=>{ const id=sequence++; widgets.set(id,options); return id; },
        execute:id=>queueMicrotask(()=>widgets.get(id).callback(widgets.get(id).action)),reset:()=>{},remove:id=>widgets.delete(id) };
    });
    page = await context.newPage(); page.setDefaultTimeout(15000);
    const navigate = async (pathname,title) => {
      await page.goto('https://lythaus.co'+pathname);
      assert.ok((await page.title()).includes(title));
      assert.ok(await page.locator('main').innerText());
      assert.equal(await page.locator('astro-error-overlay,vite-error-overlay').count(),0);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    };
    const fillSignup = async () => {
      await page.locator('#signup-email').fill(email);
      await page.locator('#signup-password').fill(password);
      await page.locator('#signup-password-confirmation').fill(password);
    };
    await navigate('/signup','Create your account');
    await fillSignup();
    await page.getByRole('button',{ name:'Create account',exact:true }).click();
    await page.locator('[data-signup-status]').filter({ hasText:'unexpected response' }).waitFor();
    await page.getByRole('button',{ name:'Create account',exact:true }).click();
    await page.locator('[data-signup-check-email]').waitFor({ state:'visible' });
    const registration = calls.filter(call=>call.path.endsWith('/auth/email') && call.method==='POST');
    assert.equal(registration.length,2);
    assert.ok(registration[0].idempotencyKey);
    assert.equal(registration[0].idempotencyKey,registration[1].idempotencyKey);
    const lookup=hmacLookup(email,env.PII_HMAC_KEY_V1);
    const rows=(await sql("SELECT user_id FROM identity.email_credentials WHERE email_lookup_hmac=decode($1,'base64')",[lookup])).rows;
    assert.equal(rows.length,1);
    const userId=rows[0].user_id;
    assert.equal((await sql('SELECT count(*)::int n FROM system.transactional_email_outbox WHERE contact_email_user_id=$1',[userId])).rows[0].n,1);
    await fillSignup();
    await page.getByRole('button',{ name:'Create account',exact:true }).click();
    await page.locator('[data-signup-status]').filter({ hasText:'accepted' }).waitFor();
    assert.equal((await sql('SELECT count(*)::int n FROM identity.email_verification_tokens WHERE user_id=$1',[userId])).rows[0].n,1);
    await relayTransactionalEmailOutbox(env);
    const verification=mailbox.find(message=>message.to===email && message.subject.includes('Verify'));
    assert.ok(verification);
    const verifyToken=messageToken(verification);
    await navigate(`/verify-email#token=${verifyToken}`,'Confirm your email');
    assert.equal(new URL(page.url()).hash,'');
    await page.locator('input[name=password]').fill(password);
    await page.locator('input[name=passwordConfirmation]').fill(password);
    await page.locator('button[type=submit]').click();
    await page.locator('[data-email-verification-status]').filter({ hasText:'verified' }).waitFor();
    await navigate(`/verify-email#token=${verifyToken}`,'Confirm your email');
    await page.locator('input[name=password]').fill(password);
    await page.locator('input[name=passwordConfirmation]').fill(password);
    await page.locator('button[type=submit]').click();
    await page.locator('[data-email-verification-status]').filter({ hasText:'already used' }).waitFor();
    const enableFlutter = async targetPage => {
      await targetPage.locator('flt-semantics-placeholder').waitFor({ timeout:60000 });
      await targetPage.locator('flt-semantics-placeholder').evaluate(node=>node.click());
    };
    const signIn = async value => {
      await navigate('/sign-in','Sign in');
      await page.locator('#sign-in-email').fill(email);
      await page.locator('#sign-in-password').fill(value);
      await page.getByRole('button',{ name:'Sign in',exact:true }).click();
    };
    const openApp = async targetPage => { await targetPage.goto('https://app.lythaus.co'); await enableFlutter(targetPage); };
    await signIn(password);
    await page.waitForURL('https://app.lythaus.co/');
    await enableFlutter(page);
    await page.getByText('No posts yet',{ exact:true }).waitFor({ timeout:60000 });
    if (process.env.AUTH_QA_DIR) {
      await mkdir(process.env.AUTH_QA_DIR,{ recursive:true });
      await page.screenshot({ path:path.join(process.env.AUTH_QA_DIR,`real-handler-${engineName}-${width}-signed-in.png`) });
    }
    const cookies=await context.cookies('https://api.lythaus.co');
    assert.ok(cookies.some(cookie=>cookie.name==='__Host-lythaus_refresh' && cookie.httpOnly && cookie.secure && cookie.sameSite==='Strict'));
    assert.ok(calls.some(call=>call.path.endsWith('/auth/refresh') && call.cookiePresent && call.status===200));
    assert.ok(!(await page.evaluate(()=>Object.keys(localStorage))).some(key=>/^(jwt|refreshToken|userData)$/.test(key)));
    const secondTab=await context.newPage(); secondTab.setDefaultTimeout(30000);
    await Promise.all([openApp(page),openApp(secondTab)]);
    await Promise.all([page.getByText('No posts yet',{ exact:true }).waitFor(),secondTab.getByText('No posts yet',{ exact:true }).waitFor()]);
    assert.equal(maximumRefreshInFlight,1,'Real rotating cookies must survive concurrent tab restoration');
    await navigate('/forgot-password','Reset your password');
    await page.locator('#reset-email').fill(email);
    await page.getByRole('button',{ name:'Send reset link',exact:true }).click();
    await page.waitForFunction(()=>['error','success'].includes(document.querySelector('[data-reset-status]')?.dataset.state));
    if (await page.locator('[data-reset-status]').getAttribute('data-state')==='error') {
      await page.getByRole('button',{ name:'Send reset link',exact:true }).click();
    }
    await page.locator('[data-reset-status]').filter({ hasText:'accepted' }).waitFor();
    const recovery=calls.filter(call=>call.path.endsWith('/password/reset/request') && call.method==='POST');
    assert.ok(recovery.length>=2,'Transport or user retry must replay the interrupted recovery');
    assert.equal(recovery[0].idempotencyKey,recovery.at(-1).idempotencyKey);
    assert.equal(recovery[0].supportReference,recovery.at(-1).supportReference);
    assert.equal((await sql('SELECT count(*)::int n FROM identity.password_reset_tokens WHERE user_id=$1',[userId])).rows[0].n,1);
    assert.match(await page.locator('[data-reset-status]').innerText(),/Support reference: [0-9a-f-]{36}/);
    await relayTransactionalEmailOutbox(env);
    const reset=mailbox.find(message=>message.to===email && message.subject.includes('Reset'));
    assert.ok(reset);
    await navigate(`/reset-password#token=${messageToken(reset)}`,'Choose a new password');
    await page.locator('#new-password').fill(nextPassword);
    await page.locator('#new-password-confirmation').fill(nextPassword);
    await page.getByRole('button',{ name:'Set new password',exact:true }).click();
    await page.locator('[data-reset-status]').filter({ hasText:'signed out' }).waitFor();
    await openApp(secondTab);
    await secondTab.getByRole('button',{ name:'Sign in with email',exact:true }).waitFor();
    await signIn(password);
    await page.locator('[data-sign-in-status][data-state=error]').waitFor();
    await signIn(nextPassword);
    await page.waitForURL('https://app.lythaus.co/');
    await enableFlutter(page);
    await page.getByText('No posts yet',{ exact:true }).waitFor();
    if (width<700) await page.getByRole('button',{ name:/^Profile(?:\b|$)/ }).click();
    await page.getByRole('button',{ name:'Settings',exact:true }).click();
    await page.getByText('Account security',{ exact:true }).click();
    await page.getByRole('button',{ name:'Sign out of all sessions',exact:true }).click();
    await page.getByRole('button',{ name:'Sign in with email',exact:true }).waitFor();
    await openApp(page);
    await page.getByRole('button',{ name:'Sign in with email',exact:true }).waitFor();
    assert.equal((await context.cookies('https://api.lythaus.co')).some(cookie=>cookie.name==='__Host-lythaus_refresh'),false);
    assert.equal((await sql('SELECT count(*)::int n FROM identity.auth_sessions WHERE user_id=$1 AND revoked_at IS NULL',[userId])).rows[0].n,0);
    assert.equal(await page.evaluate(()=>localStorage.getItem('lythaus-session-logout-pending')),null);
    assert.equal(await page.getByText('Signed out on this device. Reconnect to finish signing out of the server session.',{ exact:true }).count(),0);
    if (process.env.AUTH_QA_DIR) {
      await mkdir(process.env.AUTH_QA_DIR,{ recursive:true });
      await page.screenshot({ path:path.join(process.env.AUTH_QA_DIR,`real-handler-${engineName}-${width}.png`) });
      await writeFile(path.join(process.env.AUTH_QA_DIR,`real-handler-${engineName}-${width}.json`),JSON.stringify({
        engine:engineName,width,status:'PASSED',localOnly:true,apiHandler:'real',database:'disposable_pg17',
        maximumRefreshInFlight,calls,errors,consoleErrors,
      },null,2)+'\n');
    }
    assert.deepEqual(errors.filter(message=>!/^\/fonts\.gstatic\.com\/s\/roboto\//.test(message)),[]);
    for (const secret of [email,password,nextPassword,verifyToken,messageToken(reset)]) assert.ok(!JSON.stringify(logs).includes(secret));
    finished=true;
  });
}
