// Build: src/ -> dist/. Zero dependencies. dist/ is the folder that gets deployed.
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { register } from '../src/register.js';
import { renderPage } from '../src/render.js';
import { buildCsp } from '../src/origins.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (...p) => join(root, 'src', ...p);
const out = (...p) => join(root, 'dist', ...p);

// Colour literal for a --c-* token, read from the tokens file so nothing else names a colour.
export function hexToken(css, name) {
  const m = css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\s*;`));
  if (!m) throw new Error('token not found: ' + name);
  return m[1].toLowerCase();
}

export function build() {
  rmSync(out(), { recursive: true, force: true });
  mkdirSync(out('assets', 'js'), { recursive: true });

  const tokens = readFileSync(src('styles', 'tokens.css'), 'utf8');
  const css = ['tokens.css', 'base.css', 'sections.css'].map((f) => readFileSync(src('styles', f), 'utf8')).join('\n');
  writeFileSync(out('assets', 'app.css'), css);

  for (const f of readdirSync(src('js'))) copyFileSync(src('js', f), out('assets', 'js', f));
  for (const f of readdirSync(src('assets'))) copyFileSync(src('assets', f), out('assets', f));

  const bg = hexToken(tokens, 'c-lime');
  const fg = hexToken(tokens, 'c-ink');
  writeFileSync(out('favicon.svg'), readFileSync(src('favicon.svg.tpl'), 'utf8').trim().replace('{{bg}}', bg).replace(/\{\{fg\}\}/g, fg) + '\n');

  writeFileSync(out('index.html'), renderPage(register, { themeColor: hexToken(tokens, 'c-black') }));

  const csp = buildCsp(register.rpc.value);
  writeFileSync(out('_headers'), [
    '/*',
    `  Content-Security-Policy: ${csp}`,
    '  X-Content-Type-Options: nosniff',
    '  X-Frame-Options: DENY',
    '  Referrer-Policy: strict-origin-when-cross-origin',
    '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()',
    '  Cross-Origin-Opener-Policy: same-origin',
    '/assets/*',
    '  Cache-Control: public, max-age=300',
    '',
  ].join('\n'));
  writeFileSync(out('robots.txt'), 'User-agent: *\nAllow: /\n');
  return { bg, fg };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const r = build();
  console.log('built dist/ (favicon ' + r.bg + ' / ' + r.fg + ')');
}
