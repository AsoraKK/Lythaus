import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { harness, newPage, screenshot, evidence } from './content-journey-browser-runtime.mjs';

const runtime = await harness();
const reports = [];
const button = (page, name) => page.getByRole('button', { name, exact: true });
const text = (page, value) => page.getByText(value, { exact: false })
  .or(page.getByLabel(new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))).first();

try {
  for (const width of [320, 390]) {
    const { page, context, result } = await newPage(runtime, { width, theme: 'light' });
    result.name = 'profile-tabs-keyboard';
    try {
      await button(page, 'Open profile tabs').click();
      const group = page.getByRole('group', { name: 'Profile sections' });
      const tabList = group.getByRole('tablist');
      assert.equal(await tabList.count(), 1);
      const tab = name => page.getByRole('tab', { name: new RegExp('^' + name) });
      const panel = page.getByRole('tabpanel');

      async function expectTab(name, content, { focus = true } = {}) {
        const selectedTab = tab(name);
        if (focus) {
          await page.waitForFunction(label => {
            const active = document.activeElement;
            return active?.getAttribute('aria-label') === label
              || active?.textContent?.trim() === label;
          }, name);
        }
        await page.waitForFunction(label => [...document.querySelectorAll('[role="tab"]')]
          .some(node => node.getAttribute('aria-selected') === 'true'
            && (node.getAttribute('aria-label') === label || node.textContent?.trim() === label)), name);
        assert.equal(await selectedTab.getAttribute('aria-selected'), 'true');
        await page.waitForFunction(label => [...document.querySelectorAll('[role="tabpanel"]')]
          .some(node => node.getAttribute('aria-label') === label), name);
        assert.equal(await panel.getAttribute('aria-label'), name);
        await text(page, content).waitFor();
      }

      const overview = tab('Overview');
      await overview.focus();
      await expectTab('Overview', 'Synthetic member overview');
      await page.keyboard.press('ArrowRight');
      await expectTab('Posts', 'Synthetic member posts');
      await page.keyboard.press('ArrowRight');
      await expectTab('Comments', 'Synthetic member comments');
      await page.keyboard.press('ArrowLeft');
      await expectTab('Posts', 'Synthetic member posts');
      await page.keyboard.press('ArrowLeft');
      await expectTab('Overview', 'Synthetic member overview');
      await page.keyboard.press('Home');
      await expectTab('Overview', 'Synthetic member overview');
      await page.keyboard.press('End');
      await expectTab('Comments', 'Synthetic member comments');
      await page.keyboard.press('ArrowRight');
      await expectTab('Overview', 'Synthetic member overview');

      await button(page, 'Open composer').click();
      await button(page, 'Close composer').waitFor();
      await button(page, 'Close composer').click();
      await expectTab('Overview', 'Synthetic member overview', { focus: false });
      assert.equal(result.writes.length, 0);
      assert.deepEqual(result.errors, []);
      assert.deepEqual(result.blocked, []);
      result.checks.push('Named tab group and panels', 'Arrow focus and activation in both directions with wrapping',
        'Home and End navigation', 'Selected tab and panel survive returning from the composer');
      await screenshot(page, result, 'profile-tabs-keyboard');
      result.status = 'passed';
    } catch (error) {
      result.status = 'failed';
      result.failure = error.stack;
      await screenshot(page, result, 'profile-tabs-keyboard-failure');
    } finally {
      reports.push(result);
      console.log(JSON.stringify({ width, theme: result.theme, status: result.status,
        failure: result.failure?.split('\n').slice(0, 4).join('\n') }));
      await context.close();
    }
  }
} finally {
  await runtime.close();
  await writeFile(evidence + '/profile-tabs-keyboard-results.json', JSON.stringify({
    commit: process.env.QA_COMMIT ?? 'local-working-tree', syntheticFixture: true, reports,
  }, null, 2));
  process.exitCode = reports.some(result => result.status === 'failed') ? 1 : 0;
}
