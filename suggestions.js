'use strict';
// All providers are lazy: this file is loaded only after the first nonempty query.
(() => {
  const input = document.getElementById('query');
  const list = document.getElementById('search-suggestions');
  const form = document.getElementById('search-form');
  const combo = document.querySelector('.search-combo');
  const keyboardHelp = document.getElementById('suggestion-keyboard-help');
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const PANEL_DURATION = 300; // Matches the search-engine capsule expansion.
  const SHRINK_IDLE_MS = 180; // Delay shrinking while the user is still typing.
  let hideTimer = null;
  let shrinkTimer = null;
  let panelHeight = 0;
  let lastEditAt = 0;
  // At most one row-motion batch per query, after typing has settled.
  let animatedGeneration = -1;
  let providersSettled = true; // Only the final merged candidate set may shrink the shell.
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
    zh: {url:'访问网址', history:'最近搜索', bookmark:'书签', online:'搜索建议',site:'切换搜索范围'},
    en: {url:'Visit URL', history:'Recent', bookmark:'Bookmark', online:'Suggest',site:'Switch scope'}
  };
  const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase();
  const keyFor = item => item.isDefault ? 'action:default' : item.type === 'site' ? `site:${item.site.id}` : window.SuggestionUsage.keyFor(item);
  const siteItem = site => ({type:'site',site,text:settings.locale === 'en'
    ? `Switch to ${site.name} search` : `切换到 ${site.name} 搜索`});
  function defaultItem() {
    const text=input.value.trim();
    const parsed=window.NewTabScope?.site ? {type:'search'} : QueryAnalyzer.analyze(text);
    return {isDefault:true,type:parsed.type==='url'?'url':'search',text,...(parsed.url?{url:parsed.url}:{})};
  }
  function titleFor(item) {
    if(!item.isDefault)return item.type==='site'?siteItem(item.site).text:item.text;
    if(item.type==='url')return settings.locale==='en'?`Visit ${item.text}`:`访问 ${item.text}`;
    const scope=window.NewTabScope?.site,name=scope?.name || ENGINE_META[settings.engine].name;
    return settings.locale==='en'?`Search ${name} for “${item.text}”`:
      scope?`在 ${name} 中搜索“${item.text}”`:`使用 ${name} 搜索“${item.text}”`;
  }
  const activeIndex = () => selected < 0 && items[0]?.isDefault ? 0 : selected;
  let generation = 0;
  let activeRequest = null;
  let composing = !!window.NewTabScope?.composing;
  let dismissed = false;
  let items = [];
  let selected = -1;
  let selectedKey = null;
  let currentText = '';
  let history = [];
  let lastRanking = null;
  let localReady=Promise.resolve(),localSettled=true,settleLocal=()=>{};
  const completion = document.getElementById('query-completion');
  const completionKeyHint = document.getElementById('completion-key-hint');
  let completionText = '', completionItem = null, completionSuppressed = false;

  function clearCompletion() {
    completionText = '';
    completionItem = null;
    completion.hidden = true;
    completionKeyHint.hidden = true;
  }
  function renderCompletion() {
    const raw = input.value;
    const atEnd = input.selectionStart === raw.length && input.selectionEnd === raw.length;
    if (composing || dismissed || completionSuppressed || (selected >= 0 && !items[selected]?.isDefault) || !panelOpen()
      || document.activeElement !== input || !atEnd || input.scrollLeft || raw !== currentText) {
      completion.hidden = true;
      completionKeyHint.hidden = true;
      return;
    }
    if (!completionText) {
      for(const item of items){
        if(item.isDefault || !['history','online','bookmark'].includes(item.type))continue;
        const texts=item.type==='bookmark'
          ? [item.text,item.url,item.url?.replace(/^https?:\/\//i,''),item.url?.replace(/^https?:\/\/(?:www\.)?/i,'')]
          : [item.text];
        const text=texts.find(value=>typeof value==='string' && value.length>raw.length
          && value.slice(0,raw.length).toLocaleLowerCase()===raw.toLocaleLowerCase());
        if(text){completionText=text;completionItem=item;break;}
      }
      if(!completionText)return;
    }
    const style = getComputedStyle(input);
    completion.style.font = style.font;
    completion.style.paddingInline = `${style.paddingLeft} ${style.paddingRight}`;
    completion.querySelector('.completion-prefix').textContent = raw;
    completion.querySelector('.completion-suffix').textContent = completionText.slice(raw.length);
    completion.hidden = false;
    completionKeyHint.hidden = false;
  }
  function acceptCompletion() {
    if (completion.hidden || !completionText) return false;
    input.value += completionText.slice(input.value.length);
    input.setSelectionRange(input.value.length, input.value.length);
    if (completionItem?.type === 'bookmark') {
      // Accept the visible bookmark as an explicit destination, just like ArrowDown.
      // Keep its URL even if another provider finishes after the user accepts.
      const item = completionItem;
      abortWork(); generation++; providersSettled = true;
      currentText = input.value;
      selectedKey = keyFor(item);
      selected = items.findIndex(row => keyFor(row) === selectedKey);
      if (selected < 0) { items = [defaultItem(),item]; selected = 1; }
      else items=items.map(row=>row.isDefault?defaultItem():row);
      clearCompletion(); draw();
      return true;
    }
    input.dispatchEvent(new InputEvent('input', {bubbles:true, inputType:'insertReplacementText'}));
    return true;
  }
  // Timings are memory-only and contain no query text, URLs or candidate titles.
  const diagnosticSamples = [];

  try {
    const saved = JSON.parse(localStorage.getItem('minimalSearchHistory') || '[]');
    if (Array.isArray(saved)) history = saved.filter(v => typeof v === 'string').slice(0, 30);
  } catch (_) {}

  function isOnline() {
    try { return localStorage.getItem('onlineSuggestions') !== 'off'; }
    catch (_) { return true; }
  }
  const usageFor = (item, text) => window.SuggestionUsage.decorate(item, text);
  const recordChoice = (typed, item) => window.SuggestionUsage.record(typed, item);
  function recordSearch(value, typed = value, candidate = null) {
    history = [value, ...history.filter(row => row !== value)].slice(0, 30);
    recordChoice(typed, candidate?.url ? candidate : {text:value});
  }

  function abortWork() {
    settleLocal();
    if (activeRequest) activeRequest.abort();
    activeRequest = null;
  }
  const panelOpen = () => combo.classList.contains('is-suggesting');
  function setPanelHeight(height) {
    // The search capsule stays at its original size; only its single backplate grows.
    panelHeight = height;
    combo.style.setProperty('--suggestion-height', `${height}px`);
    list.style.height = `${height}px`;
  }
  function cancelShrink() {
    clearTimeout(shrinkTimer);
    shrinkTimer = null;
  }
  function measuredHeight() {
    const available = Math.max(0, window.innerHeight - list.getBoundingClientRect().top - 12);
    const content = [...list.children].reduce((sum, row) => sum + row.offsetHeight, 0) + 16;
    const showHelp = available >= 100;
    combo.classList.toggle('has-suggestion-help', showHelp);
    return Math.min(content + (showHelp ? keyboardHelp.offsetHeight : 0), 332, available);
  }
  function resizePanel(target, immediate = false) {
    cancelShrink();
    if (immediate || target >= panelHeight) {
      setPanelHeight(target);
      return;
    }
    // Local history/bookmarks and remote suggestions resolve at different times.
    // Never contract for a partial batch, only the final merged candidate set.
    if (!providersSettled) return;
    // After the providers settle, still wait for the typing-idle window.
    const wait = Math.max(0, SHRINK_IDLE_MS - (performance.now() - lastEditAt));
    if (!wait) { setPanelHeight(target); return; }
    const token = generation;
    shrinkTimer = setTimeout(() => {
      shrinkTimer = null;
      if (token === generation && panelOpen() && items.length) setPanelHeight(measuredHeight());
    }, wait);
  }
  function hide() {
    clearCompletion();
    cancelShrink();
    // Keep outgoing rows inside the shrinking backplate until the animation finishes.
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    list.setAttribute('aria-hidden', 'true');
    list.inert = true;
    combo.classList.remove('is-suggesting');
    document.dispatchEvent(new Event('newtab-suggestion-selection-changed'));
    setPanelHeight(0);
    clearTimeout(hideTimer);
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
    providersSettled = true;
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
    renderCompletion();
    const index=activeIndex();
    for (const [index, node] of [...list.children].entries()) {
      node.setAttribute('aria-selected', String(index === activeIndex()));
    }
    if (index >= 0 && items[index]) {
      input.setAttribute('aria-activedescendant', `search-suggestion-${index}`);
      list.children[index]?.scrollIntoView({block:'nearest'});
    } else input.removeAttribute('aria-activedescendant');
    document.dispatchEvent(new Event('newtab-suggestion-selection-changed'));
  }
  function cycle(forward){
    if(!items.length || (items.length===1 && items[0].isDefault) || !panelOpen() || list.inert)return false;
    const index=activeIndex();
    selected=forward?(index+1)%items.length:(index<=0?items.length-1:index-1);
    selectedKey=items[selected].isDefault?null:keyFor(items[selected]);
    updateActive();return true;
  }
  function createRow() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'suggestion-item';
    button.tabIndex = -1;
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
  function draw(immediateShrink = false) {
    if (dismissed || !currentText || document.activeElement !== input) {
      hide();
      return;
    }
    // An empty intermediate snapshot must not collapse an already-open capsule.
    // The last result will decide whether an empty query needs closing.
    if (!items.length && !panelOpen()) return;
    if (!items.length && !list.children.length) {
      // Provider snapshots can repeatedly be empty; do not restart outgoing-row fades.
      if (immediateShrink) setPanelHeight(Math.min(panelHeight,
        Math.max(0, window.innerHeight - list.getBoundingClientRect().top - 12)));
      return;
    }
    clearTimeout(hideTimer);
    const opening = !panelOpen();
    // Reuse visible rows by candidate identity so typing does not flash all content.
    const existing = new Map([...list.children].map(row => [row.dataset.key, row]));
    // Progressive history/bookmark/online snapshots should not each restart
    // FLIP animations. Wait until the user has stopped editing, then allow
    // at most one coherent row-motion batch for this query generation.
    const animateRows = !reduceMotion.matches && !opening &&
      animatedGeneration !== generation &&
      performance.now() - lastEditAt >= SHRINK_IDLE_MS;
    const before = new Map();
    if (animateRows) {
      for (const row of list.children) before.set(row.dataset.key, row.getBoundingClientRect());
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
      row.classList.toggle('suggestion-default',!!item.isDefault);
      row.id = `search-suggestion-${index}`;
      row.setAttribute('aria-selected', String(index === activeIndex()));
      row.querySelector('.suggestion-icon').textContent = item.type === 'bookmark' || item.type === 'url'
        ? '↗' : item.type === 'history' ? '↶' : '⌕';
      const title = row.querySelector('.suggestion-title');
      title.textContent = titleFor(item);
      title.title = item.url || item.text;
      row.querySelector('.suggestion-label').textContent = item.isDefault
        ? (settings.locale === 'en' ? 'Default' : '默认') : item.type === 'search'
        ? (settings.locale === 'en' ? `Search with ${ENGINE_META[settings.engine].name}`
          : `使用 ${ENGINE_META[settings.engine].name} 搜索`)
        : ((labels[settings.locale] || labels.zh)[item.type] || '');
      fragment.append(row);
    });
    list.replaceChildren(fragment);
    list.hidden = false;
    list.inert = !items.length;
    list.setAttribute('aria-hidden', String(!items.length));
    if (!items.length) {
      // Outdated rows are gone and cannot be clicked or selected; the outer
      // surface remains stable until the replacement providers settle.
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      document.dispatchEvent(new Event('newtab-suggestion-selection-changed'));
      if (immediateShrink) setPanelHeight(Math.min(panelHeight,
        Math.max(0, window.innerHeight - list.getBoundingClientRect().top - 12)));
      return;
    }
    // Max 6 rows; scroll if the viewport is too short for all of them.
    const targetHeight = measuredHeight();
    // When the dropdown has never been laid out, let the browser paint 0 -> target.
    if (opening) {
      setPanelHeight(0);
      combo.classList.add('is-suggesting');
      void combo.offsetHeight;
    }
    resizePanel(targetHeight, immediateShrink);
    input.setAttribute('aria-expanded', 'true');
    updateActive();
    if (!animateRows) return;
    let animated = false;
    // Animate only genuine changes once per query, never layer a second
    // transition over an earlier provider snapshot or the next backspace.
    for (const row of list.children) {
      const old = before.get(row.dataset.key);
      if (old) {
        const current = row.getBoundingClientRect();
        const shift = old.top - current.top;
        if (Math.abs(shift) > 1) {
          row.animate([{transform:`translateY(${shift}px)`},{transform:'translateY(0)'}],
            {duration:260, easing:'cubic-bezier(.2,.75,.25,1)'});
          animated = true;
        }
      } else if (inserted.includes(row) && !opening) {
        row.animate([{opacity:0,transform:'translateY(-7px)'},{opacity:1,transform:'translateY(0)'}],
          {duration:220, easing:'cubic-bezier(.2,.75,.25,1)'});
        animated = true;
      }
    }
    if (animated) animatedGeneration = generation;
  }
  function showCandidates(candidates) {
    if (!window.NewTabScope?.site && !currentText.startsWith('@')) {
      const site=window.SiteSearch?.lookup(currentText);
      const needle=normalize(currentText).replace(/\s+/g,'');
      if(site && (needle===normalize(site.name).replace(/\s+/g,'') || needle===site.domain.replace(/^www\./,''))) {
        candidates=[...candidates];candidates.splice(Math.min(1,candidates.length),0,siteItem(site));
      }
    }
    // A fresh default action is safe even while alternative providers are pending.
    // The two explicit actions for a URL stay visible and in a predictable
    // order, regardless of frecency or when bookmarks finish loading.
    if (QueryAnalyzer.analyze(currentText).type === 'url') {
      const visit = candidates.find(item => item.type === 'url');
      const search = candidates.find(item => item.type === 'search');
      candidates = [visit, search, ...candidates.filter(item => item !== visit && item !== search)].filter(Boolean);
    }
    const primary=!window.NewTabScope?.site && currentText.startsWith('@') ? null : defaultItem();
    if(primary){
      candidates=[primary,...candidates.filter(item=>!(item.type==='url' && item.url===primary.url)
        && !(item.type==='search' && primary.type==='search' && item.text===primary.text))];
    }
    // Once the user moves the keyboard highlight, async arrivals must neither
    // change its position nor evict its destination from the visible six rows.
    const pinned = selectedKey && (candidates.find(item => keyFor(item) === selectedKey)
      || items.find(item => keyFor(item) === selectedKey));
    if (pinned && selected >= 0 && !pinned.isDefault) {
      const remaining = candidates.filter(item => keyFor(item) !== selectedKey).slice(0, MAX_ITEMS - 1);
      remaining.splice(Math.min(selected, remaining.length), 0, pinned);
      items = remaining;
    } else {
      items = candidates.slice(0, MAX_ITEMS);
    }
    selected = selectedKey ? items.findIndex(item => keyFor(item) === selectedKey) : -1;
    if (selected < 0) selectedKey = null;
    draw();
    renderCompletion();
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
    async provide({query,scope}) {
      if(scope)return [];
      const parsed = QueryAnalyzer.analyze(query);
      return parsed.type === 'url' ? [
        {type:'url', text:parsed.raw, url:parsed.url},
        {type:'search', text:parsed.raw}
      ] : [];
    }
  });
  CandidatePipeline.register({
    name:'history',
    async provide({query,scope}) {
      if(scope)return window.SiteSearch.history(scope,query);
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
          .filter(row => !context.scope || (()=>{const host=new URL(row.url).hostname.replace(/^www\./,'');
            const domain=context.scope.domain.replace(/^www\./,'');return host===domain || host.endsWith('.'+domain);})())
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
      if (context.scope || context.query.startsWith('@') || context.intent === 'url' || /^https?:\/\//i.test(context.query)) return [];
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
      providers,
      // Developer-only aggregate snapshot: no query, URL, title, or key is exposed.
      ranking:lastRanking
    };
  }

  function update() {
    clearCompletion();
    abortWork();
    localReady=Promise.resolve();localSettled=true;settleLocal=()=>{};
    const token = ++generation;
    selected = -1;
    selectedKey = null;
    currentText = input.value.trim().slice(0, 160);
    dismissed = false;
    items = [];
    cancelShrink();
    providersSettled = false;
    // Changing settings without focusing the search field must not leak an old query.
    if (!currentText || composing || document.activeElement !== input) { hide(); return; }
    lastEditAt = performance.now();
    if (!window.NewTabScope?.site && currentText.startsWith('@')) {
      const renderSites=()=>{
        if(token!==generation || document.activeElement!==input)return;
        providersSettled=true;localSettled=true;
        showCandidates((window.SiteSearch?.find(currentText)||[]).map(siteItem));
        if(!items.length)hide();
      };
      if(window.SiteSearch?.loaded)renderSites();
      else {localSettled=false;localReady=Promise.resolve(window.SiteSearch?.init()).then(renderSites);}
      return;
    }
    if (panelOpen()) {
      // Do not call draw() with an empty items array here: that turned every
      // visible row into a ghost on each keystroke/backspace. Keep previous
      // rows painted but non-interactive until the first new snapshot.
      list.inert = true;
      list.setAttribute('aria-hidden', 'true');
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      for (const row of list.children) row.getAnimations().forEach(animation => animation.cancel());
      document.dispatchEvent(new Event('newtab-suggestion-selection-changed'));
    }
    const controller = new AbortController();
    activeRequest = controller;
    let localCount = 0;
    const sample = {start:performance.now(), firstCandidateMs:null, firstLocalMs:null,
      firstOnlineMs:null, providers:{}};
    const waiting=new Set(['url','history','bookmark']);
    localSettled=false;
    localReady=new Promise(resolve=>{settleLocal=resolve;});
    const finishLocal=settleLocal;
    const context = {
      scope:window.NewTabScope?.site || null,
      query:currentText,
      intent:QueryAnalyzer.analyze(currentText).type,
      engine:settings.engine,
      locale:settings.locale,
      signal:controller.signal,
      localCount: () => localCount,
      onProviderSettled: ({name, elapsedMs, count}) => {
        sample.providers[name] = {elapsedMs:round(elapsedMs), count};
        waiting.delete(name);
        if(!waiting.size){localSettled=true;void Promise.resolve().then(finishLocal);}
      },
      onRanked: counts => { sample.rankCounts = counts; }
    };
    void CandidatePipeline.collect(context, candidates => {
      if (token !== generation || controller.signal.aborted) return;
      localCount = candidates.filter(item => item.type !== 'online').length;
      showCandidates(candidates.map(item => usageFor(item, currentText))
        .sort((a, b) => FrecencyRank.score(b, currentText) - FrecencyRank.score(a, currentText)));
      lastRanking = {
        ...sample.rankCounts,
        visible:items.map((item, index) => ({
          position:index + 1, source:item.type, ...FrecencyRank.breakdown(item, currentText)
        }))
      };
      if (!panelOpen()) return;
      const elapsed = round(performance.now() - sample.start);
      if (sample.firstCandidateMs === null) sample.firstCandidateMs = elapsed;
      if (sample.firstLocalMs === null && candidates.some(item => item.type !== 'online')) sample.firstLocalMs = elapsed;
      if (sample.firstOnlineMs === null && candidates.some(item => item.type === 'online')) sample.firstOnlineMs = elapsed;
    }).then(() => {
      if (token !== generation || controller.signal.aborted) return;
      providersSettled = true;
      if (items.length && panelOpen()) resizePanel(measuredHeight());
      if (!items.length && panelOpen()) {
        // All providers have finished: this is a genuine no-result state,
        // not a temporary gap between history and bookmark responses.
        cancelShrink();
        const wait = Math.max(0, SHRINK_IDLE_MS - (performance.now() - lastEditAt));
        shrinkTimer = setTimeout(() => {
          shrinkTimer = null;
          if (token === generation && !items.length && panelOpen()) hide();
        }, wait);
      }
      diagnosticSamples.push(sample);
      if (diagnosticSamples.length > MAX_DIAGNOSTIC_SAMPLES) diagnosticSamples.shift();
    });
  }
  input.addEventListener('compositionstart', () => { composing = true; abortWork(); hide(); });
  input.addEventListener('compositionend', () => { composing = false; update(); });
  input.addEventListener('input', event => {
    completionSuppressed = event.inputType?.startsWith('delete') || false;
    if (!composing && !event.isComposing) update();
  });
  input.addEventListener('focus', () => { if (input.value.trim() && !panelOpen()) update(); });
  input.addEventListener('keydown', event => {
    if (composing || event.isComposing || event.keyCode === 229) {
      if (event.key === 'Enter') event.preventDefault();
      return;
    }
    if (event.key === 'Backspace' || event.key === 'Delete') { completionSuppressed = true; clearCompletion(); }
    if (!event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey
      && event.key === 'ArrowRight' && acceptCompletion()) {
      event.preventDefault(); return;
    }
    if (event.key === 'Escape' && panelOpen()) {
      event.preventDefault(); event.stopPropagation(); close(); return;
    }
    const cyclingTab = event.key === 'Tab' && !event.ctrlKey && !event.altKey && !event.metaKey;
    if (cyclingTab || event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      const forward = cyclingTab ? !event.shiftKey : event.key === 'ArrowDown';
      if(cycle(forward))event.preventDefault();
      else if(cyclingTab && !localSettled && !dismissed){
        event.preventDefault();void queueSearchCycle(forward);
      }
    }
  });
  input.addEventListener('blur', close);
  input.addEventListener('click', () => {selected=-1;selectedKey=null;updateActive();});
  input.addEventListener('keyup', renderCompletion);
  input.addEventListener('scroll', renderCompletion);
  document.addEventListener('selectionchange', () => { if (document.activeElement === input) renderCompletion(); });
  document.addEventListener('pointerdown', event => {
    if (!list.contains(event.target) && event.target !== input && !event.target.closest('.search-submit')) close();
  });
  document.addEventListener('newtab-locale-changed', draw);
  window.addEventListener('resize', () => { if (panelOpen()) draw(true); });
  list.inert = true;
  list.setAttribute('aria-hidden', 'true');
  window.NewTabSuggest = Object.freeze({
    close,
    engineChanged: update,
    onlineChanged: update,
    sitesChanged: () => { if(selectedKey) return; update(); },
    recordSearch,
    recordNavigation: recordChoice,
    diagnostics,
    cycle,
    ready:()=>localReady,
    chosenDestination: () => selected >= 0 && !items[selected]?.isDefault && panelOpen() ? items[selected] : null
  });
  if (input.value.trim()) update();
})();
