# Hidon

Hidon is a launchpad on Robinhood Chain where an AI personality gets its own economy. Write a short pitch, and the character gets looks, a voice, content and a community. A coin of its own anchors that economy onchain.

This repository holds the public site: a static page with the brand, a live readout of the chain, and slots for the contract address and social links that open as soon as those facts are stated.

Domain: hidon.fun

## What the page does

- Shows the latest block, read from the chain's own RPC every two seconds.
- Shows chain TVL from DefiLlama, matched by chain id 4663.
- Lists the busiest pairs tagged `robinhood` on DexScreener, with logo, price and 24h volume.
- Keeps a contract-address slot at the top of every view. It is inert until an address is stated, then it shows the full address with one-click copy.
- Shows X and GitHub icons at the top right. Each one links only once its record is stated. X is stated; GitHub is not yet.

## Chain

| Field | Value |
| --- | --- |
| Name | Robinhood Chain |
| Chain id | 4663 (0x1237) |
| RPC | https://rpc.mainnet.chain.robinhood.com |

## Layout

```
brand/               the supplied logo files
reference/           the supplied cover and slides, plus the study copy of the reference site
src/register.js      every external fact, one record each (stated, absent, unconfirmed)
src/validate.js      address and link rules shared by the renderer and the gates
src/render.js        register in, HTML out
src/styles/          tokens.css holds every colour; the other files use variables only
src/assets/          logo marks, resized with premultiplied alpha
src/js/              live data, polling, motion
tools/brand.py       regenerates the marks and the favicon from brand/
scripts/build.mjs    src -> dist
scripts/gates.mjs    thirty checks, no network
scripts/serve.mjs    local server that sends the same CSP as the deploy
dist/                deploy this folder
docs/                whitepaper, tokenomics, roadmap, architecture
```

## Commands

```
npm run build    writes dist/
npm run gates    runs the thirty gates against the source and dist/
npm run serve    serves dist/ on http://localhost:4173 (set PORT to change it)
```

No dependencies to install for the site. Node 20 or newer. `tools/brand.py` needs Pillow and numpy and only runs when the brand files change.

## Deploying

Drag `dist/` to Cloudflare Pages. The `_headers` file inside it sets the content security policy and the other response headers.

## Publishing a fact

Open `src/register.js`, change the record, and set its state to `stated`.

- Contract: put the address in `value`. Anything that is 0x followed by 40 hex digits is accepted, in any letter case.
- X and GitHub: put the full https URL in `url`. The handle is derived from it; do not store a handle.

Then run `npm run build` and `npm run gates`.

## Palette

Four colours, all sampled from the brand files: lime, ink, black and paper. Each is a real pixel from a supplied image, and `src/styles/tokens.css` records the file and coordinates. That file is the only place a colour literal may appear. Lighter and darker shades are mixes of the four, written as variables.

## Licence

MIT. See `LICENSE`.
