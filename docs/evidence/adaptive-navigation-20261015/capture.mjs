import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import { readFile, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { localAuthBrowserServer } from '../../../scripts/tests/local-auth-browser-server.mjs';
import { installFlutterEngineFonts } from '../../../scripts/tests/flutter-engine-font-fixture.mjs';

const phase = process.argv[2] ?? 'after';
const build = process.env.LYTHAUS_NAV_BUILD ?? fileURLToPath(new URL('../../../build/web', import.meta.url));
assert.match(process.env.LYTHAUS_NAV_SOURCE ?? '', /^[a-f0-9]{40}$/, 'Supply the exact build source commit.');
const output = process.env.LYTHAUS_NAV_OUTPUT ?? await mkdtemp(path.join(tmpdir(), `lythaus-navigation-${phase}-`));
if (process.env.LYTHAUS_NAV_OUTPUT) await mkdir(output);
const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.png':'image/png','.svg':'image/svg+xml','.ttf':'font/ttf','.otf':'font/otf'};
const calls = [];
const fixture = await localAuthBrowserServer(async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.hostname === 'app.lythaus.co') {
    let file = path.resolve(build, `.${url.pathname}`);
    assert.ok(file.startsWith(build));
    if (!path.extname(file)) file = path.join(build, 'index.html');
    try { return await route.fulfill({contentType:mime[path.extname(file)],body:await readFile(file)}); }
    catch { return route.fulfill({status:404,body:'Not found'}); }
  }
  if (url.hostname !== 'api.lythaus.co') return route.abort();
  const headers = {'access-control-allow-origin':'https://app.lythaus.co','access-control-allow-credentials':'true','access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'Authorization, Content-Type, Idempotency-Key, X-Correlation-ID, X-Device-Rooted, X-Device-Emulator, X-Device-Debug, X-Live-Test-Mode, X-Lythaus-Auth-Transport'};
  if (request.method() === 'OPTIONS') return route.fulfill({status:204,headers});
  calls.push({method:request.method(),path:url.pathname});
  const refresh = url.pathname === '/api/auth/refresh';
  return route.fulfill({status:refresh ? 401 : 200,headers,contentType:'application/json',body:JSON.stringify(refresh ? {code:'unauthorized',message:'Guest fixture'} : {items:[],hasMore:false,nextCursor:null})});
});
const browser = await chromium.launch({headless:true,proxy:{server:fixture.proxy},args:['--no-sandbox','--disable-dev-shm-usage']});
const results = [];
try {
  for (const theme of ['light','dark']) for (const viewport of [{width:320,height:844},{width:390,height:844},{width:1024,height:768},{width:1440,height:960}]) {
    const context = await browser.newContext({viewport,colorScheme:theme,serviceWorkers:'block',ignoreHTTPSErrors:true});
    await installFlutterEngineFonts(context);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror',error => errors.push(error.message));
    page.on('console',message => {
      if (message.type() !== 'error') return;
      const url = message.location().url, text = message.text();
      const expectedGuestRefresh = url === 'https://api.lythaus.co/api/auth/refresh'
        && /^Failed to load resource:.*401/.test(text);
      if (!expectedGuestRefresh) errors.push({text,url});
    });
    page.setDefaultTimeout(60000);
    const key = `${theme}-${viewport.width}`;
    try {
      await page.goto('https://app.lythaus.co/');
      await page.locator('flt-semantics-placeholder').evaluate(element=>element.click());
      await page.getByRole('button',{name:'Continue as guest',exact:true}).click();
      await page.getByRole('button',{name:'Feed controls',exact:true}).waitFor();
      await page.getByText('No posts yet',{exact:true}).waitFor();
      await page.screenshot({path:`${output}/${key}.png`});
      const control = page.getByRole('button',{name:'Feed controls',exact:true});
      for (let index = 0; index < 20; index++) {
        await page.keyboard.press('Tab');
        if (await control.evaluate(element => element === document.activeElement)) break;
      }
      assert.ok(await control.evaluate(element => element === document.activeElement), 'Tab reaches Feed controls');
      await page.screenshot({path:`${output}/${key}-focus.png`});
      await page.keyboard.press('Enter');
      await page.getByText('Choose a feed',{exact:true}).waitFor();
      await page.getByRole('button',{name:'Close feed controls',exact:true}).click();
      await control.waitFor();
      let navigation = 'Mobile ordering and left-handed preference verified by Flutter tests';
      if (phase === 'after' && viewport.width >= 768) {
        await page.getByRole('button', {name:'Rewards', exact:true}).click();
        await page.getByText('Sign in to view your rewards.', {exact:true}).waitFor();
        await page.getByRole('button', {name:'Create', exact:true}).click();
        await page.getByText('Sign in to create a post.', {exact:true}).waitFor();
        await page.getByRole('button', {name:'Discover', exact:true}).click();
        await page.getByText('No posts yet', {exact:true}).waitFor();
        const settings = page.getByRole('button', {name:'Settings', exact:true});
        for (let index = 0; index < 30; index++) {
          await page.keyboard.press('Tab');
          if (await settings.evaluate(element => element === document.activeElement)) break;
        }
        assert.ok(await settings.evaluate(element => element === document.activeElement));
        await page.screenshot({path:`${output}/${key}-settings-focus.png`});
        await page.keyboard.press('Enter');
        await page.getByText('Account security', {exact:true}).click();
        const signOut = page.getByRole('button', {name:'Sign out of all sessions', exact:true});
        await signOut.waitFor();
        assert.ok(await signOut.isDisabled(), 'Guest sign-out remains disabled');
        assert.equal(new URL(page.url()).pathname, '/settings/security');
        navigation = 'Rewards/Create guest gates; Discover return; Tab/Enter Settings; Account security; guest sign-out disabled';
      }
      assert.equal(await page.title(),'Lythaus');
      assert.equal(errors.length,0,JSON.stringify(errors));
      const icons = await page.evaluate(async () => {
        const sources = ['favicon.png','icons/Icon-192.png','icons/Icon-512.png','icons/Icon-maskable-512.png'];
        return Promise.all(sources.map(async source => {
          const image = new Image();
          image.src = source;
          await image.decode();
          return {source,width:image.naturalWidth,height:image.naturalHeight};
        }));
      });
      results.push({theme,viewport,url:page.url(),title:await page.title(),errors,icons,navigation,keyboard:'Tab reaches Feed controls, Enter opens the sheet, close restores the header',text:await page.locator('flt-semantics').allTextContents()});
    } catch(error) {
      await page.screenshot({path:`${output}/${key}-failure.png`});
      console.log(await page.locator('flt-semantics').allTextContents());
      throw error;
    } finally { await context.close(); }
  }
} finally { await browser.close(); await fixture.close(); }
await writeFile(`${output}/results.json`,JSON.stringify({sourceCommit:process.env.LYTHAUS_NAV_SOURCE,compiledSha256:createHash('sha256').update(await readFile(path.join(build,'main.dart.js'))).digest('hex'),browser:browser.version(),results,calls},null,2));
console.log(JSON.stringify({phase,checks:results.length,output}));
