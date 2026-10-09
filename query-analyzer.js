'use strict';
// Recognize explicit web destinations. Ordinary text remains a search.
(() => {
  function analyzeQuery(input) {
    const raw = String(input || '').trim();
    if (!raw) return { type: 'empty', raw };
    if (/\s/.test(raw)) return { type: 'search', raw };

    if (/^https?:\/\//i.test(raw)) {
      try {
        const url = new URL(raw);
        if ((url.protocol === 'https:' || url.protocol === 'http:') && url.hostname && !url.username && !url.password)
          return { type: 'url', raw, url: url.href };
      } catch (_) {}
      return { type: 'search', raw };
    }
    // Reject misleading domain-like input (e.g. an email address or an invalid port).
    const local = /^(localhost|127\.0\.0\.1)(:\d{1,5})?([/?#][^\s]*)?$/i.test(raw);
    const ip = raw.match(/^((?:\d{1,3}\.){3}\d{1,3})(?::\d{1,5})?(?:[/?#][^\s]*)?$/);
    const ipv4 = !!ip && ip[1].split('.').every(part => Number(part) <= 255);
    const domain = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?::\d{1,5})?(?:[/?#][^\s]*)?$/i.test(raw);
    if (local || ipv4 || domain) {
      try {
        const url = new URL(`${local || ipv4 ? 'http' : 'https'}://${raw}`);
        if (url.port && (+url.port < 1 || +url.port > 65535)) return { type:'search',raw };
        return { type: 'url', raw, url: url.href };
      } catch (_) {}
    }
    return { type: 'search', raw };
  }
  // The action must be synchronous even when the optional suggestions module
  // has not loaded yet (e.g. paste a URL and press Enter immediately).
  function resolve(typed, selected = null) {
    const raw = String(typed || '').trim();
    if (!raw) return {type:'empty'};
    // An explicit keyboard/mouse choice wins over automatic URL recognition.
    if (selected && typeof selected.text === 'string') {
      if (typeof selected.url === 'string') {
        try {
          const url = new URL(selected.url);
          if (['http:', 'https:'].includes(url.protocol) && !url.username && !url.password)
            return {type:'navigate', url:url.href};
        } catch (_) {}
      }
      return {type:'search', query:selected.text};
    }
    const intent = analyzeQuery(raw);
    return intent.type === 'url'
      ? {type:'navigate', url:intent.url}
      : {type:'search', query:raw};
  }
  window.QueryAnalyzer = Object.freeze({ analyze: analyzeQuery, resolve });
})();
