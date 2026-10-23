(() => {
  const overlay = document.getElementById('lythaus-startup');
  if (!overlay) return;
  overlay.hidden = false;
  const status = overlay.querySelector('[role="status"]');
  const retry = overlay.querySelector('button');
  const views = new Map();
  let finished = false;
  const blockViews = () => {
    for (const view of document.querySelectorAll('flutter-view')) {
      if (!views.has(view)) views.set(view, view.inert);
      view.inert = true;
    }
  };
  const observer = new MutationObserver(blockViews);
  observer.observe(document.body, { childList: true, subtree: true });
  blockViews();
  const offerRetry = (message) => {
    if (finished) return;
    status.textContent = message;
    retry.hidden = false;
  };
  const timer = setTimeout(() => offerRetry('Lythaus is taking longer to open. You can wait or try again.'), 30000);
  const onError = (event) => {
    if (event.target instanceof HTMLScriptElement &&
        /(?:flutter_bootstrap|main\.dart)\.js(?:\?|$)/.test(event.target.src)) {
      window.lythausStartupFailed();
    }
  };
  window.addEventListener('error', onError, true);
  retry.addEventListener('click', () => window.location.reload());
  window.lythausStartupFailed = () => offerRetry('Lythaus could not open. Please try again.');
  window.lythausStartupReady = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    window.removeEventListener('error', onError, true);
    observer.disconnect();
    overlay.remove();
    for (const [view, inert] of views) view.inert = inert;
    views.clear();
  };
})();
