'use strict';
// Favicon from the Chromium/Edge browser favicon store. No website favicon CDN.
const BrowserFavicons = (() => {
  function urlFor(pageURL, size=32) {
    try {
      const page = new URL(pageURL);
      if (!['http:', 'https:'].includes(page.protocol)) return null;
      if (typeof chrome?.runtime?.getURL !== 'function') return null;
      const base = chrome.runtime.getURL('/_favicon/');
      if (!base.startsWith('chrome-extension://')) return null;
      const resource = new URL(base);
      resource.searchParams.set('pageUrl', page.href);
      resource.searchParams.set('size', String(size));
      return resource.href;
    } catch (_) { return null; }
  }
  return Object.freeze({urlFor});
})();
