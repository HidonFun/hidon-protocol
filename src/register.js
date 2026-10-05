// Register: every external fact is one record. state is stated | absent | unconfirmed.
// dated is internal bookkeeping and is never rendered or shipped to the page.
export const STATES = ['stated', 'absent', 'unconfirmed'];

export const register = {
  name: { value: 'Hidon', state: 'stated', source: 'client brief', dated: '2026-09-02' },
  domain: { value: 'hidon.fun', state: 'stated', source: 'client brief', dated: '2026-09-02' },
  chain: {
    value: { name: 'Robinhood Chain', id: 4663, hex: '0x1237' },
    state: 'stated',
    source: 'client statement, batch-level',
    dated: '2026-09-02',
  },
  rpc: { value: 'https://rpc.mainnet.chain.robinhood.com', state: 'stated', source: 'client statement, batch-level', dated: '2026-09-02' },
  contract: { value: null, state: 'absent', source: 'none given', dated: '2026-09-02' },
  x: { url: 'https://x.com/Hidon_Fun', state: 'stated', source: 'client confirmation', dated: '2026-10-05' },
  github: { url: null, state: 'absent', source: 'none given', dated: '2026-09-02' },
};
