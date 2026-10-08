import { randomUUID } from 'node:crypto';

export async function freshOwnerReadFence(page, { navigationUrl, ownerId, semanticReady, timeoutMs = 15000 }) {
  const expectedNavigation = new URL(navigationUrl).href;
  const mainFrame = page.mainFrame();
  const markerKey = '__lythausOwnerDocument_' + randomUUID();
  // Runs only in future documents, after creation and before application scripts. Both clocks use Unix epoch milliseconds.
  await page.addInitScript(key => {
    Object.defineProperty(globalThis, key, { value: Object.freeze({
      documentUrl: location.href, createdAt: performance.timeOrigin + performance.now(),
    }) });
  }, markerKey);
  let documentRequest, documentEvidence, committed = false, ownerRequest, settled = false;
  let resolveResult;
  const result = new Promise(resolve => { resolveResult = resolve; });
  const cleanup = () => {
    clearTimeout(timer);
    page.off('request', onRequest);
    page.off('response', onResponse);
    page.off('requestfailed', onFailed);
    page.off('framenavigated', onNavigation);
    page.off('close', onClose);
  };
  const finish = (error, value) => {
    if (settled) return;
    settled = true; cleanup(); resolveResult({ error, value });
  };
  const fail = message => finish(new Error(message));
  const onRequest = request => {
    if (request.frame() !== mainFrame) return;
    if (request.isNavigationRequest()) {
      if (documentRequest) { fail('Fresh owner read became stale after another document navigation'); return; }
      if (request.method() !== 'GET' || new URL(request.url()).href !== expectedNavigation) {
        fail('Security reload navigated to an unexpected document'); return;
      }
      documentRequest = request;
      return;
    }
    if (committed && !ownerRequest && request.method() === 'GET'
      && request.url() === 'https://api.lythaus.co/api/users/me') ownerRequest = request;
  };
  const onNavigation = frame => {
    if (frame !== mainFrame || !documentRequest || committed) return;
    if (new URL(frame.url()).href !== expectedNavigation) {
      fail('Security reload did not commit the expected document'); return;
    }
    committed = true;
    documentEvidence = frame.evaluate(key => globalThis[key], markerKey).catch(() => {
      fail('Fresh document initialization evidence could not be read');
    });
  };
  const onFailed = request => {
    if (request === ownerRequest) fail('Fresh owner read was aborted');
    if (request === documentRequest) fail('Security document reload was aborted');
  };
  const onClose = () => fail('Page closed before fresh owner readiness');
  const onResponse = response => {
    if (response.request() !== ownerRequest || !ownerRequest || settled) return;
    void complete(response);
  };
  async function complete(response) {
    try {
      if (response.status() !== 200) { fail(`Fresh owner read returned status ${response.status()}`); return; }
      const error = await response.finished();
      if (settled) return;
      if (error) { fail('Fresh owner response body did not finish'); return; }
      const ownerStart = ownerRequest.timing().startTime;
      const documentStart = documentRequest.timing().startTime;
      if (!Number.isFinite(ownerStart) || !Number.isFinite(documentStart) || ownerStart <= 0 || documentStart <= 0) {
        fail('Fresh owner read timing evidence is unavailable'); return;
      }
      const initialized = await documentEvidence;
      if (settled) return;
      if (!initialized || initialized.documentUrl !== expectedNavigation || !Number.isFinite(initialized.createdAt)
        || initialized.createdAt < documentStart) {
        fail('Fresh document initialization timing evidence is unavailable'); return;
      }
      if (ownerStart < initialized.createdAt) { fail('Owner response belongs to a stale document request'); return; }
      const body = await response.json();
      if (settled) return;
      if (body?.user?.id !== ownerId) { fail('Fresh owner response does not match the signed-in owner'); return; }
      await semanticReady();
      if (settled) return;
      finish(null, { response, documentNavigationStartedAtEpochMs: documentStart,
        documentInitializedAtEpochMs: initialized.createdAt, ownerRequestStartedAtEpochMs: ownerStart });
    } catch {
      fail('Fresh owner response or semantic readiness could not complete');
    }
  }
  const timer = setTimeout(() => fail('Fresh owner readiness timed out'), timeoutMs);
  page.on('request', onRequest);
  page.on('response', onResponse);
  page.on('requestfailed', onFailed);
  page.on('framenavigated', onNavigation);
  page.on('close', onClose);
  return {
    async ready() { const outcome = await result; if (outcome.error) throw outcome.error; return outcome.value; },
    dispose() { fail('Fresh owner readiness was disposed'); },
  };
}
