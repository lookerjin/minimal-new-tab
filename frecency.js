'use strict';

// Lightweight ranking engine for suggestion candidates.
// score = text match + usage + freshness + source priority
(() => {
  const SOURCE_WEIGHT = Object.freeze({
    url: 100,
    bookmark: 90,
    history: 70,
    online: 40
  });

  function normalize(value) {
    return String(value || '').toLocaleLowerCase();
  }

  function matchScore(text, query) {
    const target = normalize(text);
    const needle = normalize(query);
    if (!needle) return 0;
    if (target === needle) return 100;
    if (target.startsWith(needle)) return 70;
    if (target.includes(needle)) return 40;
    return 0;
  }

  function calculate(candidate, query, now = Date.now()) {
    const usage = Math.min(Number(candidate.count || 0) * 5, 50);
    const last = Number(candidate.lastUsed || 0);
    const ageDays = last ? Math.max((now - last) / 86400000, 0) : 365;
    const freshness = Math.max(30 - ageDays, 0);

    return matchScore(candidate.text, query)
      + usage
      + freshness
      + (SOURCE_WEIGHT[candidate.type] || 0);
  }

  window.FrecencyRank = {
    sort(candidates, query) {
      return [...candidates]
        .map(item => ({ item, score: calculate(item, query) }))
        .sort((a, b) => b.score - a.score)
        .map(row => row.item);
    }
  };
})();
