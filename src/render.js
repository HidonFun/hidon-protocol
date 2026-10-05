// Pure page renderer: register in, HTML string out. No dates, no inline styles, no inline scripts.
import { linkView, contractView, rpcHost } from './validate.js';
import { buildCsp } from './origins.js';
import { xSvg, githubSvg, copySvg } from './icons.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const FILL = '·'; // middle dot used for the empty address slot
export const emptyAddress = () => '0x' + FILL.repeat(40);

function social(kind, rec) {
  const label = kind === 'x' ? 'X' : 'GitHub';
  const icon = kind === 'x' ? xSvg() : githubSvg();
  const v = linkView(kind, rec);
  if (v.live) {
    return `<a class="icon-btn" data-social="${kind}" data-state="stated" href="${esc(v.href)}" target="_blank" rel="noopener noreferrer" aria-label="${label}: ${esc(v.handle)}" title="${label}: ${esc(v.handle)}">${icon}</a>`;
  }
  const state = rec.state === 'stated' ? 'unconfirmed' : rec.state;
  return `<span class="icon-btn is-inert" data-social="${kind}" data-state="${esc(state)}" role="img" aria-disabled="true" aria-label="${label} (not linked yet)">${icon}</span>`;
}

function caBar(c) {
  const chip = { stated: 'Stated', absent: 'Not stated yet', unconfirmed: 'Unconfirmed' }[c.state];
  const btn = `<span class="ca-btn" id="ca-btn">${copySvg()}<span class="ca-btn-text">Copy</span></span>`;
  const body = c.state === 'stated'
    ? `<button type="button" class="ca-row" id="ca-copy" data-address="${esc(c.address)}" aria-label="Copy address ${esc(c.address)}"><code class="ca-code" id="ca-code">${esc(c.address)}</code>${btn}</button>`
    : `<div class="ca-row is-inert" aria-disabled="true" aria-label="Address slot is not available yet"><code class="ca-code" id="ca-code">${emptyAddress()}</code>${btn}</div>`;
  return `<div class="ca" id="ca" data-state="${c.state}"><div class="container ca-inner">
      <div class="ca-meta"><span class="eyebrow">Contract</span><span class="chip" data-chip>${chip}</span></div>
      ${body}
      <p class="sr" id="ca-live" role="status" aria-live="polite"></p>
    </div></div>`;
}

const skeletons = (n) => Array.from({ length: n }, () => '<div class="card inf is-skeleton" aria-hidden="true"><div class="inf-head"><i class="skeleton sk-logo"></i><div class="sk-stack"><i class="skeleton sk-line"></i><i class="skeleton sk-line short"></i></div></div><i class="skeleton sk-block"></i><i class="skeleton sk-line"></i></div>').join('');

const tile = (eyebrow, value, sub, state, extra = '') => `<div class="tile-info" data-tile="${eyebrow.toLowerCase()}" data-reveal><div class="tile-top"><span class="eyebrow">${eyebrow}</span><span class="chip">${state}</span></div><b class="tile-value${extra}">${value}</b><span class="tile-sub">${sub}</span></div>`;

