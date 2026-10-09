'use strict';
const ENGINE_META = Object.freeze({
  google: { name:'Google', url:'https://www.google.com/search?q=', icon:'assets/google.ico' },
  baidu: { name:'Baidu', url:'https://www.baidu.com/s?wd=', icon:'assets/baidu.ico' },
  bing: { name:'Bing', url:'https://www.bing.com/search?q=', icon:'assets/bing.ico' }
});
const MODES=['auto','white','black','local','bing','remote'];
const DEFAULTS=Object.freeze({engine:'google',mode:'auto',remoteUrl:'',locale:'zh'});
const dbName='minimal-new-tab-images';
const maxImageSize=20*1024*1024;
const $=(id)=>document.getElementById(id);
const query=$('query'), picture=$('wallpaper'), credit=$('credit'), panel=$('settings'), status=$('status');
const engineControl=$('engine-control'), engineMenu=$('engine-menu'), engineButton=$('engine-button');
const searchSubmit=document.querySelector('.search-submit');
const darkMode=matchMedia('(prefers-color-scheme: dark)');
let settings={...DEFAULTS},wallpaperUrl=null,modeGeneration=0;
let pendingMode=null; // A local/remote choice is not applied until a valid image is ready.
let selectionRequest=0;

// The search and wallpaper controls use a fixed local Bing brand mark, avoiding stale favicons.
// Bookmark sites continue to use Edge's own cached favicons in bookmarks.js.

