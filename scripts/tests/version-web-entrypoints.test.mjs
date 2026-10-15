import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { versionWebEntrypoints } from '../ci/version-web-entrypoints.mjs';

function fixture(t, main = 'window.release = "first";') {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'lythaus-web-version-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  writeFileSync(path.join(directory, 'main.dart.js'), main);
  writeFileSync(path.join(directory, 'flutter_bootstrap.js'), '_flutter.buildConfig = {"builds":[{"mainJsPath":"main.dart.js"}]};\n_flutter.loader.load();');
  writeFileSync(path.join(directory, 'release-update.js'), 'window.lythausReleaseUpdates = {};');
  writeFileSync(path.join(directory, 'index.html'), '<base href="/"><meta name="lythaus-release-id" content="__LYTHAUS_WEB_RELEASE_ID__"><title>Lythaus</title><script src="release-update.js"></script><script src="flutter_bootstrap.js" async></script>');
  return directory;
}

test('an updated app changes both script URLs and preserves source bytes', t => {
  const first = fixture(t);
  const second = fixture(t, 'window.release = "second";');
  const before = versionWebEntrypoints(first);
  const after = versionWebEntrypoints(second);
  assert.notEqual(after.main.file, before.main.file);
  assert.notEqual(after.bootstrap.file, before.bootstrap.file);
  assert.notEqual(after.releaseId, before.releaseId);
  assert.ok(readFileSync(path.join(second, 'index.html'), 'utf8').includes(`src="${after.bootstrap.file}"`));
  assert.ok(readFileSync(path.join(second, 'index.html'), 'utf8').includes(`content="${after.releaseId}"`));
  assert.ok(readFileSync(path.join(second, 'index.html'), 'utf8').includes(`src="${after.updateClient.file}"`));
  assert.ok(readFileSync(path.join(second, after.bootstrap.file), 'utf8').includes(`"mainJsPath":"${after.main.file}"`));
  for (const [directory, manifest] of [[first, before], [second, after]]) {
    assert.deepEqual(readFileSync(path.join(directory, manifest.main.file)), readFileSync(path.join(directory, 'main.dart.js')));
    assert.deepEqual(readFileSync(path.join(directory, manifest.updateClient.file)), readFileSync(path.join(directory, 'release-update.js')));
    for (const entry of [manifest.main, manifest.bootstrap, manifest.updateClient, manifest.index]) {
      assert.equal(createHash('sha256').update(readFileSync(path.join(directory, entry.file))).digest('hex'), entry.sha256);
    }
  }
});

test('unchanged builds retain identical content URLs', t => {
  assert.deepEqual(versionWebEntrypoints(fixture(t)), versionWebEntrypoints(fixture(t)));
});

test('an unexpected Flutter bootstrap fails before modifying the document', t => {
  const directory = fixture(t);
  const before = readFileSync(path.join(directory, 'index.html'), 'utf8');
  writeFileSync(path.join(directory, 'flutter_bootstrap.js'), 'unexpected build layout');
  assert.throws(() => versionWebEntrypoints(directory), /Expected one Flutter main entrypoint/);
  assert.equal(readFileSync(path.join(directory, 'index.html'), 'utf8'), before);
});

test('all app routes revalidate cached documents without clearing session storage', () => {
  const headers = readFileSync(new URL('../../web/_headers', import.meta.url), 'utf8');
  const globalRules = headers.split(/\r?\n\r?\n/)[0];
  assert.match(globalRules, /^\/\*\r?\n  Cache-Control: no-cache, max-age=0, must-revalidate/m);
  assert.match(headers, /\/web-release-assets\.json\r?\n  Cache-Control: no-store, max-age=0, must-revalidate/);
  for (const asset of [
    '/main.dart.*.js',
    '/flutter_bootstrap.*.js',
    '/release-update.*.js',
  ]) {
    assert.ok(
      headers.includes(
        asset +
          String.fromCharCode(10) +
          '  Cache-Control: public, max-age=31536000, immutable',
      ),
    );
  }
  assert.doesNotMatch(headers, /Clear-Site-Data/);
});

test('release identity includes the loaded updater and document inputs', t => {
  const original = fixture(t);
  const changedUpdater = fixture(t);
  const originalManifest = versionWebEntrypoints(original);
  writeFileSync(path.join(changedUpdater, 'release-update.js'), 'window.lythausReleaseUpdates = {changed:true};');
  const changedManifest = versionWebEntrypoints(changedUpdater);
  assert.notEqual(changedManifest.releaseId, originalManifest.releaseId);
});

test('canonical web builds keep the renderer in the reviewed first-party artifact', () => {
  const script = readFileSync(new URL('../cf-pages-build.sh', import.meta.url), 'utf8');
  assert.match(script, /flutter build web --release --no-tree-shake-icons --no-web-resources-cdn/);
});

test('Pages builds replace Flutter service-worker navigation with network pass-through', () => {
  const build = readFileSync(new URL('../cf-pages-build.sh', import.meta.url), 'utf8');
  const worker = readFileSync(new URL('../ci/flutter-service-worker.js', import.meta.url), 'utf8');
  assert.match(build, /cp scripts\/ci\/flutter-service-worker\.js build\/web\/flutter_service_worker\.js/);
  assert.match(worker, /self\.skipWaiting\(\)/);
  assert.match(worker, /self\.clients\.claim\(\)/);
  assert.match(worker, /self\.registration\.unregister\(\)/);
  assert.match(worker, /event\.respondWith\(fetch\(event\.request\)\)/);
  assert.doesNotMatch(worker, /client\.navigate|clients\.forEach/);
});

test('app anchors Flutter semantics at the view origin without changing the marketing homepage', () => {
  const html = readFileSync(new URL('../../web/index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../../web/flutter-semantics.css', import.meta.url), 'utf8');
  assert.match(html, /<link rel="stylesheet" href="flutter-semantics.css">/);
  assert.match(css, /flt-semantics-host\s*\{\s*left:\s*0;\s*top:\s*0;\s*\}/);
});
