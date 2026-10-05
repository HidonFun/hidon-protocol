// Chain TVL from DefiLlama, matched by chain id. Names are never trusted.
export function pickTvl(chains, chainId) {
  if (!Array.isArray(chains)) return null;
  const hit = chains.find((c) => c && Number(c.chainId) === Number(chainId));
  return hit && Number.isFinite(hit.tvl) ? hit.tvl : null;
}

export async function fetchTvl(base, chainId, fetchImpl = fetch, signal) {
  const res = await fetchImpl(base + '/v2/chains', { signal });
  if (!res.ok) throw new Error('llama status ' + res.status);
  const tvl = pickTvl(await res.json(), chainId);
  if (tvl == null) throw new Error('chain not listed');
  return tvl;
}
