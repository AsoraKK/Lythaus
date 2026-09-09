(() => {
  const root = document.documentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const animations = [];
  const listeners = new AbortController();
  let watchdog;
  let startFrame;
  let fontDeadline;
  let resolved = false;

  const resolve = () => {
    if (resolved) return;
    resolved = true;
    root.dataset.opening = 'resolved';
    window.clearTimeout(watchdog);
    window.clearTimeout(fontDeadline);
    window.cancelAnimationFrame(startFrame);
    listeners.abort();
    animations.forEach((animation) => animation.cancel());
  };

  try {
    const navigation = performance.getEntriesByType('navigation')[0];
    // Deliberately not gated by sessionStorage: a normal full refresh should replay the opening.
    if (reducedMotion.matches || document.hidden || location.hash ||
        navigation?.type === 'back_forward' || !Element.prototype.animate) return;

    root.dataset.opening = 'armed';
    watchdog = window.setTimeout(resolve, 2500);

    const options = { capture: true, passive: true, signal: listeners.signal };
    for (const name of ['pointerdown', 'keydown', 'scroll', 'touchstart', 'focusin', 'resize', 'pagehide']) {
      window.addEventListener(name, resolve, options);
    }
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) resolve();
    }, options);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) resolve();
    }, options);
    reducedMotion.addEventListener('change', resolve, { signal: listeners.signal });

    const start = () => {
      if (resolved) return;
      if (window.scrollY > 0 || reducedMotion.matches || document.hidden) return resolve();
      try {
        const scene = document.querySelector('.wordmark-scene');
        if (!scene) return resolve();
        const style = getComputedStyle(scene);
        const parameter = (name) => Number.parseFloat(style.getPropertyValue(name));
        const delay = parameter('--reveal-delay');
        const duration = parameter('--reveal-duration');
        const copyDelay = parameter('--copy-delay');
        const intensity = parameter('--light-intensity');
        const settleDuration = parameter('--settle-duration');
        const afterlight = scene.querySelector('.wordmark-afterlight');
        const settlingDistance = 1140 * settleDuration / duration;
        afterlight.setAttribute('rx', String(settlingDistance / 2));
        afterlight.setAttribute('cx', String(-settlingDistance / 2));
        const finishAt = copyDelay + 360;
        const animate = (element, frames, timing) => {
          if (!element) throw new Error('Missing opening element');
          const animation = element.animate(frames, { fill: 'both', ...timing });
          animations.push(animation);
          return animation;
        };

        // The beam turns around a fixed central source; one coordinate drives its footprint.
        const passage = Array.from({ length: 61 }, (_, index) => {
          const progress = index / 60;
          const projected = (Math.tan((progress - 0.5) * 1.1) / Math.tan(0.55) + 1) / 2;
          return { offset: progress, x: -70 + 1140 * projected };
        });
        const positions = passage.map(({ offset, x }) => ({ offset, transform: `translateX(${x}px)` }));
        scene.querySelectorAll('[data-light-position]').forEach((element) => {
          animate(element, positions, { duration, delay });
        });
        animate(scene.querySelector('[data-light-projection]'), passage.map(({ offset, x }) => ({
          offset, transform: `translate(500px, 80px) scaleX(${x - 500})`,
        })), { duration, delay });
        animate(scene.querySelector('[data-light-energy]'), [
          { offset: 0, opacity: 0 },
          { offset: 0.08, opacity: 0.34 * intensity },
          { offset: 0.26, opacity: 0.7 * intensity },
          { offset: 0.43, opacity: intensity },
          { offset: 0.56, opacity: intensity },
          { offset: 0.7, opacity: 0.62 * intensity },
          { offset: 0.88, opacity: 0.26 * intensity },
          { offset: 1, opacity: 0 },
        ], { duration: duration + settleDuration, delay, easing: 'linear' });
        animate(scene.querySelector('[data-light-core]'), [
          { offset: 0, opacity: 0 },
          { offset: 0.05, opacity: 1 },
          { offset: 0.9, opacity: 1 },
          { offset: 1, opacity: 0 },
        ], { duration, delay, easing: 'linear' });

        const enter = (selector, at, travel = true) => animate(document.querySelector(selector), [
          { opacity: 0, ...(travel ? { transform: 'translateY(5px)' } : {}) },
          { opacity: 1, ...(travel ? { transform: 'translateY(0)' } : {}) },
        ], { delay: at, duration: 180, easing: 'cubic-bezier(.2,.7,.3,1)' });
        enter('.pitch-intro-statement', copyDelay);
        enter('.pitch-intro-support .pitch-lede', copyDelay + 90);
        enter('.pitch-intro-support .button', copyDelay + 165);
        enter('.home-page .site-header', copyDelay + 165, false);
        const timelineStart = performance.now();
        animations.forEach((animation) => { animation.startTime = timelineStart; });
        root.dataset.opening = 'playing';
        window.clearTimeout(watchdog);
        watchdog = window.setTimeout(resolve, finishAt + 300);
        Promise.all(animations.map((animation) => animation.finished)).then(resolve, resolve);
      } catch {
        resolve();
      }
    };
    const schedule = () => {
      const fontReady = document.fonts?.ready ?? Promise.resolve();
      const deadline = new Promise((resolveDeadline) => {
        fontDeadline = window.setTimeout(resolveDeadline, 300);
      });
      Promise.race([fontReady, deadline]).then(() => {
        window.clearTimeout(fontDeadline);
        if (!resolved) startFrame = window.requestAnimationFrame(start);
      }, resolve);
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', schedule, { once: true, signal: listeners.signal });
    } else {
      schedule();
    }
  } catch {
    resolve();
  }
})();