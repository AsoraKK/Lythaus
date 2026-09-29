import assert from 'node:assert/strict';
import test from 'node:test';
import { chromium, webkit } from 'playwright';
import { acceptanceEmailLanding } from '../src/email-landing.ts';
import { localAuthBrowserServer } from '../../../scripts/tests/local-auth-browser-server.mjs';

for (const [name, engine] of Object.entries({ chromium, webkit })) {
  test(`${name}: Keeper email handoff is intentional, bounded, retryable and secret-free`, async t => {
    let posts = 0, status = 400, aborted = false, releaseResponse;
    const hold = new Promise(resolve => { releaseResponse = resolve; });
    const server = await localAuthBrowserServer(async route => {
      const request = route.request();
      if (request.method() === 'GET') {
        assert.equal(new URL(request.url()).search, '');
        const response = acceptanceEmailLanding();
        return route.fulfill({ headers: Object.fromEntries(response.headers), body: await response.text() });
      }
      posts++;
      assert.equal((await request.allHeaders()).origin, 'https://admin.lythaus.co');
      assert.equal(new URL(request.url()).pathname, '/api/admin/production-auth-acceptance/email/complete');
      if (posts === 1) await hold;
      if (aborted) return route.abort();
      return route.fulfill({ status, body: status === 200 ? 'Completed' : 'Rejected' });
    });
    const browser = await engine.launch({ headless: true, proxy: { server: server.proxy } });
    t.after(async () => { releaseResponse(); await browser.close(); await server.close(); });
    const page = await browser.newPage({ ignoreHTTPSErrors: true, viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto('https://admin.lythaus.co/api/admin/production-auth-acceptance/email#context=' + 'a'.repeat(64) + '&token=' + 'b'.repeat(64) + '&purpose=verification');
    assert.equal(new URL(page.url()).hash, '');
    assert.equal(posts, 0, 'GET and rendering must not consume the token');
    const password = page.getByLabel('Password', { exact: true });
    const confirmation = page.getByLabel('Confirm password', { exact: true });
    const button = page.getByRole('button', { name: 'Confirm securely' });
    await password.fill('short'); await confirmation.fill('short'); await button.click();
    await page.getByRole('status').getByText('Use 15–128 characters and enter the same password twice.').waitFor();
    assert.equal(posts, 0);
    await password.fill('Local synthetic password'); await confirmation.fill('Local synthetic password');
    await button.click();
    await page.getByRole('status').getByText('Confirming securely…').waitFor();
    assert.equal(await button.isDisabled(), true);
    await page.locator('form').evaluate(form => form.dispatchEvent(new Event('submit', { cancelable: true })));
    releaseResponse();
    await page.getByRole('status').getByText(/Confirmation could not be completed/).waitFor();
    assert.equal(posts, 1, 'Busy form must not submit twice');
    assert.equal(await password.inputValue(), 'Local synthetic password');
    aborted = true; await button.click();
    await page.getByRole('status').getByText(/The result is not confirmed/).waitFor();
    assert.equal(await button.isDisabled(), false);
    aborted = false; status = 200; await button.click();
    await page.getByRole('status').getByText('Completed. Return to the Keeper acceptance screen.').waitFor();
    assert.equal(await page.locator('form').isVisible(), false);
    assert.equal(await password.inputValue(), '');
    assert.deepEqual(await page.evaluate(() => [Object.keys(localStorage), Object.keys(sessionStorage)]), [[], []]);
    assert.deepEqual(errors, []);
  });
}
