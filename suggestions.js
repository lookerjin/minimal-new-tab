'use strict';
// All providers are lazy: this file is loaded only after the first nonempty query.
(() => {
  const input = document.getElementById('query');
  const list = document.getElementById('search-suggestions');
  const form = document.getElementById('search-form');
  const MAX_ITEMS = 6;
  const MAX_BOOKMARK_CANDIDATES = 80;
  const REMOTE_DELAY = 240;
  const REMOTE_TIMEOUT = 950;
  const CACHE_TTL = 180000;
  const onlineCache = new Map();
  const failedUntil = new Map();
  const endpoints = {
    google: (q, locale) => `https://suggestqueries.google.com/complete/search?client=firefox&hl=${locale === 'en' ? 'en' : 'zh-CN'}&q=${encodeURIComponent(q)}`,
    baidu: q => `https://www.baidu.com/sugrec?prod=pc&ie=utf-8&json=1&wd=${encodeURIComponent(q)}`,
    bing: (q, locale) => `https://api.bing.com/osjson.aspx?query=${encodeURIComponent(q)}&language=${locale === 'en' ? 'en-US' : 'zh-CN'}`
  };
  const labels = {
    zh: {url:'访问网址', history:'最近搜索', bookmark:'书签', online:'搜索建议'},
    en: {url:'Visit URL', history:'Recent', bookmark:'Bookmark', online:'Suggest'}
  };
  const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase();
  const keyFor = item => item.url ? `url:${item.url}` : `text:${normalize(item.text)}`;
  let generation = 0;
  let activeRequest = null;
  let composing = false;
  let dismissed = false;
  let items = [];
  let selected = -1;
  let selectedKey = null;
  let currentText = '';
  let history = [];
  let usage = [];

  try {
    const saved = JSON.parse(localStorage.getItem('minimalSearchHistory') || '[]');
    if (Array.isArray(saved)) history = saved.filter(v => typeof v === 'string').slice(0, 30);
    const data = JSON.parse(localStorage.getItem('minimalSuggestUsage') || '[]');
    if (Array.isArray(data)) usage = data.filter(v => v && typeof v.key === 'string' && typeof v.prefix === 'string').slice(0, 80);
  } catch (_) {}

  function isOnline() {
    try { return localStorage.getItem('onlineSuggestions') !== 'off'; }
    catch (_) { return true; }
  }
  function usageFor(item, text) {
    const key = keyFor(item);
    const matching = usage.filter(row => row.key === key);
    const count = matching.reduce((sum, row) => sum + (Number(row.count) || 0), 0);
    const lastUsed = Math.max(0, ...matching.map(row => Number(row.lastUsed) || 0));
    const adaptive = matching.reduce((sum, row) => sum + (row.prefix.startsWith(normalize(text)) ? Math.min(10, row.count || 0) : 0), 0);
    return {...item, count, lastUsed, adaptive};
  }
  // Only selections/submissions affect usage. Never persist each keystroke.
  function recordChoice(typed, item) {
    const key = keyFor(item);
    const prefix = normalize(typed).slice(0, 160);
    if (!prefix) return;
    const previous = usage.findIndex(row => row.key === key && row.prefix === prefix);
    const count = previous >= 0 ? Math.min(100, (usage[previous].count || 0) + 1) : 1;
    if (previous >= 0) usage.splice(previous, 1);
    usage.unshift({key, prefix, count, lastUsed:Date.now()});
    usage = usage.slice(0, 80);
    try { localStorage.setItem('minimalSuggestUsage', JSON.stringify(usage)); } catch (_) {}
  }
  function recordSearch(value, typed = value, candidate = null) {
    history = [value, ...history.filter(row => row !== value)].slice(0, 30);
    recordChoice(typed, candidate?.url ? candidate : {text:value});
  }

  function abortWork() {
    if (activeRequest) activeRequest.abort();
    activeRequest = null;
  }
  function hide() {
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }
  function close() {
    generation++;
    dismissed = true;
    abortWork();
    selected = -1;
    selectedKey = null;
    items = [];
    list.replaceChildren();
    hide();
  }
  function candidateIcon(type) {
    const icon = document.createElement('span');
    icon.className = 'suggestion-icon';
    icon.textContent = type === 'bookmark' || type === 'url' ? '↗' : type === 'history' ? '↶' : '⌕';
    icon.setAttribute('aria-hidden', 'true');
    return icon;
  }
  function updateActive() {
    for (const [index, node] of [...list.children].entries()) {
      node.setAttribute('aria-selected', String(index === selected));
    }
    if (selected >= 0 && items[selected]) {
      input.setAttribute('aria-activedescendant', `search-suggestion-${selected}`);
      list.children[selected]?.scrollIntoView({block:'nearest'});
    } else input.removeAttribute('aria-activedescendant');
  }
  function draw() {
    if (dismissed || !currentText || document.activeElement !== input) { hide(); return; }
    const fragment = document.createDocumentFragment();
    items.forEach((item, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'suggestion-item';
      button.id = `search-suggestion-${index}`;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(index === selected));
      const title = document.createElement('span');
      title.className = 'suggestion-title';
      title.textContent = item.text;
      title.title = item.url || item.text;
      const label = document.createElement('span');
      label.className = 'suggestion-label';
      label.textContent = (labels[settings.locale] || labels.zh)[item.type] || '';
      button.append(candidateIcon(item.type), title, label);
      button.addEventListener('pointerdown', event => event.preventDefault());
      button.addEventListener('click', () => {
        selectedKey = keyFor(item);
        selected = items.findIndex(row => keyFor(row) === selectedKey);
        form.requestSubmit();
      });
      fragment.append(button);
    });
    list.replaceChildren(fragment);
    list.hidden = !items.length;
    input.setAttribute('aria-expanded', String(!!items.length));
    updateActive();
  }
  function showCandidates(candidates) {
    // Preserve the selected destination by identity, not its unstable array index.
    items = candidates.slice(0, MAX_ITEMS);
    selected = selectedKey ? items.findIndex(item => keyFor(item) === selectedKey) : -1;
    if (selected < 0) selectedKey = null;
    draw();
  }
  function delay(ms, signal) {
    return new Promise(resolve => {
      if (signal.aborted) { resolve(false); return; }
      const timeout = setTimeout(() => { signal.removeEventListener('abort', cancel); resolve(true); }, ms);
      function cancel() { clearTimeout(timeout); resolve(false); }
      signal.addEventListener('abort', cancel, {once:true});
    });
  }
  function parseOnline(engine, payload) {
    if (engine === 'baidu') return Array.isArray(payload?.g) ? payload.g.map(row => row?.q) : [];
    return Array.isArray(payload) && Array.isArray(payload[1]) ? payload[1] : [];
  }
  async function requestOnline({query, engine, locale, signal}) {
    if (!isOnline() || Date.now() < (failedUntil.get(engine) || 0)) return [];
    const key = `${engine}:${locale}:${query}`;
    const cached = onlineCache.get(key);
    if (cached && Date.now() - cached.time < CACHE_TTL) return cached.values;
    const controller = new AbortController();
    const cancel = () => controller.abort();
    signal.addEventListener('abort', cancel, {once:true});
    const timeout = setTimeout(() => controller.abort(), REMOTE_TIMEOUT);
    try {
      if (signal.aborted) return [];
      const response = await fetch(endpoints[engine](query, locale), {
        signal:controller.signal, credentials:'omit', cache:'no-store'
      });
      if (!response.ok) throw new Error('Suggestion service error');
      if (Number(response.headers.get('content-length')) > 65536) throw new Error('Oversized suggestion response');
      const payload = await response.json();
      const values = parseOnline(engine, payload)
        .filter(value => typeof value === 'string' && value.trim() && value.length <= 120)
        .slice(0, 10).map(text => ({type:'online', text}));
      if (onlineCache.size >= 40) onlineCache.delete(onlineCache.keys().next().value);
      onlineCache.set(key, {values, time:Date.now()});
      return values;
    } catch (_) {
      if (!signal.aborted) failedUntil.set(engine, Date.now() + 60000);
      return [];
    } finally {
      clearTimeout(timeout);
      signal.removeEventListener('abort', cancel);
    }
  }

  // Providers do not know about the DOM or each other.
  CandidatePipeline.register({
    async provide({query}) {
      const parsed = QueryAnalyzer.analyze(query);
      return parsed.type === 'url' ? [{type:'url', text:parsed.raw, url:parsed.url}] : [];
    }
  });
  CandidatePipeline.register({
    async provide({query}) {
      const needle = normalize(query);
      return FrecencyRank.sort(history.filter(value => normalize(value).includes(needle))
        .map(text => usageFor({type:'history', text}, query)), query).slice(0, 2);
    }
  });
  CandidatePipeline.register({
    async provide(context) {
      if (!chrome.bookmarks?.search || !await delay(110, context.signal)) return [];
      try {
        const results = await chrome.bookmarks.search(context.query);
        if (context.signal.aborted) return [];
        const candidates = results.slice(0, MAX_BOOKMARK_CANDIDATES)
          .filter(row => row.url && /^https?:\/\//i.test(row.url))
          .map(row => usageFor({type:'bookmark', text:row.title || row.url, url:row.url}, context.query));
        // Keep local quality high without starving online suggestions of a slot.
        return FrecencyRank.sort(candidates, context.query).slice(0, 3);
      } catch (_) { return []; }
    }
  });
  CandidatePipeline.register({
    async provide(context) {
      // URLs and potentially sensitive URL-like input should never be sent to suggest APIs.
      if (context.intent === 'url' || /^https?:\/\//i.test(context.query)) return [];
      if (context.query.length < 2 || !isOnline() || !await delay(REMOTE_DELAY, context.signal)) return [];
      // Avoid network traffic when the local candidates already fill the dropdown.
      if (context.localCount() >= MAX_ITEMS) return [];
      return requestOnline(context);
    }
  });

  function update() {
    abortWork();
    const token = ++generation;
    selected = -1;
    selectedKey = null;
    currentText = input.value.trim().slice(0, 160);
    dismissed = false;
    items = [];
    // Changing settings without focusing the search field must not leak an old query.
    if (!currentText || composing || document.activeElement !== input) { hide(); return; }
    const controller = new AbortController();
    activeRequest = controller;
    let localCount = 0;
    const context = {
      query:currentText,
      intent:QueryAnalyzer.analyze(currentText).type,
      engine:settings.engine,
      locale:settings.locale,
      signal:controller.signal,
      localCount: () => localCount
    };
    void CandidatePipeline.collect(context, candidates => {
      if (token !== generation || controller.signal.aborted) return;
      localCount = candidates.filter(item => item.type !== 'online').length;
      showCandidates(candidates.map(item => usageFor(item, currentText))
        .sort((a, b) => FrecencyRank.score(b, currentText) - FrecencyRank.score(a, currentText)));
    });
  }
  input.addEventListener('compositionstart', () => { composing = true; abortWork(); hide(); });
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
      selectedKey = keyFor(items[selected]);
      updateActive();
    }
  });
  input.addEventListener('blur', close);
  document.addEventListener('pointerdown', event => {
    if (!list.contains(event.target) && event.target !== input) close();
  });
  document.addEventListener('newtab-locale-changed', draw);
  window.NewTabSuggest = Object.freeze({
    close,
    engineChanged: update,
    onlineChanged: update,
    recordSearch,
    recordNavigation: recordChoice,
    chosenDestination: () => selected >= 0 && !list.hidden ? items[selected] : null
  });
  if (input.value.trim()) update();
})();
