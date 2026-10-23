import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = await readFile('web/startup-presentation.js', 'utf8');
function fixture() {
  const status = {textContent: 'Opening Lythaus…'};
  const retry = {hidden: true, addEventListener: (_, fn) => { retry.click = fn; }};
  const overlay = {hidden: true, removed: false, querySelector: selector => selector === 'button' ? retry : status, remove: () => { overlay.removed = true; }};
  const views = [{inert: false}, {inert: true}];
  const events = new Map();
  let timer, cancelled = false, disconnected = false, reloads = 0, observe;
  class Script {}
  const window = {
    location: {reload: () => reloads++},
    addEventListener: (type, fn) => events.set(type, fn),
    removeEventListener: type => events.delete(type),
  };
  vm.runInNewContext(source, {
    window, HTMLScriptElement: Script,
    document: {body: {}, getElementById: () => overlay, querySelectorAll: () => views},
    MutationObserver: class {
      constructor(fn) { observe = fn; }
      observe() {}
      disconnect() { disconnected = true; }
    },
    setTimeout: (fn, delay) => { assert.equal(delay, 30000); timer = fn; return 1; },
    clearTimeout: id => { assert.equal(id, 1); cancelled = true; },
  });
  return {window, overlay, status, retry, views, events, Script, observe, timer,
    state: () => ({cancelled, disconnected, reloads})};
}

test('startup blocks only until ready and restores prior inert states once', () => {
  const f = fixture();
  f.window.lythausStartupDeferred();
  f.events.get('flutter-first-frame')();
  assert.equal(f.overlay.removed, false);
  assert.equal(f.overlay.hidden, false);
  assert.deepEqual(f.views.map(v => v.inert), [true, true]);
  f.views.push({inert: false}); f.observe();
  assert.equal(f.views[2].inert, true);
  f.window.lythausStartupReady();
  assert.equal(f.overlay.removed, true);
  assert.deepEqual(f.views.map(v => v.inert), [false, true, false]);
  assert.deepEqual(f.state(), {cancelled: true, disconnected: true, reloads: 0});
  f.window.lythausStartupReady(); f.window.lythausStartupFailed(); f.timer();
  assert.equal(f.retry.hidden, true);
  assert.equal(f.events.size, 0);
});

test('standalone Flutter entrypoints finish on their natural first frame', () => {
  const f = fixture();
  f.events.get('flutter-first-frame')();
  assert.equal(f.overlay.removed, true);
  assert.equal(f.views[0].inert, false);
  assert.equal(f.events.size, 0);
});

test('slow startup offers reload without dismissing the loader or restarting auth', () => {
  const f = fixture(); f.timer();
  assert.match(f.status.textContent, /taking longer/);
  assert.equal(f.retry.hidden, false);
  assert.equal(f.overlay.removed, false);
  assert.equal(f.state().reloads, 0);
  f.retry.click(); assert.equal(f.state().reloads, 1);
  f.window.lythausStartupReady(); assert.equal(f.overlay.removed, true);
});

test('entrypoint download failure offers retry; unrelated resource errors do not', () => {
  const f = fixture();
  f.events.get('error')({target: {src: 'other.png'}});
  assert.equal(f.retry.hidden, true);
  const script = new f.Script(); script.src = 'https://app.example.invalid/main.dart.js';
  f.events.get('error')({target: script});
  assert.match(f.status.textContent, /could not open/);
  assert.equal(f.retry.hidden, false);
  assert.equal(f.overlay.removed, false);
});

test('content-addressed release scripts also expose a failed download', () => {
  for (const name of ['main.dart.0123456789abcdef.js', 'flutter_bootstrap.0123456789abcdef.js']) {
    const f = fixture();
    const script = new f.Script(); script.src = `https://app.example.invalid/${name}`;
    f.events.get('error')({target: script});
    assert.equal(f.retry.hidden, false);
    assert.match(f.status.textContent, /could not open/);
  }
});
