import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import test from 'node:test';
import { chromium } from 'playwright';

const origin = process.env.SUPPORT_CONSOLE_LOCAL_URL;
if (!origin || !['localhost', '127.0.0.1'].includes(new URL(origin).hostname)) throw new Error('support_browser_requires_loopback_fixture');
const output = process.env.SUPPORT_BROWSER_EVIDENCE_DIR ?? '/tmp/wp07-support-browser';
const config = { version: 'synthetic_browser_v1', contract: {
  categories: { problem: ['display'], suggestion: ['navigation'] },
  states: { problem: ['received', 'needs_information', 'resolved'], suggestion: ['received', 'accepted'] },
  limits: { titleBytes: 1024, detailBytes: 8192, stepsBytes: 8192, contextBytes: 512, memberMessageBytes: 8192,
    titleCharacters: 160, detailCharacters: 2000, stepsCharacters: 2000, memberMessageCharacters: 2000 } },
  initial: { problem: 'received', suggestion: 'received' }, transitions: [], evidenceTypes: ['verification'],
  limits: { page: 3, messages: 3, privateItems: 3, messageBytes: 8192, noteBytes: 8192, evidenceBytes: 8192, referenceBytes: 2048 } };
const record = kind => ({ id: kind === 'problem' ? '018f0000-0000-7000-8000-000000000001' : '018f0000-0000-7000-8000-000000000002',
  submitterId: '018f0000-0000-7000-8000-000000000003', kind, category: kind === 'problem' ? 'display' : 'navigation',
  title: `Synthetic ${kind} browser request`, actual: 'Synthetic actual', expected: 'Synthetic expected',
  improvement: 'Synthetic improvement', benefit: 'Synthetic benefit', state: kind === 'problem' ? 'needs_information' : 'accepted',
  closed: kind === 'suggestion', revision: 2, memberMessage: null, createdAt: '2026-10-07T00:00:00Z', updatedAt: '2026-10-07T01:00:00Z' });

test('rendered support queues and closed replies work at desktop and mobile widths with keyboard access', async t => {
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, args: ['--no-sandbox'] });
  try {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      const page = await browser.newPage({ viewport });
      const errors = [], calls = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
      await page.route('https://fonts.googleapis.com/**', route => route.fulfill({ status: 200, contentType: 'text/css', body: '' }));
      await page.route('**/api/admin/**', async route => {
        const request = route.request(), path = new URL(request.url()).pathname;
        calls.push({ path, method: request.method() });
        let body;
        if (path === '/api/admin/health') body = { status: 'ok' };
        else if (path === '/api/admin/support/options') body = config;
        else if (/\/support\/(problems|suggestions)$/.test(path)) body = { items: [record(path.endsWith('problems') ? 'problem' : 'suggestion')], nextCursor: null };
        else {
          const item = record(path.includes('/problems/') ? 'problem' : 'suggestion');
          body = { request: item, messages: [{ id: 'synthetic-message', from: 'owner', text: 'Synthetic private support reply', revision: 2, createdAt: item.updatedAt }],
            private: { notes: [], evidence: [], decisions: [] } };
        }
        await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'cache-control': 'private, no-store' }, body: JSON.stringify(body) });
      });
      await page.goto(`${origin}/support`);
      await page.getByRole('heading', { name: 'Problem reports', exact: true }).waitFor();
      assert.ok((await page.title()).includes('Lythaus')); assert.ok(page.url().endsWith('/support'));
      const problem = page.getByRole('button', { name: /Synthetic problem browser request/ });
      await problem.focus(); await page.keyboard.press('Enter');
      await page.getByLabel('Reply to member').fill('😀'.repeat(2001));
      assert.equal(await page.getByRole('button', { name: 'Send reply', exact: true }).isEnabled(), false);
      await page.getByLabel('Reply to member').fill('Synthetic reply within bounds');
      assert.equal(await page.getByRole('button', { name: 'Send reply', exact: true }).isEnabled(), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      await page.screenshot({ path: `${output}/problem-${viewport.width}.png`, fullPage: true });
      await page.getByRole('button', { name: 'Suggestions', exact: true }).click();
      await page.getByRole('button', { name: /Synthetic suggestion browser request/ }).click();
      await page.getByText('This request is closed.', { exact: true }).waitFor();
      assert.equal(await page.getByLabel('Reply to member').isEnabled(), false);
      assert.equal(await page.getByRole('button', { name: 'Send reply', exact: true }).isEnabled(), false);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      await page.screenshot({ path: `${output}/suggestion-${viewport.width}.png`, fullPage: true });
      assert.deepEqual(errors, []);
      assert.equal(calls.some(call => call.method === 'POST'), false);
      t.diagnostic(`Synthetic Chromium ${viewport.width}×${viewport.height}: separate queues, keyboard, Unicode, closed state, no overflow or page errors`);
      await page.close();
    }
  } finally { await browser.close(); }
});
