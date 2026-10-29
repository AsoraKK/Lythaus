(() => {
  const overlay = document.getElementById('lythaus-startup');
  if (!overlay) return;
  overlay.hidden = false;
  const status = overlay.querySelector('[role="status"]');
  const retry = overlay.querySelector('button');
  const views = new Map();
  let finished = false;
  let deferred = false;
  let failed = false;
  let pageHidden = false;
  let revealSettled = false;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const animations = [];
  const stopLight = () => {
    animations.splice(0).forEach(animation => animation.cancel());
    delete overlay.dataset.light;
  };
  const startLight = () => {
    const scene = overlay.querySelector('.startup-wordmark-scene');
    if (!scene?.animate || motion.matches || finished || failed) return;
    try {
      const delay = 120, duration = 1080, settle = 120, period = 3000;
      const passage = Array.from({length: 61}, (_, index) => {
        const progress = index / 60;
        const projected = (Math.tan((progress - .5) * 1.1) / Math.tan(.55) + 1) / 2;
        return {offset: progress, x: -70 + 1140 * projected};
      });
      const afterlight = scene.querySelector('.startup-wordmark-afterlight');
      afterlight.setAttribute('rx', String(1140 * settle / duration / 2));
      afterlight.setAttribute('cx', String(-1140 * settle / duration / 2));
      const animate = (element, frames, timing) => {
        animations.push(element.animate(frames, {fill: 'both', ...timing}));
      };
      const repeat = (element, frames, length = duration) => {
        const timed = frames.map(frame => ({...frame, offset: (delay + frame.offset * length) / period}));
        animate(element, [{...frames[0], offset: 0}, ...timed, {...frames.at(-1), offset: 1}], {duration: period, iterations: Infinity});
      };
      const positions = passage.map(({offset, x}) => ({offset, transform: `translateX(${x}px)`}));
      scene.querySelectorAll('[data-light-position]').forEach(element => {
        if (element.closest('mask')) {
          if (revealSettled) element.style.transform = positions.at(-1).transform;
          else animate(element, positions, {duration, delay});
        } else repeat(element, positions);
      });
      repeat(scene.querySelector('[data-light-projection]'), passage.map(({offset, x}) => ({offset, transform: `translate(500px, 80px) scaleX(${x - 500})`})));
      repeat(scene.querySelector('[data-light-energy]'), [
        {offset: 0, opacity: 0}, {offset: .08, opacity: .34},
        {offset: .26, opacity: .7}, {offset: .43, opacity: 1},
        {offset: .56, opacity: 1}, {offset: .7, opacity: .62},
        {offset: .88, opacity: .26}, {offset: 1, opacity: 0},
      ], duration + settle);
      repeat(scene.querySelector('[data-light-core]'), [
        {offset: 0, opacity: 0}, {offset: .05, opacity: 1},
        {offset: .9, opacity: 1}, {offset: 1, opacity: 0},
      ]);
      const start = document.timeline.currentTime;
      animations.forEach(animation => { animation.startTime = start; });
      overlay.dataset.light = 'playing';
    } catch {
      stopLight();
    }
  };
  const syncLight = () => {
    if (finished || failed) return stopLight();
    if (motion.matches) {
      revealSettled = true;
      return stopLight();
    }
    if (document.hidden || pageHidden) {
      animations.forEach(animation => { if (animation.playState === 'running') animation.pause(); });
    } else if (!animations.length) startLight();
    else animations.forEach(animation => { if (animation.playState === 'paused') animation.play(); });
  };
  const onPageHide = () => { pageHidden = true; syncLight(); };
  const onPageShow = () => { pageHidden = false; syncLight(); };
  document.addEventListener('visibilitychange', syncLight);
  motion.addEventListener('change', syncLight);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
  syncLight();
  window.lythausStartupDeferred = () => { deferred = true; };
  const onFirstFrame = () => {
    if (!deferred) window.lythausStartupReady();
  };
  window.addEventListener('flutter-first-frame', onFirstFrame);
  const blockViews = () => {
    if (!overlay.isConnected) return window.lythausStartupReady();
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
    status.dataset.visible = '';
    retry.hidden = false;
  };
  const timer = setTimeout(() => offerRetry('Lythaus is taking longer to open. You can wait or try again.'), 30000);
  const onError = (event) => {
    if (event.target instanceof HTMLScriptElement &&
        /\/(?:flutter_bootstrap|main\.dart)(?:\.[a-f0-9]{16})?\.js(?:\?|$)/.test(event.target.src)) {
      window.lythausStartupFailed();
    }
  };
  window.addEventListener('error', onError, true);
  retry.addEventListener('click', () => window.location.reload());
  window.lythausStartupFailed = () => {
    failed = true;
    stopLight();
    clearTimeout(timer);
    offerRetry('Lythaus could not open. Please try again.');
  };
  window.lythausStartupReady = () => {
    if (finished) return;
    finished = true;
    stopLight();
    document.removeEventListener('visibilitychange', syncLight);
    motion.removeEventListener('change', syncLight);
    window.removeEventListener('pagehide', onPageHide);
    window.removeEventListener('pageshow', onPageShow);
    clearTimeout(timer);
    window.removeEventListener('error', onError, true);
    window.removeEventListener('flutter-first-frame', onFirstFrame);
    observer.disconnect();
    overlay.remove();
    for (const [view, inert] of views) view.inert = inert;
    views.clear();
  };
})();
