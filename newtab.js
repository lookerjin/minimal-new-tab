'use strict';
const ENGINE_META = Object.freeze({
  google: { name:'Google', url:'https://www.google.com/search?q=', icon:'assets/google.ico' },
  baidu: { name:'Baidu', url:'https://www.baidu.com/s?wd=', icon:'assets/baidu.ico' },
  bing: { name:'Bing', url:'https://www.bing.com/search?q=', icon:'assets/bing.ico' }
});
const MODES=['auto','white','black','local','bing'];
const DEFAULTS=Object.freeze({engine:'google',mode:'auto',wallpaperId:'',locale:'zh'});
const dbName='minimal-new-tab-images';
const maxImageSize=20*1024*1024;
const maxImportedBackgrounds=50;
const BUILTIN_BACKGROUNDS=Object.freeze(['alpine','aurora','dunes','coast']);
const builtinBlobs=new Map();
const $=(id)=>document.getElementById(id);
const query=$('query'), picture=$('wallpaper'), credit=$('credit'), panel=$('settings'), status=$('status');
const engineControl=$('engine-control'), engineMenu=$('engine-menu'), engineButton=$('engine-button');
const searchSubmit=document.querySelector('.search-submit');
const searchCombo=document.querySelector('.search-combo');
const darkMode=matchMedia('(prefers-color-scheme: dark)');
let settings={...DEFAULTS},persistedSettings={...DEFAULTS},wallpaperUrl=null,modeGeneration=0;
// Serialize sync writes; earlier completions must never overwrite a newer choice.
let settingsWriteQueue=Promise.resolve(),settingsRevision=0,committedRevision=0,pendingLocalWrites=0;
const ownSettingsWrites=[]; // Short-lived fingerprints of our own onChanged echoes.
let selectionRequest=0;
let activeSite=null,scopeComposing=false;

// The search and wallpaper controls use a fixed local Bing brand mark, avoiding stale favicons.
// Bookmark sites continue to use Edge's own cached favicons in bookmarks.js.

