// Latest block number from the chain's JSON-RPC endpoint.
export function parseBlock(payload) {
  const r = payload && payload.result;
  if (typeof r !== 'string' || !/^0x[0-9a-fA-F]+$/.test(r)) throw new Error('bad block payload');
  const n = Number(BigInt(r));
  if (!Number.isSafeInteger(n)) throw new Error('block out of range');
  return n;
}

export async function fetchBlock(url, fetchImpl = fetch, signal) {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
    signal,
  });
  if (!res.ok) throw new Error('rpc status ' + res.status);
  return parseBlock(await res.json());
}
