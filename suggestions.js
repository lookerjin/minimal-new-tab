'use strict';
// Loaded on the first nonempty search input, never during new-tab startup.
(() => {
  const input = document.getElementById('query');
  const list = document.getElementById('search-suggestions');
  const form = document.getElementById('search-form');
  const engineButton = document.getElementById('engine-button');
  const MAX_ITEMS = 6;
  const REMOTE_DELAY = 240;
  const REMOTE_TIMEOUT = 950;
  const CACHE_TTL = 180000;
  const onlineCache = new Map();
  const failedUntil = new Map();
  const provider = {
    google: (q, locale) => `https://suggestqueries.google.com/complete/search?client=firefox&hl=${locale === 'en' ? 'en' : 'zh-CN'}&q=${encodeURIComponent(q)}`,
    baidu: q => `https://www.baidu.com/sugrec?prod=pc&ie=utf-8&json=1&wd=${encodeURIComponent(q)}`,
    bing: (q, locale) => `https://api.bing.com/osjson.aspx?query=${encodeURIComponent(q)}&language=${locale === 'en' ? 'en-US' : 'zh-CN'}`
  };
  let version = 0, localTimer = null, remoteTimer = null, controller = null;
  let composing = false, dismissed = false, items = [], selected = -1;
  let currentText = '', historyResults = [], bookmarkResults = [], onlineResults = [];
  let history = [];
  try {
    const raw = JSON.parse(localStorage.getItem('minimalSearchHistory') || '[]');
    history = Array.isArray(raw) ? raw.filter(v => typeof v === 'string').slice(0, 30) : [];
  } catch (_) {}
  const isOnline = () => {
    try { return localStorage.getItem('onlineSuggestions') !== 'off'; }
    catch (_) { return true; }
  };
  function stopPending() {
    clearTimeout(localTimer); clearTimeout(remoteTimer);
    if (controller) { controller.abort(); controller = null; }
  }
  function close() {
    version++; dismissed = true; stopPending();
    selected = -1; items = []; list.hidden = true;
    list.replaceChildren();
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }
  function makeIcon(type) {
    const icon = document.createElement('span');
    icon.className = 'suggestion-icon';
    icon.textContent = type === 'bookmark' ? '↗' : type === 'history' ? '↶' : '⌕';
    icon.setAttribute('aria-hidden', 'true');
    return icon;
  }
  function draw() {
    if (dismissed || !currentText || document.activeElement !== input) {
      list.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      return;
    }
    const next = [];
    const seen = new Set();
    // Local matches always remain ahead of online suggestions. Stable selection is
    // reset only on input changes, not when a delayed online response is appended.
    for (const result of [...historyResults, ...bookmarkResults, ...onlineResults]) {
      const key = (result.url || result.text).toLocaleLowerCase();
      if (seen.has(key)) continue;
      seen.add(key); next.push(result);
      if (next.length === MAX_ITEMS) break;
    }
    items = next;
    if (selected >= items.length) selected = -1;
    const fragment = document.createDocumentFragment();
    items.forEach((item, index) => {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'suggestion-item';
      button.id = `search-suggestion-${index}`;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(index === selected));
      const title = document.createElement('span');
      title.className = 'suggestion-title'; title.textContent = item.text;
      const source = document.createElement('span');
      source.className = 'suggestion-label';
      source.textContent = settings.locale === 'en'
        ? {history:'Recent', bookmark:'Bookmark', online:'Suggest'}[item.type]
        : {history:'最近搜索', bookmark:'书签', online:'搜索建议'}[item.type];
      button.append(makeIcon(item.type), title, source);
      button.addEventListener('pointerdown', event => event.preventDefault());
      button.addEventListener('click', () => {
        selected = index;
        form.requestSubmit();
      });
      fragment.append(button);
    });
    list.replaceChildren(fragment);
    list.hidden = !items.length;
    input.setAttribute('aria-expanded', String(!!items.length));
    updateActive();
  }
  function updateActive() {
    for (const [i, node] of [...list.children].entries()) {
      node.setAttribute('aria-selected', String(i === selected));
    }
    if (selected >= 0 && items[selected]) {
      input.setAttribute('aria-activedescendant', `search-suggestion-${selected}`);
      list.children[selected]?.scrollIntoView({block:'nearest'});
    } else input.removeAttribute('aria-activedescendant');
  }
  function parseOnline(engine, payload) {
    if (engine === 'baidu') {
      return Array.isArray(payload?.g) ? payload.g.map(row => row?.q) : [];
    }
    return Array.isArray(payload) && Array.isArray(payload[1]) ? payload[1] : [];
  }
  async function requestRemote(text, engine, token) {
    if (!isOnline() || Date.now() < (failedUntil.get(engine) || 0)) return;
    const key = `${engine}:${settings.locale}:${text}`;
    const cached = onlineCache.get(key);
    if (cached && Date.now() - cached.time < CACHE_TTL) {
      if (token === version) { onlineResults = cached.values; draw(); }
      return;
    }
    const request = new AbortController(); controller = request;
    const timeout = setTimeout(() => request.abort(), REMOTE_TIMEOUT);
    try {
      const response = await fetch(provider[engine](text, settings.locale), {
        signal:request.signal, credentials:'omit', cache:'no-store'
      });
      if (!response.ok) throw new Error('Suggestions HTTP error');
      if (Number(response.headers.get('content-length')) > 65536) throw new Error('Suggestions oversized');
      const data = await response.json();
      const words = parseOnline(engine, data)
        .filter(value => typeof value === 'string' && value.length <= 120)
        .slice(0, 10).map(value => ({type:'online',text:value}));
      if (onlineCache.size >= 40) onlineCache.delete(onlineCache.keys().next().value);
      onlineCache.set(key, {values:words, time:Date.now()});
      if (token === version && !request.signal.aborted) { onlineResults = words; draw(); }
    } catch (error) {
      // Timeout / DNS / blocked / invalid JSON: silently degrade to local matches.
      if (!request.signal.aborted || token === version) failedUntil.set(engine, Date.now() + 60000);
    } finally {
      clearTimeout(timeout);
      if (controller === request) controller = null;
    }
  }
  async function requestBookmarks(text, token) {
    if (!chrome.bookmarks?.search) return;
    try {
      const results = await chrome.bookmarks.search(text);
      if (token !== version) return;
      bookmarkResults = results.filter(row => row.url && /^https?:\/\//i.test(row.url))
        .slice(0, 3).map(row => ({type:'bookmark', text:row.title || row.url, url:row.url}));
      draw();
    } catch (_) { /* Bookmark permission may have been revoked. */ }
  }
  function update() {
    stopPending();
    const token = ++version;
    dismissed = false; selected = -1;
    currentText = input.value.trim().slice(0, 160);
    historyResults = []; bookmarkResults = []; onlineResults = [];
    if (!currentText || composing) { list.hidden = true; input.setAttribute('aria-expanded', 'false'); return; }
    const needle = currentText.toLocaleLowerCase();
    historyResults = history.filter(value => value.toLocaleLowerCase().includes(needle))
      .slice(0, 2).map(value => ({type:'history',text:value}));
    draw();
    // Bookmarks are queried through the browser's API, never by copying/scanning
    // the entire tree on every new-tab startup or every keystroke.
    localTimer = setTimeout(() => { void requestBookmarks(currentText, token); }, 110);
    if (currentText.length >= 2 && isOnline()) {
      const engine = settings.engine;
      remoteTimer = setTimeout(() => {
        if (historyResults.length + bookmarkResults.length < MAX_ITEMS) void requestRemote(currentText, engine, token);
      }, REMOTE_DELAY);
    }
  }
  input.addEventListener('compositionstart', () => { composing = true; stopPending(); });
  input.addEventListener('compositionend', () => { composing = false; update(); });
  input.addEventListener('input', event => { if (!composing && !event.isComposing) update(); });
  input.addEventListener('focus', () => { if (input.value.trim() && list.hidden) update(); });
  input.addEventListener('keydown', event => {
    if (composing || event.isComposing || event.keyCode === 229) {
      if (event.key === 'Enter') event.preventDefault();
      return;
    }
    if (event.key === 'Escape' && !list.hidden) {
      event.preventDefault(); event.stopPropagation(); close(); return;
    }
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && items.length && !list.hidden) {
      event.preventDefault();
      selected = event.key === 'ArrowDown' ? (selected + 1) % items.length
        : (selected <= 0 ? items.length - 1 : selected - 1);
      updateActive();
    }
  });
  input.addEventListener('blur', () => { close(); });
  document.addEventListener('pointerdown', event => {
    if (!list.contains(event.target) && event.target !== input) close();
  });
  document.addEventListener('newtab-locale-changed', draw);
  window.NewTabSuggest = {
    close,
    engineChanged: update,
    onlineChanged: update,
    recordSearch: value => { history = [value, ...history.filter(x => x !== value)].slice(0, 30); },
    chosenDestination: () => items[selected] && !list.hidden ? items[selected] : null
  };
  if (input.value.trim()) update();
})();
