// Page wiring. Live data: block (RPC), TVL (DefiLlama), pairs (DexScreener).
import { createPoller, browserEnv } from './poller.js';
import { createHealth, HEALTH_LABEL } from './health.js';
import { fetchBlock } from './rpc.js';
import { fetchTvl } from './llama.js';
import { fetchPairs, sortPairs, filterPairs } from './dex.js';
import { DASH, fmtInt, fmtUsdCompact, fmtPrice, fmtDelta } from './format.js';
import { copyAddress, selectFallback } from './copy.js';
import { prefersReduced, countUp, flash, initReveal, initScroll, initPointerGlow, initMatrix } from './motion.js';

const $ = (id) => document.getElementById(id);
const meta = (n) => document.querySelector(`meta[name="${n}"]`)?.content || '';
const RPC = meta('hidon-rpc');
const CHAIN_ID = Number(meta('hidon-chain'));
const LLAMA = 'https://api.llama.fi';
const DEX = 'https://api.dexscreener.com';
const reduced = prefersReduced();
const env = browserEnv();

const h = (tag, cls, text) => { const el = document.createElement(tag); if (cls) el.className = cls; if (text != null) el.textContent = text; return el; };
const setText = (el, text) => { if (el.textContent !== text) { el.textContent = text; return true; } return false; };

/* ---------- guarded fetch: every call gets a timeout ---------- */
const withTimeout = (fn, ms = 8000) => {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  return fn(ctl.signal).finally(() => clearTimeout(t));
};

/* ---------- health pill ---------- */
const healthEl = $('health');
const health = createHealth({
  onChange: (s) => { healthEl.dataset.state = s; document.documentElement.dataset.health = s; $('health-text').textContent = HEALTH_LABEL[s]; },
});
addEventListener('offline', () => health.offline());

/* ---------- number tiles ---------- */
const tiles = { block: [$('hero-block'), $('stat-block')], tvl: [$('stat-tvl')], vol: [$('stat-vol')] };
const last = { block: null, tvl: null, vol: null };
let tapeBlock = [];

function dash(key) {
  last[key] = null;
  tiles[key].forEach((el) => { el.dataset.dash = ''; setText(el, DASH); });
  if (key === 'block') tapeBlock.forEach((el) => setText(el, DASH));
  if (key === 'vol' || key === 'tvl') refreshTape();
}

function showBlock(n) {
  const text = fmtInt(n);
  const changed = last.block !== n;
  last.block = n;
  tiles.block.forEach((el) => {
    delete el.dataset.dash;
    if (setText(el, text) && changed) flash(el);
  });
  tapeBlock.forEach((el) => setText(el, text));
}

function showUsd(key, value) {
  const els = tiles[key];
  const prev = last[key];
  last[key] = value;
  els.forEach((el) => {
    delete el.dataset.dash;
    const set = (v) => { el.textContent = fmtUsdCompact(v); };
    if (prev == null) countUp({ from: 0, to: value, set, reduced });
    else if (prev !== value) { countUp({ from: prev, to: value, duration: 600, set, reduced }); flash(el); }
  });
  refreshTape();
}

/* ---------- ticker tape ---------- */
let tapePairs = [];
function tapeItem(label, value, cls) {
  const a = h('span', 'tape-item');
  a.append(h('b', null, label), h('span', cls || 'num', value));
  return a;
}
function refreshTape() {
  const items = [
    () => { const i = tapeItem('BLOCK', last.block == null ? DASH : fmtInt(last.block), 'num tape-block'); return i; },
    () => tapeItem('TVL', last.tvl == null ? DASH : fmtUsdCompact(last.tvl)),
    () => tapeItem('24H VOL', last.vol == null ? DASH : fmtUsdCompact(last.vol)),
    ...tapePairs.slice(0, 10).map((p) => () => { const d = fmtDelta(p.chg24); return tapeItem(p.symbol, d.text, 'num delta-' + d.dir); }),
  ];
  const fill = (set) => {
    set.replaceChildren();
    let count = 0;
    while (count < 18) { for (const make of items) { set.append(make()); count++; } }
  };
  fill($('tape-a')); fill($('tape-b'));
  tapeBlock = [...document.querySelectorAll('.tape-block')];
}