const STRINGS={
 zh:{bookmarks:'书签',folders:'文件夹',back:'返回上一级',closeBookmarks:'收起侧栏',bookmarkPlaceholder:'搜索“书签”',searchPlaceholder:'搜索或输入 Web 地址',settings:'设置',language:'语言',background:'背景',auto:'自动跟随系统',white:'纯白',black:'纯黑',local:'本地图片',daily:'必应每日背景',noBookmarks:'暂无书签',noResults:'没有匹配的书签',loadingBookmarks:'正在读取本地书签...',bookmarkError:'读取书签失败，请检查扩展权限',onlineSuggestions:'在线搜索建议'},
 en:{bookmarks:'Bookmarks',folders:'Folders',back:'Back',closeBookmarks:'Hide sidebar',bookmarkPlaceholder:'Search Bookmarks',searchPlaceholder:'Search or enter a web address',settings:'Settings',language:'Language',background:'Background',auto:'Follow system',white:'White',black:'Black',local:'Local image',daily:'Bing daily wallpaper',noBookmarks:'No bookmarks',noResults:'No matching bookmarks',loadingBookmarks:'Reading local bookmarks...',bookmarkError:'Could not read bookmarks; check permissions',onlineSuggestions:'Online suggestions'}
};
Object.assign(STRINGS.zh, {
 siteHint:'站内搜索', exitSite:'退出站内搜索', enterSite:'进入站内搜索', siteSwitch:'切换到 {site} 搜索', siteTarget:'搜索位置：{site}', openHint:'打开', switchHint:'切换', openBookmark:'打开书签', siteMissing:'没有找到这个站点，请尝试名称、域名或快捷词。', sitePlaceholder:'在 {site} 中搜索…', siteAction:'在 {site} 中搜索', scopeCompletionHelp:'Tab 下一条，Shift+Tab 上一条，右方向键接受补全，Enter 执行当前项，Esc 收起建议，再按 Esc 退出站内搜索',
 cycleHint:'切换建议', completeHint:'补全', confirmHint:'确认', dismissHint:'收起',
 wallpaperLibrary:'背景', closeWallpapers:'关闭背景配置', addImages:'添加图片', manage:'管理', done:'完成', selectAll:'全选', clearSelection:'取消全选', deleteSelected:'删除所选',
 alpine:'雪山晨光', aurora:'极光之夜', dunes:'流金沙丘', coast:'静谧海岸', backgroundCount:'{count} 个背景', daily:'必应每日背景', manageUploaded:'管理上传的背景', imageLimit:'支持多选，最多导入 50 张，每张不超过 20MB', capacityReached:'最多可导入 50 张背景，请先删除部分图片后再添加。', capacitySkipped:'已达到 50 张导入上限，另有 {count} 张图片未添加。',
 currentWallpaper:'当前背景', chooseWallpaper:'请先添加图片，再点击图片设为背景。',
 addedImages:'已添加 {count} 张图片，当前背景保持不变。', invalidImages:'{count} 张图片无效或超过 20MB，未添加。', uploadFailed:'无法保存图片，请检查本机存储空间后重试。', libraryFailed:'无法读取背景库，请重试。', selectedImages:'已选择 {count} 张', deleteFailed:'删除失败，图片已保留，请重试。', deletedImages:'已删除 {count} 张图片。', applyFailed:'无法设置背景，已保留原来的背景。',
 bingLoading:'正在更新 Bing 每日背景…', bingCurrent:'已更新 · {day}', bingCached:'暂未更新，正在使用缓存 · {day}', bingOffline:'暂时无法获取 Bing 背景，联网后自动重试。', retry:'重试更新', completionHelp:'Tab 下一条，Shift+Tab 上一条，右方向键接受补全，Enter 确认，Esc 收起建议'
});
Object.assign(STRINGS.en, {
 siteHint:'Sites', exitSite:'Exit site search', enterSite:'Enter site search', siteSwitch:'Switch to {site} search', siteTarget:'Search scope: {site}', openHint:'Open', switchHint:'Switch', openBookmark:'Open bookmark', siteMissing:'Site not found. Try its name, domain, or shortcut.', sitePlaceholder:'Search {site}…', siteAction:'Search on {site}', scopeCompletionHelp:'Tab: next; Shift+Tab: previous; Right Arrow: complete; Enter: execute current item; Esc: dismiss suggestions, then exit site search',
 cycleHint:'Cycle', completeHint:'Complete', confirmHint:'Confirm', dismissHint:'Dismiss',
 wallpaperLibrary:'Background', closeWallpapers:'Close background settings', addImages:'Add images', manage:'Manage', done:'Done', selectAll:'Select all', clearSelection:'Clear selection', deleteSelected:'Delete selected',
 alpine:'Alpine dawn', aurora:'Northern lights', dunes:'Golden dunes', coast:'Quiet coast', backgroundCount:'{count} backgrounds', daily:'Bing daily', manageUploaded:'Manage uploaded backgrounds', imageLimit:'Select multiple images, up to 50 imports and 20MB each', capacityReached:'You can import up to 50 backgrounds. Delete some images before adding more.', capacitySkipped:'The 50-image import limit has been reached. {count} more images were not added.',
 currentWallpaper:'Current background', chooseWallpaper:'Add images first, then click an image to apply it.',
 addedImages:'Added {count} images. Your background is unchanged.', invalidImages:'Skipped {count} invalid images or images over 20MB.', uploadFailed:'Could not save images. Check local storage space and retry.', libraryFailed:'Could not load wallpapers. Please retry.', selectedImages:'{count} selected', deleteFailed:'Could not delete images. They have been kept; please retry.', deletedImages:'Deleted {count} images.', applyFailed:'Could not apply wallpaper. Your previous background is unchanged.',
 bingLoading:'Updating Bing daily wallpaper…', bingCurrent:'Updated · {day}', bingCached:'Update unavailable. Using cached wallpaper · {day}', bingOffline:'Bing wallpaper is unavailable. Will retry when online.', retry:'Retry update', completionHelp:'Tab: next; Shift+Tab: previous; Right Arrow: accept completion; Enter: confirm; Esc: dismiss'
});
function t(key){return STRINGS[settings.locale]?.[key] || STRINGS.zh[key] || key}
function setStatus(message='',error=false){status.textContent=message;status.classList.toggle('error',error)}
function normalize(input){return {
 engine:Object.hasOwn(ENGINE_META,input?.engine)?input.engine:DEFAULTS.engine,
 mode:MODES.includes(input?.mode)?input.mode:DEFAULTS.mode,
 wallpaperId:typeof input?.wallpaperId==='string'?input.wallpaperId:'',
 locale:input?.locale==='en'?'en':'zh'
}}
function applyTheme(){
  const dark=settings.mode==='black'||(settings.mode!=='white'&&darkMode.matches);
  const hasPhoto=['local','bing'].includes(settings.mode)&&picture.classList.contains('ready');
  document.documentElement.dataset.mode=settings.mode;
  document.documentElement.dataset.theme=hasPhoto?'photo':(dark?'dark':'light');
  try{localStorage.setItem('lastMode',settings.mode)}catch(_){}
}
function applyLocale(){
  document.getElementById("locale-segmented").dataset.selected=settings.locale;
  document.documentElement.lang=settings.locale==='en'?'en':'zh-CN';
  document.querySelectorAll('[data-i18n]').forEach(el=>{el.textContent=t(el.dataset.i18n)});
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el=>{el.placeholder=t(el.dataset.i18nPlaceholder)});
  document.querySelectorAll('[data-i18n-aria]').forEach(el=>el.setAttribute('aria-label',t(el.dataset.i18nAria)));
  query.placeholder=t('searchPlaceholder');
  query.setAttribute('aria-label',t('searchPlaceholder'));
  syncSubmitState();
  applyScopeControls();
  for(const button of document.querySelectorAll('[data-locale]')){
    const current=button.dataset.locale===settings.locale;
    button.classList.toggle('active',current);button.setAttribute('aria-pressed',String(current));
  }
  document.dispatchEvent(new CustomEvent('newtab-locale-changed'));
}
function applyEngine(){
  if(activeSite){applyScopeControls();return;}
  const engine=ENGINE_META[settings.engine];
  engineButton.setAttribute('aria-haspopup','menu');engineButton.setAttribute('aria-controls','engine-menu');
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
function applyScopeControls(){
  engineControl.classList.toggle('is-site-search',!!activeSite);
  $('exit-site-search').hidden=!activeSite;
  $('exit-site-search').setAttribute('aria-label',t('exitSite'));
  $('site-search-key-hint').hidden=true;
  $('dismiss-hint-label').textContent=t('dismissHint');
  $('completion-help').textContent=t(activeSite?'scopeCompletionHelp':'completionHelp');
  if(!activeSite)return;
  const label=t('siteTarget').replace('{site}',activeSite.name);
  engineButton.setAttribute('aria-haspopup','menu');engineButton.setAttribute('aria-controls','engine-menu');
  engineButton.title=label;engineButton.setAttribute('aria-label',label);
  $('engine-name').textContent=activeSite.name;
  $('engine-icon').src=BrowserFavicons.urlFor(activeSite.home)||'assets/site-search.svg';
  query.placeholder=t('sitePlaceholder').replace('{site}',activeSite.name);
  query.setAttribute('aria-label',query.placeholder);
  for(const item of engineMenu.querySelectorAll('[data-engine]'))item.setAttribute('aria-checked','false');
}
function enterSite(site,text=''){
  window.NewTabSuggest?.close();setEngineOpen(false);activeSite=site;
  query.value=text;applyScopeControls();clearSubmitFeedback();query.focus();
  query.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertReplacementText'}));
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
    engineControl.animate([{transform:'scale(.94)'},{transform:'scale(1)'}],{duration:240,easing:'cubic-bezier(.22,1,.36,1)'});
  }
}
function exitSite(){
  activeSite=null;applyEngine();applyScopeControls();
  query.placeholder=t('searchPlaceholder');query.setAttribute('aria-label',query.placeholder);
  clearSubmitFeedback();query.focus();window.NewTabSuggest?.close();syncSubmitState();
}
function acceptSitePrefix(){
  if(activeSite || scopeComposing)return false;
  const parsed=window.SiteSearch?.parsePrefix(query.value);
  if(!parsed)return false;
  enterSite(parsed.site,parsed.query);return true;
}
window.NewTabScope=Object.freeze({get site(){return activeSite;},get composing(){return scopeComposing;},enter:enterSite,exit:exitSite});
$('engine-icon').addEventListener('error',()=>{if(activeSite && !$('engine-icon').src.endsWith('/assets/site-search.svg'))$('engine-icon').src='assets/site-search.svg';});
$('exit-site-search').addEventListener('click',exitSite);
query.addEventListener('compositionstart',()=>{scopeComposing=true;});
query.addEventListener('compositionend',()=>{scopeComposing=false;acceptSitePrefix();});
query.addEventListener('keydown',event=>{
  if(scopeComposing || event.isComposing || event.keyCode===229)return;
  if(activeSite && ((event.key==='Escape' && query.getAttribute('aria-expanded')!=='true')
    || (event.key==='Backspace' && !query.value))){
    event.preventDefault();event.stopImmediatePropagation();exitSite();
  }
});
function applyModeControls(){
  document.querySelectorAll('[name="mode"]').forEach(input=>{input.checked=input.value===settings.mode});
  $('bing-details').hidden=settings.mode!=='bing';
  updateBingStatus();
  updateGalleryControls();
}
function sameSettings(a,b){
  return Object.keys(DEFAULTS).every(key=>a[key]===b[key]);
}
async function saveSettings(patch){
  const next=normalize({...settings,...patch});
  const revision=++settingsRevision;
  ++pendingLocalWrites;
  settings=next;
  applySettingsToControls();
  // Queue writes in user-action order even if an earlier write is still pending.
  const write=settingsWriteQueue.catch(()=>{}).then(async()=>{
    const ownWrite={value:next,expires:Date.now()+5000};
    ownSettingsWrites.push(ownWrite);
    if(ownSettingsWrites.length>64)ownSettingsWrites.shift();
    try{
      await chrome.storage.sync.set({newTabPrefs:next});
      persistedSettings=next;
      committedRevision=revision;
    }catch(error){
      const index=ownSettingsWrites.indexOf(ownWrite);
      if(index!==-1)ownSettingsWrites.splice(index,1);
      throw error;
    }
  });
  settingsWriteQueue=write;
  try{await write;}
  catch(error){
    // A failed older request must not undo an even newer user selection.
    if(revision===settingsRevision){
      settings=persistedSettings;
      applySettingsToControls();
    }
    throw error;
  }finally{
    --pendingLocalWrites;
  }
}
function setPanelOpen(open){
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
  $('exit-site-search').tabIndex=open?-1:0;
  if(open){window.NewTabSuggest?.close();engineMenu.querySelector('[data-engine="'+settings.engine+'"]')?.setAttribute('tabindex','0');}
}
// Resolve the default action independently of async suggestions or their ranking.
function syncSubmitState(){
  const text=query.value.trim();
  searchSubmit.disabled=!text;
  const destination=window.NewTabSuggest?.chosenDestination();
  const action=text ? QueryAnalyzer.resolve(text,destination) : null;
  const label=destination?.type==='site'?t('siteSwitch').replace('{site}',destination.site.name)
    :destination?.type==='bookmark'?t('openBookmark')
    :activeSite?t('siteAction').replace('{site}',activeSite.name):action?.type==='navigate'
    ? (settings.locale==='en'?'Visit URL':'访问网址')
    : (settings.locale==='en'?'Search':'搜索');
  searchSubmit.setAttribute('aria-label',label);
  searchSubmit.title=label;
  $('confirm-hint-label').textContent=t(destination?.type==='site'?'switchHint':
    destination?.type==='bookmark'||(!activeSite&&action?.type==='navigate')?'openHint':'confirmHint');
}
searchSubmit.addEventListener('pointerdown',event=>event.preventDefault());
// Navigation feedback is visual only: never wait for a frame or animation before assigning.
// The left capsule ring acknowledges all outgoing navigation, including direct URLs.
function clearSubmitFeedback(){
  searchCombo.classList.remove('is-submitting');
  engineControl.classList.remove('is-submitting');
}
function showSubmitFeedback(){
  pendingSearchCycle++;earlySuggestionsDismissed=true;
  window.NewTabSuggest?.close(); // Invalidates pending suggestions before leaving the page.
  setEngineOpen(false);
  searchCombo.classList.add('is-submitting');
  engineControl.classList.add('is-submitting');
}
window.addEventListener('pageshow',clearSubmitFeedback); // Back/forward cache restores.
query.addEventListener('input',clearSubmitFeedback); // Navigation blocked/cancelled: editable again.

