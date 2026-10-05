// Polling with exponential backoff and equal jitter. Pauses while the tab is hidden.
// Every side effect comes in through env so the whole thing runs on a fake clock.

export function backoffDelay(attempt, { base, max, random = Math.random }) {
  const ceil = Math.min(max, base * 2 ** attempt);
  return Math.round(ceil / 2 + random() * (ceil / 2));
}

export function createPoller({ task, interval, max = 60000, retryBase = Math.min(interval, 5000), onSuccess = () => {}, onError = () => {}, env }) {
  let failures = 0;
  let timer = null;
  let running = false;
  let paused = false;
  let inflight = false;
  let gen = 0;
  let offVis = () => {};

  const clear = () => { if (timer != null) { env.clearTimeout(timer); timer = null; } };
  const schedule = (ms) => { clear(); timer = env.setTimeout(tick, ms); };

  async function tick() {
    timer = null;
    if (!running) return;
    if (env.isHidden()) { paused = true; return; }
    if (inflight) return;
    inflight = true;
    const my = gen;
    try {
      const value = await task();
      if (my !== gen) return;
      failures = 0;
      onSuccess(value);
    } catch (err) {
      if (my !== gen) return;
      failures += 1;
      onError(err, failures);
    } finally {
      inflight = false;
    }
    if (my !== gen || !running) return;
    if (env.isHidden()) { paused = true; return; }
    schedule(failures === 0 ? interval : backoffDelay(failures - 1, { base: retryBase, max, random: env.random }));
  }

  function onVisibility() {
    if (!running) return;
    if (env.isHidden()) { clear(); paused = true; return; }
    if (paused) { paused = false; clear(); tick(); }
  }

  return {
    start() {
      if (running) return;
      running = true; paused = false; gen += 1;
      offVis = env.onVisibility(onVisibility);
      tick();
    },
    stop() { running = false; gen += 1; clear(); offVis(); },
    get failures() { return failures; },
    get paused() { return paused; },
  };
}

export function browserEnv(win = window) {
  return {
    setTimeout: (fn, ms) => win.setTimeout(fn, ms),
    clearTimeout: (id) => win.clearTimeout(id),
    random: () => Math.random(),
    isHidden: () => win.document.hidden,
    onVisibility: (cb) => {
      win.document.addEventListener('visibilitychange', cb);
      return () => win.document.removeEventListener('visibilitychange', cb);
    },
  };
}