export function renderPage(reg, opts = {}) {
  const name = reg.name.value;
  const chain = reg.chain.value;
  const c = contractView(reg.contract);
  const host = rpcHost(reg.rpc) || '';
  const csp = buildCsp(reg.rpc.value, { meta: true });
  const title = `${name} · Synthetic stars, minted onchain`;
  const desc = 'Hidon mints synthetic stars. Looks, voice, followers, token: each one is anchored in Robinhood Chain.';
  const cStateLabel = { stated: 'Stated', absent: 'Absent', unconfirmed: 'Unconfirmed' }[c.state];
  const contractValue = c.state === 'stated' ? esc(c.address) : c.state === 'absent' ? 'Not stated yet' : 'Awaiting a valid address';
  const contractSub = c.state === 'stated' ? 'Full address, copy it from the top bar' : 'This slot opens once an address is published';
  const nav = '<a href="#pulse">Pulse</a><a href="#board">Board</a><a href="#method">Method</a>';

  return `<!doctype html>
<html lang="en" data-tone="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta http-equiv="Content-Security-Policy" content="${esc(csp)}">
<meta name="color-scheme" content="dark light">
${reg.rpc.state === 'stated' ? `<meta name="hidon-rpc" content="${esc(reg.rpc.value)}">` : ''}
<meta name="hidon-chain" content="${chain.id}">
${opts.themeColor ? `<meta name="theme-color" content="${esc(opts.themeColor)}">` : ''}
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta name="twitter:card" content="summary">
${reg.domain.state === 'stated' ? `<link rel="canonical" href="https://${esc(reg.domain.value)}/">` : ''}
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@500;700&display=swap">
<link rel="stylesheet" href="/assets/app.css">
<script src="/assets/js/boot.js"></script>
<script type="module" src="/assets/js/main.js"></script>
</head>
<body>
<div class="progress" aria-hidden="true"><i id="progress"></i></div>
<a class="skip" href="#board">Skip ahead to pairs</a>

<header class="header" id="site-header"><div class="container">
    <a class="wordmark" href="#top" aria-label="${esc(name)} home"><img class="mark" src="/assets/mark-lime-64.png" srcset="/assets/mark-lime-64.png 1x, /assets/mark-lime-128.png 2x" width="30" height="30" alt=""><span class="wm"><span>hid</span><em>on</em></span></a>
    <nav class="nav" aria-label="Sections">${nav}</nav>
    <div class="header-right">
      <div class="health" id="health" data-state="connecting" role="status" aria-live="polite"><i class="dot" aria-hidden="true"></i><span id="health-text">Connecting</span></div>
      <div class="social" aria-label="Social links">${social('x', reg.x)}${social('github', reg.github)}</div>
    </div>
</div></header>
${caBar(c)}

<div class="tape" id="tape" aria-label="Live ticker"><div class="tape-run">
  <div class="tape-set" id="tape-a"></div><div class="tape-set" id="tape-b" aria-hidden="true"></div>
</div></div>

<main id="top">
<section class="panel hero" data-tone="dark" aria-labelledby="h1">
  <canvas class="matrix" id="matrix" aria-hidden="true"></canvas>
  <div class="hero-glow" data-depth="0.08" aria-hidden="true"></div>
  <div class="container home-hero">
    <div class="emblem" data-depth="0.1" aria-hidden="true"><img src="/assets/mark-lime-256.png" srcset="/assets/mark-lime-128.png 1x, /assets/mark-lime-256.png 2x, /assets/mark-lime-512.png 4x" width="112" height="112" alt=""></div>
    <span class="eyebrow" data-reveal>${esc(chain.name)} · ${chain.id}</span>
    <h1 class="display" id="h1" data-reveal="1"><span class="h1-a">Type once.</span><br><em>Mint a star.</em></h1>
    <p class="lede" data-reveal="2">Type a persona into Hidon. Out come looks, voice and feed, plus a token anchored in ${esc(chain.name)} that followers can hold.</p>
    <div class="readout" data-reveal="3">
      <span class="readout-label"><i class="dot" aria-hidden="true"></i>Latest block</span>
      <b class="readout-value num" id="hero-block" data-dash>—</b>
      <a class="btn btn-lg" href="#board">See live pairs</a>
    </div>
    <div class="chips" data-reveal="4"><a class="chip-btn" href="#info">Chain ${chain.id}</a><a class="chip-btn" href="#info">Contract slot</a><a class="chip-btn" href="#info">RPC endpoint</a></div>
    <div class="lineup" aria-hidden="true">
      <div class="arch a1" data-depth="0.05"><i></i></div><div class="arch a2" data-depth="0.11"><i></i></div><div class="arch a3" data-depth="0.18"><i></i></div><div class="arch a4" data-depth="0.11"><i></i></div><div class="arch a5" data-depth="0.05"><i></i></div>
    </div>
    <p class="lineup-note" data-reveal>Five panes of generated geometry. Decoration only.</p>
  </div>
</section>

<section class="panel" data-tone="light" id="pulse" aria-labelledby="h-pulse">
  <div class="container">
    <div class="section-head" data-reveal><h2 class="display" id="h-pulse">Chain <em>pulse.</em></h2><p class="muted">Three readings, each refreshing independently.</p></div>
    <div class="home-stats" id="totals">
      <div data-reveal="1"><b class="num" id="stat-block" data-dash>—</b><span class="eyebrow">Latest block</span></div>
      <div data-reveal="2"><b class="num" id="stat-tvl" data-dash>—</b><span class="eyebrow">Chain TVL</span></div>
      <div data-reveal="3"><b class="num" id="stat-vol" data-dash>—</b><span class="eyebrow">Pair volume · 24h</span></div>
    </div>
  </div>
</section>

<section class="panel" data-tone="dark" id="board" aria-labelledby="h-board">
  <div class="container">
    <div class="section-head" data-reveal><h2 class="display" id="h-board">Moving <em>pairs.</em></h2><p class="muted">The busiest markets here, read from public data.</p></div>
    <div class="toolbar" data-reveal="1">
      <div class="tabs" role="tablist" aria-label="Order pairs by">
        <button type="button" role="tab" data-sort="volume" aria-selected="true">Volume</button>
        <button type="button" role="tab" data-sort="move" aria-selected="false">Momentum</button>
        <button type="button" role="tab" data-sort="depth" aria-selected="false">Depth</button>
      </div>
      <input class="input" id="filter" type="search" placeholder="Filter by symbol or name" aria-label="Filter pairs" maxlength="30" autocomplete="off">
    </div>
    <div id="list" class="grid-cards" aria-live="polite" aria-busy="true">${skeletons(8)}</div>
    <p class="board-note" id="board-note" hidden></p>
  </div>
</section>

<section class="panel" data-tone="light" id="method" aria-labelledby="h-method">
  <div class="container">
    <div class="section-head" data-reveal><h2 class="display" id="h-method">Three moves. <em>One premise.</em></h2></div>
    <ol class="how">
      <li data-reveal="1"><span class="n">01 · PREMISE</span><h3>Write the brief</h3><p>Just a brief pitch: temperament, topics, tone. Nothing to upload, nothing to code.</p>
        <div class="demo"><q>A deadpan finance explainer who distrusts hype</q></div></li>
      <li data-reveal="2"><span class="n">02 · PRESENCE</span><h3>Give it a presence</h3><p>Your pitch becomes a persona: looks, voice, fresh posts, plus a hangout for followers.</p>
        <div class="demo"><span class="ok">Face</span><span class="ok">Voice</span><span class="ok">Feed</span></div></li>
      <li data-reveal="3"><span class="n">03 · ECONOMY</span><h3>Open its economy</h3><p>A token tied to that persona debuts across ${esc(chain.name)}, and holders help steer where it heads next.</p>
        <div class="demo"><span class="ok">Coin onchain</span><span class="ok">Community open</span><span class="ok">Content flowing</span></div></li>
    </ol>
  </div>
</section>

<section class="panel" data-tone="dark" id="layers" aria-labelledby="h-layers">
  <div class="container">
    <div class="card fee-card" data-reveal>
      <div class="fee-copy">
        <span class="eyebrow">Anatomy</span>
        <h2 class="display" id="h-layers">One AI, <em>three layers.</em></h2>
        <p>Each persona stacks three layers. Pick one to read about it.</p>
        <div class="tabs block" role="tablist" aria-label="Character layers">
          <button type="button" role="tab" data-layer="identity" aria-selected="true">Identity</button>
          <button type="button" role="tab" data-layer="community" aria-selected="false">Community</button>
          <button type="button" role="tab" data-layer="coin" aria-selected="false">Coin</button>
        </div>
        <p class="layer-note" id="layer-note" aria-live="polite">Looks, voice and temperament, taken off the pitch and held steady wherever the persona appears.</p>
      </div>
      <div class="splitter">
        <div class="splitbar" role="img" aria-label="The three character layers, side by side"><i class="seg seg-identity is-on" data-seg="identity"></i><i class="seg seg-community" data-seg="community"></i><i class="seg seg-coin" data-seg="coin"></i></div>
        <dl class="legend">
          <div data-row="identity" class="is-on" data-note="Looks, voice and temperament, taken off the pitch and held steady wherever the persona appears."><i class="seg-identity"></i><dt>Identity<small>Face, voice, personality</small></dt><dd>01</dd></div>
          <div data-row="community" data-note="Followers take part. They react, remix and nudge the character toward new directions."><i class="seg-community"></i><dt>Community<small>People who shape what comes next</small></dt><dd>02</dd></div>
          <div data-row="coin" data-note="A token anchored in ${esc(chain.name)} links the persona's economy to its backers."><i class="seg-coin"></i><dt>Coin<small>Its economy, onchain</small></dt><dd>03</dd></div>
        </dl>
      </div>
    </div>
  </div>
</section>

<section class="panel" data-tone="light" id="info" aria-labelledby="h-info">
  <div class="container">
    <div class="section-head" data-reveal><h2 class="display" id="h-info">Wiring <em>details.</em></h2><p class="muted">Where Hidon points today. An address appears here once stated.</p></div>
    <div class="card details tiles-info">
      ${tile('Chain', esc(chain.name), `Chain id ${chain.id} · ${esc(chain.hex)}`, 'Stated')}
      ${tile('Contract', contractValue, contractSub, cStateLabel, c.state === 'stated' ? ' is-mono' : '')}
      ${tile('RPC', esc(host), 'Public JSON-RPC endpoint', 'Stated', ' is-mono')}
    </div>
  </div>
</section>

<section class="panel band-panel" data-tone="dark" aria-labelledby="h-band">
  <div class="container"><div class="band" data-reveal>
    <h2 class="display" id="h-band">Stay <em>close.</em></h2>
    <a class="btn btn-lg" href="#board">Open pairs</a>
  </div></div>
</section>
</main>

<footer class="footer" data-tone="dark"><div class="container">
  <div class="foot-col"><span class="foot-brand"><img class="mark" src="/assets/mark-lime-64.png" width="30" height="30" alt=""><span class="wm"><span>hid</span><em>on</em></span></span>
    <span>Hidon stands alone; Robinhood plays no part.</span>
    <span class="foot-nav">${nav}</span></div>
  <div class="foot-col foot-right"><span>Numbers arrive from DefiLlama, DexScreener, along with RPC reads, and may lag.</span></div>
</div></footer>
</body>
</html>
`;
}
