'use strict';
// Read-only Safari-style bookmark browser. Folder: click to navigate in the same sidebar.
// Link: click to navigate to its URL. No hover-driven navigation or extra network requests.
(() => {
  const toggle = document.getElementById('open-bookmarks');
  const sidebar = document.getElementById('bookmark-sidebar');
  const tree = document.getElementById('bookmark-tree');
  const search = document.getElementById('bookmark-query');
  const clearButton = document.getElementById('clear-bookmark-query');
  const backButton = document.getElementById('bookmark-back');
  const currentTitle = document.getElementById('bookmark-current-title');
  const closeButton = document.getElementById('bookmark-close');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const scrollPositions = new Map();
  const stack = []; // A stable hierarchy of bookmark folder IDs. No DOM nodes retained.
  let roots = [], indexed = [], loaded = false, dirty = false, reading = null;
  let currentPage = null, inTransition = false, transitionTimer = null;
  let searchTimer = null, refreshTimer = null, searchActive = false;

  const tLabel = (key, fallback) => typeof t === 'function' ? t(key) : fallback;
  const folderSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6.5h6.1l2 2h8.9v9.4a1.8 1.8 0 0 1-1.8 1.8H5.3a1.8 1.8 0 0 1-1.8-1.8z"/></svg>';
  const linkSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M4 12h16M12 4c-5 4.5-5 11.5 0 16M12 4c5 4.5 5 11.5 0 16"/></svg>';
  const arrowSvg = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>';

  function isOpen() { return sidebar.classList.contains('is-open'); }
  function setOpen(open) {
    sidebar.classList.toggle('is-open', open);
    sidebar.setAttribute('aria-hidden', String(!open));
    document.body.classList.toggle('sidebar-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', '展开书签侧边栏');
    if (open && (!loaded || dirty)) void readBookmarks();
    if (!open) toggle.focus({preventScroll: true});
  }
  function urlFor(node) {
    try {
      const url = new URL(node.url);
      return ['http:', 'https:', 'edge:', 'chrome:', 'file:'].includes(url.protocol) ? url.href : null;
    } catch (_) { return null; }
  }
  // Most favicons carry their own artwork. Only monochrome transparent glyphs need a
  // contrast surface. Sample the already cached favicon (never fetch another URL).
  // A browser that blocks canvas pixel access simply keeps the original icon.
  function faviconContrastClass(image) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 24;
      const ctx = canvas.getContext('2d', {willReadFrequently: true});
      if (!ctx) return '';
      ctx.drawImage(image, 0, 0, 24, 24);
      const data = ctx.getImageData(0, 0, 24, 24).data;
      let transparent = 0, visible = 0, colourful = 0, dark = 0, light = 0;
      for (let i = 0; i < data.length; i += 4) {
        const alpha = data[i + 3];
        if (alpha < 32) { transparent++; continue; }
        if (alpha < 96) continue;
        visible++;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        if (max - min > 40) colourful++;
        const luminosity = .2126 * r + .7152 * g + .0722 * b;
        if (luminosity < 100) dark++;
        if (luminosity > 180) light++;
      }
      // Opaque brand tiles already have their own background; colourful icons are fine.
      if (visible < 8 || transparent < 75 || colourful / visible > .15) return '';
      if (dark / visible > .72) return 'favicon-dark-ink';
      if (light / visible > .72) return 'favicon-light-ink';
    } catch (_) { /* Favicon can remain unmodified if pixel access is blocked. */ }
    return '';
  }
  function iconElement(folder, bookmarkUrl) {
    const span = document.createElement('span');
    span.className = 'bookmark-icon' + (folder ? ' folder-icon' : '');
    span.innerHTML = folder ? folderSvg : linkSvg;
    if (!folder && bookmarkUrl) {
      const faviconURL = BrowserFavicons.urlFor(bookmarkUrl, 32);
      if (faviconURL) {
        const image = document.createElement('img');
        image.className = 'bookmark-favicon';
        image.alt = '';
        image.decoding = 'async';
        image.loading = 'lazy';
        image.addEventListener('load', () => {
          span.classList.add('has-favicon');
          const contrastClass = faviconContrastClass(image);
          if (contrastClass) span.classList.add(contrastClass);
        }, {once: true});
        image.addEventListener('error', () => image.remove(), {once: true});
        image.src = faviconURL;
        span.append(image);
      }
    }
    return span;
  }
  function folderCount(item) {
    return (item.children || []).length;
  }
  function rowFor(item, path = '', isSearchResult = false) {
    const folder = !item.url;
    const url = folder ? null : urlFor(item);
    if (!folder && !url) return null;
    const row = document.createElement(folder ? 'button' : 'a');
    row.className = 'bookmark-row ' + (folder ? 'folder' : 'link') + (isSearchResult ? ' bookmark-result' : '');
    if (folder) {
      row.type = 'button';
      row.addEventListener('click', () => enterFolder(item));
    } else {
      row.href = url;
      // A deliberately opened site is meaningful feedback even without using the search dropdown.
      const recordVisit = () => {
        if (/^https?:\/\//i.test(url)) window.SuggestionUsage?.record(
          item.title || item.url, {type:'bookmark', text:item.title || item.url, url});
      };
      row.addEventListener('click', recordVisit);
      row.addEventListener('auxclick', event => { if (event.button === 1) recordVisit(); });
    }
    row.append(iconElement(folder, url));
    const text = document.createElement('span');
    text.className = 'bookmark-text';
    const label = document.createElement('span');
    label.className = 'bookmark-name';
    label.textContent = item.title || item.url || tLabel('bookmarks', '书签');
    text.append(label);
    if (!folder) {
      const subtitle = document.createElement('span');
      subtitle.className = 'bookmark-path';
      if (isSearchResult && path) subtitle.textContent = path;
      else {
        try { subtitle.textContent = new URL(url).hostname.replace(/^www\./, ''); }
        catch (_) { subtitle.textContent = ''; }
      }
      if (subtitle.textContent) text.append(subtitle);
    }
    row.append(text);
    if (folder) {
      const count = document.createElement('span');
      count.className = 'bookmark-count';
      count.textContent = String(folderCount(item));
      row.append(count);
      const chevron = document.createElement('span');
      chevron.className = 'bookmark-chevron';
      chevron.innerHTML = arrowSvg;
      row.append(chevron);
    }
    return row;
  }
  function currentFolder() { return stack.at(-1)?.node || null; }
  function currentKey() { return stack.at(-1)?.id || '__root__'; }
  function nodesForCurrent() { return currentFolder()?.children || roots; }
  function updateHeader() {
    const current = currentFolder();
    currentTitle.textContent = current?.title || tLabel('bookmarks', '书签');
    currentTitle.title = currentTitle.textContent;
    const label = stack.length ? tLabel('back', '返回上一级') : tLabel('closeBookmarks', '收起侧栏');
    backButton.title = label;
    backButton.setAttribute('aria-label', label);
  }
  function makePage(rows) {
    const page = document.createElement('div');
    page.className = 'bookmark-page';
    const folderRows = [], linkRows = [];
    for (const row of rows) (row.item.url ? linkRows : folderRows).push(row);
    const isSearch = rows.some(row => row.isResult);
    // As in Safari, folder and website sections are labeled only if relevant.
    // A leaf folder that contains only URLs is a clean, uninterrupted bookmark list.
    const grouped = !isSearch && folderRows.length > 0;
    function addRows(items, heading) {
      if (!items.length) return;
      if (heading) {
        const header = document.createElement('h3');
        header.className = 'bookmark-section-title';
        header.textContent = tLabel(heading, heading === 'folders' ? '文件夹' : '书签');
        page.append(header);
      }
      for (const {item, path, isResult} of items) {
        const row = rowFor(item, path, isResult);
        if (row) page.append(row);
      }
    }
    addRows(folderRows, grouped ? 'folders' : null);
    addRows(linkRows, grouped ? 'bookmarks' : null);
    if (!page.querySelector('.bookmark-row')) {
      const empty = document.createElement('p');
      empty.className = 'empty-note';
      empty.textContent = search.value.trim() ? tLabel('noResults', '没有匹配的书签') : tLabel('noBookmarks', '这个文件夹是空的');
      page.append(empty);
    }
    return page;
  }
  function directoryRows() { return nodesForCurrent().map(item => ({item})); }
  function completeTransition() {
    clearTimeout(transitionTimer);
    transitionTimer = null;
    const pages = [...tree.querySelectorAll('.bookmark-page')];
    for (const page of pages) if (page !== currentPage) page.remove();
    currentPage?.classList.remove('page-from-right', 'page-from-left', 'page-to-left', 'page-to-right');
    currentPage?.classList.add('page-current');
    inTransition = false;
  }
  function showRows(rows, direction = 'none', restoreScroll = 0) {
    if (inTransition) completeTransition();
    const next = makePage(rows);
    next.scrollTop = restoreScroll;
    const old = currentPage;
    currentPage = next;
    if (!old || direction === 'none' || reduceMotion.matches) {
      tree.replaceChildren(next);
      next.scrollTop = restoreScroll;
      next.classList.add('page-current');
      inTransition = false;
      return;
    }
    inTransition = true;
    old.classList.remove('page-current');
    old.classList.add(direction === 'forward' ? 'page-to-left' : 'page-to-right');
    next.classList.add(direction === 'forward' ? 'page-from-right' : 'page-from-left');
    tree.append(next);
    next.scrollTop = restoreScroll;
    // Two pages share the same fixed viewport. Only transform/opacity animate.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      next.classList.remove('page-from-right', 'page-from-left');
      next.classList.add('page-current');
      transitionTimer = setTimeout(completeTransition, 320);
    }));
  }
  function enterFolder(folder) {
    if (!loaded || search.value.trim()) return;
    if (currentPage) scrollPositions.set(currentKey(), currentPage.scrollTop);
    stack.push({id: folder.id, node: folder});
    updateHeader();
    showRows(directoryRows(), 'forward', scrollPositions.get(currentKey()) || 0);
  }
  function goBack() {
    if (search.value.trim()) {
      search.value = '';
      clearButton.hidden = true;
      renderDirectory();
      return;
    }
    if (!stack.length) { setOpen(false); return; }
    stack.pop();
    updateHeader();
    showRows(directoryRows(), 'back', scrollPositions.get(currentKey()) || 0);
    backButton.focus({preventScroll: true});
  }
  function renderDirectory() {
    searchActive = false;
    updateHeader();
    showRows(directoryRows(), 'none', scrollPositions.get(currentKey()) || 0);
  }
  function fold(input) { return String(input || '').normalize('NFKC').toLocaleLowerCase(); }
  function subsequence(needle, haystack) {
    let index = 0;
    for (const ch of haystack) {
      if (ch === needle[index]) index++;
      if (index === needle.length) return true;
    }
    return false;
  }
  function indexTree(nodes) {
    indexed = [];
    // Iterative walk supports arbitrarily deep bookmark folder structures.
    const pending = nodes.map(node => ({node, path: []})).reverse();
    while (pending.length) {
      const {node, path} = pending.pop();
      if (node.url) {
        if (urlFor(node)) indexed.push({item: node, path: path.join(' / '),
          title: fold(node.title || ''), searchable: fold([...path, node.title || '', node.url].join(' '))});
      } else {
        const nextPath = [...path, node.title || ''];
        for (let i = (node.children || []).length - 1; i >= 0; i--) {
          pending.push({node: node.children[i], path: nextPath});
        }
      }
    }
  }
  function rankEntry(entry, terms) {
    let score = 0;
    for (const term of terms) {
      if (entry.title.startsWith(term)) score += 0;
      else if (entry.title.includes(term)) score += 1;
      else if (entry.searchable.includes(term)) score += 2;
      else if (subsequence(term, entry.title)) score += 4;
      else return null;
    }
    return score;
  }
  function renderSearch() {
    const value = fold(search.value.trim());
    clearButton.hidden = !value;
    if (!value) { renderDirectory(); return; }
    if (!searchActive && currentPage) scrollPositions.set(currentKey(), currentPage.scrollTop);
    searchActive = true;
    updateHeader();
    const terms = value.split(/\s+/).filter(Boolean);
    const rows = indexed.map(entry => ({entry, score: rankEntry(entry, terms)}))
      .filter(({score}) => score !== null)
      .sort((a,b) => a.score - b.score || a.entry.title.length - b.entry.title.length)
      .slice(0, 100)
      .map(({entry}) => ({item: entry.item, path: entry.path, isResult: true}));
    showRows(rows);
  }
  function reconcilePath() {
    let items = roots;
    const retained = [];
    for (const old of stack) {
      const node = items.find(n => n.id === old.id && !n.url);
      if (!node) break;
      retained.push({id: node.id, node});
      items = node.children || [];
    }
    stack.splice(0, stack.length, ...retained);
  }
  async function readBookmarks() {
    if (reading) return reading;
    if (!loaded) {
      const note = document.createElement('p');
      note.className = 'empty-note';
      note.textContent = tLabel('loadingBookmarks', '正在读取书签…');
      tree.replaceChildren(note);
    }
    reading = (async () => {
      try {
        const data = await chrome.bookmarks.getTree();
        roots = data?.[0]?.children || [];
        indexTree(roots);
        loaded = true;
        dirty = false;
        reconcilePath();
        if (search.value.trim()) renderSearch();
        else renderDirectory();
      } catch (error) {
        loaded = false;
        const note = document.createElement('p');
        note.className = 'empty-note';
        note.textContent = tLabel('bookmarkError', '无法读取书签');
        tree.replaceChildren(note);
        console.warn('Bookmark API:', error);
      } finally { reading = null; }
    })();
    return reading;
  }
  function updateLater() {
    dirty = true;
    if (!isOpen()) return;
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(() => void readBookmarks(), 150);
  }

  toggle.addEventListener('click', () => setOpen(!isOpen()));
  backButton.addEventListener('click', goBack);
  closeButton.addEventListener('click', () => setOpen(false));
  search.addEventListener('input', () => {
    clearButton.hidden = !search.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(renderSearch, 70);
  });
  clearButton.addEventListener('click', () => {
    search.value = '';
    renderDirectory();
    search.focus();
  });
  document.addEventListener('pointerdown', event => {
    if (!isOpen()) return;
    if (sidebar.contains(event.target) || toggle.contains(event.target)) return;
    setOpen(false);
  });
  document.addEventListener('keydown', event => {
    if (!isOpen() || event.key !== 'Escape') return;
    if (search.value && document.activeElement === search) {
      search.value = '';
      renderDirectory();
    } else if (stack.length) goBack();
    else setOpen(false);
  });
  document.addEventListener('newtab-locale-changed', () => {
    updateHeader();
    if (loaded) {
      if (search.value.trim()) renderSearch();
      else renderDirectory();
    }
  });
  for (const eventName of ['onCreated', 'onRemoved', 'onChanged', 'onMoved', 'onChildrenReordered', 'onImportEnded']) {
    chrome.bookmarks?.[eventName]?.addListener(updateLater);
  }
  // Every new tab starts with its bookmark sidebar closed (Issue #4).
})();
