# Contributing to Hidon

Thanks for taking a look. This repository is small on purpose, so the rules are short.

## Ground rules

1. **One record per fact.** Anything that comes from outside the repository (an address, a URL, an endpoint) lives in `src/register.js` as one record with a state: `stated`, `absent` or `unconfirmed`.
2. **Links follow records.** A link renders only when its record is `stated`. Store the URL; the handle is derived. Never hard-code a link in markup.
3. **Brand colours only, defined once.** Every colour literal lives in `src/styles/tokens.css`, sampled from the files in `brand/` with its source pixel noted. Everything else uses variables or mixes of them.
4. **Never reject valid hex.** Address checks refuse malformed input, never well-formed 0x values.
5. **Keep dates off the page.** Dates may sit in the register; they are never rendered.

## Workflow

```
npm run build
npm run gates
```

Both must exit 0 before you open a pull request. The gates use synthetic fixtures and a fake clock, so they finish in seconds and never touch the network.

## Pull requests

- Keep each change focused. Describe what moved and why.
- If you change behaviour, change or add a gate in the same pull request.
- If you add a network origin, add it to `src/origins.js` so the content security policy follows.
- Write copy in plain, original words.

## Reporting problems

For anything security related, follow `SECURITY.md` instead of opening a public issue.
