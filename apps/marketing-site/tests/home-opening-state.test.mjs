import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const script = readFileSync(new URL('../src/scripts/home-opening.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

async function opening({ asset = 'loaded', unsupported = '', motion = false, animationFails = false } = {}) {
  const root = { dataset: {} };
  const timers = new Map();
  const frames = [];
  const calls = [];
  let nextId = 0;
  const animate = (name) => ({
    animate: (_frames, timing) => {
      if (animationFails) throw new Error('animation unavailable');
      calls.push({ name, timing });
      return { finished: new Promise(() => {}), cancel() {} };
    },
  });
  const position = [animate('position'), animate('exposure')];
  const afterlight = { setAttribute() {} };
  const selectors = {
    '.wordmark-afterlight': afterlight,
    '[data-light-projection]': animate('projection'),
    '[data-light-energy]': animate('energy'),
    '[data-light-core]': animate('core'),
  };
  const scene = {
    querySelector: selector => selectors[selector],
    querySelectorAll: selector => selector === '[data-light-position]' ? position : [],
  };
  const source = { getAttribute: name => name === 'href' ? '/approved-wordmark.svg' : null };
  const document = {
    documentElement: root,
    hidden: false,
    readyState: 'complete',
    fonts: { ready: Promise.resolve() },
    querySelector: selector => selector === '.wordmark-scene' ? scene : selector === '#wordmark-material' ? source : null,
    addEventListener() {},
  };
  const media = { matches: motion, addEventListener() {} };
  const window = {
    matchMedia: () => media,
    SVGMaskElement: unsupported === 'svg-mask' ? undefined : function SVGMaskElement() {},
    scrollY: 0,
    addEventListener() {},
    setTimeout: (callback, delay) => { const id = ++nextId; timers.set(id, { callback, delay }); return id; },
    clearTimeout: id => timers.delete(id),
    requestAnimationFrame: callback => { frames.push(callback); return ++nextId; },
    cancelAnimationFrame() {},
  };
  class FakeImage {
    constructor() { this.naturalWidth = 470; this.naturalHeight = 130; }
    set src(_value) {
      if (asset !== 'pending') queueMicrotask(() => asset === 'loaded' ? this.onload?.() : this.onerror?.());
    }
  }
  class FakeElement {}
  FakeElement.prototype.animate = () => {};
  runInNewContext(script, {
    window, document, Image: FakeImage, Element: FakeElement,
    CSS: { supports: kind => kind !== unsupported },
    AbortController,
    location: { hash: '' },
    performance: { getEntriesByType: () => [{ type: 'navigate' }], now: () => 100 },
    getComputedStyle: () => ({ getPropertyValue: name => ({
      '--reveal-delay': '120', '--reveal-duration': '1080', '--settle-duration': '120', '--light-intensity': '1',
    })[name] }),
  });
  await tick();
  return { root, timers, frames, calls };
}

test('normal supported opening plays only after the approved artwork loads', async () => {
  const state = await opening();
  assert.equal(state.root.dataset.opening, 'armed');
  assert.equal(state.frames.length, 1);
  state.frames[0]();
  assert.equal(state.root.dataset.opening, 'playing');
  assert.deepEqual(state.calls.map(call => call.name), ['position', 'exposure', 'projection', 'energy', 'core']);
});

for (const unsupported of ['svg-mask', 'mask-image', 'filter', 'color']) {
  test(`unsupported ${unsupported} keeps the static fallback`, async () => {
    const state = await opening({ unsupported });
    assert.equal(state.root.dataset.opening, undefined);
    assert.equal(state.frames.length, 0);
    assert.equal(state.calls.length, 0);
  });
}

test('reduced motion keeps the static fallback', async () => {
  const state = await opening({ motion: true });
  assert.equal(state.root.dataset.opening, undefined);
  assert.equal(state.frames.length, 0);
});

test('failed and stalled artwork loads resolve without starting the animation', async () => {
  const failed = await opening({ asset: 'failed' });
  assert.equal(failed.root.dataset.opening, 'resolved');
  assert.equal(failed.frames.length, 0);
  const stalled = await opening({ asset: 'pending' });
  assert.equal(stalled.root.dataset.opening, 'armed');
  const deadline = [...stalled.timers.values()].find(timer => timer.delay === 1200);
  assert.ok(deadline);
  deadline.callback();
  await tick();
  assert.equal(stalled.root.dataset.opening, 'resolved');
  assert.equal(stalled.frames.length, 0);
});

test('animation setup failure resolves to the static fallback', async () => {
  const state = await opening({ animationFails: true });
  state.frames[0]();
  assert.equal(state.root.dataset.opening, 'resolved');
});
