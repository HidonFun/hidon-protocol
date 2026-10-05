// Click-to-copy for the contract address. Clipboard and fallback are injected.
export async function copyAddress(address, { clipboard, fallback } = {}) {
  if (typeof address !== 'string' || !address) return 'failed';
  try {
    if (clipboard && clipboard.writeText) { await clipboard.writeText(address); return 'copied'; }
  } catch { /* fall through to the selection fallback */ }
  try { if (fallback && fallback(address)) return 'copied'; } catch { /* ignore */ }
  return 'failed';
}

// Select the visible text so a manual copy is one keystroke away.
export function selectFallback(node, win = window) {
  if (!node) return false;
  const range = win.document.createRange();
  range.selectNodeContents(node);
  const sel = win.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  try { return win.document.execCommand('copy'); } catch { return false; }
}