const STRINGS={
 zh:{bookmarks:'书签',folders:'文件夹',back:'返回上一级',closeBookmarks:'收起侧栏',focusBookmarkSearch:'搜索书签',bookmarkPlaceholder:'搜索“书签”',bookmarkHint:'点击文件夹进入',searchPlaceholder:'搜索...',settings:'设置',language:'语言',background:'背景',auto:'自动跟随系统',white:'纯白',black:'纯黑',local:'本地图片',daily:'必应每日壁纸',remote:'图片链接',chooseImage:'选择本机图片',localHelp:'仅保存在此设备上',imageLink:'HTTPS 图片直链',saveImage:'保存并缓存',remoteHelp:'链接会同步，图片保存在本地',noBookmarks:'暂无书签',noResults:'没有匹配的书签',loadingBookmarks:'正在读取本地书签...',bookmarkError:'读取书签失败，请检查扩展权限',onlineSuggestions:'在线搜索建议'},
 en:{bookmarks:'Bookmarks',folders:'Folders',back:'Back',closeBookmarks:'Hide sidebar',focusBookmarkSearch:'Search bookmarks',bookmarkPlaceholder:'Search Bookmarks',searchPlaceholder:'Search...',settings:'Settings',language:'Language',background:'Background',auto:'Follow system',white:'White',black:'Black',local:'Local image',daily:'Bing daily wallpaper',remote:'Image URL',chooseImage:'Choose local image',localHelp:'Saved only on this device',imageLink:'HTTPS image URL',saveImage:'Save and cache',remoteHelp:'The URL syncs; the image stays local',noBookmarks:'No bookmarks',noResults:'No matching bookmarks',loadingBookmarks:'Reading local bookmarks...',bookmarkError:'Could not read bookmarks; check permissions',onlineSuggestions:'Online suggestions'}
};
function t(key){return STRINGS[settings.locale]?.[key] || STRINGS.zh[key] || key}
function setStatus(message='',error=false){status.textContent=message;status.classList.toggle('error',error)}
function normalize(input){return {
 engine:Object.hasOwn(ENGINE_META,input?.engine)?input.engine:DEFAULTS.engine,
 mode:MODES.includes(input?.mode)?input.mode:DEFAULTS.mode,
 remoteUrl:typeof input?.remoteUrl==='string'?input.remoteUrl:'',
 locale:input?.locale==='en'?'en':'zh'
}}
function applyTheme(){
  const dark=settings.mode==='black'||(settings.mode!=='white'&&darkMode.matches);
  const hasPhoto=['local','bing','remote'].includes(settings.mode)&&picture.classList.contains('ready');
  document.documentElement.dataset.mode=settings.mode;
  document.documentElement.dataset.theme=hasPhoto?'photo':(dark?'dark':'light');
  try{localStorage.setItem('lastMode',settings.mode)}catch(_){}
}
function applyLocale(){
  document.getElementById("locale-segmented").dataset.selected=settings.locale;
  document.documentElement.lang=settings.locale==='en'?'en':'zh-CN';
  document.querySelectorAll('[data-i18n]').forEach(el=>{el.textContent=t(el.dataset.i18n)});
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{el.placeholder=t(el.dataset.i18nPlaceholder)});
  query.placeholder=t('searchPlaceholder');
  query.setAttribute('aria-label',settings.locale==='en'?'Search query':'搜索内容');
  searchSubmit.setAttribute('aria-label',settings.locale==='en'?'Search':'搜索');
  document.querySelectorAll('[data-i18n-title]').forEach(el=>{el.title=t(el.dataset.i18nTitle)});
  for(const button of document.querySelectorAll('[data-locale]')){
    const current=button.dataset.locale===settings.locale;
    button.classList.toggle('active',current);button.setAttribute('aria-pressed',String(current));
  }
  document.dispatchEvent(new CustomEvent('newtab-locale-changed'));
}
function applyEngine(){
  const engine=ENGINE_META[settings.engine];
  engineButton.title = (settings.locale==='en' ? 'Search engine: ' : '搜索引擎：') + engine.name;
  engineButton.setAttribute('aria-label',engineButton.title);
  $('engine-name').textContent = engine.name;
  $('engine-icon').src=engine.icon;
  for(const b of engineMenu.querySelectorAll('[data-engine]')){
    b.setAttribute('aria-checked',String(b.dataset.engine===settings.engine));
  }
}
function applySettingsToControls(){
  applyEngine();applyTheme();applyLocale();
  applyModeControls();
}
function applyModeControls(){
  const selected=pendingMode||settings.mode;
  document.querySelectorAll('[name="mode"]').forEach(input=>{input.checked=input.value===selected});
  $('local-control').hidden=selected!=='local';
  $('remote-control').hidden=selected!=='remote';
  if(document.activeElement!==$('image-url'))$('image-url').value=settings.remoteUrl;
}
async function saveSettings(patch){
  settings=normalize({...settings,...patch});applySettingsToControls();
  await chrome.storage.sync.set({newTabPrefs:settings});
}
function setPanelOpen(open){
  if(!open && pendingMode){++selectionRequest;pendingMode=null;applyModeControls();setStatus();}
  panel.classList.toggle('is-open',open);panel.setAttribute('aria-hidden',String(!open));
  $('open-settings').setAttribute('aria-expanded',String(open));
  if(open){setEngineOpen(false);window.NewTabSuggest?.close();}
}
function setEngineOpen(open, focusTarget=null){
  // A focused menu item must leave the menu before it becomes hidden/inert.
  // Outside pointer interactions should not steal focus from the clicked control.
  if(!open && engineMenu.contains(document.activeElement)){
    if(focusTarget)focusTarget.focus({preventScroll:true});
    else document.activeElement.blur();
  }
  // Keep the existing CSS animation; inert only disables hidden menu interaction.
  engineMenu.inert=!open;
  engineMenu.setAttribute('aria-hidden',String(!open));
  engineControl.classList.toggle('menu-open',open);
  engineMenu.classList.toggle('is-open',open);
  engineButton.setAttribute('aria-expanded',String(open));
  if(open){window.NewTabSuggest?.close();engineMenu.querySelector('[data-engine="'+settings.engine+'"]')?.setAttribute('tabindex','0');}
}
// Search submission is purely text-based; keep the arrow visible but disable empty queries.
function syncSubmitState(){searchSubmit.disabled=!query.value.trim();}
// The suggestions code, bookmark queries and all network work are absent from first paint.
let suggestionsLoading = false;
function loadSuggestions() {
  if (suggestionsLoading || window.NewTabSuggest) return;
  suggestionsLoading = true;
  const script = document.createElement('script');
  script.src = 'suggestions.js';
  script.async = true;
  script.onerror = () => { suggestionsLoading = false; };
  document.head.append(script);
}
query.addEventListener('input', () => {
  syncSubmitState();
  if (query.value.trim() && !window.NewTabSuggest) loadSuggestions();
});
query.addEventListener('focus', () => { if (query.value.trim() && !window.NewTabSuggest) loadSuggestions(); });
syncSubmitState();

