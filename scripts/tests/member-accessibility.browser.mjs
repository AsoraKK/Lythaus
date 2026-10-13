import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { harness, newPage, enterText, screenshot, evidence } from './content-journey-browser-runtime.mjs';

const runtime = await harness();
const reports = [];
const before = process.env.QA_BEFORE === '1';
const numbers = (name, fallback) => (process.env[name] ?? fallback).split(',').map(Number);
const button = (page, name) => page.getByRole('button', { name, exact: true }).first();
const text = (page, value) => page.getByText(value, { exact: false })
  .or(page.getByLabel(value, { exact: false })).first();
const tick = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const back = async page => { await page.evaluate(() => globalThis.lythausSyntheticBack()); await tick(page); };
const focused = (page, name) => page.waitForFunction(value => {
  const active = document.activeElement;
  return active?.getAttribute('aria-label') === value || active?.textContent === value;
}, name);

async function reveal(page, locator, result, direction = 1) {
  const bottom = result.height - result.keyboardInset;
  for (let attempt = 0; attempt < 20; attempt++) {
    const box = await locator.count() ? await locator.boundingBox() : null;
    if (box && box.y >= 0 && box.y + box.height <= bottom + 1) return;
    await page.mouse.move(result.width - 20, Math.max(90, bottom - 140));
    await page.mouse.wheel(0, direction * 220);
    await tick(page);
  }
  throw new Error('Control is not reachable: ' + await locator.count());
}

async function activate(page, locator, result) {
  await reveal(page, locator, result);
  await locator.click();
  await tick(page);
}

async function reachable(locator, result) {
  const box = await locator.boundingBox();
  assert.ok(box, 'Missing rendered control');
  assert.ok(box.x >= -1 && box.x + box.width <= result.width + 1, JSON.stringify(box));
  assert.ok(box.y >= -1 && box.y + box.height <= result.height - result.keyboardInset + 1, JSON.stringify(box));
}

async function draft(page, body) {
  const input = page.getByRole('textbox', { name: /Your post/ });
  await input.focus();
  await tick(page);
  assert.equal(await input.inputValue(), body);
  assert.equal(await page.getByRole('checkbox', { name: 'Human-authored', exact: true }).getAttribute('aria-checked'), 'true');
}

async function profileTab(page, name) {
  const tab = page.getByRole('tab', { name: new RegExp('^' + name) });
  await tab.focus();
  // Flutter's scrollable TabBar animates focus scrolling for 300 ms.
  await page.waitForTimeout(350);
  await tab.evaluate(node => node.click());
  await page.getByRole('tab', { name: new RegExp('^' + name), selected: true }).waitFor();
  await focused(page, name);
  assert.equal(await tab.getAttribute('aria-selected'), 'true');
}

