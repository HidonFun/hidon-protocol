// Chain health: connecting until the first answer, live while answers keep coming, offline after a run of misses.
export const HEALTH_LABEL = { connecting: 'Connecting', live: 'Live', offline: 'Offline' };

export function createHealth({ threshold = 3, onChange = () => {} } = {}) {
  let state = 'connecting';
  let misses = 0;
  const set = (next) => { if (next !== state) { state = next; onChange(state); } };
  return {
    get state() { return state; },
    ok() { misses = 0; set('live'); },
    fail() { misses += 1; if (misses >= threshold) set('offline'); },
    offline() { set('offline'); },
  };
}
