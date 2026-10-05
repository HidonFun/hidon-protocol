// Motion: reveal on scroll, progress bar, parallax, count-up, flash, pointer glow, matrix canvas.
// Every function honours reduced motion by settling straight to the end state.

export const prefersReduced = (win = window) => Boolean(win.matchMedia && win.matchMedia('(prefers-reduced-motion: reduce)').matches);

export const easeOutCubic = (t) => 1 - (1 - t) ** 3;
export const tween = (from, to, t) => from + (to - from) * easeOutCubic(Math.min(1, Math.max(0, t)));

// Tween a number into an element. raf/now are injectable for tests.
export function countUp({ from = 0, to, duration = 1100, set, reduced = false, raf = (f) => requestAnimationFrame(f), now = () => performance.now() }) {
  if (reduced || duration <= 0) { set(to); return; }
  const t0 = now();
  const step = () => {
    const t = (now() - t0) / duration;
    if (t >= 1) { set(to); return; }
    set(tween(from, to, t));
    raf(step);
  };
  raf(step);
}

export function flash(el) {
  el.classList.remove('flash');
  void el.offsetWidth; // restart the animation
  el.classList.add('flash');
}

export function initReveal(doc = document, reduced = false) {
  const items = [...doc.querySelectorAll('[data-reveal]')];
  if (reduced || !('IntersectionObserver' in window)) { items.forEach((el) => el.classList.add('is-in')); return; }
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  items.forEach((el) => io.observe(el));
}

// One rAF loop for scroll: progress bar width and the parallax offset variable.
export function initScroll({ bar, root = document.documentElement, reduced = false }) {
  const depthEls = [...document.querySelectorAll('[data-depth]')];
  depthEls.forEach((el) => el.style.setProperty('--d', el.dataset.depth));
  let queued = false;
  const apply = () => {
    queued = false;
    const y = window.scrollY;
    const max = Math.max(1, root.scrollHeight - window.innerHeight);
    bar.style.transform = `scaleX(${Math.min(1, y / max).toFixed(4)})`;
    if (!reduced) root.style.setProperty('--sy', String(Math.min(y, 1400)));
  };
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(apply); } };
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue, { passive: true });
  apply();
}

// Soft light that follows the pointer on cards and tiles.
export function initPointerGlow(selector = '.card, .how > li, .tile-info, .home-stats > div') {
  document.addEventListener('pointermove', (e) => {
    const el = e.target.closest && e.target.closest(selector);
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - r.left}px`);
    el.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, { passive: true });
}

// Matrix rain: three depth layers of hex digits. Colours come from the CSS tokens at run time.
export function initMatrix(canvas, { reduced = false } = {}) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const cs = getComputedStyle(canvas);
  const ink = cs.getPropertyValue('--accent').trim();
  const bg = cs.getPropertyValue('--bg-deep').trim();
  const mono = cs.getPropertyValue('--font-mono').trim() || 'monospace';
  if (!ink || !bg) return; // tokens missing: draw nothing rather than invent a colour
  const GLYPHS = '0123456789abcdef';
  const LAYERS = [
    { size: 11, speed: 0.22, alpha: 0.16, gap: 2.4, glow: 0 },
    { size: 15, speed: 0.42, alpha: 0.34, gap: 3.2, glow: 0 },
    { size: 21, speed: 0.78, alpha: 0.7, gap: 4.6, glow: 10 },
  ];
  let w = 0, h = 0, dpr = 1, cols = [];

  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.floor(w * dpr)); canvas.height = Math.max(1, Math.floor(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = bg; ctx.globalAlpha = 1; ctx.fillRect(0, 0, w, h);
    cols = LAYERS.map((L) => {
      const step = L.size * L.gap;
      const n = Math.ceil(w / step) + 1;
      return Array.from({ length: n }, (_, i) => ({ x: i * step + (Math.random() * step) / 2, y: Math.random() * (h / L.size), v: 0.6 + Math.random() * 0.8 }));
    });
  };

  const draw = () => {
    ctx.globalAlpha = 0.1; ctx.fillStyle = bg; ctx.shadowBlur = 0; ctx.fillRect(0, 0, w, h);
    LAYERS.forEach((L, li) => {
      ctx.font = `${L.size}px ${mono}`;
      ctx.fillStyle = ink; ctx.shadowColor = ink; ctx.shadowBlur = L.glow;
      for (const c of cols[li]) {
        ctx.globalAlpha = L.alpha;
        ctx.fillText(GLYPHS[(Math.random() * GLYPHS.length) | 0], c.x, c.y * L.size);
        c.y += L.speed * c.v;
        if (c.y * L.size > h + L.size && Math.random() > 0.975) { c.y = 0; c.v = 0.6 + Math.random() * 0.8; }
      }
    });
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  };

  resize();
  if (reduced) { for (let i = 0; i < 160; i++) draw(); return; }

  let on = true, visible = true, last = 0, raf = 0;
  const loop = (t) => {
    raf = 0;
    if (!on || !visible || document.hidden) return;
    if (t - last >= 33) { last = t; draw(); }
    raf = requestAnimationFrame(loop);
  };
  const kick = () => { if (!raf && on && visible && !document.hidden) raf = requestAnimationFrame(loop); };
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; kick(); }).observe(canvas);
  document.addEventListener('visibilitychange', kick);
  new ResizeObserver(() => { resize(); kick(); }).observe(canvas);
  kick();
}
