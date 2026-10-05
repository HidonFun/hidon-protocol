// Pairs from DexScreener that carry the robinhood chain tag.
export const DEX_SLUG = 'robinhood';
const LOGO_HOSTS = ['cdn.dexscreener.com', 'dd.dexscreener.com'];
const num = (v) => { const n = typeof v === 'string' ? Number(v) : v; return Number.isFinite(n) ? n : null; };

export function safeLogo(url, size = 128) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' || !LOGO_HOSTS.includes(u.hostname)) return null;
    if (u.searchParams.has('width')) { u.searchParams.set('width', String(size)); u.searchParams.set('height', String(size)); }
    return u.toString();
  } catch { return null; }
}

export function safePairUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'dexscreener.com' ? u.toString() : null;
  } catch { return null; }
}

export function normalizePairs(json, { slug = DEX_SLUG, limit = 12 } = {}) {
  const raw = json && Array.isArray(json.pairs) ? json.pairs : [];
  const best = new Map();
  for (const p of raw) {
    if (!p || p.chainId !== slug || typeof p.pairAddress !== 'string') continue;
    const base = p.baseToken || {};
    if (typeof base.symbol !== 'string' || !base.symbol) continue;
    const vol = num(p.volume && p.volume.h24);
    if (vol == null) continue;
    const key = String(base.address || p.pairAddress).toLowerCase();
    const row = {
      id: p.pairAddress.toLowerCase(),
      symbol: base.symbol.slice(0, 14),
      name: String(base.name || base.symbol).slice(0, 40),
      price: num(p.priceUsd),
      vol24: vol,
      chg24: num(p.priceChange && p.priceChange.h24),
      liq: num(p.liquidity && p.liquidity.usd),
      url: safePairUrl(p.url),
      logo: safeLogo(p.info && p.info.imageUrl),
    };
    const seen = best.get(key);
    if (!seen || row.vol24 > seen.vol24) best.set(key, row);
  }
  return [...best.values()].sort((a, b) => b.vol24 - a.vol24).slice(0, limit);
}

const desc = (pick) => (a, b) => {
  const x = pick(a), y = pick(b);
  if (x == null && y == null) return 0;
  if (x == null) return 1;
  if (y == null) return -1;
  return y - x;
};
const SORTS = { volume: desc((p) => p.vol24), move: desc((p) => p.chg24), depth: desc((p) => p.liq) };

export function sortPairs(pairs, key) { return [...pairs].sort(SORTS[key] || SORTS.volume); }

export function filterPairs(pairs, q) {
  const t = String(q || '').trim().toLowerCase();
  return t ? pairs.filter((p) => p.symbol.toLowerCase().includes(t) || p.name.toLowerCase().includes(t)) : pairs;
}

export async function fetchPairs(base, fetchImpl = fetch, signal) {
  const res = await fetchImpl(`${base}/latest/dex/search?q=${DEX_SLUG}`, { signal });
  if (!res.ok) throw new Error('dex status ' + res.status);
  const pairs = normalizePairs(await res.json());
  if (!pairs.length) throw new Error('no pairs');
  return pairs;
}
