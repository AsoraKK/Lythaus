import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { harness, newPage, enterText, screenshot, evidence } from './content-journey-browser-runtime.mjs';

const runtime = await harness();
const reports = [];
const button = (page, name) => page.getByRole('button', { name, exact: true });
const text = (page, value) => page.getByText(value, { exact: false })
  .or(page.getByLabel(new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).first();
async function run(name, options, task) {
  const { page, context, result } = await newPage(runtime, options);
  result.name = name;
  try {
    await task(page, context, result);
    assert.deepEqual(result.errors, []);
    assert.deepEqual(result.blocked, []);
    result.status = 'passed';
  } catch (error) {
    result.status = 'failed';
    result.failure = error.stack;
    await screenshot(page, result, name + '-failure');
  } finally {
    reports.push(result);
    console.log(JSON.stringify({ name, width: result.width, theme: result.theme, status: result.status, failure: result.failure }));
    await context.close();
  }
}

try {
  for (const width of [320, 390, 1280]) for (const theme of ['light', 'dark']) {
    await run('member-feed', { width, theme }, async (page, _, result) => {
      await button(page, 'Open Discover').click();
      await text(page, 'Kai Rivers').waitFor();
      await text(page, 'Declared: Human-authored').waitFor();
      await screenshot(page, result, 'member-feed');
      await button(page, 'Trust details').click();
      await text(page, 'does not independently verify authorship').waitFor();
      for (const diagnostic of ['Created: complete', 'Media checked: none', 'Moderation: none', 'No extra signals']) {
        assert.equal(await page.getByText(diagnostic, { exact: true }).count(), 0);
      }
      await screenshot(page, result, 'member-feed-details');
      await button(page, 'View content history').click();
      await text(page, 'Post Receipt').waitFor();
      await text(page, 'Submission recorded').waitFor();
      await screenshot(page, result, 'member-content-history');
      await button(page, 'Close receipt').click();
      assert.equal(result.writes.length, 0);
      result.checks.push('Public name projection', 'Self-declaration is explicit', 'Expanded details contain no internal states');
      result.checks.push('Accessible history action opens the existing drawer without a content write');
    });
    await run('member-composer', { width, theme }, async (page, _, result) => {
      await button(page, 'Open composer').click();
      await text(page, 'Photos are not available yet').waitFor();
      await screenshot(page, result, 'member-composer');
      for (const diagnostic of ['Capture metadata hash', 'Edit history hash', 'Source attestation', 'Add media']) {
        assert.equal(await page.getByText(diagnostic, { exact: true }).count(), 0);
      }
      assert.equal(await button(page, 'Post').isEnabled(), false);
      await button(page, 'Posting policy').click();
      await text(page, 'AI-generated public content is not allowed.').waitFor();
      await screenshot(page, result, 'member-posting-policy');
      await button(page, 'Done').click();
      await enterText(page, page.getByRole('textbox', { name: /Your post/ }), 'A quiet morning in the neighbourhood.');
      await page.getByRole('checkbox', { name: 'Human-authored', exact: true }).click();
      await button(page, 'Post').click();
      await button(page, 'Open composer').waitFor();
      await text(page, 'Post submitted. Publication checks are pending.').waitFor();
      assert.equal(result.writes.length, 1);
      await screenshot(page, result, 'member-submitted-pending');
      result.checks.push('Media gate is explained', 'Required declaration', 'Full policy is accessible', 'Accepted pending returns to a nonblank caller');
    });
  }
  for (const theme of ['light', 'dark']) {
    await run('member-post-history', {width:390,theme}, async (page, _, result) => {
      await button(page,'Open post').click();
      await text(page,'Synthetic published post').waitFor();
      await button(page,'Trust details').click();
      await button(page,'View content history').click();
      await text(page,'Post Receipt').waitFor();
      await text(page,'Submission recorded').waitFor();
      await screenshot(page,result,'member-post-history');
      assert.equal(result.writes.length,0);
      result.checks.push('Post detail compact history action remains reachable','Synthetic receipt reader only; no new native API or appeal activation');
    });
  }
  await run('offline-post-retry', { width: 390, theme: 'dark' }, async (page, context, result) => {
    await button(page, 'Open composer').click();
    const body = 'A saved update while offline.';
    const input = page.getByRole('textbox', { name: /Your post/ });
    await enterText(page, input, body);
    await page.getByRole('checkbox', { name: 'Human-authored', exact: true }).click();
    await context.setOffline(true);
    await button(page, 'Post').click();
    await button(page, 'Retry submission').waitFor();
    await text(page, 'Check your connection and retry.').waitFor();
    assert.equal(await input.inputValue(), body);
    await button(page, 'Retry submission').hover();
    assert.equal(await text(page, 'Choose Human-authored or AI-assisted before posting.').count(), 0);
    await screenshot(page, result, 'member-offline-draft');
    await context.setOffline(false);
    assert.equal(result.writes.length, 1);
    await button(page, 'Retry submission').click();
    await button(page, 'Open composer').waitFor();
    assert.equal(result.writes.length, 2);
    assert.equal(result.writes[0].key, result.writes[1].key);
    assert.deepEqual(result.writes[0].body, result.writes[1].body);
    const stats = await page.evaluate(async id => (await fetch('/api/fixture/stats', {
      headers: { 'X-Synthetic-Case': id },
    })).json(), result.caseId);
    assert.equal(stats.posts.filter(post => post.body === body).length, 1);
    result.expectedHttpErrors.push(...result.errors.filter(error => error.includes('ERR_INTERNET_DISCONNECTED')));
    result.errors = result.errors.filter(error => !error.includes('ERR_INTERNET_DISCONNECTED'));
    result.checks.push('Offline preserves draft', 'Reconnect does not automatically send', 'Explicit retry keeps request key and creates one pending post');
  });
} finally {
  await runtime.close();
  await writeFile(evidence + '/member-experience-results.json', JSON.stringify({
    commit: process.env.QA_COMMIT ?? 'local-working-tree', syntheticFixture: true, reports,
  }, null, 2));
  process.exitCode = reports.some(result => result.status !== 'passed') ? 1 : 0;
}
