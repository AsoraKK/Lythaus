import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { chromium, webkit } from 'playwright';
import { localAuthBrowserServer } from '../../../scripts/tests/local-auth-browser-server.mjs';

const build = path.resolve('apps/control-panel/dist');
const shots = await mkdtemp(path.join(tmpdir(), 'lythaus-keeper-owner-ui-'));
for (const [name, engine] of Object.entries({ chromium, webkit })) {
  for (const width of [390, 1440]) {
    test(`${name} ${width}px: private owner destinations are explicit, bound and cleared`, async t => {
      const runId = '11111111-1111-4111-8111-111111111111';
      const run = { releaseSha: 'a'.repeat(40), candidate: { workerVersionId: '22222222-2222-4222-8222-222222222222' },
        status: 'pending', expiresAt: new Date(Date.now()+600000).toISOString(), events: [],
        destinations: { primary: { status: 'pending', reference: 'primary-random-reference' }, secondary: { status: 'pending', reference: 'secondary-random-reference' } } };
      let posts=0, reject=true;
      const server=await localAuthBrowserServer(async route=>{
        const request=route.request(), pathname=new URL(request.url()).pathname;
        if(pathname.endsWith('/destinations')) {
          posts++;
          assert.equal((await request.allHeaders()).origin,'https://admin.lythaus.co');
          assert.deepEqual(request.postDataJSON(),{primaryEmail:'local@example.invalid',secondaryEmail:'local@second.invalid',authorize:true,releaseSha:run.releaseSha,candidateVersion:run.candidate.workerVersionId});
          if(reject)return route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:{code:'acceptance_second_mail_provider_required'}})});
          run.destinations.primary.status=run.destinations.secondary.status='authorized';
          return route.fulfill({contentType:'application/json',body:JSON.stringify({state:'owner_destinations_authorized'})});
        }
        if(pathname.startsWith('/api/admin/'))return route.fulfill({contentType:'application/json',body:JSON.stringify(pathname.endsWith('/turnstile')?{siteKey:'synthetic-local-key'}:pathname.endsWith('/health')?{}:run)});
        const file=pathname.startsWith('/assets/')?path.resolve(build,'.'+pathname):path.join(build,'index.html');
        assert.ok(file.startsWith(build+path.sep));
        return route.fulfill({contentType:file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html',body:await readFile(file)});
      });
      const browser=await engine.launch({headless:true,proxy:{server:server.proxy}});
      t.after(async()=>{await browser.close();await server.close();});
      const page=await browser.newPage({ignoreHTTPSErrors:true,viewport:{width,height:900}});
      const errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.route('https://challenges.cloudflare.com/**',route=>route.fulfill({contentType:'application/javascript',body:''}));
      await page.goto(`https://admin.lythaus.co/production-auth-acceptance?run=${runId}`);
      await page.getByRole('heading',{name:'Production Auth Acceptance',exact:true}).waitFor();
      await page.waitForFunction(()=>getComputedStyle(document.querySelector('.acceptance-page')).opacity==='1');
      const authorize=page.getByRole('button',{name:'Authorize destinations for this candidate'});
      assert.equal(await authorize.isDisabled(),true);
      assert.equal(await page.getByRole('button',{name:'Request real verification email'}).isDisabled(),true);
      await page.screenshot({path:path.join(shots,`${name}-${width}-pending.png`),fullPage:true});
      await page.getByLabel('Primary test destination',{exact:true}).fill('local@example.invalid');
      await page.getByLabel('Second-provider test destination',{exact:true}).fill('local@second.invalid');
      await page.getByRole('checkbox').check();
      await authorize.click();
      await page.getByRole('status').getByText('Use two independent receiving providers, such as Google and Zoho.').waitFor();
      assert.equal(posts,1);assert.equal(await authorize.isEnabled(),true);
      reject=false;
      await page.getByLabel('Second-provider test destination',{exact:true}).press('Enter');
      await page.getByRole('status').getByText(/Destinations locked to this run/).waitFor();
      assert.equal(posts,2);
      assert.equal(await page.locator('input[type=email]').count(),0);
      assert.ok(!(await page.locator('body').innerText()).includes('local@'));
      assert.deepEqual(await page.evaluate(()=>[Object.keys(localStorage),Object.keys(sessionStorage)]),[[],[]]);
      assert.equal(new URL(page.url()).searchParams.get('run'),runId);
      await page.screenshot({path:path.join(shots,`${name}-${width}.png`),fullPage:true});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
      await page.reload();
      await page.getByText(/Destinations authorized. Private references/).waitFor();
      assert.equal(await page.locator('input[type=email]').count(),0);
      assert.deepEqual(errors,[]);
    });
  }
}
console.log(`Sanitized Keeper screenshots: ${shots}`);
