'use strict';
// Shared, local-only choice statistics for search suggestions and the bookmark sidebar.
(() => {
  const STORAGE_KEY = 'minimalSuggestUsage';
  const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase();
  function keyFor(item) {
    if (item.url) {
      try { return 'url:' + new URL(item.url).href; }
      catch (_) { return 'url:' + item.url; }
    }
    return (item.type === 'search' ? 'search:' : 'text:') + normalize(item.text);
  }
  let records = [];
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (Array.isArray(saved)) records = saved.filter(row =>
      row && typeof row.key === 'string' && typeof row.prefix === 'string')
      .slice(0, 80).map(row => ({
        ...row, key:row.key.startsWith('url:') ? keyFor({url:row.key.slice(4)}) : row.key
      }));
  } catch (_) {}

  function decorate(item, query) {
    const matching = records.filter(row => row.key === keyFor(item));
    const count = matching.reduce((sum, row) => sum + (Number(row.count) || 0), 0);
    const lastUsed = Math.max(0, ...matching.map(row => Number(row.lastUsed) || 0));
    const adaptive = matching.reduce((sum, row) =>
      sum + (row.prefix.startsWith(normalize(query)) ? Math.min(10, row.count || 0) : 0), 0);
    return {...item, count, lastUsed, adaptive};
  }

  // Record intentional submissions or clicked links, never keystrokes or folder expansion.
  function record(typed, item) {
    const prefix = normalize(typed).slice(0, 160);
    if (!prefix || !item || (!item.text && !item.url)) return;
    const key = keyFor(item);
    const previous = records.findIndex(row => row.key === key && row.prefix === prefix);
    const count = previous >= 0 ? Math.min(100, (Number(records[previous].count) || 0) + 1) : 1;
    if (previous >= 0) records.splice(previous, 1);
    records.unshift({key, prefix, count, lastUsed:Date.now()});
    records = records.slice(0, 80);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); } catch (_) {}
  }
  window.SuggestionUsage = Object.freeze({keyFor, decorate, record});
})();