try {
  for (const width of numbers('QA_WIDTHS', '320,390'))
    for (const textScale of numbers('QA_SCALES', before ? '2' : '1,2'))
      for (const keyboardInset of numbers('QA_KEYBOARD', before ? '280' : '0,280'))
        for (const theme of (process.env.QA_THEMES ?? 'light,dark').split(',')) {
          const { page, context, result } = await newPage(runtime, { width, height: 640, textScale, keyboardInset, theme });
          const prefix = `${before ? 'before' : 'after'}-scale${textScale}-inset${keyboardInset}`;
          result.name = prefix;
          result.layoutErrors = [];
          page.on('console', message => {
            if (/RenderFlex|overflowed by|EXCEPTION CAUGHT|Another exception/.test(message.text())) result.layoutErrors.push(message.text());
          });
          try {
            assert.equal(await page.title(), 'Lythaus content journey synthetic QA');
            await activate(page, button(page, 'Open composer'), result);
            await page.getByRole('textbox', { name: /Your post/ }).waitFor();
            await reachable(button(page, 'Close composer'), result);
            const body = 'A saved thought for this member.';
            await enterText(page, page.getByRole('textbox', { name: /Your post/ }), body);
            const declaration = page.getByRole('checkbox', { name: 'Human-authored', exact: true });
            await reveal(page, declaration, result);
            await declaration.click();
            await text(page, 'Draft saved on this device.').waitFor();
            await screenshot(page, result, prefix + '-composer');
            const policy = button(page, 'Posting policy');
            await activate(page, policy, result);
            await button(page, 'Done').waitFor();
            await reachable(button(page, 'Done'), result);
            await screenshot(page, result, prefix + '-policy');
            await page.mouse.move(width / 2, Math.max(60, (result.height - keyboardInset) / 2 - 40));
            await page.mouse.wheel(0, 2000);
            await tick(page);
            await reachable(button(page, 'Done'), result);
            await screenshot(page, result, prefix + '-policy-end');
            await button(page, 'Done').click();
            await tick(page);
            if (before) {
              await policy.evaluate(node => { node.click(); node.click(); });
              await button(page, 'Done').waitFor();
              await button(page, 'Done').click();
              await tick(page);
              result.stackedDialog = await button(page, 'Done').count() > 0;
              await screenshot(page, result, prefix + '-repeated-policy');
              result.status = 'baseline captured';
              continue;
            }
            await focused(page, 'Posting policy');
            for (const dismissal of ['Escape', 'Back', 'Done']) {
              await page.keyboard.press('Enter');
              await button(page, 'Done').waitFor();
              if (dismissal === 'Back') await back(page);
              else if (dismissal === 'Escape') await page.keyboard.press('Escape');
              else await button(page, 'Done').click();
              await button(page, 'Done').waitFor({ state: 'hidden' });
              await focused(page, 'Posting policy');
            }
            await policy.evaluate(node => { node.click(); node.click(); });
            await button(page, 'Done').waitFor();
            await button(page, 'Done').click();
            await button(page, 'Done').waitFor({ state: 'hidden' });
            await draft(page, body);
            await activate(page, button(page, 'Close composer'), result);
            await button(page, 'Open composer').waitFor();
            await focused(page, 'Open composer');
            await page.keyboard.press('Enter');
            await page.getByRole('textbox', { name: /Your post/ }).waitFor();
            await draft(page, body);
            await back(page);
            await button(page, 'Open composer').waitFor();
            result.checks.push('Done and Close reachable', 'Done/Escape/native Back restore opener focus', 'Repeated policy activation opens one dialog', 'Close and Back preserve body and declaration');

            await activate(page, button(page, 'Open profile tabs'), result);
            for (const name of ['Posts', 'Comments', 'Overview', 'Posts']) await profileTab(page, name);
            await screenshot(page, result, prefix + '-profile-tabs');
            await activate(page, button(page, 'Open composer'), result);
            await page.getByRole('textbox', { name: /Your post/ }).waitFor();
            await draft(page, body);
            await activate(page, button(page, 'Close composer'), result);
            assert.equal(await page.getByRole('tab', { name: /^Posts/ }).getAttribute('aria-selected'), 'true');
            await text(page, 'Synthetic member posts').waitFor();
            await back(page);
            if (keyboardInset === 0) {
              await activate(page, button(page, 'Open Discover'), result);
              await text(page, 'Kai Rivers').waitFor();
              await page.getByLabel(/Author declaration:\s*Human-authored/).waitFor();
              await screenshot(page, result, prefix + '-feed');
              for (const trigger of ['Feed controls', 'Discover']) {
                await activate(page, button(page, trigger), result);
                await button(page, 'Close feed controls').waitFor();
                await reachable(button(page, 'Close feed controls'), result);
                await screenshot(page, result, prefix + '-feed-controls-' + trigger.replaceAll(' ', '-'));
                await page.keyboard.press('Escape');
                await button(page, 'Close feed controls').waitFor({ state: 'hidden' });
                await focused(page, trigger);
                await page.keyboard.press('Enter');
                await button(page, 'Close feed controls').waitFor();
                await button(page, 'Close feed controls').click();
                await button(page, 'Close feed controls').waitFor({ state: 'hidden' });
                await focused(page, trigger);
              }
              const controls = button(page, 'Feed controls');
              await controls.evaluate(node => { node.click(); node.click(); });
              await button(page, 'Close feed controls').waitFor();
              await button(page, 'Close feed controls').click();
              await button(page, 'Close feed controls').waitFor({ state: 'hidden' });
              result.checks.push('Feed icon/title Close/Escape restore focus and Enter reopens', 'Repeated feed activation opens one sheet', 'Public name and honest declaration remain present');
            }
            result.checks.push('Profile tabs expose selected semantics and retain active pane on composer return');
            assert.equal(result.writes.length, 0);
            assert.deepEqual(result.errors, []);
            assert.deepEqual(result.layoutErrors, []);
            assert.deepEqual(result.blocked, []);
            result.status = 'passed';
          } catch (error) {
            result.status = 'failed'; result.failure = error.stack;
            result.labels = await page.locator('[aria-label]').evaluateAll(nodes => nodes.map(n => ({ role: n.getAttribute('role'), label: n.getAttribute('aria-label') })));
            await screenshot(page, result, prefix + '-failure');
          } finally {
            reports.push(result);
            console.log(JSON.stringify({ width, textScale, keyboardInset, theme, status: result.status, failure: result.failure?.split('\n').slice(0,4).join('\n'), layoutErrors: result.layoutErrors.length, stackedDialog: result.stackedDialog }));
            await context.close();
          }
        }
} finally {
  await runtime.close();
  await writeFile(evidence + '/member-accessibility-results.json', JSON.stringify({ commit: process.env.QA_COMMIT ?? 'working-tree', before, syntheticFixture: true, syntheticKeyboardInset: true, nativeBackViaWidgetsBinding: true, reports }, null, 2));
  process.exitCode = reports.some(result => result.status === 'failed') ? 1 : 0;
}
