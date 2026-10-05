# Architecture

This covers the repository as it is today: the public site. The launchpad itself (builder, content, coin contracts) is described in `whitepaper.md` and has no code yet.

## Site

A static page, built with plain Node scripts and no runtime dependencies. `dist/` is the whole deploy.

```
register --> render --> dist/index.html
tokens.css + base.css + sections.css --> dist/assets/app.css
src/js/*.js --> dist/assets/js/*.js   (native modules, no bundler)
src/assets/*.png --> dist/assets/     (logo marks)
src/favicon.svg.tpl + tokens --> dist/favicon.svg
```

### Register

`src/register.js` holds each external fact as one record: `name`, `domain`, `chain`, `rpc`, `contract`, `x`, `github`. Every record has a `state` of `stated`, `absent` or `unconfirmed`, a source note, and a `dated` field. The date is bookkeeping only and is never rendered or shipped.

### Render

`src/render.js` is a pure function from register to HTML. Two rules drive it:

- A link or a copy action exists only for a `stated` record that also passes its shape check.
- Absent and unconfirmed records render an inert slot of the same size, so the layout never shifts when a fact is published.

### Validation

`src/validate.js` holds the shape checks. The address check accepts any `0x` followed by 40 hex digits, in any letter case, and refuses nothing else. Handles are derived from stored URLs on an allow-listed host; they are never stored.

## Brand pipeline

- `brand/` holds the supplied logo files. One is opaque, one is transparent. The transparent one keeps pure black under every fully transparent pixel.
- `tools/brand.py` crops the mark, resizes it with premultiplied alpha so no dark halo forms at the edges, writes ink and lime variants at four sizes, and traces the favicon from an alpha grid of the mark.
- The four palette colours were sampled with k-means and snapped to real pixels. `src/styles/tokens.css` records each file and coordinate, and the gates read the PNG pixels back to confirm them.
- Output is committed, so the build needs nothing beyond Node.

## Live data

| Reading | Source | Cadence |
| --- | --- | --- |
| Latest block | JSON-RPC `eth_blockNumber` on the chain RPC | 2 s |
| Chain TVL | DefiLlama chain list, matched by chain id | 60 s |
| Pairs | DexScreener search, filtered to the `robinhood` tag | 30 s |

Each reading has its own poller (`src/js/poller.js`):

- on failure the next attempt waits twice as long as the last, up to a cap, with jitter so many tabs do not retry together;
- one success returns the poller to its normal cadence;
- while the tab is hidden nothing is requested, and on return the poller refreshes at once;
- every request has a timeout.

When a reading fails, its tile shows a dash. The health pill follows the block poller: Connecting until the first answer, Live while answers arrive, Offline after three misses in a row or when the browser goes offline.

## Security posture

- Content security policy delivered as a response header and repeated in a meta tag. Scripts and styles from the site only, fonts from Google Fonts, network calls only to the three data origins, no inline code.
- Remote values reach the page as text. Remote images and links pass a host allow-list first.
- No keys, no signing, no wallet connection.

## Motion

Reveal on scroll, progress bar, parallax, count-up, flash on change, the floating mark and the hero canvas all respect `prefers-reduced-motion`. With it set, content shows immediately, values land without tweening, and the canvas draws one still frame.

## Gates

`scripts/gates.mjs` runs thirty checks with synthetic fixtures and a fake clock. It renders the page from fixture registers to prove both branches of every slot, and it mutates the validators and the registers to prove the checks notice. Mutation anchors read the current record at run time, so the checks do not depend on which state the real register is in.
