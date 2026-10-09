'use strict';
// All providers are lazy: this file is loaded only after the first nonempty query.
(() => {
  const input = document.getElementById('query');
  const list = document.getElementById('search-suggestions');
  const form = document.getElementById('search-form');
  const combo = document.querySelector('.search-combo');
  const ghostLayer = document.createElement('div');
  ghostLayer.className = 'suggestion-ghost-layer';
  ghostLayer.setAttribute('aria-hidden', 'true');
  ghostLayer.inert = true;
  combo.append(ghostLayer);
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const PANEL_DURATION = 300; // Matches the search-engine capsule expansion.
  let hideTimer = null;
  const MAX_ITEMS = 6;
  const MAX_BOOKMARK_CANDIDATES = 80;
  const MAX_DIAGNOSTIC_SAMPLES = 40;
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
  const keyFor = item => item.url ? `url:${item.url}`
    : `${item.type === 'search' ? 'search' : 'text'}:${normalize(item.text)}`;
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
  // Timings are memory-only and contain no query text, URLs or candidate titles.
  const diagnosticSamples = [];

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
  const panelOpen = () => combo.classList.contains('is-suggesting');
  function setPanelHeight(height) {
    // The search capsule stays at its original size; only its single backplate grows.
    combo.style.setProperty('--suggestion-height', `${height}px`);
    list.style.height = `${height}px`;
  }
  function hide() {
    // Keep outgoing rows inside the shrinking backplate until the animation finishes.
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    list.setAttribute('aria-hidden', 'true');
    list.inert = true;
    combo.classList.remove('is-suggesting');
    document.dispatchEvent(new Event('newtab-suggestion-selection-changed'));
    setPanelHeight(0);
    clearTimeout(hideTimer);
    ghostLayer.replaceChildren();
    if (reduceMotion.matches || list.hidden) {
      list.hidden = true;
      list.replaceChildren();
    } else {
      hideTimer = setTimeout(() => {
        if (panelOpen()) return;
        list.hidden = true;
        list.replaceChildren();
      }, PANEL_DURATION);
    }
  }
  function close() {
    generation++;
    dismissed = true;
    abortWork();
    selected = -1;
    selectedKey = null;
    items = [];
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
    document.dispatchEvent(new Event('newtab-suggestion-selection-changed'));
  }
  function createRow() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'suggestion-item';
    button.setAttribute('role', 'option');
    const title = document.createElement('span');
    title.className = 'suggestion-title';
    const label = document.createElement('span');
    label.className = 'suggestion-label';
    button.append(candidateIcon('online'), title, label);
    // The candidate is refreshed on reconciliation; this handler never captures stale data.
    button.addEventListener('pointerdown', event => event.preventDefault());
    button.addEventListener('click', () => {
      const item = button._candidate;
      if (!item || !panelOpen()) return;
      selectedKey = keyFor(item);
      selected = items.findIndex(row => keyFor(row) === selectedKey);
      form.requestSubmit();
    });
    return button;
  }
  function draw() {
    if (dismissed || !currentText || document.activeElement !== input || !items.length) {
      hide();
      return;
    }
    clearTimeout(hideTimer);
    const opening = !panelOpen();
    // Reuse visible rows by candidate identity so typing does not flash all content.
    const existing = new Map([...list.children].map(row => [row.dataset.key, row]));
    const before = new Map();
    if (!reduceMotion.matches && !opening) {
      for (const row of list.children) before.set(row.dataset.key, row.getBoundingClientRect());
    }
    const nextKeys = new Set(items.map(keyFor));
    ghostLayer.replaceChildren();
    if (!opening && !reduceMotion.matches) {
      const layerTop = list.getBoundingClientRect().top;
      for (const [key, row] of existing) {
        if (nextKeys.has(key)) continue;
        const rect = before.get(key);
        if (!rect) continue;
        const ghost = row.cloneNode(true);
        ghost.className = 'suggestion-ghost';
        ghost.removeAttribute('role');
        ghost.removeAttribute('id');
        ghost.setAttribute('aria-hidden', 'true');
        ghost.tabIndex = -1;
        ghost.style.top = `${rect.top - layerTop}px`;
        ghostLayer.append(ghost);
        ghost.animate([{opacity:1,transform:'translateY(0)'},
          {opacity:0,transform:'translateY(-7px)'}],
          {duration:170,easing:'cubic-bezier(.2,.75,.25,1)'}).onfinish = () => ghost.remove();
      }
    }
    const fragment = document.createDocumentFragment();
    const inserted = [];
    items.forEach((item, index) => {
      const key = keyFor(item);
      const row = existing.get(key) || createRow();
      if (!existing.has(key)) inserted.push(row);
      else row.getAnimations().forEach(animation => animation.cancel());
      row.dataset.key = key;
      row._candidate = item;
      row.id = `search-suggestion-${index}`;
      row.setAttribute('aria-selected', String(index === selected));
      row.querySelector('.suggestion-icon').textContent = item.type === 'bookmark' || item.type === 'url'
        ? '↗' : item.type === 'history' ? '↶' : '⌕';
      const title = row.querySelector('.suggestion-title');
      title.textContent = item.text;
      title.title = item.url || item.text;
      row.querySelector('.suggestion-label').textContent = item.type === 'search'
        ? (settings.locale === 'en' ? `Search with ${ENGINE_META[settings.engine].name}`
          : `使用 ${ENGINE_META[settings.engine].name} 搜索`)
        : ((labels[settings.locale] || labels.zh)[item.type] || '');
      fragment.append(row);
    });
    list.replaceChildren(fragment);
    list.hidden = false;
    list.inert = false;
    list.setAttribute('aria-hidden', 'false');
    // Max 6 rows; scroll if the viewport is too short for all of them.
    const available = Math.max(0, window.innerHeight - list.getBoundingClientRect().top - 12);
    const contentHeight = [...list.children].reduce((sum, row) => sum + row.offsetHeight, 0) + 16;
    const targetHeight = Math.min(contentHeight, 332, available);
    // When the dropdown has never been laid out, let the browser paint 0 -> target.
    if (opening) {
      setPanelHeight(0);
      combo.classList.add('is-suggesting');
      void combo.offsetHeight;
    }
    setPanelHeight(targetHeight);
    input.setAttribute('aria-expanded', 'true');
    updateActive();
    if (reduceMotion.matches) return;
    // FLIP existing items, fade/slide only genuinely new results.
    for (const row of list.children) {
      const old = before.get(row.dataset.key);
      if (old) {
        const current = row.getBoundingClientRect();
        const shift = old.top - current.top;
        if (Math.abs(shift) > 1) {
          row.animate([{transform:`translateY(${shift}px)`},{transform:'translateY(0)'}],
            {duration:260, easing:'cubic-bezier(.2,.75,.25,1)'});
        }
      } else if (inserted.includes(row) && !opening) {
        row.animate([{opacity:0,transform:'translateY(-7px)'},{opacity:1,transform:'translateY(0)'}],
          {duration:220, easing:'cubic-bezier(.2,.75,.25,1)'});
      }
    }
  }
  function showCandidates(candidates) {
    // The two explicit actions for a URL stay visible and in a predictable
    // order, regardless of frecency or when bookmarks finish loading.
    if (QueryAnalyzer.analyze(currentText).type === 'url') {
      const visit = candidates.find(item => item.type === 'url');
      const search = candidates.find(item => item.type === 'search');
      candidates = [visit, search, ...candidates.filter(item => item !== visit && item !== search)].filter(Boolean);
    }
    // Once the user moves the keyboard highlight, async arrivals must neither
    // change its position nor evict its destination from the visible six rows.
    const pinned = selectedKey && (candidates.find(item => keyFor(item) === selectedKey)
      || items.find(item => keyFor(item) === selectedKey));
    if (pinned && selected >= 0) {
      const remaining = candidates.filter(item => keyFor(item) !== selectedKey).slice(0, MAX_ITEMS - 1);
      remaining.splice(Math.min(selected, remaining.length), 0, pinned);
      items = remaining;
    } else {
      items = candidates.slice(0, MAX_ITEMS);
    }
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
    name:'url',
    async provide({query}) {
      const parsed = QueryAnalyzer.analyze(query);
      return parsed.type === 'url' ? [
        {type:'url', text:parsed.raw, url:parsed.url},
        {type:'search', text:parsed.raw}
      ] : [];
    }
  });
  CandidatePipeline.register({
    name:'history',
    async provide({query}) {
      const needle = normalize(query);
      return FrecencyRank.sort(history.filter(value => normalize(value).includes(needle))
        .map(text => usageFor({type:'history', text}, query)), query).slice(0, 2);
    }
  });
  CandidatePipeline.register({
    name:'bookmark',
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
    name:'online',
    async provide(context) {
      // URLs and potentially sensitive URL-like input should never be sent to suggest APIs.
      if (context.intent === 'url' || /^https?:\/\//i.test(context.query)) return [];
      if (context.query.length < 2 || !isOnline() || !await delay(REMOTE_DELAY, context.signal)) return [];
      // Avoid network traffic when the local candidates already fill the dropdown.
      if (context.localCount() >= MAX_ITEMS) return [];
      return requestOnline(context);
    }
  });

  const round = value => Math.round(value * 10) / 10;
  function summarize(values) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    if (!sorted.length) return {samples:0, p50Ms:null, p95Ms:null};
    const at = quantile => sorted[Math.ceil(quantile * sorted.length) - 1];
    return {samples:sorted.length, p50Ms:round(at(.5)), p95Ms:round(at(.95))};
  }
  function diagnostics() {
    const providers = {};
    for (const name of ['url', 'history', 'bookmark', 'online']) {
      providers[name] = summarize(diagnosticSamples
        .map(sample => sample.providers[name]?.elapsedMs));
    }
    const load = performance.getEntriesByName('minimal-new-tab-suggestions-load', 'measure').at(-1);
    return {
      // No localStorage writes, raw searches, history or URLs in this snapshot.
      completedQueries:diagnosticSamples.length,
      moduleLoadMs:load ? round(load.duration) : null,
      firstCandidate:summarize(diagnosticSamples.map(sample => sample.firstCandidateMs)),
      firstLocal:summarize(diagnosticSamples.map(sample => sample.firstLocalMs)),
      firstOnline:summarize(diagnosticSamples.map(sample => sample.firstOnlineMs)),
      providers
    };
  }

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
    const sample = {start:performance.now(), firstCandidateMs:null, firstLocalMs:null,
      firstOnlineMs:null, providers:{}};
    const context = {
      query:currentText,
      intent:QueryAnalyzer.analyze(currentText).type,
      engine:settings.engine,
      locale:settings.locale,
      signal:controller.signal,
      localCount: () => localCount,
      onProviderSettled: ({name, elapsedMs, count}) => {
        sample.providers[name] = {elapsedMs:round(elapsedMs), count};
      }
    };
    void CandidatePipeline.collect(context, candidates => {
      if (token !== generation || controller.signal.aborted) return;
      localCount = candidates.filter(item => item.type !== 'online').length;
      showCandidates(candidates.map(item => usageFor(item, currentText))
        .sort((a, b) => FrecencyRank.score(b, currentText) - FrecencyRank.score(a, currentText)));
      if (!panelOpen()) return;
      const elapsed = round(performance.now() - sample.start);
      if (sample.firstCandidateMs === null) sample.firstCandidateMs = elapsed;
      if (sample.firstLocalMs === null && candidates.some(item => item.type !== 'online')) sample.firstLocalMs = elapsed;
      if (sample.firstOnlineMs === null && candidates.some(item => item.type === 'online')) sample.firstOnlineMs = elapsed;
    }).then(() => {
      if (token !== generation || controller.signal.aborted) return;
      diagnosticSamples.push(sample);
      if (diagnosticSamples.length > MAX_DIAGNOSTIC_SAMPLES) diagnosticSamples.shift();
    });
  }
  input.addEventListener('compositionstart', () => { composing = true; abortWork(); hide(); });
  input.addEventListener('compositionend', () => { composing = false; update(); });
  input.addEventListener('input', event => { if (!composing && !event.isComposing) update(); });
  input.addEventListener('focus', () => { if (input.value.trim() && !panelOpen()) update(); });
  input.addEventListener('keydown', event => {
    if (composing || event.isComposing || event.keyCode === 229) {
      if (event.key === 'Enter') event.preventDefault();
      return;
    }
    if (event.key === 'Escape' && panelOpen()) {
      event.preventDefault(); event.stopPropagation(); close(); return;
    }
    if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && items.length && panelOpen()) {
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
  window.addEventListener('resize', () => { if (panelOpen()) draw(); });
  list.inert = true;
  list.setAttribute('aria-hidden', 'true');
  window.NewTabSuggest = Object.freeze({
    close,
    engineChanged: update,
    onlineChanged: update,
    recordSearch,
    recordNavigation: recordChoice,
    diagnostics,
    chosenDestination: () => selected >= 0 && panelOpen() ? items[selected] : null
  });
  if (input.value.trim()) update();
})();
