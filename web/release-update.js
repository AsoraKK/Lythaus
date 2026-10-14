(() => {
  'use strict';

  const releaseIdElement = document.querySelector(
    'meta[name="lythaus-release-id"]',
  );
  const currentReleaseId = releaseIdElement?.content ?? '';
  const releaseIdPattern = /^[a-f0-9]{64}$/i;
  const assetHashPattern = /^[a-f0-9]{64}$/i;
  const mainFilePattern = /^main\.dart\.([a-f0-9]{16})\.js$/i;
  const bootstrapFilePattern = /^flutter_bootstrap\.([a-f0-9]{16})\.js$/i;
  const updateClientFilePattern = /^release-update\.([a-f0-9]{16})\.js$/i;
  const attemptStorageKey = 'lythaus.web-release.attempted.v1';
  const pollIntervalMs = 5 * 60 * 1000;
  const requestTimeoutMs = 5000;

  const state = {
    available: false,
    targetReleaseId: null,
    canReload: false,
    checking: false,
    confirming: false,
    reloadRequested: false,
  };

  let pollTimer = null;
  let banner = null;
  let bannerMessage = null;
  let reloadButton = null;

  function attemptedReleaseId() {
    try {
      return window.sessionStorage.getItem(attemptStorageKey);
    } catch (_) {
      return null;
    }
  }

  function canRecordAttempt() {
    try {
      const probeKey = `${attemptStorageKey}.probe`;
      window.sessionStorage.setItem(probeKey, '1');
      window.sessionStorage.removeItem(probeKey);
      return true;
    } catch (_) {
      return false;
    }
  }

  function rememberAttempt(releaseId) {
    try {
      window.sessionStorage.setItem(attemptStorageKey, releaseId);
      return true;
    } catch (_) {
      return false;
    }
  }

  function clearAttempt() {
    try {
      window.sessionStorage.removeItem(attemptStorageKey);
    } catch (_) {
      // A storage restriction must not turn an ordinary page into an error.
    }
  }

  function validAsset(entry, pattern) {
    if (!entry || typeof entry.file !== 'string' ||
        typeof entry.sha256 !== 'string' ||
        !assetHashPattern.test(entry.sha256)) {
      return false;
    }
    const match = pattern.exec(entry.file);
    return match !== null && entry.sha256.startsWith(match[1].toLowerCase());
  }

  function validManifest(value) {
    return value !== null && typeof value === 'object' &&
      value.schemaVersion === 1 &&
      typeof value.releaseId === 'string' &&
      releaseIdPattern.test(value.releaseId) &&
      validAsset(value.main, mainFilePattern) &&
      validAsset(value.bootstrap, bootstrapFilePattern) &&
      validAsset(value.updateClient, updateClientFilePattern);
  }

  async function fetchWithTimeout(url, init) {
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      requestTimeoutMs,
    );
    try {
      return await window.fetch(url, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function fetchTextWithTimeout(url, init) {
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      requestTimeoutMs,
    );
    try {
      const response = await window.fetch(url, {
        ...init,
        signal: controller.signal,
      });
      return { response, text: await response.text() };
    } finally {
      window.clearTimeout(timeout);
    }
  }

  async function readReleaseManifest() {
    if (!window.navigator.onLine) return null;
    const url = new URL('web-release-assets.json', document.baseURI);
    url.searchParams.set(
      'check',
      `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    );
    try {
      const { response, text } = await fetchTextWithTimeout(url, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache, no-store',
          Pragma: 'no-cache',
        },
      });
      if (!response.ok ||
          !/application\/(?:[a-z0-9.+-]*\+)?json/i.test(
            response.headers.get('content-type') ?? '',
          )) {
        return null;
      }
      const manifest = JSON.parse(text);
      return validManifest(manifest) ? manifest : null;
    } catch (_) {
      return null;
    }
  }

  function renderBanner() {
    if (!state.available || !state.targetReleaseId) {
      banner?.remove();
      banner = null;
      bannerMessage = null;
      reloadButton = null;
      return;
    }

    if (banner === null) {
      banner = document.createElement('section');
      banner.id = 'lythaus-web-release-update';
      banner.setAttribute('role', 'status');
      banner.setAttribute('aria-live', 'polite');
      Object.assign(banner.style, {
        position: 'fixed',
        top: 'max(12px, env(safe-area-inset-top))',
        left: '12px',
        right: '12px',
        zIndex: '2147483647',
        maxWidth: '720px',
        margin: '0 auto',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        borderRadius: '12px',
        background: '#17212b',
        color: '#fff',
        boxShadow: '0 4px 18px rgba(0, 0, 0, 0.28)',
        font: '500 14px/1.4 system-ui, sans-serif',
      });
      bannerMessage = document.createElement('span');
      bannerMessage.style.flex = '1';
      reloadButton = document.createElement('button');
      reloadButton.type = 'button';
      reloadButton.textContent = 'Reload app';
      Object.assign(reloadButton.style, {
        border: '0',
        borderRadius: '8px',
        padding: '9px 14px',
        background: '#d8e9ff',
        color: '#10243a',
        font: '600 14px/1 system-ui, sans-serif',
        cursor: 'pointer',
      });
      reloadButton.addEventListener('click', () => {
        void tryReload(state.targetReleaseId, true);
      });
      banner.append(bannerMessage, reloadButton);
      document.body.append(banner);
    }

    const alreadyTried = attemptedReleaseId() === state.targetReleaseId;
    const attemptStorageAvailable = canRecordAttempt();
    bannerMessage.textContent = !attemptStorageAvailable
      ? 'An app update is ready. Browser storage is unavailable, so reloading is paused to prevent a reload loop.'
      : state.canReload
      ? alreadyTried
        ? 'An app update is ready. Reload this tab to finish updating.'
        : state.confirming
        ? 'Checking the new app files before restarting…'
        : 'An app update is ready. Restarting when the release is available…'
      : 'An app update is ready. Finish or save your current work before restarting.';
    reloadButton.disabled = !state.canReload ||
      !attemptStorageAvailable || state.confirming || state.reloadRequested ||
      !window.navigator.onLine;
    reloadButton.setAttribute(
      'aria-label',
      alreadyTried ? 'Reload app' : 'Restart app',
    );
    reloadButton.style.opacity = reloadButton.disabled ? '0.6' : '1';
    reloadButton.style.cursor = reloadButton.disabled ? 'not-allowed' : 'pointer';
  }

  async function verifyCandidateAssets(manifest) {
    const indexUrl = new URL('index.html', document.baseURI);
    try {
      const { response: indexResponse, text: html } =
        await fetchTextWithTimeout(indexUrl, {
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin',
        headers: { 'Cache-Control': 'no-cache, no-store' },
      });
      if (!indexResponse.ok ||
          !/text\/html/i.test(indexResponse.headers.get('content-type') ?? '')) {
        return false;
      }
      const identity = html.match(
        /<meta\s+name=["']lythaus-release-id["']\s+content=["']([a-f0-9]{64})["']/i,
      );
      if (identity?.[1]?.toLowerCase() !== manifest.releaseId.toLowerCase()) {
        return false;
      }

      for (const entry of [manifest.main, manifest.bootstrap, manifest.updateClient]) {
        const assetUrl = new URL(entry.file, document.baseURI);
        if (assetUrl.origin !== window.location.origin) return false;
        const response = await fetchWithTimeout(assetUrl, {
          method: 'HEAD',
          cache: 'no-store',
          credentials: 'same-origin',
          headers: { 'Cache-Control': 'no-cache, no-store' },
        });
        if (!response.ok ||
            !/javascript/i.test(response.headers.get('content-type') ?? '')) {
          return false;
        }
      }
      return true;
    } catch (_) {
      return false;
    }
  }

  async function tryReload(expectedReleaseId, manual) {
    if (!state.available || !state.canReload || state.confirming ||
        state.reloadRequested || !expectedReleaseId ||
        !window.navigator.onLine || !canRecordAttempt()) {
      return false;
    }
    if (!manual && attemptedReleaseId() === expectedReleaseId) return false;

    state.confirming = true;
    renderBanner();
    try {
      let candidate = null;
      let verified = false;
      for (let recheck = 0; recheck < 3; recheck += 1) {
        candidate = await readReleaseManifest();
        if (!candidate) return false;
        if (candidate.releaseId.toLowerCase() === currentReleaseId.toLowerCase()) {
          state.available = false;
          state.targetReleaseId = null;
          clearAttempt();
          renderBanner();
          return false;
        }
        if (candidate.releaseId.toLowerCase() !== expectedReleaseId.toLowerCase()) {
          expectedReleaseId = candidate.releaseId;
          state.targetReleaseId = candidate.releaseId;
          state.available = true;
          renderBanner();
          continue;
        }
        if (await verifyCandidateAssets(candidate)) {
          verified = true;
          break;
        }
        return false;
      }

      if (!verified || !candidate ||
          candidate.releaseId.toLowerCase() !== expectedReleaseId.toLowerCase() ||
          !state.canReload || !window.navigator.onLine) {
        return false;
      }

      if (!manual && attemptedReleaseId() === candidate.releaseId) return false;
      if (!rememberAttempt(candidate.releaseId)) return false;
      state.reloadRequested = true;
      renderBanner();
      window.location.reload();
      return true;
    } finally {
      state.confirming = false;
      renderBanner();
    }
  }

  async function checkNow() {
    if (state.checking || !releaseIdPattern.test(currentReleaseId) ||
        !window.navigator.onLine) {
      return;
    }
    state.checking = true;
    try {
      const manifest = await readReleaseManifest();
      if (!manifest) return;
      if (manifest.releaseId.toLowerCase() === currentReleaseId.toLowerCase()) {
        state.available = false;
        state.targetReleaseId = null;
        clearAttempt();
        return;
      }
      state.available = true;
      state.targetReleaseId = manifest.releaseId;
    } finally {
      state.checking = false;
      renderBanner();
      if (state.available && state.canReload) {
        void tryReload(state.targetReleaseId, false);
      }
    }
  }

  function setCanReload(canReload) {
    state.canReload = canReload === true;
    renderBanner();
    if (state.canReload && state.available) {
      void tryReload(state.targetReleaseId, false);
    }
  }

  function snapshot() {
    return Object.freeze({
      currentReleaseId,
      targetReleaseId: state.targetReleaseId,
      available: state.available,
      canReload: state.canReload,
      checking: state.checking,
      confirming: state.confirming,
      reloadRequested: state.reloadRequested,
      attemptedReleaseId: attemptedReleaseId(),
    });
  }

  function syncPolling() {
    if (document.visibilityState === 'visible') {
      if (pollTimer === null) {
        void checkNow();
        pollTimer = window.setInterval(() => {
          if (document.visibilityState === 'visible') void checkNow();
        }, pollIntervalMs);
      }
      return;
    }
    if (pollTimer !== null) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  document.addEventListener('focusin', event => {
    const target = event.target;
    if (target instanceof window.HTMLInputElement ||
        target instanceof window.HTMLTextAreaElement ||
        (target instanceof window.HTMLElement && target.isContentEditable)) {
      setCanReload(false);
    }
  }, true);
  document.addEventListener('visibilitychange', syncPolling);
  window.addEventListener('online', () => void checkNow());
  window.addEventListener('pageshow', syncPolling);

  window.lythausReleaseUpdates = Object.freeze({
    checkNow,
    setCanReload,
    snapshot,
  });
  syncPolling();
})();
