import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_DIR
  ? path.join(process.env.PLAYWRIGHT_MODULE_DIR, 'playwright') : 'playwright');
const directory = path.resolve(process.env.ACCOUNT_ACTION_REDIRECT_FIXTURE_DIR ?? 'build/member-action-redirect-fixture');
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
const close = server => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
let targetRequests = 0;
const target = createServer((request, response) => {
  targetRequests++;
  request.resume();
  response.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*'});
  response.end('{}');
});
const targetOrigin = await listen(target);
const cases = new Map();
const proof = `${randomUUID()}.${randomBytes(32).toString('hex')}`;
const source = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://fixture.invalid');
  if (url.pathname.startsWith('/api/')) {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const verification = url.pathname === '/api/auth/recent-verification';
    const input = verification ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : undefined;
    const stage = verification ? input.operation.path.split('/')[3] : url.pathname.split('/')[3];
    const state = cases.get(stage);
    if (!state) { response.writeHead(400); response.end(); return; }
    state.cookieSeen &&= Boolean(request.headers.cookie?.includes('lythaus_fixture_only='));
    state.nativeBindingSeen ||= Boolean(request.headers['x-lythaus-session-binding']);
    if (verification) state.verifications++; else state.actions++;
    const redirect = stage === 'initial_action' || (stage === 'password_verification' && verification)
      || (stage === 'verified_action' && !verification && state.actions === 2);
    if (redirect) { response.writeHead(303, { location: `${targetOrigin}/redirect-target` }); response.end(); return; }
    response.setHeader('content-type', 'application/json');
    if (verification) {
      response.writeHead(201); response.end(JSON.stringify({ proof, action: 'reward_claim' }));
    } else if (request.headers['x-lythaus-action-verification']) {
      state.proofSeen = request.headers['x-lythaus-action-verification'] === proof;
      response.writeHead(201); response.end('{"state":"received"}');
    } else {
      response.writeHead(403); response.end('{"error":"recent_authentication_required"}');
    }
    return;
  }
  try {
    const filename = path.resolve(directory, `.${url.pathname === '/' ? '/index.html' : url.pathname}`);
    assert.ok(filename.startsWith(`${directory}${path.sep}`));
    assert.ok((await stat(filename)).isFile());
    const contentType = filename.endsWith('.js') ? 'application/javascript' : filename.endsWith('.json') ? 'application/json'
      : filename.endsWith('.wasm') ? 'application/wasm' : filename.endsWith('.html') ? 'text/html' : 'application/octet-stream';
    response.writeHead(200, { 'content-type': contentType, 'cache-control': 'no-store',
      'set-cookie': `lythaus_fixture_only=${randomBytes(16).toString('hex')}; HttpOnly; SameSite=Lax; Path=/` });
    response.end(await readFile(filename));
  } catch { response.writeHead(404); response.end(); }
});
const sourceOrigin = await listen(source);
assert.notEqual(sourceOrigin, targetOrigin);
let browser;
try {
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  for (const stage of ['initial_action', 'password_verification', 'verified_action', 'success']) {
    const state = { actions: 0, verifications: 0, cookieSeen: true, nativeBindingSeen: false, proofSeen: false };
    cases.set(stage, state);
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.goto(`${sourceOrigin}/?stage=${stage}`);
      await page.waitForFunction(() => typeof window.lythausAccountRedirectResult === 'string', null, { timeout: 30000 });
      const result = await page.evaluate(() => window.lythausAccountRedirectResult);
      assert.equal(result, stage === 'success' ? 'completed' : 'blocked');
      assert.equal(targetRequests, 0, 'No request may reach the other origin');
      assert.equal(state.cookieSeen, true, 'The existing cookie transport remains available');
      assert.equal(state.nativeBindingSeen, false, 'Web must never read/send the native refresh binding');
      assert.equal(await page.evaluate(() => document.cookie.includes('lythaus_fixture_only=')), false);
      assert.equal(state.actions, ['verified_action', 'success'].includes(stage) ? 2 : 1);
      assert.equal(state.verifications, stage === 'initial_action' ? 0 : 1);
      if (stage === 'success') assert.equal(state.proofSeen, true);
      console.log(`PASS Chromium Fetch ${stage}: result=${result}, redirect-target requests=0, HttpOnly cookie preserved`);
    } finally { await context.close(); }
  }
} finally {
  await browser?.close();
  await close(source);
  await close(target);
}
