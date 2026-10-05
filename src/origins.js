// Every network origin the page talks to, and the policy built from them.
export const ORIGINS = {
  llama: 'https://api.llama.fi',
  dex: 'https://api.dexscreener.com',
  dexImages: ['https://cdn.dexscreener.com', 'https://dd.dexscreener.com'],
  fontsCss: 'https://fonts.googleapis.com',
  fontsFiles: 'https://fonts.gstatic.com',
};

export function buildCsp(rpcOrigin, { meta = false } = {}) {
  const connect = ['https://' + new URL(rpcOrigin).host, ORIGINS.llama, ORIGINS.dex];
  return [
    "default-src 'none'",
    "script-src 'self'",
    `style-src 'self' ${ORIGINS.fontsCss}`,
    `font-src ${ORIGINS.fontsFiles}`,
    `img-src 'self' data: ${ORIGINS.dexImages.join(' ')}`,
    `connect-src ${connect.join(' ')}`,
    "manifest-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "object-src 'none'",
    ...(meta ? [] : ["frame-ancestors 'none'"]),
  ].join('; ');
}
