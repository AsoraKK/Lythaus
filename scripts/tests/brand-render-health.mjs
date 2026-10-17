import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

// Install before newPage/goto so startup failures and canvas events are retained.
export async function observeRenderHealth(context, origin) {
  const network = { responses: [], failed: [], errors: [], crashes: 0 };
  const pending=[];
  context.on('response', response => {
    const record={url:response.url(),status:response.status(),local:new URL(response.url()).origin===origin};
    network.responses.push(record);
    pending.push(response.body().then(body=>{record.sha256=createHash('sha256').update(body).digest('hex');})
      .catch(error=>{record.bodyError=error.message;}));
  });
  context.on('requestfailed', request => network.failed.push({
    url: request.url(), error: request.failure()?.errorText,
  }));
  context.on('page', page => {
    page.on('pageerror', error => network.errors.push(error.message));
    page.on('console', message => {if(message.type()==='error')network.errors.push(message.text());});
    page.on('crash', () => network.crashes++);
  });
  await context.addInitScript(() => {
    const health = window.__brandHealth = { frames: 0, events: [], contexts: [], started: performance.now() };
    const observed = new WeakSet();
    const instrument=prototype=>{
    const original = prototype.getContext;
    prototype.getContext = function(type, ...args) {
      if (!observed.has(this)) {
        observed.add(this);
        for (const name of ['webglcontextlost', 'webglcontextrestored', 'contextlost', 'contextrestored'])
          this.addEventListener(name, () => health.events.push({ name, at: performance.now() }));
      }
      const result = original.call(this, type, ...args);
      health.contexts.push({ type, available: !!result });
      return result;
    };
    };
    instrument(HTMLCanvasElement.prototype);
    if(typeof OffscreenCanvas!=='undefined')instrument(OffscreenCanvas.prototype);
    const frame = () => { health.frames++; requestAnimationFrame(frame); };
    requestAnimationFrame(frame);
    window.addEventListener('unhandledrejection', event => health.events.push({ name: 'unhandledrejection', reason: String(event.reason) }));
  });
  return async page => {await Promise.all(pending);return ({ ...network, page: await page.evaluate(() => ({
    ...window.__brandHealth, now: performance.now(), readyState: document.readyState,
    visibility: document.visibilityState, semantics: document.querySelectorAll('flt-semantics').length,
    canvases: [...document.querySelectorAll('canvas')].map(c => ({width:c.width,height:c.height})),
  })) });};
}

export function assertRenderHealth(health) {
  assert.equal(health.crashes, 0, 'Browser page crashed');
  assert.deepEqual(health.errors, [], 'Page errors');
  assert.deepEqual(health.failed, [], 'Failed network requests');
  assert.ok(health.responses.length > 0, 'Local responses were observed');
  assert.deepEqual(health.responses.filter(r => r.status < 200 || r.status >= 400), [], 'Local HTTP failures');
  assert.deepEqual(health.page.events, [], 'Canvas context loss or unhandled rejection');
  assert.ok(health.page.frames > 2, 'Animation frame heartbeat');
  assert.equal(health.page.readyState, 'complete');
}

export function assertFlutterFixtureReady(state, requireImage=true) {
  assert.ok(state?.frames>0, 'No Dart Flutter frame callback');
  assert.ok(state.paints?.rectangle>0 && state.paints?.text>0, 'No Dart control paint callbacks');
  if(requireImage){
    assert.ok(!state.image?.error, 'ImageStream decode error: '+state.image?.error);
    assert.ok(state.image?.decoded && state.image?.frameReady, 'PNG decode/frame-ready timeout; presentation undetermined');
  }
}
