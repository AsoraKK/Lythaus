import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import {execFileSync} from 'node:child_process';
import { chromium, webkit } from 'playwright';
import { installFlutterEngineFonts } from './flutter-engine-font-fixture.mjs';
import {observeRenderHealth, assertRenderHealth} from './brand-render-health.mjs';
import {compareApprovedArtwork} from './brand-reference.mjs';
import {containedWordmarkRect} from './brand-artwork-pixels.mjs';
import {assertBrandCaseMatrix} from './brand-case-matrix.mjs';
import {loginFixtureResponse,expectedRefreshConsole,refreshUrl,logoutUrl,discoverUrl} from './brand-login-transport.mjs';
import {assertLoginLayout,assertMatchingLoginLayout,loginFirstPaintPixels,assertLoginFirstPaintPixels} from './brand-login-first-paint.mjs';
import {runOnboardingCase,onboardingInventory} from './brand-onboarding.browser.mjs';

const output = path.resolve(process.env.BRAND_EVIDENCE ?? 'build/brand-evidence');
const build = path.resolve(process.env.BRAND_WEB_BUILD ?? 'build/brand-web');
const loginBuilds = [1,2].map(scale => path.resolve(`build/brand-login-${scale}`));
const onboardingBuilds = [1,2].map(scale => path.resolve(`build/brand-onboarding-${scale}`));
const onboardingReferenceBuild = path.resolve('build/brand-onboarding-reference');
const admin = path.resolve('apps/control-panel/dist');
const engine = process.env.BRAND_BROWSER ?? 'chromium';
assert.ok(['chromium', 'webkit'].includes(engine));
const source = process.env.BRAND_SOURCE;
const selectedCase = process.env.BRAND_CASE;
assert.match(source ?? '', /^[a-f0-9]{40}$/);
const approved = JSON.parse(await readFile('docs/brand/approved-v1/INTEGRATION-MANIFEST.json', 'utf8'));
async function verifyIcons(page, context) {
  const icons = await page.locator('link[rel="icon"],link[rel="apple-touch-icon"]').evaluateAll(nodes => nodes.map(node => node.href));
  assert.equal(icons.length, 4);
  for (const url of icons) {
    const expected = approved.web_copy_map.find(asset => asset.public_url === new URL(url).pathname);
    assert.ok(expected, url);
    const response = await context.request.get(url);
    assert.equal(response.status(), 200);
    assert.equal(createHash('sha256').update(await response.body()).digest('hex'), expected.sha256);
  }
}
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.otf': 'font/otf', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
async function serve(root) {
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      let file = path.resolve(root, '.' + pathname);
      assert.ok(file === root || file.startsWith(root + path.sep));
      if (!path.extname(file)) file = path.join(root, 'index.html');
      const bytes = await readFile(file);
      response.writeHead(200, { 'Content-Type': types[path.extname(file)] ?? 'application/octet-stream', 'Access-Control-Allow-Origin': '*' });
      response.end(bytes);
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return { server, origin: 'http://127.0.0.1:' + server.address().port };
}
await mkdir(output, { recursive: true });
const appServer = await serve(build), adminServer = await serve(admin);
const loginServers = await Promise.all(loginBuilds.map(serve));
const onboardingServers = await Promise.all(onboardingBuilds.map(serve));
const onboardingReferenceServer = await serve(onboardingReferenceBuild);
const onboardingResources = await Promise.all([...onboardingBuilds,onboardingReferenceBuild].map(root => onboardingInventory(root)));
const assets = files => Object.fromEntries(Object.entries(files).filter(([name]) => name.startsWith('assets/') || name.startsWith('canvaskit/')));
assert.equal(Object.keys(assets(onboardingResources[2])).length,40,'Complete original asset and CanvasKit inventory');
for (const resources of onboardingResources.slice(0,2)) assert.deepEqual(assets(resources),assets(onboardingResources[2]));
await writeFile(path.join(output,engine+'-onboarding-resources.json'),JSON.stringify({source,resources:onboardingResources},null,2)+'\n');
const headed = process.env.BRAND_CAPTURE_HEADED === '1';
const browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: !headed });
const results = [];
const { PNG } = createRequire(import.meta.url)('playwright-core/lib/utilsBundle');
const readLoginLayout = page => page.evaluate(() => JSON.parse(window.__readBrandLoginLayout()));
async function firstPaint(page, name, scale, theme) {
  const record = {status:'pending', protocol:'One original PNG before semantics, interaction or resize; real fractional layout, no ink-derived crop'};
  try {
    await page.waitForFunction(() => window.__brandFirstFrameAt !== null && typeof window.__readBrandLoginLayout === 'function' &&
      JSON.parse(window.__readBrandLoginLayout()).brands.length === 1);
    record.firstFrameAt = await page.evaluate(() => window.__brandFirstFrameAt);
    await page.waitForTimeout(Math.max(0, 250 - (await page.evaluate(() => performance.now()) - record.firstFrameAt)));
    record.before = await readLoginLayout(page);
    assertLoginLayout(record.before, scale);
    assert.equal(await page.locator('flt-semantics').count(), 0, 'First paint precedes DOM semantics');
    record.captureStartedAt = await page.evaluate(() => performance.now());
    const file = path.join(output, name + '-first-paint.png');
    await page.screenshot({path:file});
    record.captureFinishedAt = await page.evaluate(() => performance.now());
    record.after = await readLoginLayout(page);
    assertLoginLayout(record.after, scale);
    assertMatchingLoginLayout(record.before, record.after);
    // Read the saved bytes: later semantic/interaction captures cannot replace them.
    const bytes = await readFile(file), png = PNG.sync.read(bytes);
    record.pngSha256 = createHash('sha256').update(bytes).digest('hex');
    Object.assign(record, loginFirstPaintPixels(png, record.before));
    assertLoginFirstPaintPixels(record);
    const artworkFile = theme === 'dark' ? 'lythaus-wordmark-white.5ba0451347e2.svg' : 'lythaus-wordmark-black.e450176663e0.svg';
    record.fidelity = await compareApprovedArtwork(page,png,record.artwork,new URL('/assets/assets/brand/lythaus-v1/'+artworkFile,page.url()).href,PNG);
    record.status = 'passed';
    return record;
  } catch (error) {record.status='failed';record.error=error.message;throw error;}
  finally {await writeFile(path.join(output,name+'-first-paint.json'),JSON.stringify(record,null,2)+'\n');}
}
function checkedLoginHealth(raw, expectedConsoleErrors, requests) {
  const errors = [...raw.errors];
  for (const expected of expectedConsoleErrors) {
    const index = errors.indexOf(expected.text);
    assert.ok(index >= 0, 'Expected resource error is present in raw health evidence');
    errors.splice(index,1);
  }
  return {...raw,errors,responses:raw.responses.filter(r => !(r.url===refreshUrl && r.status===401 &&
    requests.some(request=>request.url===r.url&&request.method==='POST'&&request.status===r.status)))};
}
async function saveCase(result) {
  await writeFile(path.join(output,`${engine}-${result.screen}-${result.theme}-${result.width}.json`),JSON.stringify(result,null,2)+'\n');
  console.log(`${engine} ${result.screen} ${result.theme} ${result.width}: ${result.status}${result.error?' — '+result.error:''}`);
}
async function capture(page, name, validate = true) {
  await page.evaluate(() => {
    const label = document.createElement('div');
    label.textContent = 'LOCAL SYNTHETIC BRAND QA';
    label.style.cssText = 'position:fixed;bottom:0;right:0;z-index:99999;background:#111;color:#fff;padding:4px;font:10px sans-serif;pointer-events:none';
    document.body.append(label);
  });
  const image = page.getByRole('img', { name: 'Lythaus', exact: true }).first();
  const brand = await image.count() ? image : page.getByRole('button', { name: 'Feed controls', exact: true });
  for (let attempt = 0; attempt < 20; attempt++) {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.waitForTimeout(250);
    const bytes = await page.screenshot({ path: path.join(output, name + '.png') });
    if(headed)execFileSync('import',['-window','root',path.join(output,name+'-desktop.png')]);
    if (!validate) return;
    let rect = await brand.boundingBox();
    assert.ok(rect && rect.width > 0 && rect.height > 0, 'Brand has a visible layout box');
    const symbol = !(await image.count());
    if (symbol) rect = {x:rect.x+(rect.width-24)/2,y:rect.y+(rect.height-24)/2,width:24,height:24};
    if(!symbol) rect=containedWordmarkRect(rect);
    const png = PNG.sync.read(bytes);
    const colors = new Map();
    let pixels = 0;
    for (let y = Math.max(0, Math.ceil(rect.y)); y < Math.min(png.height, rect.y + rect.height); y++) {
      for (let x = Math.max(0, Math.ceil(rect.x)); x < Math.min(png.width, rect.x + rect.width); x++) {
        const offset = (y * png.width + x) * 4;
        const color = png.data.readUInt32BE(offset);
        colors.set(color, (colors.get(color) ?? 0) + 1);
        pixels++;
      }
    }
    const painted = pixels - Math.max(0, ...colors.values());
    if (colors.size >= 4 && painted >= 16 && painted / pixels > 0.003) {
      const dark=name.includes('-dark-');
      const file=symbol ? (dark?'lythaus-symbol-square-warm.fb697a91817f.svg':'lythaus-symbol-square-black.6a1b6d025e69.svg')
        : (dark?'lythaus-wordmark-white.5ba0451347e2.svg':'lythaus-wordmark-black.e450176663e0.svg');
      const url=name.includes('-admin-') ? await image.getAttribute('src') : '/assets/assets/brand/lythaus-v1/'+file;
      await compareApprovedArtwork(page,png,rect,new URL(url,page.url()).href,PNG);
      if(name.includes('-shell-')&&!symbol){
        const button=page.getByRole('button',{name:'Feed controls',exact:true});
        assert.equal(await button.getByRole('img').count(),0,'Decorative brand adds no named image');
        const box=await button.boundingBox();
        const icon={x:box.x+(box.width-24)/2,y:box.y+(box.height-24)/2,width:24,height:24};
        const symbolFile=dark?'lythaus-symbol-square-warm.fb697a91817f.svg':'lythaus-symbol-square-black.6a1b6d025e69.svg';
        await compareApprovedArtwork(page,png,icon,new URL('/assets/assets/brand/lythaus-v1/'+symbolFile,page.url()).href,PNG);
      }
      return;
    }
  }
  assert.fail('Brand artwork did not paint; refusing a blank screenshot: ' + name);
}
try {
  for (const theme of ['light', 'dark']) {
    for (const width of [320, 390, 1440]) {
      for (const screen of ['login', 'onboarding', 'shell']) {
        if (selectedCase && selectedCase !== `${screen}-${theme}-${width}`) continue;
        if (screen === 'onboarding') {
          const scale = width === 320 ? 2 : 1;
          results.push(await runOnboardingCase({browser,engine,origin:onboardingServers[scale-1].origin,referenceOrigin:onboardingReferenceServer.origin,
            theme,width,scale,output,source,approved}));
          await saveCase(results.at(-1));
          continue;
        }
        const login = screen === 'login', scale = width === 320 ? 2 : 1;
        const origin = login ? loginServers[scale-1].origin : appServer.origin;
        const name = `${engine}-${screen}-${theme}-${width}`;
        const context = await browser.newContext({ locale:'en-US', viewport: { width, height: 960 }, colorScheme: theme, reducedMotion: 'reduce', ...(login?{serviceWorkers:'block'}:{}) });
        const errors = [], blocked = [], requests = [], expectedConsoleErrors = [];
        const health = await observeRenderHealth(context,origin);
        if (login) await context.addInitScript(() => {
          window.__brandFirstFrameAt = null;
          window.addEventListener('flutter-first-frame',()=>{window.__brandFirstFrameAt ??= performance.now();});
        });
        await context.route('**/*', async route => {
          const request=route.request(),url=request.url(),method=request.method();
          if (new URL(url).origin === origin) return route.continue();
          const response=login && loginFixtureResponse(url,method,request.headers()['access-control-request-method']);
          if(response){
            requests.push({url,method,status:response.status});
            return route.fulfill({status:response.status,contentType:'application/json',headers:{
              'access-control-allow-origin':origin,'access-control-allow-credentials':'true',
              'access-control-allow-methods':response.method,
              'access-control-allow-headers':request.headers()['access-control-request-headers']??'content-type',
            },body:response.body===null?'':JSON.stringify(response.body)});
          }
          blocked.push(url); return route.abort();
        });
        await installFlutterEngineFonts(context);
        const page = await context.newPage();
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') {
          const error={text:message.text(),url:message.location().url};
          if(login&&expectedRefreshConsole(error,requests))expectedConsoleErrors.push(error);else errors.push(error.text);
        } });
        let initialPaint;
        try {
          await page.goto(login ? origin+'/login' : origin + '/?screen=' + screen + '&theme=' + theme + '&scale=' + scale);
          if(login)initialPaint=await firstPaint(page,name,scale,theme);
          await page.locator('flt-semantics-placeholder').evaluate(element => element.click());
          if (screen === 'shell') {
            await page.getByRole('textbox', { name: /Your post/ }).waitFor();
            await page.getByRole('button', { name: /^Discover(?:$|\s+Tab)/ }).click();
            await page.locator('flt-semantics').getByText('No posts yet', { exact: true }).waitFor();
            assert.equal(await page.getByRole('button', { name: 'Feed controls', exact: true }).isDisabled(), true,
              'The single-feed fixture must not offer unavailable feed switching');
          } else {
            await page.getByRole('img', { name: 'Lythaus', exact: true }).waitFor();
          }
          assert.equal(await page.getByRole('img',{name:'Lythaus',exact:true}).count(), screen==='shell'&&width<768?0:1,
            'Exactly one named brand where present; decorative controls add no duplicate');
          if(login){
            const semanticBox=await page.getByRole('img',{name:'Lythaus',exact:true}).boundingBox();
            for(const key of ['x','y','width','height'])assert.ok(Math.abs(semanticBox[key]-initialPaint.before.brands[0][key])<0.02,'Named image matches original fractional '+key);
            assertMatchingLoginLayout(initialPaint.before,await readLoginLayout(page),0.02);
          }
          await page.waitForTimeout(300);
          await capture(page, engine + '-' + screen + '-' + theme + '-' + width);
          if (screen === 'login') {
            const email = page.getByRole('textbox', { name: 'Email', exact: true });
            await email.click();
            await page.waitForFunction(() => document.activeElement instanceof HTMLInputElement);
            await page.keyboard.insertText('draft@example.invalid');
            await page.setViewportSize({ width: width === 1440 ? 1024 : width + 20, height: 960 });
            await page.setViewportSize({ width, height: 960 });
            await page.waitForFunction(() => document.activeElement?.value === 'draft@example.invalid');
          }
          await verifyIcons(page, context);
          if (screen !== 'shell') {
          const action = page.getByRole('button', { name: screen === 'login' ? 'Continue as guest' : 'Continue', exact: true });
          for (let attempt = 0; attempt < 12; attempt++) {
            const rect = await action.boundingBox();
            if (rect && rect.y >= 0 && rect.y + rect.height < 940) break;
            await page.mouse.move(width / 2, 700);
            await page.mouse.wheel(0, 400);
            await page.waitForTimeout(120);
          }
          await action.click();
          if(login){
            await page.waitForURL(url=>url.pathname==='/');
            assert.equal(new URL(page.url()).pathname,'/','Real GoRouter guest destination');
            await page.getByRole('button',{name:/^Discover(?:$|\s+Tab)/}).and(page.locator('[aria-current="true"]')).waitFor();
            await page.locator('flt-semantics').getByText('No posts yet',{exact:true}).waitFor();
            assert.equal(requests.filter(r=>r.url===refreshUrl&&r.method==='POST').length,1,'Real signed-out refresh');
            assert.equal(requests.filter(r=>r.url===logoutUrl&&r.method==='POST').length,1,'One real guest logout');
            assert.ok(requests.some(r=>r.url===discoverUrl&&r.method==='GET'),'Real public Discover request');
          }else await page.getByText('Synthetic continuation completed', { exact: true }).waitFor();
          }
          assert.deepEqual(errors, []);
          assert.deepEqual(blocked, []);
          const renderHealth=await health(page);
          assertRenderHealth(login?checkedLoginHealth(renderHealth,expectedConsoleErrors,requests):renderHealth);
          results.push({ screen, theme, width, scale, status: 'passed', health:renderHealth, ...(login?{firstPaint:initialPaint,requests,expectedConsoleErrors,guestDestination:new URL(page.url()).pathname}:{}) });
        } catch (error) {
          await capture(page, name + '-failed', false).catch(()=>{});
          results.push({ screen, theme, width, scale, status: 'failed', error: error.message, errors, blocked, requests, expectedConsoleErrors, health:await health(page).catch(error=>({observationError:error.message})) });
        } finally { await saveCase(results.at(-1)); await context.close(); }
      }
      if (selectedCase && selectedCase !== `admin-${theme}-${width}`) continue;
      const context = await browser.newContext({ viewport: { width, height: 960 }, colorScheme: theme, reducedMotion: 'reduce' });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ contentType: 'text/css', body: '' }));
      await page.route('https://fonts.gstatic.com/**', route => route.fulfill({ body: '' }));
      await page.route('**/api/admin/**', route => route.fulfill({ contentType: 'application/json', body: '{"items":[],"status":"synthetic"}' }));
      try {
        await page.goto(adminServer.origin + '/flags');
        await page.evaluate(theme => document.documentElement.dataset.theme = theme, theme);
        const logo = page.getByRole('img', { name: 'Lythaus', exact: true });
        await logo.waitFor();
        assert.equal(await logo.count(), 1);
        assert.ok(await logo.evaluate(image => image.complete && image.naturalWidth > 0));
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await capture(page, engine + '-admin-' + theme + '-' + width);
        await page.getByRole('link', { name: 'Audit', exact: true }).click();
        assert.equal(new URL(page.url()).pathname, '/audit');
        await verifyIcons(page, context);
        assert.deepEqual(errors, []);
        results.push({ screen: 'admin', theme, width, status: 'passed' });
      } catch(error) {
        await page.screenshot({path:path.join(output,`${engine}-admin-${theme}-${width}-failed.png`)}).catch(()=>{});
        results.push({screen:'admin',theme,width,status:'failed',error:error.message,errors});
      } finally { await saveCase(results.at(-1)); await context.close(); }
    }
  }
  assertBrandCaseMatrix(results,selectedCase);
  assert.deepEqual(results.filter(result=>result.status!=='passed').map(({screen,theme,width,error})=>({screen,theme,width,error})),[],'All required brand cases must pass');
} finally {
  await browser.close();
  await Promise.all([appServer, adminServer, ...loginServers, ...onboardingServers, onboardingReferenceServer].map(({ server }) => new Promise(resolve => server.close(resolve))));
  await writeFile(path.join(output, engine + '-results.json'), JSON.stringify({
    source, engine, browser: browser.version(), results,
    compiledSha256: createHash('sha256').update(await readFile(path.join(build, 'main.dart.js'))).digest('hex'),
    loginCompiledSha256: await Promise.all(loginBuilds.map(async(root,index)=>({scale:index+1,sha256:createHash('sha256').update(await readFile(path.join(root,'main.dart.js'))).digest('hex')}))),
    onboardingCompiledSha256: onboardingResources.map((files,index)=>({fixture:index===2?'static-reference':'settled-component',scale:index<2?index+1:null,sha256:files['main.dart.js']})),
  }, null, 2) + '\n');
}
