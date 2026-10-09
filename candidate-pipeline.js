'use strict';

// Candidate pipeline foundation. Providers can be extended without changing UI.
(() => {
  const providers = [];

  function register(provider) {
    if (provider && typeof provider.provide === 'function') providers.push(provider);
  }

  async function collect(context) {
    const results = [];
    for (const provider of providers) {
      try {
        const items = await provider.provide(context);
        if (Array.isArray(items)) results.push(...items);
      } catch (_) {}
    }
    return rank(results, context.query);
  }

  function rank(items, query) {
    const q = String(query || '').toLocaleLowerCase();
    return items.map(item => ({
      ...item,
      score: (item.score || 0) +
        (String(item.text || '').toLocaleLowerCase().startsWith(q) ? 20 : 0) +
        (item.type === 'url' || item.type === 'bookmark' ? 10 : 0)
    })).sort((a, b) => b.score - a.score);
  }

  window.CandidatePipeline = { register, collect, rank };
})();