function openDatabase() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(dbName, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('images');
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function dbGet(key) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('images', 'readonly');
    const req = tx.objectStore('images').get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.oncomplete = () => db.close();
  });
}
async function dbPut(key, value) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('images', 'readwrite');
    tx.objectStore('images').put(value, key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
    tx.onabort = () => { db.close(); reject(tx.error); };
  });
}
function showSolidBackground() {
  picture.classList.remove('ready');
  picture.removeAttribute('src');
  credit.hidden = true;
  credit.textContent = '';
  if (wallpaperUrl) URL.revokeObjectURL(wallpaperUrl);
  wallpaperUrl = null;
  applyTheme();
}
async function displayImage(blob, token, attribution = '') {
  if (!(blob instanceof Blob) || !blob.type.startsWith('image/')) return false;
  const nextUrl = URL.createObjectURL(blob);
  const nextImage = new Image();
  nextImage.src = nextUrl;
  try {
    await nextImage.decode();
    if (token !== modeGeneration) { URL.revokeObjectURL(nextUrl); return false; }
    const previous = wallpaperUrl;
    wallpaperUrl = nextUrl;
    picture.src = nextUrl;
    picture.classList.add('ready');
    applyTheme();
    credit.textContent = attribution;
    credit.hidden = !attribution;
    if (previous) URL.revokeObjectURL(previous);
    return true;
  } catch (e) { URL.revokeObjectURL(nextUrl); throw e; }
}
function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
async function downloadImage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, { signal: controller.signal, cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const length = Number(response.headers.get('content-length'));
    if (length > maxImageSize) throw new Error('图片过大');
    const blob = await response.blob();
    if (!blob.type.startsWith('image/') || blob.size > maxImageSize) throw new Error('服务器返回的不是有效图片');
    return blob;
  } finally { clearTimeout(timer); }
}
async function refreshBing(token) {
  const cached = await dbGet('bing');
  if (token !== modeGeneration) return;
  if (cached?.blob) await displayImage(cached.blob, token, cached.credit || '');
  if (cached?.day === today()) return;
  const previousAttempt = Number(localStorage.getItem('bingAttempt') || 0);
  if (Date.now() - previousAttempt < 90 * 60 * 1000) return;
  localStorage.setItem('bingAttempt', String(Date.now()));
  try {
    const metadataController = new AbortController();
    const metadataTimeout = setTimeout(() => metadataController.abort(), 10000);
    let data;
    try {
      const response = await fetch('https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN', {
        cache: 'no-cache', signal: metadataController.signal
      });
      if (!response.ok) throw new Error(`Bing API ${response.status}`);
      data = await response.json();
    } finally { clearTimeout(metadataTimeout); }

    const image = data?.images?.[0];
    if (!image || typeof image.url !== 'string') throw new Error('Bing 图片数据缺失');
    const url = new URL(image.url, 'https://www.bing.com/');
    if (url.origin !== 'https://www.bing.com') throw new Error('壁纸地址异常');
    const blob = await downloadImage(url.href);
    const next = { blob, day: today(), credit: image.copyright || 'Bing 每日壁纸' };
    await dbPut('bing', next);
    if (token === modeGeneration) await displayImage(blob, token, next.credit);
  } catch (e) {
    if (token === modeGeneration && !cached?.blob) setStatus('暂时无法获取必应壁纸，联网后会自动重试。', true);
    console.warn('Bing wallpaper request failed:', e);
  }
}
function validateRemoteURL(text) {
  const url = new URL(text.trim());
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('请输入普通的 HTTPS 图片直链');
  if (url.href.length > 1800) throw new Error('图片链接太长');
  return url;
}
async function loadRemote(token) {
  const url = settings.remoteUrl;
  if (!url) { setStatus('请在下方填写图片地址。'); return; }
  const cache = await dbGet('remote');
  if (token !== modeGeneration) return;
  if (cache?.url === url && cache?.blob) {
    await displayImage(cache.blob, token);
  } else {
    setStatus('这台电脑尚未缓存该图片，请点击“保存并缓存壁纸”。');
  }
}
async function renderBackground() {
  const token = ++modeGeneration;
  showSolidBackground();
  setStatus();
  try {
    if (settings.mode === 'local') {
      const blob = await dbGet('local');
      if (token !== modeGeneration) return;
      if (blob) await displayImage(blob, token);
      else setStatus('这台电脑还没有选择壁纸，请点击下方按钮。');
    } else if (settings.mode === 'bing') {
      await refreshBing(token);
    } else if (settings.mode === 'remote') {
      await loadRemote(token);
    }
  } catch (e) {
    if (token === modeGeneration) setStatus('读取壁纸失败，已使用纯色背景。', true);
    console.warn(e);
  }
}