/* ---------- board ---------- */
const list = $('list');
const note = $('board-note');
let pairs = [];
let sortKey = 'volume';
let query = '';
const cards = new Map();

function makeCard(p) {
  const el = h(p.url ? 'a' : 'div', 'card inf');
  if (p.url) { el.href = p.url; el.target = '_blank'; el.rel = 'noopener noreferrer'; }
  const head = h('div', 'inf-head');
  const logo = h('span', 'logo');
  const fallback = () => { logo.replaceChildren(h('span', 'logo-letter', (p.symbol[0] || '?').toUpperCase())); };
  if (p.logo) {
    const img = new Image(44, 44);
    img.alt = ''; img.decoding = 'async'; img.loading = 'lazy';
    img.addEventListener('error', fallback, { once: true });
    img.src = p.logo;
    logo.append(img);
  } else fallback();
  const id = h('div', 'inf-id');
  id.append(h('b', 'inf-name', p.name), h('span', 'tick', p.symbol));
  const delta = h('span', 'delta');
  head.append(logo, id, delta);

  const quote = h('div', 'quote');
  const left = h('div'); const right = h('div', 'quote-right');
  left.append(h('span', 'quote-v num q-price'), h('span', 'quote-l', 'Price'));
  right.append(h('span', 'quote-v sm num q-vol'), h('span', 'quote-l', '24h volume'));
  quote.append(left, right);

  const curve = h('div', 'curve-line');
  const meter = h('span', 'meter'); meter.append(h('i'));
  curve.append(meter, h('span', 'q-share'));
  el.append(head, quote, curve);
  return el;
}

function updateCard(el, p, maxVol) {
  const price = el.querySelector('.q-price'), vol = el.querySelector('.q-vol'), delta = el.querySelector('.delta');
  const d = fmtDelta(p.chg24);
  if (setText(price, fmtPrice(p.price)) && el.dataset.ready) flash(price);
  if (setText(vol, fmtUsdCompact(p.vol24)) && el.dataset.ready) flash(vol);
  setText(delta, d.text); delta.dataset.dir = d.dir;
  const share = maxVol > 0 ? p.vol24 / maxVol : 0;
  el.querySelector('.meter i').style.width = `${Math.max(2, share * 100).toFixed(1)}%`;
  setText(el.querySelector('.q-share'), `${Math.round(share * 100)}% of top`);
  el.dataset.ready = '1';
}

function drawBoard() {
  list.removeAttribute('aria-busy');
  const view = filterPairs(sortPairs(pairs, sortKey), query);
  const maxVol = Math.max(0, ...pairs.map((p) => p.vol24));
  const keep = new Set(view.map((p) => p.id));
  for (const [id, el] of cards) if (!keep.has(id)) { el.remove(); cards.delete(id); }
  list.querySelectorAll('.is-skeleton').forEach((s) => s.remove());
  view.forEach((p, i) => {
    let el = cards.get(p.id);
    if (!el) { el = makeCard(p); cards.set(p.id, el); el.classList.add('is-new'); }
    updateCard(el, p, maxVol);
    if (list.children[i] !== el) list.insertBefore(el, list.children[i] || null);
  });
  note.hidden = view.length > 0 || !pairs.length;
  if (!note.hidden) note.textContent = 'Nothing matches that filter.';
}

function boardFailed() {
  if (pairs.length) return;
  list.setAttribute('aria-busy', 'false');
  cards.clear();
  list.replaceChildren(...Array.from({ length: 4 }, () => {
    const c = h('div', 'card inf is-dash');
    c.append(h('b', 'inf-name', DASH), h('span', 'quote-v num', DASH), h('span', 'quote-l', 'Pairs unavailable'));
    return c;
  }));
}

