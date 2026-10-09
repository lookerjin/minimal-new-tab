'use strict';
// Run independent providers concurrently. Report new snapshots as each finishes.
(() => {
  const providers = [];
  const identity = item => item.url ? `url:${item.url}` : `text:${String(item.text || '').normalize('NFKC').toLocaleLowerCase()}`;

  function register(provider) {
    if (!provider || typeof provider.provide !== 'function') throw new TypeError('Invalid candidate provider');
    providers.push(provider);
    return () => { const index = providers.indexOf(provider); if (index !== -1) providers.splice(index, 1); };
  }
  function rank(items, query) {
    const seen = new Set();
    const unique = [];
    // Prefer the first candidate when identities collide (providers are registered by priority).
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
    const notify = () => {
      if (context.signal?.aborted) return;
      const all = [...gathered.values()].flat();
      onUpdate(rank(all, context.query));
    };
    await Promise.all(providers.map(async (provider, index) => {
      try {
        const values = await provider.provide(context);
        if (context.signal?.aborted) return;
        gathered.set(index, Array.isArray(values) ? values : []);
        notify();
      } catch (_) { /* A failed optional provider must not block the others. */ }
    }));
    return context.signal?.aborted ? [] : rank([...gathered.values()].flat(), context.query);
  }
  window.CandidatePipeline = Object.freeze({ register, collect, rank });
})();
