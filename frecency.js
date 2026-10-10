'use strict';
// Small ranking function, not a browser-wide history index.
(() => {
  const SOURCE_WEIGHT = Object.freeze({url: 155, search: 150, history: 95, bookmark: 90, online: 35});
  const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase();

  function matchScore(candidate, query) {
    const q = normalize(query);
    if (!q) return 0;
    const text = normalize(candidate.text);
    const url = normalize(candidate.url);
    if (text === q) return 105;
    if (text.startsWith(q)) return 80;
    if (url && (url === q || url.replace(/^https?:\/\//, '').startsWith(q))) return 75;
    if (text.includes(q)) return 50;
    if (url.includes(q)) return 35;
    // Keep semantically related suggestions returned by the selected search engine.
    return candidate.type === 'online' ? 0 : -1000;
  }

  function breakdown(candidate, query, now = Date.now()) {
    const count = Math.max(0, Number(candidate.count) || 0);
    const last = Number(candidate.lastUsed) || 0;
    const ageDays = last > 0 ? Math.max(0, (now - last) / 86400000) : Infinity;
    const decay = Number.isFinite(ageDays) ? Math.pow(0.5, ageDays / 45) : 0;
    const source = SOURCE_WEIGHT[candidate.type] || 0;
    const match = matchScore(candidate, query);
    const usage = Math.min(35, Math.log2(count * decay + 1) * 9);
    const freshness = Number.isFinite(ageDays) ? 20 * Math.pow(0.5, ageDays / 14) : 0;
    const adaptive = candidate.adaptive ? Math.min(25, 9 * Math.log2(candidate.adaptive * decay + 1)) : 0;
    return {source, match, usage, freshness, adaptive,
      total:source + match + usage + freshness + adaptive};
  }
  function score(candidate, query, now = Date.now()) {
    return breakdown(candidate, query, now).total;
  }

  window.FrecencyRank = Object.freeze({
    score, breakdown,
    sort(candidates, query) {
      return candidates.map((item, index) => ({item, index, score: score(item, query)}))
        .filter(row => row.score >= 0)
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .map(row => row.item);
    }
  });
})();