// URL classification is tiny and eager; suggestion providers remain lazy.
// Parallel local module loads; the controller loads only after its dependencies are ready.
let suggestionsTask=null,pendingSearchCycle=0,earlySuggestionsDismissed=false;
function moveSearchFocus(forward){
  (forward?searchSubmit:activeSite?$('exit-site-search'):engineButton).focus();
}
async function queueSearchCycle(forward){
  const token=pendingSearchCycle,value=query.value,scope=activeSite;
  const valid=()=>token===pendingSearchCycle && document.activeElement===query && query.value===value && activeSite===scope;
  await loadSuggestions();
  if(!valid())return;
  const controller=window.NewTabSuggest;
  if(controller){
    let ready,timer,expired=false;
    const limit=new Promise(resolve=>{timer=setTimeout(()=>{expired=true;resolve();},300);});
    try{do{ready=controller.ready();await Promise.race([ready,limit]);}
      while(valid() && !expired && ready!==controller.ready());}
    finally{clearTimeout(timer);}
  }
  if(valid() && !controller?.cycle(forward))moveSearchFocus(forward);
}
function loadLocalScript(path) {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = path;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Could not load ${path}`));
    document.head.append(script);
  });
}
function loadSuggestions() {
  if(window.NewTabSuggest)return Promise.resolve();
  if(suggestionsTask)return suggestionsTask;
  suggestionsTask=(async()=>{
    const started=performance.now();
    try {
      await Promise.all(['frecency.js','candidate-pipeline.js'].map(loadLocalScript));
      await loadLocalScript('suggestions.js');
      if(earlySuggestionsDismissed)window.NewTabSuggest?.close();
      performance.measure('minimal-new-tab-suggestions-load',{start:started,end:performance.now()});
    }catch(error){console.warn('Search suggestions unavailable:',error);}
    finally{suggestionsTask=null;}
  })();
  return suggestionsTask;
}
query.addEventListener('input', () => {
  pendingSearchCycle++;earlySuggestionsDismissed=false;
  $('site-search-notice').hidden=true;
  if(!scopeComposing && acceptSitePrefix())return;
  syncSubmitState();
  if (query.value.trim() && !window.NewTabSuggest) loadSuggestions();
});
query.addEventListener('focus', () => { if (query.value.trim() && !window.NewTabSuggest) loadSuggestions(); });
query.addEventListener('blur',()=>{pendingSearchCycle++;});
query.addEventListener('click',()=>{pendingSearchCycle++;});
query.addEventListener('keydown',event=>{
  if(scopeComposing || event.isComposing || event.keyCode===229)return;
  if(event.key==='Escape'){
    pendingSearchCycle++;
    if(!window.NewTabSuggest)earlySuggestionsDismissed=true;
  }
  if(event.key==='Tab' && !event.ctrlKey && !event.altKey && !event.metaKey
    && query.value.trim() && !window.NewTabSuggest){
    event.preventDefault();void queueSearchCycle(!event.shiftKey);
  }
});
document.addEventListener('newtab-suggestion-selection-changed',syncSubmitState);
window.addEventListener('newtab-sites-changed',()=>{
  if(document.activeElement===query){if(!acceptSitePrefix())window.NewTabSuggest?.sitesChanged();}
});
if(window.SiteSearch)void window.SiteSearch.init();
syncSubmitState();

// Image bytes and gallery metadata are separate: opening the gallery only reads thumbnails.
function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('images')) db.createObjectStore('images');
      if (!db.objectStoreNames.contains('wallpapers')) db.createObjectStore('wallpapers', {keyPath:'id'});
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Wallpaper database upgrade blocked'));
  });
}
async function imageTransaction(stores, mode, work) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    let result;
    const tx = db.transaction(stores, mode);
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = tx.onabort = () => { db.close(); reject(tx.error || new Error('Image transaction aborted')); };
    try { work(tx, value => { result = value; }); }
    catch (error) { tx.abort(); db.close(); reject(error); }
  });
}
function dbGet(key) {
  return imageTransaction(['images'], 'readonly', (tx, done) => {
    tx.objectStore('images').get(key).onsuccess = event => done(event.target.result);
  });
}
function dbPut(key, value) {
  return imageTransaction(['images'], 'readwrite', tx => tx.objectStore('images').put(value, key));
}
function readGallery() {
  return imageTransaction(['wallpapers'], 'readonly', (tx, done) => {
    tx.objectStore('wallpapers').getAll().onsuccess = event => done(event.target.result);
  });
}
function writeGallery(records, remove = []) {
  return imageTransaction(['wallpapers', 'images'], 'readwrite', (tx, done) => {
    for (const id of remove) {
      tx.objectStore('wallpapers').delete(id);
      tx.objectStore('images').delete(`wallpaper:${id}`);
    }
    // Count and insert in one transaction so simultaneous tabs cannot exceed the limit.
    tx.objectStore('wallpapers').count().onsuccess = event => {
      const accepted=records.slice(0,Math.max(0,maxImportedBackgrounds-event.target.result));
      try {
        for (const {blob, ...metadata} of accepted) {
          tx.objectStore('wallpapers').put(metadata);
          tx.objectStore('images').put(blob, `wallpaper:${metadata.id}`);
        }
        done({added:accepted.length,skipped:records.length-accepted.length});
      } catch (_) { tx.abort(); }
    };
  });
}

const previousPicture = $('wallpaper-previous');
const wallpaperDialog = $('wallpaper-manager');
const backgroundOptions = $('background-options');
// The whole grid scrolls together; its frame never grows beyond three card rows.
function sizeBackgroundGrid() {
  const height=backgroundOptions.querySelector('.wallpaper-mode').offsetHeight;
  const gap=parseFloat(getComputedStyle(backgroundOptions).rowGap);
  if(height)backgroundOptions.style.maxHeight=`${3*height+2*gap+6}px`;
}
new ResizeObserver(sizeBackgroundGrid).observe(backgroundOptions);
const reducedWallpaperMotion = matchMedia('(prefers-reduced-motion: reduce)');
let previousWallpaperUrl = null, wallpaperFadeTimer = null;
let gallery = [], galleryUrls = [], galleryGeneration = 0, galleryBusy = false, managingGallery = false;
let galleryDialogMotion = null, galleryDialogGeneration = 0, galleryClosing = false;
const gallerySelection = new Set();
let bingState = {key:'', day:''}, bingFlight = null, bingRefreshTimer = null;
let displayedBingDay = null;
let bingPreviewUrl = null, bingPreviewGeneration = 0;
async function setBingPreview(blob, generation = ++bingPreviewGeneration) {
  if(!(blob instanceof Blob))return;
  const url=URL.createObjectURL(blob),image=new Image();
  image.src=url;
  try { await image.decode(); }
  catch (_) { URL.revokeObjectURL(url);return; }
  if(generation!==bingPreviewGeneration){URL.revokeObjectURL(url);return;}
  const old=bingPreviewUrl;
  bingPreviewUrl=url; $('bing-preview').src=url; $('bing-preview').hidden=false;
  if(old)URL.revokeObjectURL(old);
}
async function loadBingPreview() {
  const generation=++bingPreviewGeneration;
  try {
    const cached=await dbGet('bing');
    if(generation===bingPreviewGeneration && cached?.blob)await setBingPreview(cached.blob,generation);
  } catch (error) {console.warn('Could not load Bing preview:',error);}
}
let bingAttempt = {day:'', at:0};
try { bingAttempt = JSON.parse(localStorage.getItem('bingRefreshAttempt') || 'null') || bingAttempt; } catch (_) {}
const interpolate = (key, values) => t(key).replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ''));
function setWallpaperStatus(message = '', error = false) {
  $('wallpaper-status').textContent = message;
  $('wallpaper-status').classList.toggle('error', error);
}
function updateBingStatus() {
  $('bing-status').textContent = bingState.key ? interpolate(bingState.key, {day:bingState.day}) : '';
  $('retry-bing').disabled = !!bingFlight;
}
function setBingStatus(key, day = '') {
  const date = String(day).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
  bingState = {key, day:date}; updateBingStatus();
}
function clearPreviousWallpaper() {
  clearTimeout(wallpaperFadeTimer);
  previousPicture.classList.remove('ready');
  previousPicture.removeAttribute('src');
  if (previousWallpaperUrl) URL.revokeObjectURL(previousWallpaperUrl);
  previousWallpaperUrl = null;
}
function showSolidBackground() {
  displayedBingDay = null;
  clearPreviousWallpaper();
  picture.classList.remove('ready');
  picture.removeAttribute('src');
  credit.hidden = true;
  credit.textContent = '';
  if (wallpaperUrl) URL.revokeObjectURL(wallpaperUrl);
  wallpaperUrl = null;
  applyTheme();
}
async function decodeImage(blob) {
  if (!(blob instanceof Blob) || !blob.type.startsWith('image/')) throw new Error('Invalid image');
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.src = url;
  try { await image.decode(); return image; }
  finally { URL.revokeObjectURL(url); }
}
async function displayImage(blob, token, attribution = '') {
  const nextUrl = URL.createObjectURL(blob);
  const nextImage = new Image();
  nextImage.src = nextUrl;
  try { await nextImage.decode(); }
  catch (error) { URL.revokeObjectURL(nextUrl); throw error; }
  if (token !== modeGeneration) { URL.revokeObjectURL(nextUrl); return false; }
  clearPreviousWallpaper();
  if (wallpaperUrl && !reducedWallpaperMotion.matches) {
    previousWallpaperUrl = wallpaperUrl;
    previousPicture.src = wallpaperUrl;
    previousPicture.style.transition = 'none';
    previousPicture.classList.add('ready');
    // The outgoing layer sits above the new, fully decoded image.
    void previousPicture.offsetWidth;
    previousPicture.style.transition = '';
    previousPicture.classList.remove('ready');
    wallpaperFadeTimer = setTimeout(clearPreviousWallpaper, 480);
  } else if (wallpaperUrl) URL.revokeObjectURL(wallpaperUrl);
  wallpaperUrl = nextUrl;
  displayedBingDay = null;
  picture.src = nextUrl;
  picture.classList.add('ready');
  credit.textContent = attribution;
  credit.hidden = !attribution;
  applyTheme();
  return true;
}
function today() {
  const date = new Date();
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
async function downloadImage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch(url, {signal:controller.signal, cache:'no-cache', credentials:'omit'});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (Number(response.headers.get('content-length')) > maxImageSize) throw new Error('Image too large');
    const blob = await response.blob();
    if (!blob.type.startsWith('image/') || blob.size > maxImageSize) throw new Error('Invalid image');
    return blob;
  } finally { clearTimeout(timer); }
}
async function fetchBingWallpaper(day) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  let image;
  try {
    const response = await fetch('https://www.bing.com/HPImageArchive.aspx?format=js&idx=0&n=1&mkt=zh-CN', {
      signal:controller.signal, cache:'no-cache', credentials:'omit'
    });
    if (!response.ok) throw new Error(`Bing API ${response.status}`);
    image = (await response.json())?.images?.[0];
  } finally { clearTimeout(timer); }
  if (!image || typeof image.url !== 'string') throw new Error('Missing Bing image');
  const url = new URL(image.url, 'https://www.bing.com/');
  if (url.origin !== 'https://www.bing.com') throw new Error('Unexpected image origin');
  const blob = await downloadImage(url.href);
  await decodeImage(blob); // A corrupt download must never overwrite a working cache.
  const next = {blob, day, credit:image.copyright || 'Bing', sourceDate:image.startdate || ''};
  await dbPut('bing', next);
  await setBingPreview(blob);
  return next;
}
async function refreshBing(token, force = false, showCache = true) {
  let cached;
  try {
    cached = await dbGet('bing');
    if (token !== modeGeneration || settings.mode !== 'bing') return;
    if (cached?.blob && (showCache || cached.day !== displayedBingDay || !picture.classList.contains('ready'))) {
      try {
        if (await displayImage(cached.blob, token, cached.credit || '')) {
          displayedBingDay = cached.day;
          await setBingPreview(cached.blob);
        }
      }
      catch (_) { cached = null; }
    }
    if (token !== modeGeneration || settings.mode !== 'bing') return;
    const day = today();
    if (cached?.day === day) { setBingStatus('bingCurrent', cached.sourceDate || day); return; }
    setBingStatus(cached?.blob ? 'bingCached' : 'bingOffline', cached?.sourceDate || cached?.day || '');
    const elapsed = Date.now() - bingAttempt.at;
    if (!bingFlight && !force && bingAttempt.day === day && elapsed >= 0 && elapsed < 15 * 60 * 1000) return;
    if (!bingFlight) {
      bingAttempt = {day, at:Date.now()};
      try { localStorage.setItem('bingRefreshAttempt', JSON.stringify(bingAttempt)); } catch (_) {}
      bingFlight = fetchBingWallpaper(day);
    }
    const flight = bingFlight;
    setBingStatus('bingLoading');
    try {
      const next = await flight;
      if (token !== modeGeneration || settings.mode !== 'bing') return;
      if (await displayImage(next.blob, token, next.credit)) displayedBingDay = next.day;
      setBingStatus('bingCurrent', next.sourceDate || next.day);
    } finally {
      if (bingFlight === flight) bingFlight = null;
      updateBingStatus();
    }
  } catch (error) {
    if (token === modeGeneration && settings.mode === 'bing') {
      setBingStatus(cached?.blob ? 'bingCached' : 'bingOffline', cached?.sourceDate || cached?.day || '');
    }
    console.warn('Bing wallpaper request failed:', error);
  }
}
function scheduleBingCheck() {
  clearTimeout(bingRefreshTimer);
  if (settings.mode !== 'bing') return;
  // A bounded check also catches clock/timezone changes while a tab stays visible.
  const midnight = new Date(); midnight.setHours(24, 0, 0, 0);
  bingRefreshTimer = setTimeout(() => {
    if (!document.hidden) void refreshBing(modeGeneration, false, false);
    scheduleBingCheck();
  }, Math.max(1000, Math.min(60000, midnight.getTime() - Date.now() + 100)));
}
async function renderBackground() {
  const token = ++modeGeneration;
  scheduleBingCheck();
  try {
    if (settings.mode === 'local') {
      const blob = settings.wallpaperId ? await loadWallpaperBlob(settings.wallpaperId) : null;
      if (token !== modeGeneration) return;
      if (!blob) throw new Error('Wallpaper not found');
      await displayImage(blob, token);
    } else if (settings.mode === 'bing') {
      await refreshBing(token);
    } else showSolidBackground();
  } catch (error) {
    if (token === modeGeneration) setWallpaperStatus(t('applyFailed'), true);
    console.warn(error);
  }
}

function updateGalleryControls() {
  $('manage-wallpapers').textContent = t(managingGallery ? 'done' : 'manage');
  $('manage-wallpapers').setAttribute('aria-pressed',String(managingGallery));
  $('manage-wallpapers').title=t('manageUploaded');
  $('choose-image').title=t('imageLimit');
  $('background-count').textContent=interpolate('backgroundCount',{count:8+gallery.length});
  $('background-count').hidden=settings.mode==='bing';
  wallpaperDialog.classList.toggle('is-managing',managingGallery);
  $('manage-wallpapers').disabled = galleryBusy || (!gallery.length && !managingGallery);
  $('choose-image').disabled = galleryBusy;
  $('wallpaper-batch').inert = !managingGallery;
  $('wallpaper-batch').setAttribute('aria-hidden',String(!managingGallery));
  $('select-all-wallpapers').textContent = t(gallery.length && gallerySelection.size === gallery.length ? 'clearSelection' : 'selectAll');
  $('select-all-wallpapers').disabled = galleryBusy || !gallery.length;
  $('delete-wallpapers').disabled = galleryBusy || !gallerySelection.size;
  $('wallpaper-selection-count').textContent = interpolate('selectedImages', {count:gallerySelection.size});
  for (const button of document.querySelectorAll('[data-builtin]')) {
    const current=settings.mode==='local' && button.dataset.id===settings.wallpaperId;
    button.classList.toggle('is-current',current);
    button.setAttribute('aria-pressed',String(current));
    button.disabled=managingGallery;
  }
  for (const radio of document.querySelectorAll('input[name="mode"]')) radio.disabled=managingGallery;
  for (const card of $('wallpaper-grid').children) {
    if (!card.dataset.id) continue;
    const current = settings.mode === 'local' && card.dataset.id === settings.wallpaperId;
    card.classList.toggle('is-current', current);
    card.classList.toggle('is-selected', gallerySelection.has(card.dataset.id));
    card.setAttribute('aria-pressed', String(managingGallery ? gallerySelection.has(card.dataset.id) : current));
    card.disabled = galleryBusy;
    card.querySelector('.wallpaper-current').hidden = !current;
    card.querySelector('.wallpaper-current').textContent = t('currentWallpaper');
    card.querySelector('.wallpaper-checkbox').hidden = !managingGallery;
  }
}
function releaseGalleryUrls() {
  galleryUrls.forEach(url => URL.revokeObjectURL(url)); galleryUrls = [];
}
const galleryEasing=()=>getComputedStyle(document.documentElement).getPropertyValue('--ease').trim();
function selectionMark(className) {
  const mark=document.createElement('span'); mark.className=className; mark.setAttribute('aria-hidden','true');
  mark.append(document.querySelector('#background-options .mode-selection svg').cloneNode(true));
  return mark;
}
async function renderGallery() {
  const generation = ++galleryGeneration;
  $('background-options').setAttribute('aria-busy','true');
  try {
    const rows = await readGallery();
    if (generation !== galleryGeneration || !wallpaperDialog.open || galleryClosing) return;
    gallery = rows.sort((a, b) => b.added - a.added);
    const ids = new Set(gallery.map(item => item.id));
    for (const id of gallerySelection) if (!ids.has(id)) gallerySelection.delete(id);
    const grid = $('wallpaper-grid');
    const previous=new Map([...grid.children].map(card=>[card.dataset.id,{card,box:card.getBoundingClientRect()}]));
    const next=[];
    for (const item of gallery) {
      if(previous.has(item.id)){next.push(previous.get(item.id).card);continue;}
      const card = document.createElement('button');
      card.type = 'button'; card.className = 'wallpaper-card wallpaper-option'; card.dataset.id = item.id; card.title = item.name;
      const thumbnail = document.createElement('img');
      const url = URL.createObjectURL(item.thumbnail); galleryUrls.push(url);
      card._thumbnailUrl=url;
      thumbnail.src = url; thumbnail.alt = ''; thumbnail.className='background-preview'; thumbnail.loading = 'lazy';
      const name=document.createElement('span');name.className='background-name';name.textContent=item.name;
      const current = document.createElement('span'); current.className = 'wallpaper-current sr-only';
      const checkbox=selectionMark('wallpaper-checkbox');
      card.append(thumbnail,name,current,selectionMark('mode-selection'),checkbox);
      card.addEventListener('click', () => {
        if (galleryBusy) return;
        if (managingGallery) {
          if (gallerySelection.has(item.id)) gallerySelection.delete(item.id); else gallerySelection.add(item.id);
          updateGalleryControls();
        } else void selectWallpaper(item.id);
      });
      next.push(card);
    }
    for(const [id,{card}] of previous)if(!ids.has(id)){
      URL.revokeObjectURL(card._thumbnailUrl);
      galleryUrls=galleryUrls.filter(url=>url!==card._thumbnailUrl);
    }
    grid.replaceChildren(...next);
    updateGalleryControls();
    if(!reducedWallpaperMotion.matches)for(const [index,card] of next.entries()){
      const old=previous.get(card.dataset.id)?.box;
      const box=card.getBoundingClientRect();
      if(old && (Math.abs(old.left-box.left)>1 || Math.abs(old.top-box.top)>1)){
        card.animate([{transform:`translate(${old.left-box.left}px,${old.top-box.top}px)`},{transform:'translate(0,0)'}],{duration:260,easing:galleryEasing()});
      }else if(!old && galleryDialogMotion?.playState!=='running'){
        card.animate([{opacity:0,transform:'translateY(9px) scale(.96)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:260,delay:Math.min(index,5)*20,easing:galleryEasing()});
      }
    }
  } catch (error) {
    if (generation === galleryGeneration && wallpaperDialog.open) setWallpaperStatus(t('libraryFailed'), true);
    console.warn(error);
  } finally {if(generation===galleryGeneration)$('background-options').setAttribute('aria-busy','false');}
}
async function selectWallpaper(id) {
  if (galleryBusy && !id.startsWith('builtin:')) return;
  const request = ++selectionRequest;
  const token = ++modeGeneration;
  try {
    const blob = await loadWallpaperBlob(id);
    await decodeImage(blob);
    if (request !== selectionRequest) return;
    await saveSettings({mode:'local', wallpaperId:id});
    if (request !== selectionRequest) return;
    await displayImage(blob, token);
    scheduleBingCheck();
    setWallpaperStatus();
  } catch (error) {
    if (request === selectionRequest) setWallpaperStatus(t('applyFailed'), true);
    console.warn(error);
  }
}
async function loadWallpaperBlob(id) {
  const name=id.startsWith('builtin:')?id.slice(8):null;
  if(name && BUILTIN_BACKGROUNDS.includes(name)){
    if(!builtinBlobs.has(name)){
      const response=await fetch(`assets/backgrounds/${name}.webp`);
      if(!response.ok)throw new Error('Bundled background unavailable');
      // These are trusted packaged WebP files; local preview servers may send octet-stream.
      const blob=await response.blob();
      builtinBlobs.set(name,blob.slice(0,blob.size,'image/webp'));
    }
    return builtinBlobs.get(name);
  }
  return dbGet(`wallpaper:${id}`);
}
async function prepareWallpaper(file) {
  if (!/^image\/(png|jpeg|webp|avif|gif)$/.test(file.type) || file.size > maxImageSize) throw new Error('Unsupported image');
  const image = await decodeImage(file);
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 240 / Math.max(image.naturalWidth, image.naturalHeight));
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  const thumbnail = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', .8));
  if (!thumbnail) throw new Error('Thumbnail failed');
  return {id:crypto.randomUUID(), name:file.name, size:file.size, added:Date.now(), thumbnail, blob:file};
}
async function addWallpapers(files) {
  if (galleryBusy || !files.length) return;
  galleryBusy = true; updateGalleryControls();
  let invalid = 0, overflow = 0;
  try {
    const existing=await readGallery();
    const available=Math.max(0,maxImportedBackgrounds-existing.length);
    if(!available){setWallpaperStatus(t('capacityReached'),true);return;}
    const batchTime=Math.max(Date.now(),...existing.map(row=>row.added+1));
    const records = [];
    for (const [index,file] of files.entries()) {
      if(records.length===available){overflow=files.length-index;break;}
      try {
        const record=await prepareWallpaper(file);
        record.added=batchTime+(files.length-index)/(files.length+1);
        records.push(record);
      } catch (_) { ++invalid; }
    }
    const result=records.length ? await writeGallery(records) : {added:0,skipped:0};
    overflow+=result.skipped;
    backgroundOptions.scrollTop=0;
    await renderGallery();
    setWallpaperStatus([
      result.added ? interpolate('addedImages', {count:result.added}) : '',
      invalid ? interpolate('invalidImages', {count:invalid}) : '',
      overflow ? interpolate('capacitySkipped', {count:overflow}) : ''
    ].filter(Boolean).join(' '), invalid > 0 || overflow > 0);
  } catch (error) { setWallpaperStatus(t('uploadFailed'), true); console.warn(error); }
  finally { galleryBusy = false; updateGalleryControls(); }
}
async function deleteSelectedWallpapers() {
  if (galleryBusy || !gallerySelection.size) return;
  galleryBusy = true; updateGalleryControls();
  const request = ++selectionRequest; // A pending image choice must not apply an image being deleted.
  const previous = {mode:settings.mode, wallpaperId:settings.wallpaperId};
  let clearedSelection = false;
  const ids = [...gallerySelection];
  try {
    if (ids.includes(settings.wallpaperId)) {
      const removingCurrent = settings.mode === 'local';
      if (removingCurrent) ++modeGeneration;
      await saveSettings({mode:removingCurrent ? 'auto' : settings.mode, wallpaperId:''});
      clearedSelection = true;
      if (removingCurrent) await renderBackground();
    }
    await writeGallery([], ids);
    if(!reducedWallpaperMotion.matches){
      await Promise.all([...$('wallpaper-grid').children].filter(card=>ids.includes(card.dataset.id)).map(card=>
        card.animate([{opacity:1,transform:'scale(1)'},{opacity:0,transform:'scale(.94)'}],{duration:180,easing:galleryEasing(),fill:'forwards'}).finished.catch(()=>{})));
    }
    gallerySelection.clear();
    await renderGallery();
    setWallpaperStatus(interpolate('deletedImages', {count:ids.length}));
  } catch (error) {
    if (clearedSelection && request === selectionRequest) {
      try {
        await saveSettings(previous);
        if (previous.mode === 'local') await renderBackground();
      }
      catch (restoreError) { console.warn('Could not restore background selection:', restoreError); }
    }
    setWallpaperStatus(t('deleteFailed'), true); console.warn(error);
  }
  finally { galleryBusy = false; updateGalleryControls(); }
}
function openWallpaperManager() {
  if(wallpaperDialog.open)return;
  setPanelOpen(false); setWallpaperStatus();
  managingGallery = false; gallerySelection.clear();
  ++galleryDialogGeneration; galleryClosing=false; wallpaperDialog.inert=false;
  wallpaperDialog.showModal();
  sizeBackgroundGrid();
  wallpaperDialog.classList.remove('is-closing');
  if(!reducedWallpaperMotion.matches){
    galleryDialogMotion=wallpaperDialog.animate([{opacity:0,transform:'translateY(12px) scale(.94)'},{opacity:1,transform:'translateY(0) scale(1)'}],{duration:320,easing:galleryEasing()});
  }
  updateGalleryControls(); void renderGallery(); void loadBingPreview();
}
async function closeWallpaperManager() {
  if(!wallpaperDialog.open || galleryClosing)return;
  galleryClosing=true; wallpaperDialog.inert=true; ++galleryGeneration;
  const generation=++galleryDialogGeneration;
  const style=getComputedStyle(wallpaperDialog),opacity=style.opacity,transform=style.transform;
  galleryDialogMotion?.cancel();
  wallpaperDialog.classList.add('is-closing');
  if(!reducedWallpaperMotion.matches){
    galleryDialogMotion=wallpaperDialog.animate([{opacity,transform},{opacity:0,transform:'translateY(10px) scale(.96)'}],{duration:200,easing:galleryEasing(),fill:'forwards'});
    await galleryDialogMotion.finished.catch(()=>{});
  }
  if(generation===galleryDialogGeneration)wallpaperDialog.close();
}
$('open-wallpapers').addEventListener('click', openWallpaperManager);
$('close-wallpapers').addEventListener('click', closeWallpaperManager);
wallpaperDialog.addEventListener('cancel',event=>{
  // A file picker cancellation bubbles from its input; only Escape on the dialog closes it.
  if(event.target!==wallpaperDialog)return;
  event.preventDefault();void closeWallpaperManager();
});
wallpaperDialog.addEventListener('click',event=>{
  const box=wallpaperDialog.getBoundingClientRect();
  if(event.target===wallpaperDialog && (event.clientX<box.left || event.clientX>box.right || event.clientY<box.top || event.clientY>box.bottom))void closeWallpaperManager();
});
document.querySelectorAll('[data-builtin]').forEach(button=>button.addEventListener('click',()=>{if(!managingGallery)void selectWallpaper(button.dataset.id);}));
wallpaperDialog.addEventListener('close', () => {
  if(wallpaperDialog.open)return;
  galleryDialogMotion?.cancel(); galleryDialogMotion=null; galleryClosing=false;
  wallpaperDialog.classList.remove('is-closing'); wallpaperDialog.inert=false;
  ++galleryGeneration; releaseGalleryUrls(); $('wallpaper-grid').replaceChildren();
  setPanelOpen(false); $('open-settings').focus({preventScroll:true});
});
$('choose-image').addEventListener('click', () => {
  if(gallery.length>=maxImportedBackgrounds){setWallpaperStatus(t('capacityReached'),true);return;}
  $('image-file').click();
});
$('image-file').addEventListener('change', () => {
  const files = [...$('image-file').files]; $('image-file').value = ''; void addWallpapers(files);
});
$('manage-wallpapers').addEventListener('click', () => {
  managingGallery = !managingGallery; gallerySelection.clear(); setWallpaperStatus(); updateGalleryControls();
});
$('select-all-wallpapers').addEventListener('click', () => {
  if (gallerySelection.size === gallery.length) gallerySelection.clear();
  else gallery.forEach(item => gallerySelection.add(item.id));
  updateGalleryControls();
});
$('delete-wallpapers').addEventListener('click', () => void deleteSelectedWallpapers());
$('retry-bing').addEventListener('click', () => void refreshBing(modeGeneration, true, false));
window.addEventListener('online', () => {
  if (settings.mode === 'bing') void refreshBing(modeGeneration, true, false);
});
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && settings.mode === 'bing') void refreshBing(modeGeneration, false, false);
});
window.addEventListener('focus', () => {
  if (settings.mode === 'bing') void refreshBing(modeGeneration, false, false);
});
document.addEventListener('newtab-locale-changed', () => {
  updateBingStatus(); updateGalleryControls();
});


$('search-form').addEventListener('submit',(event)=>{
  event.preventDefault();
  if(scopeComposing)return;
  const text=query.value.trim();
  if(!text)return;
  const destination=window.NewTabSuggest?.chosenDestination();
  if(destination?.type==='site'){enterSite(destination.site);return;}
  if(!activeSite && text.startsWith('@')){
    if(window.SiteSearch && !window.SiteSearch.loaded){
      void window.SiteSearch.init().then(()=>{if(query.value.trim()===text)$('search-form').requestSubmit();});return;
    }
    if(acceptSitePrefix()) {if(query.value.trim())$('search-form').requestSubmit();return;}
    const site=window.SiteSearch?.lookup(text.slice(1));
    if(site){enterSite(site);return;}
    $('site-search-notice').textContent=t('siteMissing');$('site-search-notice').hidden=false;return;
  }
  if(activeSite){
    const target=destination?.type==='bookmark'?destination.url:window.SiteSearch.buildURL(activeSite,destination?.text||text);
    if(!target)return;
    if(destination?.type!=='bookmark')window.SiteSearch.remember(activeSite,destination?.text||text);
    showSubmitFeedback();location.assign(target);return;
  }
  const action=QueryAnalyzer.resolve(text,destination);
  if(action.type==='navigate'){
    window.NewTabSuggest?.recordNavigation(text,destination || {type:'url',text,url:action.url});
    showSubmitFeedback();
    location.assign(action.url);
    return;
  }
  const submitted=action.query;
  // Sync localStorage is intentionally written only when submitting, never while typing.
  try {
    const key='minimalSearchHistory';
    const old=JSON.parse(localStorage.getItem(key)||'[]');
    const recent=Array.isArray(old)?old.filter(v=>typeof v==='string'&&v!==submitted):[];
    localStorage.setItem(key,JSON.stringify([submitted,...recent].slice(0,30)));
  } catch(_){}
  window.NewTabSuggest?.recordSearch(submitted,text,destination);
  showSubmitFeedback();
  location.assign(ENGINE_META[settings.engine].url+encodeURIComponent(submitted));
});
engineButton.addEventListener('click',event=>{
  setPanelOpen(false);const open=!engineMenu.classList.contains('is-open');setEngineOpen(open);
  if(open && event.detail===0)engineMenu.querySelector('[data-engine]')?.focus();
});
engineMenu.addEventListener('focusout',event=>{
  if(!engineMenu.contains(event.relatedTarget) && event.relatedTarget!==engineButton)setEngineOpen(false);
});
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
  if(activeSite)exitSite();
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
for (const radio of document.querySelectorAll('input[name="mode"]')) {
  radio.addEventListener('change', async () => {
    if (!radio.checked) return;
    const request = ++selectionRequest;
    ++modeGeneration;
    try {
      await saveSettings({mode:radio.value});
      if (request === selectionRequest) await renderBackground();
    } catch (error) {
      if (request === selectionRequest) {
        await renderBackground();
        setWallpaperStatus(settings.locale === 'en' ? 'Failed to save background settings.' : '无法保存背景设置。', true);
      }
      console.warn(error);
    }
  });
}
darkMode.addEventListener('change',()=>applyTheme());
chrome.storage.onChanged.addListener((changes,area)=>{
  if(area==='sync'&&changes.newTabPrefs){
    const next=normalize(changes.newTabPrefs.newValue||DEFAULTS);
    const now=Date.now();
    for(let i=ownSettingsWrites.length-1;i>=0;i--){
      if(ownSettingsWrites[i].expires<now)ownSettingsWrites.splice(i,1);
    }
    if(ownSettingsWrites.some(own=>sameSettings(own.value,next)))return;
    // Local user input wins while its ordered writes are still outstanding.
    if(pendingLocalWrites)return;
    ++settingsRevision;
    ++selectionRequest;
    ++modeGeneration;
    persistedSettings=next;
    const changeBackground=next.mode!==settings.mode||next.wallpaperId!==settings.wallpaperId;
    settings=next;
    applySettingsToControls();if(changeBackground)void renderBackground();
  }
});
(async()=>{
  try{
    const saved=await chrome.storage.sync.get('newTabPrefs');
    const initial=normalize(saved.newTabPrefs||DEFAULTS);
    if(committedRevision===0)persistedSettings=initial;
    if(settingsRevision===0)settings=initial;
  }catch(e){console.warn('Settings sync unavailable:',e)}
  applySettingsToControls();await renderBackground();
})();