$('search-form').addEventListener('submit',(event)=>{
  event.preventDefault();
  const text=query.value.trim();
  if(!text)return;
  const destination=window.NewTabSuggest?.chosenDestination();
  if(destination?.url){location.assign(destination.url);return;}
  const submitted=destination?.text||text;
  // Sync localStorage is intentionally written only when submitting, never while typing.
  try {
    const key='minimalSearchHistory';
    const old=JSON.parse(localStorage.getItem(key)||'[]');
    const recent=Array.isArray(old)?old.filter(v=>typeof v==='string'&&v!==submitted):[];
    localStorage.setItem(key,JSON.stringify([submitted,...recent].slice(0,30)));
  } catch(_){}
  window.NewTabSuggest?.recordSearch(submitted);
  location.assign(ENGINE_META[settings.engine].url+encodeURIComponent(submitted));
});
engineButton.addEventListener('click',()=>{setPanelOpen(false);setEngineOpen(!engineMenu.classList.contains('is-open'))});
engineMenu.addEventListener('keydown',(event)=>{
  if(event.key==='Escape'){
    event.preventDefault();event.stopPropagation();
    setEngineOpen(false,engineButton);return;
  }
  const items=[...engineMenu.querySelectorAll('[data-engine]')];
  const i=items.indexOf(document.activeElement);
  if(event.key==='ArrowDown'||event.key==='ArrowUp'){
    event.preventDefault();
    const next=i===-1?(event.key==='ArrowDown'?0:items.length-1)
      :(i+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
    items[next].focus();
  }
});
engineMenu.querySelectorAll('[data-engine]').forEach(button=>button.addEventListener('click',async()=>{
  // Focus the search field before hiding the selected menu item.
  setEngineOpen(false,query);
  try{await saveSettings({engine:button.dataset.engine});window.NewTabSuggest?.engineChanged()}
  catch(e){setStatus('Could not save the search engine.',true);console.warn(e)}
}));
// Local-only privacy control: online suggestions never run until the user types.
const onlineToggle=$('online-suggestions');
try{onlineToggle.checked=localStorage.getItem('onlineSuggestions')!=='off'}catch(_){}
onlineToggle.addEventListener('change',()=>{
  try{localStorage.setItem('onlineSuggestions',onlineToggle.checked?'on':'off')}catch(_){}
  window.NewTabSuggest?.onlineChanged();
});
$('open-settings').addEventListener('click',()=>setPanelOpen(!panel.classList.contains('is-open')));
$('close-settings').addEventListener('click',()=>setPanelOpen(false));
document.querySelectorAll('[data-locale]').forEach(button=>button.addEventListener('click',async()=>{
  try{await saveSettings({locale:button.dataset.locale})}catch(e){setStatus('Could not save language preference.',true);console.warn(e)}
}));
document.addEventListener('pointerdown',(event)=>{
  if(!engineControl.contains(event.target))setEngineOpen(false);
  if(!panel.contains(event.target)&&!$('open-settings').contains(event.target))setPanelOpen(false);
});
document.addEventListener('keydown',(event)=>{
  if(event.key==='Escape'){
    setPanelOpen(false);
    // Escape from the menu returns focus to its trigger; do not blur it again.
    const wasOpen=engineMenu.classList.contains('is-open');
    setEngineOpen(false,wasOpen?engineButton:null);
  }
});
for(const radio of document.querySelectorAll('input[name="mode"]')){
  radio.addEventListener('change',async()=>{
    if(!radio.checked)return;
    ++selectionRequest;
    if(radio.value==='local'||radio.value==='remote'){
      pendingMode=radio.value;
      applyModeControls();
      setStatus(settings.locale==='en'
        ? 'Choose an image first; your current background stays unchanged.'
        : '选择图片并保存后才切换背景，当前背景保持不变。');
      // Existing cached wallpapers can be re-selected without re-uploading.
      // If no matching cache exists, the choice stays pending and the background stays put.
      const request=selectionRequest;
      try{
        const cached=await dbGet(radio.value);
        if(request!==selectionRequest)return;
        const blob=radio.value==='local' ? cached :
          (cached?.url===settings.remoteUrl ? cached.blob : null);
        if(blob){
          await commitPhoto(radio.value,blob);
          setStatus('');
        }
      }catch(e){if(request===selectionRequest)console.warn('Cached wallpaper unavailable:',e)}
      return;
    }
    pendingMode=null;
    try{await saveSettings({mode:radio.value});await renderBackground()}
    catch(e){setStatus('Failed to save background settings.',true);console.warn(e)}
  });
}
async function commitPhoto(mode, blob, extra={}){
  // Show a decoded image before switching the theme to prevent a black flash.
  const token=++modeGeneration;
  const displayed=await displayImage(blob,token);
  if(!displayed)throw new Error('Cannot decode image');
  pendingMode=null;
  await saveSettings({mode,...extra});
  applyModeControls();
}

$('choose-image').addEventListener('click',()=>$('image-file').click());
$('image-file').addEventListener('change',async()=>{
  const file=$('image-file').files?.[0];$('image-file').value='';if(!file)return;
  if(!file.type.startsWith('image/')||file.size>maxImageSize){setStatus('Choose an image under 20MB.',true);return}
  const request=++selectionRequest;
  try{
    // Decode once before touching the saved background. A failed image is not committed.
    const testUrl=URL.createObjectURL(file);
    try{const img=new Image();img.src=testUrl;await img.decode()}finally{URL.revokeObjectURL(testUrl)}
    if(request!==selectionRequest)return;
    await dbPut('local',file);
    if(request!==selectionRequest)return;
    await commitPhoto('local',file);
    setStatus('Saved to this device.');
  }
  catch(e){setStatus('Could not save image.',true);console.warn(e)}
});
$('save-url').addEventListener('click',async()=>{
  let url;try{url=validateRemoteURL($('image-url').value)}catch(e){setStatus(e.message,true);return}
  const request=++selectionRequest;
  try{
    const allowed=await chrome.permissions.request({origins:[`${url.origin}/*`]});
    if(!allowed){setStatus('Image domain access denied.',true);return}
    setStatus('Downloading image...');const blob=await downloadImage(url.href);
    const testUrl=URL.createObjectURL(blob);
    try{const img=new Image();img.src=testUrl;await img.decode()}finally{URL.revokeObjectURL(testUrl)}
    if(request!==selectionRequest)return;
    await dbPut('remote',{url:url.href,blob});
    if(request!==selectionRequest)return;
    await commitPhoto('remote',blob,{remoteUrl:url.href});
    setStatus('Image cached on this device.');
  }catch(e){setStatus('Could not download this HTTPS image.',true);console.warn(e)}
});
darkMode.addEventListener('change',()=>applyTheme());
chrome.storage.onChanged.addListener((changes,area)=>{
  if(area==='sync'&&changes.newTabPrefs){
    const next=normalize(changes.newTabPrefs.newValue||DEFAULTS);
    const changeBackground=next.mode!==settings.mode||next.remoteUrl!==settings.remoteUrl;
    settings=next;applySettingsToControls();if(changeBackground)void renderBackground();
  }
});
(async()=>{
  try{const saved=await chrome.storage.sync.get('newTabPrefs');settings=normalize(saved.newTabPrefs||DEFAULTS)}
  catch(e){console.warn('Settings sync unavailable:',e)}
  applySettingsToControls();await renderBackground();
})();
