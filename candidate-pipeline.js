'use strict';
// Run independent providers concurrently. Report new snapshots as each finishes.
(() => {
  const providers = [];
  const identity = item => item.url ? `url:${item.url}`
    : `${item.type === 'search' ? 'search' : 'text'}:${String(item.text || '').normalize('NFKC').toLocaleLowerCase()}`;
  const now = () => typeof performance !== 'undefined' ? performance.now() : Date.now();

  function register(provider) {
    if (!provider || typeof provider.provide !== 'function') throw new TypeError('Invalid candidate provider');
    providers.push(provider);
    return () => { const index = providers.indexOf(provider); if (index !== -1) providers.splice(index, 1); };
  }
  function rank(items, query) {
    const seen = new Set();
    const unique = [];
    // Providers are always merged in registration order, not completion order.
    // A local result should supersede an identical online result even if it arrives later.
    for (const item of items) {
      if (!item || typeof item.text !== 'string' || !item.text.trim()) continue;
      const key = identity(item);
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(item);
    }
    return window.FrecencyRank ? window.FrecencyRank.sort(unique, query) : unique;
  }
  async function collect(context = {}, onUpdate = () => {}) {
    const gathered = new Map();
    const allCandidates = () => [...gathered.entries()]
      .sort(([a], [b]) => a - b)
      .flatMap(([, values]) => values);
    let scheduled = false;
    const notify = () => {
      if (scheduled || context.signal?.aborted) return;
      // Coalesce providers settling in the same microtask checkpoint into one DOM update.
      scheduled = true;
      Promise.resolve().then(() => {
        scheduled = false;
        if (!context.signal?.aborted) onUpdate(rank(allCandidates(), context.query));
      });
    };
    await Promise.all(providers.map(async (provider, index) => {
      const started = now();
      let count = 0;
      try {
        const values = await provider.provide(context);
        if (context.signal?.aborted) return;
        const items = Array.isArray(values) ? values : [];
        count = items.length;
        gathered.set(index, items);
        notify();
      } catch (_) { /* A failed optional provider must not block the others. */ }
      finally {
        if (!context.signal?.aborted) {
          context.onProviderSettled?.({name: provider.name || `provider-${index}`, elapsedMs: now() - started, count});
        }
      }
    }));
    return context.signal?.aborted ? [] : rank(allCandidates(), context.query);
  }
  window.CandidatePipeline = Object.freeze({ register, collect, rank });
})();
