'use strict';

// Query classification layer. Keep URL detection conservative to avoid
// treating normal search text such as "ai agent" as a navigation target.
(() => {
  function analyzeQuery(input) {
    const raw = String(input || '').trim();
    if (!raw) return { type: 'empty', raw };

    const hasProtocol = /^https?:\/\//i.test(raw);
    const localhost = /^(localhost|127\.0\.0\.1)(:\d+)?(\/.*)?$/i.test(raw);
    const domainLike = /^[a-z0-9-]+(?:\.[a-z0-9-]+)+(?::\d+)?(?:\/.*)?$/i.test(raw);

    if (hasProtocol) {
      try {
        const url = new URL(raw);
        return { type: 'url', raw, url: url.href };
      } catch (_) {}
    }

    if (localhost) {
      return { type: 'url', raw, url: `http://${raw}` };
    }

    if (domainLike && !/\s/.test(raw)) {
      return { type: 'url', raw, url: `https://${raw}` };
    }

    return { type: 'search', raw };
  }

  window.QueryAnalyzer = { analyze: analyzeQuery };
})();
