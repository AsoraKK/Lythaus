import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const template = await readFile('web/flutter_bootstrap.js', 'utf8');
const script = template
  .replace('{{flutter_js}}', '')
  .replace('{{flutter_build_config}}', '')
  .replace('{{flutter_service_worker_version}}', '"test-release"');

for (const [browser, vendor] of [
  ['WebKit', 'Apple Computer, Inc.'],
  ['Chromium', 'Google Inc.'],
  ['Firefox', ''],
]) {
  test(`${browser} selects its rendering path without changing release startup`, () => {
    const calls = [];
    vm.runInNewContext(script, {
      navigator: { vendor },
      _flutter: { loader: { load: options => calls.push(options) } },
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].config?.canvasKitForceCpuOnly, undefined);
    assert.equal(calls[0].serviceWorkerSettings.serviceWorkerVersion, 'test-release');
  });
}
