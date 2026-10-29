import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = await readFile('web/startup-presentation.js', 'utf8');
function fixture({reduced = false, hidden = false} = {}) {
  const status = {textContent: 'Loading Lythaus', dataset: {}};
  const retry = {hidden: true, addEventListener: (_, fn) => { retry.click = fn; }};
  const animations = [];
  const target = (mask = false) => ({
    closest: () => mask,
    style: {},
    setAttribute() {},
    animate: (frames, timing) => {
      const animation = {frames, timing, playState: 'running',
        cancel() { this.playState = 'idle'; },
        pause() { this.playState = 'paused'; },
        play() { this.playState = 'running'; }};
      animations.push(animation); return animation;
    },
  });
  const positions = [target(true), target(), target()];
  const scene = {...target(), querySelector: () => target(),
    querySelectorAll: () => positions};
  const overlay = {hidden: true, removed: false, isConnected: true, dataset: {},
    querySelector: selector => selector === 'button' ? retry : selector === '.startup-wordmark-scene' ? scene : status,
    remove: () => { overlay.removed = true; overlay.isConnected = false; }};
  const views = [{inert: false}, {inert: true}];
  const events = new Map();
  const documentEvents = new Map();
  const motionEvents = new Map();
  const motion = {matches: reduced, addEventListener: (type, fn) => motionEvents.set(type, fn), removeEventListener: type => motionEvents.delete(type)};
  const document = {body: {}, hidden, timeline: {currentTime: 0}, getElementById: () => overlay, querySelectorAll: () => views,
    addEventListener: (type, fn) => documentEvents.set(type, fn), removeEventListener: type => documentEvents.delete(type)};
  let timer, cancelled = false, disconnected = false, reloads = 0, observe;
  class Script {}
  const window = {
    matchMedia: () => motion,
    location: {reload: () => reloads++},
    addEventListener: (type, fn) => events.set(type, fn),
    removeEventListener: type => events.delete(type),
  };
  vm.runInNewContext(source, {
    window, HTMLScriptElement: Script,
    document,
    MutationObserver: class {
      constructor(fn) { observe = fn; }
      observe() {}
      disconnect() { disconnected = true; }
    },
    setTimeout: (fn, delay) => { assert.equal(delay, 30000); timer = fn; return 1; },
    clearTimeout: id => { assert.equal(id, 1); cancelled = true; },
  });
  return {window, overlay, status, retry, views, events, Script, observe, timer, animations, positions, document, documentEvents, motion, motionEvents,
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

test('website passage repeats every three seconds with a first-only reveal', () => {
  const f = fixture();
  assert.equal(f.animations.length, 6);
  assert.deepEqual({...f.animations[0].timing}, {fill: 'both', duration: 1080, delay: 120});
  for (const animation of f.animations.slice(1)) {
    assert.equal(animation.timing.duration, 3000);
    assert.equal(animation.timing.iterations, Infinity);
    assert.equal(animation.startTime, 0);
    assert.equal(animation.frames[0].offset, 0);
    assert.equal(animation.frames.at(-1).offset, 1);
  }
  f.timer();
  assert.ok(f.animations.every(animation => animation.playState === 'running'));
  f.window.lythausStartupReady();
  assert.ok(f.animations.every(animation => animation.playState === 'idle'));
  assert.equal(f.documentEvents.size, 0);
  assert.equal(f.motionEvents.size, 0);
});

test('hidden tabs pause and resume existing animations without replay or catch-up', () => {
  const f = fixture();
  f.document.hidden = true; f.documentEvents.get('visibilitychange')();
  assert.ok(f.animations.every(animation => animation.playState === 'paused'));
  f.document.hidden = false; f.documentEvents.get('visibilitychange')();
  assert.equal(f.animations.length, 6);
  assert.ok(f.animations.every(animation => animation.playState === 'running'));
  f.events.get('pagehide')();
  assert.ok(f.animations.every(animation => animation.playState === 'paused'));
  f.events.get('pageshow')();
  assert.ok(f.animations.every(animation => animation.playState === 'running'));
  const background = fixture({hidden: true});
  assert.equal(background.animations.length, 0);
  background.document.hidden = false; background.documentEvents.get('visibilitychange')();
  assert.equal(background.animations.length, 6);
});

test('a finished initial reveal is not replayed after backgrounding', () => {
  const f = fixture(); f.animations[0].playState = 'finished';
  f.events.get('pagehide')(); f.events.get('pageshow')();
  assert.equal(f.animations[0].playState, 'finished');
  assert.ok(f.animations.slice(1).every(animation => animation.playState === 'running'));
});

test('reduced motion stays static and dynamic changes cancel the light', () => {
  const f = fixture({reduced: true});
  assert.equal(f.animations.length, 0);
  assert.equal(f.overlay.dataset.light, undefined);
  f.motion.matches = false; f.motionEvents.get('change')();
  assert.equal(f.animations.length, 5);
  assert.equal(f.positions[0].style.transform, 'translateX(1070px)');
  assert.ok(f.animations.every(animation => animation.timing.iterations === Infinity));
  f.motion.matches = true; f.motionEvents.get('change')();
  assert.ok(f.animations.every(animation => animation.playState === 'idle'));
  assert.equal(f.overlay.dataset.light, undefined);
  f.motion.matches = false; f.motionEvents.get('change')();
  assert.equal(f.animations.length, 10);
  assert.equal(f.positions[0].style.transform, 'translateX(1070px)');
  assert.ok(f.animations.slice(5).every(animation => animation.timing.iterations === Infinity));
});

test('enabling motion after an interrupted reveal keeps the wordmark settled', () => {
  const f = fixture();
  assert.equal(f.animations.length, 6);
  f.motion.matches = true; f.motionEvents.get('change')();
  assert.ok(f.animations.every(animation => animation.playState === 'idle'));
  f.motion.matches = false; f.motionEvents.get('change')();
  assert.equal(f.positions[0].style.transform, 'translateX(1070px)');
  assert.equal(f.animations.length, 11);
  assert.ok(f.animations.slice(6).every(animation => animation.timing.iterations === Infinity));
  f.window.lythausStartupReady();
  assert.ok(f.animations.every(animation => animation.playState === 'idle'));
});

test('failure cancels light and slow timer and cannot restart on resume', () => {
  const f = fixture(); f.window.lythausStartupFailed();
  assert.equal(f.state().cancelled, true);
  assert.ok(f.animations.every(animation => animation.playState === 'idle'));
  f.events.get('pageshow')(); f.documentEvents.get('visibilitychange')(); f.motionEvents.get('change')();
  assert.equal(f.animations.length, 6);
  assert.match(f.status.textContent, /could not open/);
  assert.equal(f.status.dataset.visible, '');
});

test('external disposal stops light and restores previous inert states', () => {
  const f = fixture(); f.overlay.isConnected = false; f.observe();
  assert.ok(f.animations.every(animation => animation.playState === 'idle'));
  assert.deepEqual(f.views.map(view => view.inert), [false, true]);
  assert.equal(f.state().disconnected, true);
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
