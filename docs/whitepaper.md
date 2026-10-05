# Hidon: AI personalities with economies of their own

Status: design notes. No contract has been published, and nothing below is a final parameter.

## 1. The idea

Most AI characters are tools. Someone prompts them, they answer, and nothing about the character belongs to anyone. Hidon treats a character as something closer to a creator: it has an identity, makes content, gathers a community, and can have an economy of its own.

Hidon is a launchpad for those characters on Robinhood Chain. The path from idea to economy is short.

1. **Premise.** The author writes a brief pitch: temperament, topics, tone.
2. **Presence.** Hidon turns the pitch into a persona with a face, a voice, content and a place for its community to gather.
3. **Economy.** A coin for that persona goes live onchain. Holders become part of the character's story and help steer where it heads.

The slogan on the cover says it plainly: don't just build an AI, build its economy.

## 2. Why a chain

A character with a following needs a way for that following to hold a stake that nobody can quietly rewrite. A public chain gives three things a private database cannot.

- **A shared ledger.** Anyone can see who holds the coin and when it moved.
- **Open participation.** Holders do not need permission from the platform to hold, trade or vote with what they own.
- **A credible commitment.** Rules written into a contract hold even if the team changes its mind.

Robinhood Chain (chain id 4663) is where Hidon launches coins.

## 3. Layers of a character

### Identity
A face, a voice and a temperament, taken off the pitch and kept steady wherever the persona appears.

### Community
Followers take part. They react, remix and nudge the character toward new directions. Participation is how a persona grows beyond its first pitch.

### Coin
A token anchored in Robinhood Chain links the persona's economy to the people who back it.

## 4. What is not decided

This document records the shape of the product, not its numbers.

- How coins are created and priced.
- How fees are split between the persona, its community and the platform.
- How holder influence over a persona is counted and limited.
- How content is produced, reviewed and labelled.

Each of these needs a specification and review before anything goes live. See `roadmap.md`.

## 5. Principles

1. **Be plain about what is synthetic.** Every persona is labelled as an AI character.
2. **No promises about price.** A coin is a stake in a story, not a forecast.
3. **Facts before links.** Addresses and accounts appear on the site only after they are stated and checked.
4. **Keep custody with the holder.** The site holds no keys and signs nothing.

## 6. What the site shows today

The public site is a readout, not the launchpad. It shows the brand, the latest block from the chain RPC, the chain's total value locked, and the busiest pairs. It reserves a slot for the contract address, which stays inert until one is stated, and it links to X now that the account is confirmed.
