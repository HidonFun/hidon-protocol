// Shared checks. Pure functions, no DOM.
const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

// Any 0x + 40 hex digits passes, in any letter case. Only malformed input is refused.
export function isAddress(v) {
  return typeof v === 'string' && ADDRESS.test(v.trim());
}

// What a record may show: stated and well-formed. Unconfirmed and absent never produce links or copy.
export function isLive(rec) {
  return Boolean(rec) && rec.state === 'stated';
}

const HOSTS = { x: ['x.com', 'twitter.com'], github: ['github.com'] };

// Store the URL, derive the handle. Returns null when the URL is not on the expected host.
export function deriveHandle(kind, url) {
  if (typeof url !== 'string') return null;
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.replace(/^www\./, '');
  if (!HOSTS[kind] || !HOSTS[kind].includes(host)) return null;
  const first = u.pathname.split('/').filter(Boolean)[0];
  if (!first || !/^[A-Za-z0-9_-]{1,39}$/.test(first)) return null;
  return first;
}

// Final view of a link record: href exists only when stated and the handle derives cleanly.
export function linkView(kind, rec) {
  if (!isLive(rec)) return { live: false, href: null, handle: null };
  const handle = deriveHandle(kind, rec.url);
  if (!handle) return { live: false, href: null, handle: null };
  return { live: true, href: rec.url, handle };
}

// Final view of the contract record.
export function contractView(rec) {
  if (!rec || rec.state === 'absent' || rec.value == null) return { state: 'absent', address: null };
  if (rec.state === 'stated' && isAddress(rec.value)) return { state: 'stated', address: rec.value.trim() };
  return { state: 'unconfirmed', address: null };
}

export function rpcHost(rec) {
  try { return new URL(rec.value).host; } catch { return null; }
}
