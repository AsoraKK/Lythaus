// Archived exact review-only harness from detached refs/review/1090 (a10c3812).
// Run only in that worktree after its existing browser fixture is built:
//   source /workspace/.lythaus-tools/activate.sh
//   node review/comment-reload.browser.mjs
// It imports the fixture/runtime from that checkout; no product source changed.
import assert from 'node:assert/strict';
import { harness, newPage, enterText, screenshot } from '../scripts/tests/content-journey-browser-runtime.mjs';

const runtime = await harness();
const { page, context, result } = await newPage(runtime, { width: 390, theme: 'light', caseId: 'comment-reload-review' });
let commentReads = 0;
page.on('response', async response => {
  if (new URL(response.url()).pathname.endsWith('/comments')) commentReads++;
});
const button = name => page.getByRole('button', { name, exact: true });
const content = text => page.getByText(text, { exact: false }).or(page.getByLabel(new RegExp(text)));
async function until(condition, message, timeout = 20000) {
  const start = Date.now();
  while (!(await condition())) {
    if (Date.now() - start > timeout) throw new Error(message);
    await page.waitForTimeout(50);
  }
}
const activate = async () => {
  await page.locator('flt-semantics-placeholder').waitFor({ timeout: 60000 });
  await page.locator('flt-semantics-placeholder').evaluate(node => node.click());
  await button('Open composer').waitFor();
};

try {
  assert.equal(await page.title(), 'Lythaus content journey synthetic QA');
  await button('Open comments').click();
  await until(() => commentReads >= 1, 'Synthetic comments API read');
  const composer = page.getByRole('textbox', { name: /Write a/ });
  await composer.waitFor();
  const recoveryKey = await page.evaluate(() => Object.keys(localStorage)
    .find(key => key.startsWith('LythausContentRecovery.lythaus.content-recovery.v1.')) ?? null);
  const previousJournal = recoveryKey == null ? null
    : await page.evaluate(key => localStorage.getItem(key), recoveryKey);
  const text = 'Unsent comment after actual page reload';
  await enterText(page, composer, text);
  await page.getByRole('checkbox', { name: 'Human-authored', exact: true }).click();
  await until(async () => {
    const key = recoveryKey ?? await page.evaluate(() => Object.keys(localStorage)
      .find(item => item.startsWith('LythausContentRecovery.lythaus.content-recovery.v1.')) ?? null);
    if (key == null) return false;
    return await page.evaluate(({ key, previous }) => {
      const current = localStorage.getItem(key);
      return current != null && current !== previous;
    }, { key, previous: previousJournal });
  }, 'Durable browser recovery journal update');
  assert.equal(result.writes.length, 0, 'Drafting does not submit a comment');
  await page.reload({ waitUntil: 'load' });
  await activate();
  await button('Open comments').click();
  await until(() => commentReads >= 2, 'Synthetic comments API read after reload');
  await content('Draft restored on this device.').waitFor();
  assert.equal(await page.getByRole('checkbox', { name: 'Human-authored', exact: true }).getAttribute('aria-checked'), 'true');
  assert.equal(result.writes.length, 0, 'Reload restoration does not submit the draft');
  await screenshot(page, result, 'comment-unsent-actual-reload');
  await button('Send reply').click();
  await until(() => result.writes.length === 1, 'Restored comment submission');
  assert.equal(result.writes[0].body.body, text, 'Post-reload submission uses exact draft text');
  await content(text).waitFor();
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.blocked, []);
  console.log(JSON.stringify({ status: 'PASSED', scenario: 'same-context page.reload restores an unsent comment and disclosure; post-reload send carries exact text', screenshot: result.screenshots.at(-1) }));
} catch (error) {
  console.error(JSON.stringify({ status: 'FAILED', failure: error.message, body: await page.locator('body').innerText().catch(() => ''), errors: result.errors, blocked: result.blocked }));
  await screenshot(page, result, 'comment-unsent-actual-reload-failure');
  throw error;
} finally {
  await context.close();
  await runtime.close();
}
