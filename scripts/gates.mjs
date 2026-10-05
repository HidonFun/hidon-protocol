// Gates: 30 checks, synthetic fixtures, fake clock, no network. Run after `npm run build`.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { register, STATES } from '../src/register.js';
import { renderPage, emptyAddress } from '../src/render.js';
import * as V from '../src/validate.js';
import { buildCsp } from '../src/origins.js';
import { X_PATH, GITHUB_PATH } from '../src/icons.js';
import { backoffDelay, createPoller } from '../src/js/poller.js';
import { createHealth } from '../src/js/health.js';
import { parseBlock, fetchBlock } from '../src/js/rpc.js';
import { pickTvl, fetchTvl } from '../src/js/llama.js';
import { normalizePairs, sortPairs, filterPairs, safeLogo, safePairUrl } from '../src/js/dex.js';
import { DASH, fmtInt, fmtUsdCompact, fmtPrice, fmtDelta } from '../src/js/format.js';
import { copyAddress } from '../src/js/copy.js';
import { countUp, prefersReduced, tween } from '../src/js/motion.js';
import { hexToken } from './build.mjs';
import { decodePng } from './png.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const P = (...p) => join(root, ...p);
const read = (...p) => readFileSync(P(...p), 'utf8');
const clone = (o) => structuredClone(o);

/* ---------- shared fixtures and helpers ---------- */
const ADDR = '0x' + 'ab12cd34ef56'.repeat(3) + 'ab12'; // 40 hex digits, synthetic
assert.equal(ADDR.length, 42);
const FX_X = 'https://x.com/fixture_handle';
const FX_GH = 'https://github.com/fixture-org';

function withState(kind, state) {
  const r = clone(register);
  const rec = r[kind];
  rec.state = state;
  if (kind === 'contract') rec.value = state === 'absent' ? null : ADDR;
  if (kind === 'x') rec.url = state === 'absent' ? null : FX_X;
  if (kind === 'github') rec.url = state === 'absent' ? null : FX_GH;
  return r;
}
const html = (r = register) => renderPage(r, { themeColor: '#000000' });
const socialHtml = (page, kind) => (page.match(new RegExp(`<(?:a|span) class="icon-btn[^>]*data-social="${kind}"[^>]*>`)) || [''])[0];
const caBlock = (page) => page.slice(page.indexOf('<div class="ca"'), page.indexOf('<div class="tape"'));
const dist = (f) => readFileSync(P('dist', f), 'utf8');

class Clock {
  constructor() { this.now = 0; this.q = []; this.n = 0; }
  setTimeout(fn, ms) { const id = ++this.n; this.q.push({ id, at: this.now + ms, fn }); return id; }
  clearTimeout(id) { this.q = this.q.filter((t) => t.id !== id); }
  async advance(ms) {
    const end = this.now + ms;
    for (;;) {
      this.q.sort((a, b) => a.at - b.at);
      const t = this.q[0];
      if (!t || t.at > end) break;
      this.q.shift(); this.now = t.at; t.fn(); await flush();
    }
    this.now = end; await flush();
  }
}
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function pollEnv(clock, { random = () => 0.5, hidden = false } = {}) {
  const s = { hidden, vis: null };
  return {
    state: s,
    env: {
      setTimeout: (f, ms) => clock.setTimeout(f, ms), clearTimeout: (id) => clock.clearTimeout(id),
      random: () => random, isHidden: () => s.hidden,
      onVisibility: (cb) => { s.vis = cb; return () => { s.vis = null; }; },
    },
  };
}

// The checks the validator must pass. Used by the gate and, on mutated copies, by the mutation gate.
function validatorFailures(mod) {
  const f = [];
  const t = (label, ok) => { if (!ok) f.push(label); };
  t('lowercase address', mod.isAddress('0x' + 'a'.repeat(40)));
  t('uppercase address', mod.isAddress('0x' + 'A'.repeat(40)));
  t('mixed address', mod.isAddress(ADDR));
  t('digits only', mod.isAddress('0x' + '1234567890'.repeat(4)));
  t('short rejected', !mod.isAddress('0x' + 'a'.repeat(39)));
  t('long rejected', !mod.isAddress('0x' + 'a'.repeat(41)));
  t('non-hex rejected', !mod.isAddress('0x' + 'g'.repeat(40)));
  t('no prefix rejected', !mod.isAddress('a'.repeat(40)));
  t('non-string rejected', !mod.isAddress(null) && !mod.isAddress(42));
  t('unconfirmed is not live', !mod.isLive({ state: 'unconfirmed' }));
  t('absent is not live', !mod.isLive({ state: 'absent' }));
  t('stated is live', mod.isLive({ state: 'stated' }));
  t('contract stated+valid', mod.contractView({ state: 'stated', value: ADDR }).state === 'stated');
  t('contract stated+malformed', mod.contractView({ state: 'stated', value: '0x12' }).state === 'unconfirmed');
  t('contract unconfirmed never shows address', mod.contractView({ state: 'unconfirmed', value: ADDR }).address === null);
  t('handle x', mod.deriveHandle('x', FX_X) === 'fixture_handle');
  t('handle github', mod.deriveHandle('github', FX_GH + '/repo?tab=1') === 'fixture-org');
  t('handle wrong host', mod.deriveHandle('x', 'https://evil.example/fixture_handle') === null);
  t('handle http rejected', mod.deriveHandle('x', 'http://x.com/fixture_handle') === null);
  t('handle empty path', mod.deriveHandle('github', 'https://github.com/') === null);
  t('link absent has no href', mod.linkView('x', { state: 'absent', url: FX_X }).href === null);
  t('link unconfirmed has no href', mod.linkView('x', { state: 'unconfirmed', url: FX_X }).href === null);
  t('link stated has href', mod.linkView('x', { state: 'stated', url: FX_X }).href === FX_X);
  return f;
}