document.querySelector('.toolbar .tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-sort]');
  if (!b) return;
  sortKey = b.dataset.sort;
  document.querySelectorAll('.toolbar .tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
  drawBoard();
});
let filterTimer;
$('filter').addEventListener('input', (e) => {
  clearTimeout(filterTimer);
  filterTimer = setTimeout(() => { query = e.target.value; drawBoard(); }, 200);
});

/* ---------- pollers ---------- */
const pollers = [
  createPoller({
    env, interval: 2000, max: 30000,
    task: () => withTimeout((s) => fetchBlock(RPC, fetch, s), 6000),
    onSuccess: (n) => { health.ok(); showBlock(n); },
    onError: () => { health.fail(); dash('block'); },
  }),
  createPoller({
    env, interval: 60000, max: 300000,
    task: () => withTimeout((s) => fetchTvl(LLAMA, CHAIN_ID, fetch, s), 20000),
    onSuccess: (v) => showUsd('tvl', v),
    onError: () => dash('tvl'),
  }),
  createPoller({
    env, interval: 30000, max: 300000,
    task: () => withTimeout((s) => fetchPairs(DEX, fetch, s), 15000),
    onSuccess: (p) => {
      pairs = p; tapePairs = sortPairs(p, 'volume');
      showUsd('vol', p.reduce((a, x) => a + x.vol24, 0));
      drawBoard();
    },
    onError: () => { dash('vol'); boardFailed(); },
  }),
];

/* ---------- contract copy ---------- */
function initCopy() {
  const row = $('ca-copy');
  if (!row) return;
  const label = row.querySelector('.ca-btn-text');
  let timer;
  row.addEventListener('click', async () => {
    const address = row.dataset.address;
    const res = await copyAddress(address, { clipboard: navigator.clipboard, fallback: () => selectFallback($('ca-code')) });
    clearTimeout(timer);
    const ok = res === 'copied';
    label.textContent = ok ? 'Copied' : 'Select';
    row.dataset.copied = ok ? 'yes' : 'no';
    $('ca-live').textContent = ok ? 'Copied to clipboard' : 'Copy failed, text selected';
    toast(ok ? 'Copied to clipboard' : 'Selected. Press your copy shortcut.');
    timer = setTimeout(() => { label.textContent = 'Copy'; delete row.dataset.copied; }, 1600);
  });
}

let toastTimer;
function toast(msg) {
  document.querySelector('.toast')?.remove();
  const t = h('div', 'toast', msg);
  t.setAttribute('role', 'status');
  document.body.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2600);
}

/* ---------- layer picker ---------- */
function initLayers() {
  const tabs = document.querySelectorAll('[data-layer]');
  const select = (id) => {
    tabs.forEach((t) => t.setAttribute('aria-selected', String(t.dataset.layer === id)));
    document.querySelectorAll('[data-row]').forEach((r) => {
      const on = r.dataset.row === id;
      r.classList.toggle('is-on', on);
      if (on) $('layer-note').textContent = r.dataset.note;
    });
    document.querySelectorAll('[data-seg]').forEach((s) => s.classList.toggle('is-on', s.dataset.seg === id));
  };
  tabs.forEach((t) => t.addEventListener('click', () => select(t.dataset.layer)));
  document.querySelectorAll('[data-row]').forEach((r) => r.addEventListener('click', () => select(r.dataset.row)));
}

/* ---------- boot ---------- */
document.documentElement.dataset.health = 'connecting';
const syncTop = () => {
  const head = $('site-header'), ca = $('ca');
  const pinned = (head.offsetHeight && getComputedStyle(head).position === 'sticky' ? head.offsetHeight : 0) + ca.offsetHeight;
  document.documentElement.style.setProperty('--top-h', `${pinned + 12}px`);
};
new ResizeObserver(syncTop).observe($('ca'));
addEventListener('resize', syncTop);
syncTop();
initCopy();
initLayers();
initReveal(document, reduced);
initScroll({ bar: $('progress'), reduced });
initPointerGlow();
initMatrix($('matrix'), { reduced });
refreshTape();
if (RPC) pollers[0].start(); else health.offline();
pollers[1].start();
pollers[2].start();
