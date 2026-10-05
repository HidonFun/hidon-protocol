# Security policy

## Scope

This repository contains a static website. It holds no keys, signs nothing, and sends no transaction. The launchpad and coin contracts described in `docs/` have not been published; when they are, their audit status will be stated here.

## Reporting a vulnerability

Please do not open a public issue for a security problem. Contact the maintainers privately through the channel listed on hidon.fun once one is published. Until then, open a minimal public issue that says only "security contact needed" and leave out the details.

A useful report includes:

- what you found and where,
- steps to reproduce it,
- what an attacker could do with it.

## What the site does to stay safe

- A strict content security policy: scripts and styles from the site itself, network calls only to the chain RPC, DefiLlama and DexScreener.
- No inline scripts, no inline styles, no `eval`.
- Remote data is written to the page as text, never as markup.
- Links and images from remote data are checked against an allow-list of hosts before use.
- Links in the header exist only when the matching register record is `stated`.

## Out of scope

- Problems in third-party endpoints (the RPC, DefiLlama, DexScreener).
- Findings that need a modified browser or a compromised machine.
