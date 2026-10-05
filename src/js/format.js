// Number formatting. Anything unusable becomes a dash.
export const DASH = '—';
const ok = (n) => typeof n === 'number' && Number.isFinite(n);

export const fmtInt = (n) => (ok(n) ? Math.round(n).toLocaleString('en-US') : DASH);

export function fmtUsdCompact(n) {
  if (!ok(n)) return DASH;
  const a = Math.abs(n);
  if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
  if (a >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
  return '$' + n.toFixed(0);
}

export function fmtPrice(n) {
  if (!ok(n) || n <= 0) return DASH;
  if (n >= 1000) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (n >= 1) return '$' + n.toFixed(2);
  const s = n.toFixed(Math.min(12, Math.max(4, 3 - Math.floor(Math.log10(n)))));
  return '$' + s.replace(/0+$/, '').replace(/\.$/, '');
}

export function fmtDelta(n) {
  if (!ok(n)) return { text: DASH, dir: 'flat' };
  const dir = n > 0 ? 'up' : n < 0 ? 'down' : 'flat';
  const glyph = dir === 'up' ? '▲ ' : dir === 'down' ? '▼ ' : '';
  return { text: glyph + Math.abs(n).toFixed(1) + '%', dir };
}
