import { performance } from 'node:perf_hooks';

export function describeFailureWindow(request, marks, ownerId) {
  const { startedAt, failedAt } = request;
  let window = 'unobserved_start';
  if (Number.isFinite(startedAt) && Number.isFinite(failedAt)) {
    if (marks.teardownAt != null && failedAt >= marks.teardownAt) window = 'teardown';
    else if (marks.intentAt == null || failedAt < marks.intentAt) window = 'before_signout_intent';
    else if (startedAt >= marks.intentAt) window = 'started_after_signout_intent';
    else if (marks.finishedAt != null && failedAt > marks.finishedAt) window = 'after_logout_response';
    else window = 'during_explicit_signout';
  }
  const profileRead = request.origin === 'https://api.lythaus.co' && request.method === 'GET'
    && [ '/api/users/me', `/api/users/${ownerId}` ].includes(request.path);
  return { window, profileRead };
}

export function createAuthRequestLifecycle({ ownerId, clock = () => performance.now(), limit = 1024 }) {
  const began = clock(), events = [], requests = new WeakMap(), pages = new WeakMap();
  const marks = { intentAt: null, finishedAt: null, teardownAt: null };
  let sequence = 0, requestSequence = 0, pageSequence = 0, dropped = 0, phase = 'entry';
  const time = () => Number((clock() - began).toFixed(3));
  const safePath = value => {
    const parsed = new URL(value, 'https://app.lythaus.co');
    const pathname = parsed.pathname.replaceAll(ownerId, '{synthetic-owner}');
    return /^\/(?:api\/(?:auth\/(?:email|refresh|userinfo|logout)|users\/(?:me(?:\/reputation)?|\{synthetic-owner\})|feed\/discover|subscription\/status|custom-feeds|reputation\/me|rewards\/me\/monthly)|settings(?:\/security)?|login|forgot-password|resend-verification)?$/.test(pathname)
      ? pathname : '/[redacted]';
  };
  const record = (type, fields = {}) => {
    const ms = time();
    if (type === 'dom_signout_click' && marks.intentAt == null) marks.intentAt = ms;
    if (type === 'logout_response_finished') marks.finishedAt = ms;
    if (type === 'teardown_start') marks.teardownAt = ms;
    if (events.length < limit) events.push({ sequence: ++sequence, ms, phase, type, ...fields });
    else dropped++;
  };
  const pageId = page => {
    if (!pages.has(page)) pages.set(page, ++pageSequence);
    return pages.get(page);
  };
  const relevant = request => new URL(request.url()).origin === 'https://api.lythaus.co' || request.isNavigationRequest();
  const info = (request, started = false) => {
    if (!requests.has(request)) {
      const url = new URL(request.url());
      requests.set(request, { requestId: ++requestSequence, pageId: pageId(request.frame().page()),
        method: request.method(), path: url.pathname, origin: url.origin, startedAt: started ? time() : undefined });
    }
    return requests.get(request);
  };
  const projection = item => ({ requestId: item.requestId, pageId: item.pageId, method: item.method,
    path: safePath(item.path), startedAt: item.startedAt });
  return {
    record,
    phase(name) { phase = name; record('phase'); },
    server(request, status) { record(status == null ? 'server_request' : 'server_response', {
      method: request.method(), path: safePath(request.url()), ...(status == null ? {} : { status }),
    }); },
    async install(context) {
      context.on('request', request => {
        if (relevant(request)) record('request_start', projection(info(request, true)));
      });
      context.on('response', response => {
        if (relevant(response.request())) record('response_headers', {
          ...projection(info(response.request())), status: response.status(),
        });
      });
      context.on('requestfinished', request => {
        if (relevant(request)) record('request_finished', projection(info(request)));
      });
      context.on('requestfailed', request => {
        if (!relevant(request)) return;
        const item = info(request);
        const error = request.failure()?.errorText;
        record('request_failed', { ...projection(item), error:
          ['Load request cancelled', 'net::ERR_ABORTED', 'net::ERR_FAILED'].includes(error) ? error : 'other_network_failure',
          ...describeFailureWindow({ ...item, failedAt: time() }, marks, ownerId) });
      });
      context.on('page', page => page.on('framenavigated', frame => {
        if (frame === page.mainFrame()) record('navigation', { pageId: pageId(page), path: safePath(frame.url()) });
      }));
      await context.exposeBinding('__lythausAuthDiagnostic', ({ page }, event) => record(event.type, {
        pageId: pageId(page), path: safePath(event.path), browserEpochMs: event.browserEpochMs,
        ...(event.xhrId == null ? {} : { xhrId: event.xhrId, method: event.method }),
      }));
      await context.addInitScript(() => {
        const send = (type, pathname = location.pathname, extra = {}) => {
          void window.__lythausAuthDiagnostic({ type, path: pathname,
            browserEpochMs: performance.timeOrigin + performance.now(), ...extra }).catch(() => {});
        };
        document.addEventListener('click', event => {
          for (let node = event.target; node instanceof Element; node = node.parentElement) {
            const label = (node.getAttribute('aria-label') || node.textContent || '').trim();
            if (label === 'Sign out of all sessions') { send('dom_signout_click'); break; }
            if (label === 'Back') { send('dom_back_click'); break; }
          }
        }, true);
        const open = XMLHttpRequest.prototype.open, sendRequest = XMLHttpRequest.prototype.send;
        const abort = XMLHttpRequest.prototype.abort, metadata = new WeakMap(); let sequence = 0;
        XMLHttpRequest.prototype.open = function(method, value, ...rest) {
          const url = new URL(value, location.href);
          if (url.origin === 'https://api.lythaus.co') {
            const item = { xhrId: ++sequence, method, path: url.pathname }; metadata.set(this, item);
            for (const type of ['load', 'error', 'abort', 'loadend']) {
              this.addEventListener(type, () => send('xhr_' + type, item.path, item));
            }
          }
          return open.call(this, method, value, ...rest);
        };
        XMLHttpRequest.prototype.send = function(...args) {
          const item = metadata.get(this); if (item) send('xhr_send', item.path, item);
          return sendRequest.apply(this, args);
        };
        XMLHttpRequest.prototype.abort = function(...args) {
          const item = metadata.get(this); if (item) send('xhr_abort_called', item.path, item);
          return abort.apply(this, args);
        };
      });
    },
    snapshot() { return { schemaVersion: 1, synthetic: true, purpose: 'diagnosis_only_no_failure_acceptance',
      clock: 'Node monotonic milliseconds; browserEpochMs records browser DOM/XHR order',
      dropped, marks: { ...marks }, events: events.map(event => ({ ...event })) }; },
  };
}