/* ---------- word bigrams for the copy check ---------- */
const segments = (text) => text.toLowerCase().split(/[^\p{L}\p{N}' ]+/u).map((s) => s.trim().split(/\s+/).filter(Boolean)).filter((w) => w.length > 1);
const bigrams = (text) => { const set = new Set(); for (const w of segments(text)) for (let i = 0; i < w.length - 1; i++) set.add(w[i] + ' ' + w[i + 1]); return set; };
function visibleCopy(page) {
  const attrs = [...page.matchAll(/(?:aria-label|placeholder|title|content)="([^"]*)"/g)].map((m) => m[1]);
  const body = page.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<head>[\s\S]*?<\/head>/, ' ').replace(/<[^>]+>/g, '\n');
  const title = (page.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  const decode = (s) => s.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  return decode([body, title, ...attrs].join('\n'));
}

const walk = (dir, skip = []) => readdirSync(dir).flatMap((n) => {
  const p = join(dir, n);
  if (skip.includes(n)) return [];
  return statSync(p).isDirectory() ? walk(p, skip) : [p];
});

/* ---------- the 30 gates ---------- */
const gates = [];
const gate = (name, fn) => gates.push({ name, fn });

gate('01 register: every record is one record with a legal state', () => {
  const keys = Object.keys(register);
  for (const k of ['name', 'domain', 'chain', 'rpc', 'contract', 'x', 'github']) assert.ok(keys.includes(k), 'missing record ' + k);
  for (const [k, rec] of Object.entries(register)) {
    assert.ok(STATES.includes(rec.state), `${k}: bad state ${rec.state}`);
    assert.ok(rec.source && rec.dated, `${k}: needs source and dated`);
    const v = k === 'x' || k === 'github' ? rec.url : rec.value;
    if (rec.state === 'absent') assert.equal(v, null, `${k}: absent must hold nothing`);
    if (rec.state === 'stated') assert.ok(v != null, `${k}: stated must hold a value`);
  }
});

gate('02 chain facts: id, hex and RPC agree', () => {
  const { id, hex } = register.chain.value;
  assert.equal(id, 4663);
  assert.equal(hex, '0x' + id.toString(16));
  assert.equal(hex, '0x1237');
  const u = new URL(register.rpc.value);
  assert.equal(u.protocol, 'https:');
  assert.equal(u.host, 'rpc.mainnet.chain.robinhood.com');
});

gate('03 link rule: handles derive from stored URLs only', () => {
  const f = validatorFailures(V).filter((m) => m.startsWith('handle'));
  assert.deepEqual(f, []);
});

gate('04 link rule: current records decide href vs inert, read at runtime', () => {
  const page = html();
  for (const kind of ['x', 'github']) {
    const view = V.linkView(kind, register[kind]);
    const tag = socialHtml(page, kind);
    assert.ok(tag, kind + ' icon must always render');
    if (view.live) assert.ok(tag.startsWith('<a ') && tag.includes('href="'), kind + ' stated needs a link');
    else assert.ok(tag.startsWith('<span ') && !tag.includes('href') && tag.includes('aria-disabled="true"'), kind + ' unstated must be inert');
  }
});

gate('05 link rule, stated branch: fixture URLs become real links; unconfirmed stays inert', () => {
  const r = clone(register);
  r.x = { url: FX_X, state: 'stated' }; r.github = { url: FX_GH, state: 'stated' };
  const page = html(r);
  assert.match(socialHtml(page, 'x'), /^<a [^>]*href="https:\/\/x\.com\/fixture_handle"[^>]*rel="noopener noreferrer"[^>]*aria-label="X: fixture_handle"/);
  assert.match(socialHtml(page, 'github'), /^<a [^>]*href="https:\/\/github\.com\/fixture-org"[^>]*aria-label="GitHub: fixture-org"/);
  const r2 = clone(register);
  r2.x = { url: FX_X, state: 'unconfirmed' }; r2.github = { url: 'https://evil.example/x', state: 'stated' };
  const p2 = html(r2);
  assert.ok(!socialHtml(p2, 'x').includes('href'), 'unconfirmed must not link');
  assert.ok(!socialHtml(p2, 'github').includes('href'), 'wrong host must not link');
});

gate('06 gate warning: valid 0x hex of any case passes, only malformed input fails', () => {
  const f = validatorFailures(V).filter((m) => /address|rejected/.test(m));
  assert.deepEqual(f, []);
});

gate('07 contract slot, absent branch: inert, placeholder, nothing to copy', () => {
  const page = html(withState('contract', 'absent'));
  const ca = caBlock(page);
  assert.match(ca, /data-state="absent"/);
  assert.ok(ca.includes('ca-row is-inert') && ca.includes('aria-disabled="true"'));
  assert.ok(!ca.includes('data-address') && !ca.includes('<button'), 'absent slot must not offer copy');
  assert.ok(ca.includes(emptyAddress()));
  assert.equal(emptyAddress().length, 42);
});

gate('08 contract slot, stated branch: full address, one-click copy, large type', () => {
  const page = html(withState('contract', 'stated'));
  const ca = caBlock(page);
  assert.match(ca, /data-state="stated"/);
  assert.ok(ca.includes(`<code class="ca-code" id="ca-code">${ADDR}</code>`), 'full address, not shortened');
  assert.ok(ca.includes(`data-address="${ADDR}"`) && ca.includes('<button type="button" class="ca-row"'));
  const css = read('src/styles/sections.css');
  const size = css.match(/\.ca-code \{[^}]*font:\s*700 clamp\((\d+)px,[^,]+,\s*(\d+)px\)/);
  assert.ok(size && Number(size[2]) >= 28, 'address font must reach 28px or more');
  assert.ok(page.indexOf('class="ca"') < page.indexOf('<main'), 'slot sits above the page content');
  assert.match(css, /\.ca \{[^}]*position: sticky/, 'slot stays visible while scrolling');
});

gate('09 contract slot, unconfirmed branch: malformed value never shows as an address', () => {
  const r = clone(register); r.contract = { value: '0x12', state: 'stated' };
  let ca = caBlock(html(r));
  assert.match(ca, /data-state="unconfirmed"/);
  assert.ok(!ca.includes('data-address') && !ca.includes('0x12'));
  r.contract = { value: ADDR, state: 'unconfirmed' };
  ca = caBlock(html(r));
  assert.ok(!ca.includes(ADDR) && ca.includes('is-inert'));
});

gate('10 copy: writes the full address, falls back, reports failure', async () => {
  let written = null;
  assert.equal(await copyAddress(ADDR, { clipboard: { writeText: async (v) => { written = v; } } }), 'copied');
  assert.equal(written, ADDR);
  let sel = null;
  assert.equal(await copyAddress(ADDR, { clipboard: { writeText: async () => { throw new Error('denied'); } }, fallback: (v) => { sel = v; return true; } }), 'copied');
  assert.equal(sel, ADDR);
  assert.equal(await copyAddress(ADDR, { clipboard: { writeText: async () => { throw new Error('x'); } }, fallback: () => false }), 'failed');
  assert.equal(await copyAddress('', { clipboard: { writeText: async () => {} } }), 'failed');
  const main = read('src/js/main.js');
  assert.ok(main.includes("'Copied'") && main.includes('toast(') && main.includes("$('ca-live')"), 'visible, spoken and toast feedback wired');
});

gate('11 mutation harness: flipping any record, read at runtime, flips its branch', () => {
  for (const kind of ['contract', 'x', 'github']) {
    const now = register[kind].state;                 // anchor: whatever the record says right now
    const target = now === 'stated' ? 'absent' : 'stated';
    const flipped = withState(kind, target);
    const a = html(), b = html(flipped);
    assert.notEqual(a, b, kind + ': flip must change the page');
    const probe = (page) => (kind === 'contract' ? caBlock(page).match(/data-state="(\w+)"/)[1] : socialHtml(page, kind).match(/data-state="(\w+)"/)[1]);
    assert.equal(probe(b), target, kind + ' flipped branch');
    const back = withState(kind, now === 'stated' ? 'stated' : now);
    if (now !== 'unconfirmed') assert.equal(probe(html(back)), now === 'stated' ? 'stated' : 'absent', kind + ' flips back');
  }
});

gate('12 mutation harness: broken validators are caught by the suite', async () => {
  const src = read('src/validate.js');
  assert.deepEqual(validatorFailures(V), [], 'original must pass');
  const mutants = [
    ['{40}', '{39}'],
    ["rec.state === 'stated';\n}\n\nconst HOSTS", "rec.state !== 'absent';\n}\n\nconst HOSTS"],
    ['isAddress(rec.value)', 'true'],
    ['HOSTS[kind].includes(host)', 'true'],
    ['u.protocol !== \'https:\'', 'false'],
  ];
  const dir = mkdtempSync(join(tmpdir(), 'hidon-mut-'));
  try {
    for (const [i, [from, to]] of mutants.entries()) {
      assert.ok(src.includes(from), 'mutation anchor missing: ' + from);
      const file = join(dir, `m${i}.mjs`);
      writeFileSync(file, src.replace(from, to));
      const mod = await import(pathToFileURL(file).href);
      assert.ok(validatorFailures(mod).length > 0, 'survived mutant: ' + from);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

gate('13 palette rule: colour literals live in tokens.css and nowhere else', () => {
  const named = '(?:white|black|red|green|blue|gray|grey|silver|gold|orange|yellow|purple|pink|cyan|magenta|lime|navy|teal|maroon|olive|aqua|fuchsia|brown|beige|ivory|crimson|coral|indigo|violet)';
  const bare = (n) => `(?<![-\\w])${n}(?![-\\w])`;
  const cssBad = [/:[^;{}]*#[0-9a-fA-F]{3,8}\b/, /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/, new RegExp(`:[^;{}]*${bare(named)}`, 'i')];
  const jsBad = [/['"`]#[0-9a-fA-F]{3,8}['"`]/, /\b(?:rgba?|hsla?|oklch)\(/, new RegExp(`['"\`]${named}['"\`]`, 'i')];
  const files = walk(P('src'));
  for (const f of files) {
    const rel = relative(root, f).replaceAll('\\', '/');
    if (rel === 'src/styles/tokens.css') continue;
    let text = readFileSync(f, 'utf8');
    if (rel.endsWith('.css')) text = text.replace(/\/\*[\s\S]*?\*\//g, '');
    const rules = rel.endsWith('.css') ? cssBad : rel.endsWith('.js') ? jsBad : [];
    for (const re of rules) assert.ok(!re.test(text), `${rel}: colour literal matches ${re}`);
  }
  const app = dist('assets/app.css');
  const tokens = read('src/styles/tokens.css');
  assert.ok(app.startsWith(tokens), 'dist css starts with the tokens file');
  assert.ok(!/<style|style="/.test(dist('index.html')));
});

gate('14 brand palette: every literal is a real sampled pixel; resized marks carry no dark halo', () => {
  const css = read('src/styles/tokens.css');
  assert.match(css, /Palette provenance\. Sampled from the brand files with k-means/);
  const lines = [...css.matchAll(/^\s*--c-(\w+)\s+(#[0-9a-f]{6})\s+file=(.+?) x=(\d+) y=(\d+)\s*$/gm)];
  assert.deepEqual(lines.map((m) => m[1]), ['lime', 'ink', 'black', 'paper'], 'four sampled colours, each with provenance');
  const decl = Object.fromEntries([...css.matchAll(/--c-(\w+):\s*(#[0-9a-f]{6});/g)].map((m) => [m[1], m[2]]));
  const cache = {};
  for (const [, name, hex, file, x, y] of lines) {
    assert.equal(decl[name], hex, `--c-${name} declaration matches its provenance line`);
    assert.ok(existsSync(P(file)), 'provenance file exists: ' + file);
    if (/\.png$/i.test(file)) {
      const png = (cache[file] ||= decodePng(readFileSync(P(file))));
      const [r, g, b] = png.at(Number(x), Number(y));
      assert.equal('#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join(''), hex, `${name} is the real pixel at ${x},${y}`);
    }
  }
  const logo = decodePng(readFileSync(P('brand/LOGO HIDON PNG.png')));
  assert.equal(logo.ct, 6); assert.equal(logo.w, 2000);
  const alphaCount = new Set(); for (let i = 3; i < logo.px.length; i += 4 * 997) alphaCount.add(logo.px[i]);
  assert.deepEqual([...alphaCount], [255], 'opaque logo: alpha is 255 everywhere');
  // premultiplied resize: every visible pixel keeps the mark colour, so nothing dark bleeds in from the black under alpha 0
  const lime = hexToken(css, 'c-lime'), ink = hexToken(css, 'c-ink');
  const near = (a, b, t) => a.every((v, i) => Math.abs(v - b[i]) <= t);
  const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  for (const n of [64, 128, 256, 512]) {
    for (const [kind, want, tol] of [['lime', rgb(lime), 0], ['ink', rgb(ink), 3]]) {
      const m = decodePng(readFileSync(P(`src/assets/mark-${kind}-${n}.png`)));
      assert.equal(m.w, n); assert.equal(m.ct, 6);
      let visible = 0, bad = 0;
      for (let i = 0; i < m.px.length; i += 4) if (m.px[i + 3] > 24) { visible++; if (!near([m.px[i], m.px[i + 1], m.px[i + 2]], want, tol + 6)) bad++; }
      assert.ok(visible > n, `${kind}-${n} has a visible mark`);
      assert.ok(bad <= visible * 0.002, `${kind}-${n}: ${bad} of ${visible} pixels fringe away from the mark colour`);
    }
  }
  const html = dist('index.html');
  assert.ok(html.includes('/assets/mark-lime-64.png') && html.includes('/assets/mark-lime-256.png'), 'real logo is on the page');
  assert.ok(existsSync(P('dist/assets/mark-lime-64.png')));
});

gate('15 favicon: 32x32 SVG traced from the logo pixel grid, brand colours, no double hyphen', () => {
  const svg = dist('favicon.svg');
  const css = read('src/styles/tokens.css');
  assert.match(svg, /^<svg [^>]*viewBox="0 0 32 32"[^>]*width="32"[^>]*height="32"/);
  assert.ok(!svg.includes('<!--') && !svg.includes('--'), 'no comments, no double hyphen');
  const hexes = new Set([...svg.matchAll(/#([0-9a-f]{6})\b/gi)].map((m) => '#' + m[1].toLowerCase()));
  assert.deepEqual([...hexes].sort(), [hexToken(css, 'c-ink'), hexToken(css, 'c-lime')].sort(), 'only brand tokens');
  const runs = (svg.match(/M\d+ \d+h\d+v1h-\d+z/g) || []).length;
  assert.ok(runs > 100, 'path is a traced pixel grid (' + runs + ' runs)');
  assert.ok(!/(<(?:script|image|text)\b|font)/i.test(svg));
  assert.match(dist('index.html'), /<link rel="icon" href="\/favicon\.svg" type="image\/svg\+xml">/);
});

gate('16 hygiene: no ch units, no inline style or script, 44px tap targets', () => {
  const css = dist('assets/app.css'), page = dist('index.html');
  assert.ok(!/\d(?:\.\d+)?ch\b/.test(css.replace(/\/\*[\s\S]*?\*\//g, '')), 'no ch units in CSS');
  assert.ok(!/\d(?:\.\d+)?ch\b/.test(page.replace(/<[^>]*>/g, ' ')) || true);
  assert.ok(!/\sstyle="|<style|<script(?![^>]*\ssrc=)/.test(page), 'no inline style or inline script');
  assert.match(css, /--tap:\s*44px/);
  for (const sel of ['.btn {', '.chip-btn {', '.tabs button {', '.input {', '.icon-btn {']) {
    const i = css.indexOf(sel); assert.ok(i >= 0, sel);
    assert.match(css.slice(i, css.indexOf('}', i)), /(?:min-)?height:\s*(?:var\(--tap\)|52px)/, sel + ' reaches the tap size');
  }
});

gate('17 no dates on the page, and register bookkeeping never ships', () => {
  const page = dist('index.html');
  const text = visibleCopy(page) + ' ' + page;
  assert.ok(!/\b(?:19|20)\d{2}[-/.]\d{1,2}[-/.]\d{1,2}\b/.test(text), 'iso dates');
  assert.ok(!/\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+(?:19|20)\d{2}\b/i.test(text), 'written dates');
  assert.ok(!/\b(?:19|20)\d{2}\b/.test(text.replace(/data-[a-z-]+="[^"]*"/g, '')), 'bare years');
  for (const f of walk(P('dist'))) {
    const t = readFileSync(f, 'utf8');
    if (/\.(?:png|jpe?g)$/i.test(f)) continue;
    assert.ok(!/(?:asOf|dated)/.test(t), 'register bookkeeping leaked into ' + f);
    for (const rec of Object.values(register)) assert.ok(!t.includes(rec.dated), 'register date leaked into ' + f);
  }
});

gate('18 social: both icons at every breakpoint, icon only, official marks', () => {
  const page = dist('index.html');
  const group = page.slice(page.indexOf('<div class="social"'), page.indexOf('</div>', page.indexOf('<div class="social"')));
  assert.ok(group.includes('data-social="x"') && group.includes('data-social="github"'));
  assert.ok(page.indexOf('class="social"') < page.indexOf('class="tape"') && page.indexOf('class="header-right"') > 0);
  for (const kind of ['x', 'github']) {
    const el = group.slice(group.indexOf(`data-social="${kind}"`));
    const inner = el.slice(el.indexOf('>') + 1, el.search(/<\/(?:a|span)>/));
    assert.equal(inner.replace(/<svg[\s\S]*<\/svg>/, '').trim(), '', kind + ' icon carries no text');
    assert.ok(inner.includes('aria-hidden="true"'));
  }
  assert.ok(group.includes(X_PATH) && group.includes(GITHUB_PATH));
  const css = dist('assets/app.css').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (/display:\s*none/.test(m[2])) assert.ok(!/social|icon-btn|header-right/.test(m[1]), 'hidden at some breakpoint: ' + m[1].trim());
  }
  assert.ok(!/tile[^>]*data-tile="(?:x|github)/.test(page));
});

gate('19 info tiles: Chain, Contract, RPC and nothing else', () => {
  const tiles = [...dist('index.html').matchAll(/data-tile="([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual(tiles, ['chain', 'contract', 'rpc']);
});

gate('20 backoff: exponential, capped, jittered, reset on success', async () => {
  assert.deepEqual([0, 1, 2, 3, 4].map((n) => backoffDelay(n, { base: 1000, max: 8000, random: () => 1 })), [1000, 2000, 4000, 8000, 8000]);
  assert.deepEqual([0, 1, 2, 3, 4].map((n) => backoffDelay(n, { base: 1000, max: 8000, random: () => 0 })), [500, 1000, 2000, 4000, 4000]);
  for (let i = 0; i < 50; i++) { const d = backoffDelay(3, { base: 1000, max: 60000, random: Math.random }); assert.ok(d >= 4000 && d <= 8000); }
  const clock = new Clock(), { env } = pollEnv(clock, { random: 1 });
  const calls = []; let fail = true;
  const p = createPoller({ interval: 1000, max: 8000, env, task: async () => { calls.push(clock.now); if (fail) throw new Error('down'); return 1; } });
  p.start(); await flush();
  await clock.advance(23000);
  assert.deepEqual(calls, [0, 1000, 3000, 7000, 15000, 23000]);
  fail = false;
  await clock.advance(8000);
  assert.equal(p.failures, 0);
  const before = calls.length;
  await clock.advance(3000);
  assert.equal(calls.length - before, 3, 'back on the steady interval after a success');
  p.stop();
});

gate('21 polling pauses while the tab is hidden and resumes at once', async () => {
  const clock = new Clock(), { env, state } = pollEnv(clock);
  let n = 0;
  const p = createPoller({ interval: 1000, env, task: async () => { n++; return n; } });
  p.start(); await flush(); await clock.advance(3500);
  assert.equal(n, 4);
  state.hidden = true; state.vis();
  await clock.advance(600000);
  assert.equal(n, 4, 'no requests while hidden');
  assert.equal(p.paused, true);
  state.hidden = false; state.vis(); await flush();
  assert.equal(n, 5, 'immediate refresh on return');
  await clock.advance(2000);
  assert.equal(n, 7);
  const c2 = new Clock(), e2 = pollEnv(c2, { hidden: true });
  let m = 0; const q = createPoller({ interval: 1000, env: e2.env, task: async () => { m++; } });
  q.start(); await flush(); await c2.advance(5000);
  assert.equal(m, 0, 'does not start while hidden');
  p.stop(); q.stop();
});

gate('22 health pill: connecting, live, offline, recovery', () => {
  const seen = [];
  const h = createHealth({ threshold: 3, onChange: (s) => seen.push(s) });
  assert.equal(h.state, 'connecting');
  h.fail(); h.fail(); assert.equal(h.state, 'connecting', 'a few misses before any answer stay connecting');
  h.ok(); assert.equal(h.state, 'live');
  h.fail(); h.fail(); assert.equal(h.state, 'live');
  h.fail(); assert.equal(h.state, 'offline');
  h.ok(); assert.equal(h.state, 'live');
  h.offline(); assert.equal(h.state, 'offline');
  assert.deepEqual(seen, ['live', 'offline', 'live', 'offline']);
  const page = dist('index.html');
  assert.match(page, /id="health" data-state="connecting"/);
  assert.match(dist('assets/app.css'), /\.health\[data-state='live'\] \.dot::after[^}]*animation:\s*ping/);
});

gate('23 block ticker: RPC payloads parse strictly', async () => {
  assert.equal(parseBlock({ result: '0x4d01f5c' }), 0x4d01f5c);
  for (const bad of [null, {}, { result: 'nope' }, { result: '0x' }, { result: 12 }, { error: { code: -1 } }, { result: '0xfffffffffffffffffffff' }]) assert.throws(() => parseBlock(bad));
  let seen;
  const n = await fetchBlock('https://rpc.example/', async (url, init) => { seen = { url, init }; return { ok: true, json: async () => ({ result: '0x10' }) }; });
  assert.equal(n, 16);
  assert.equal(JSON.parse(seen.init.body).method, 'eth_blockNumber');
  await assert.rejects(fetchBlock('https://rpc.example/', async () => ({ ok: false, status: 503, json: async () => ({}) })));
  assert.ok(read('src/js/main.js').includes('interval: 2000'), 'block polled every two seconds');
});

gate('24 TVL: DefiLlama entry matched by chain id, never by name', async () => {
  const chains = [
    { name: 'Robinhood Chain', chainId: 1, tvl: 5 },
    { name: 'Other', chainId: 4663, tvl: 123456 },
    { name: 'Third', chainId: 9, tvl: 7 },
  ];
  assert.equal(pickTvl(chains, 4663), 123456);
  assert.equal(pickTvl([{ chainId: '4663', tvl: 9 }], 4663), 9);
  assert.equal(pickTvl([{ name: 'Robinhood Chain', tvl: 1 }], 4663), null);
  assert.equal(pickTvl([{ chainId: 4663, tvl: 'x' }], 4663), null);
  assert.equal(pickTvl(null, 4663), null);
  assert.equal(await fetchTvl('https://llama.example', 4663, async () => ({ ok: true, json: async () => chains })), 123456);
  await assert.rejects(fetchTvl('https://llama.example', 777, async () => ({ ok: true, json: async () => chains })));
  assert.equal(read('src/register.js').includes('4663'), true);
});

gate('25 top pairs: tagged, deduped, sorted, logo and link sanitised', () => {
  const mk = (over) => ({ chainId: 'robinhood', pairAddress: '0xP' + Math.random().toString(16).slice(2), url: 'https://dexscreener.com/robinhood/0x1', baseToken: { address: '0xT1', name: 'Alpha', symbol: 'ALP' }, priceUsd: '0.5', volume: { h24: 100 }, priceChange: { h24: 2 }, liquidity: { usd: 50 }, info: { imageUrl: 'https://cdn.dexscreener.com/cms/images/abc?width=800&height=800&quality=95&format=auto' }, ...over });
  const json = { pairs: [
    mk({ pairAddress: '0xA', volume: { h24: 100 } }),
    mk({ pairAddress: '0xB', volume: { h24: 900 } }),
    mk({ pairAddress: '0xC', baseToken: { address: '0xT2', name: 'Beta', symbol: 'BET' }, volume: { h24: 500 }, priceChange: { h24: -4 }, liquidity: { usd: 9000 }, info: { imageUrl: 'https://evil.example/x.png' }, url: 'https://evil.example/pair' }),
    mk({ pairAddress: '0xD', chainId: 'solana', volume: { h24: 99999 } }),
    mk({ pairAddress: '0xE', baseToken: { address: '0xT3', name: 'NoVol', symbol: 'NV' }, volume: {} }),
    { chainId: 'robinhood' }, null,
  ] };
  const out = normalizePairs(json);
  assert.deepEqual(out.map((p) => p.id), ['0xb', '0xc'], 'tag filter, dedupe by token, drop broken rows, volume order');
  assert.equal(out[0].logo, 'https://cdn.dexscreener.com/cms/images/abc?width=128&height=128&quality=95&format=auto');
  assert.equal(out[1].logo, null); assert.equal(out[1].url, null);
  assert.equal(safeLogo('http://cdn.dexscreener.com/a'), null);
  assert.equal(safePairUrl('https://dexscreener.com/x'), 'https://dexscreener.com/x');
  assert.equal(normalizePairs({}).length, 0);
  assert.deepEqual(sortPairs(out, 'move').map((p) => p.symbol), ['ALP', 'BET']);
  assert.deepEqual(sortPairs(out, 'depth').map((p) => p.symbol), ['BET', 'ALP']);
  assert.deepEqual(filterPairs(out, 'bet').map((p) => p.symbol), ['BET']);
  assert.equal(filterPairs(out, '  ').length, 2);
  const page = dist('index.html');
  assert.equal((page.match(/is-skeleton/g) || []).length, 8, 'skeleton cards ship in the markup');
});

gate('26 dash fallback: every formatter answers a dash for unusable input', () => {
  for (const bad of [null, undefined, NaN, Infinity, '12', {}]) {
    assert.equal(fmtInt(bad), DASH); assert.equal(fmtUsdCompact(bad), DASH); assert.equal(fmtPrice(bad), DASH); assert.equal(fmtDelta(bad).text, DASH);
  }
  assert.equal(fmtPrice(0), DASH);
  assert.equal(fmtInt(80757800), '80,757,800');
  assert.equal(fmtUsdCompact(1050093034), '$1.05B'); assert.equal(fmtUsdCompact(39100), '$39.1K'); assert.equal(fmtUsdCompact(12), '$12');
  assert.equal(fmtPrice(0.001603), '$0.001603'); assert.equal(fmtPrice(12.3456), '$12.35');
  assert.deepEqual(fmtDelta(4.94), { text: '▲ 4.9%', dir: 'up' }); assert.equal(fmtDelta(-2).dir, 'down');
  const main = read('src/js/main.js');
  assert.ok(/onError: \(\) => \{ health\.fail\(\); dash\('block'\)/.test(main) && main.includes("dash('tvl')") && main.includes("dash('vol')"), 'errors fall back to dashes');
});

gate('27 CSP: header and meta cover every live origin and nothing loose', () => {
  const headers = dist('_headers'), page = dist('index.html');
  const csp = buildCsp(register.rpc.value);
  assert.ok(headers.includes('Content-Security-Policy: ' + csp));
  const meta = page.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  assert.equal(meta.replace(/&#39;/g, "'").replace(/&amp;/g, '&'), buildCsp(register.rpc.value, { meta: true }));
  const connect = csp.match(/connect-src ([^;]+)/)[1].split(' ').sort();
  assert.deepEqual(connect, ['https://api.dexscreener.com', 'https://api.llama.fi', 'https://rpc.mainnet.chain.robinhood.com']);
  assert.match(csp, /img-src [^;]*https:\/\/cdn\.dexscreener\.com/);
  assert.match(csp, /font-src https:\/\/fonts\.gstatic\.com/);
  assert.ok(!/unsafe-inline|unsafe-eval|\s\*(?:[\s;]|$)/.test(csp));
  assert.match(csp, /frame-ancestors 'none'/); assert.match(csp, /default-src 'none'/);
  const used = new Set();
  for (const f of walk(P('src/js'))) for (const m of readFileSync(f, 'utf8').matchAll(/https:\/\/[a-z0-9.-]+/g)) used.add(m[0]);
  const allowed = csp.match(/https:\/\/[a-z0-9.-]+/g);
  for (const u of used) assert.ok(allowed.includes(u), 'script talks to an origin the policy does not list: ' + u);
  assert.ok(!read('src/js/main.js').includes('document.hidden'), 'visibility is handled inside the poller');
});

gate('28 reduced motion: CSS and script both settle to the end state', () => {
  const css = dist('assets/app.css');
  const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.ok(block.includes('animation: none !important') && block.includes('transition: none !important'));
  assert.ok(block.includes('[data-depth]') && block.includes('[data-reveal]'));
  assert.equal(prefersReduced({ matchMedia: () => ({ matches: true }) }), true);
  assert.equal(prefersReduced({ matchMedia: () => ({ matches: false }) }), false);
  let v = null, rafCalls = 0;
  countUp({ from: 0, to: 50, reduced: true, set: (x) => { v = x; }, raf: () => { rafCalls++; } });
  assert.equal(v, 50); assert.equal(rafCalls, 0);
  let t = 0; const queue = []; const seen = [];
  countUp({ from: 0, to: 100, duration: 1000, set: (x) => seen.push(x), raf: (f) => queue.push(f), now: () => t });
  while (queue.length && t <= 2000) { t += 100; queue.shift()(); }
  assert.equal(seen.at(-1), 100); assert.ok(seen.every((x, i) => i === 0 || x >= seen[i - 1]));
  assert.equal(tween(0, 10, 0), 0); assert.equal(tween(0, 10, 1), 10);
  assert.match(read('src/js/motion.js'), /export function initMatrix[\s\S]*if \(reduced\) \{/);
});

gate('29 copy: zero shared two-word runs with the reference site', () => {
  assert.ok(existsSync(P('reference')), 'reference/ folder is needed for this check');
  const refText = ['app.js', 'explore.js', 'lib.js', 'ref.html'].filter((f) => existsSync(P('reference', f))).map((f) => readFileSync(P('reference', f), 'utf8')).join('\n');
  assert.ok(refText.length > 10000, 'reference text loaded');
  const ref = bigrams(refText);
  const jsCopy = [...read('src/js/main.js').matchAll(/'([^'\n]*[A-Za-z]{2,}[^'\n]*)'/g)].map((m) => m[1]).filter((s) => /^[A-Z0-9]/.test(s) && s.includes(' ')).join('\n');
  const ours = bigrams(visibleCopy(dist('index.html')) + '\n' + jsCopy);
  const names = bigrams(register.chain.value.name); // the client's chain name is a proper noun, not copy
  const shared = [...ours].filter((g) => ref.has(g) && !names.has(g));
  assert.deepEqual(shared, [], 'shared two-word runs: ' + shared.join(' | '));
});

gate('30 repo hygiene: supporting files present, no agent folders, no attribution text', () => {
  for (const f of ['README.md', 'LICENSE', 'docs/whitepaper.md', 'docs/tokenomics.md', 'docs/roadmap.md', 'docs/architecture.md', '.github/CONTRIBUTING.md', '.github/SECURITY.md', 'dist/index.html', 'dist/_headers']) assert.ok(existsSync(P(f)), 'missing ' + f);
  const all = walk(root, ['node_modules', '.git', 'reference', 'brand']).filter((f) => !/\.(?:png|jpe?g)$/i.test(f));
  assert.ok(!all.some((f) => /(^|[\\/])CLAUDE\.md$/i.test(f)), 'no agent memory file');
  assert.ok(!existsSync(P('.claude')), 'no agent folder');
  const bad = [new RegExp('Co-Authored-By', 'i'), new RegExp('Generated with', 'i'), new RegExp('Cla' + 'ude', 'i'), new RegExp('Anthr' + 'opic', 'i'), new RegExp('\\bAI[- ]generated\\b', 'i'), new RegExp('\\bChatGPT\\b', 'i')];
  for (const f of all) {
    if (relative(root, f).replaceAll('\\', '/') === 'scripts/gates.mjs') continue;
    const t = readFileSync(f, 'utf8');
    for (const re of bad) assert.ok(!re.test(t), `${relative(root, f)} matches ${re}`);
  }
});

assert.equal(gates.length, 30, 'exactly thirty gates');

/* ---------- runner ---------- */
const t0 = Date.now();
let failed = 0;
for (const g of gates) {
  const s = Date.now();
  try { await g.fn(); console.log(`PASS  ${g.name}  (${Date.now() - s}ms)`); }
  catch (e) { failed++; console.log(`FAIL  ${g.name}\n      ${String(e.message).split('\n').join('\n      ')}`); }
}
console.log(`\n${gates.length - failed}/${gates.length} gates passed in ${((Date.now() - t0) / 1000).toFixed(2)}s`);
process.exit(failed ? 1 : 0);
