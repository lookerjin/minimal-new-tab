'use strict';
// Community-maintained data is parsed locally. No remote scripts or query-bearing requests.
(() => {
  const DAY=86400000, RETRY=900000, MAX_BYTES=5*1024*1024;
  const META='https://api.github.com/repos/kagisearch/bangs/commits?path=data/bangs.json&per_page=1';
  const sources=version=>[
    `https://raw.githubusercontent.com/kagisearch/bangs/${version}/data/bangs.json`,
    `https://cdn.jsdelivr.net/gh/kagisearch/bangs@${version}/data/bangs.json`
  ];
  const normalize=value=>String(value||'').normalize('NFKC').toLocaleLowerCase().trim();
  const compact=value=>normalize(value).replace(/\s+/g,'');
  const defaults=['open_base_path','open_snap_domain','url_encode_placeholder','url_encode_space_to_plus'];
  let sites=[],catalog=null,initialization=null,loaded=false,flight=null;
  const owner=()=>crypto.randomUUID();

  function normalizeRule(row) {
    if(!row || typeof row.s!=='string' || !row.s.trim() || row.s.length>120
      || typeof row.t!=='string' || !/^[a-z\d._-]{1,60}$/i.test(row.t)
      || typeof row.u!=='string' || row.u.length>4000 || row.x
      || !row.u.includes('{{{s}}}') || /\$\d/.test(row.u))return null;
    try {
      const url=new URL(row.u.replaceAll('{{{s}}}','__query__'));
      if(!['https:','http:'].includes(url.protocol) || url.username || url.password || url.hostname.includes('__query__'))return null;
      let domain=url.hostname;
      try {if(typeof row.d==='string')domain=new URL(`https://${row.d}`).hostname;}catch(_){}
      const aliases=[...new Set([row.t,...(Array.isArray(row.ts)?row.ts:[])])]
        .filter(value=>typeof value==='string' && /^[a-z\d._-]{1,60}$/i.test(value)).map(normalize);
      if(row.fmt!==undefined && (!Array.isArray(row.fmt) || row.fmt.some(flag=>!defaults.includes(flag))))return null;
      return Object.freeze({id:normalize(row.t),name:row.s.trim(),domain,home:`https://${domain}/`,
        aliases,template:row.u,flags:row.fmt||defaults});
    } catch (_) {return null;}
  }
  function compile(rows) {
    if(!Array.isArray(rows) || rows.length<100 || rows.length>50000)throw Error('Invalid site catalog');
    const normalized=rows.map(normalizeRule).filter(Boolean);
    if(normalized.length<100 || normalized.length<rows.length*.8)throw Error('Incomplete site catalog');
    return normalized;
  }
  function validEnvelope(value) {
    return value?.schema===1 && /^[a-f\d]{40}$/.test(value.version) && Number.isFinite(Date.parse(value.updatedAt));
  }
  function newer(a,b) {return !b || Date.parse(a.updatedAt)>Date.parse(b.updatedAt);}
  function install(value) {
    if(!validEnvelope(value))throw Error('Invalid catalog version');
    const next=compile(value.rules);
    catalog=value;sites=next;
    window.dispatchEvent(new Event('newtab-sites-changed'));
  }
  async function transact(mode,work) {
    const db=await new Promise((resolve,reject)=>{
      const request=indexedDB.open('minimal-new-tab-site-search',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('catalog');
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
      request.onblocked=()=>reject(Error('Site catalog storage blocked'));
    });
    return new Promise((resolve,reject)=>{
      let result; const tx=db.transaction('catalog',mode);
      tx.oncomplete=()=>{db.close();resolve(result);};
      tx.onerror=tx.onabort=()=>{db.close();reject(tx.error||Error('Site catalog transaction failed'));};
      try {work(tx.objectStore('catalog'),value=>{result=value;});}
      catch(error){tx.abort();db.close();reject(error);}
    });
  }
  const read=key=>transact('readonly',(store,done)=>{store.get(key).onsuccess=event=>done(event.target.result);});
  async function fetchJSON(url,limit=MAX_BYTES) {
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6500);
    try {
      const response=await fetch(url,{signal:controller.signal,credentials:'omit',cache:'no-cache',referrerPolicy:'no-referrer'});
      if(!response.ok)throw Error(`Catalog HTTP ${response.status}`);
      if(Number(response.headers.get('content-length'))>limit)throw Error('Catalog too large');
      const reader=response.body?.getReader();
      if(!reader){const text=await response.text();if(text.length>limit)throw Error('Catalog too large');return JSON.parse(text);}
      const chunks=[];let length=0;
      while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;
        if(length>limit){await reader.cancel();throw Error('Catalog too large');}chunks.push(value);}
      const bytes=new Uint8Array(length);let offset=0;
      for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
      return JSON.parse(new TextDecoder().decode(bytes));
    } finally {clearTimeout(timer);}
  }
  async function claim(token) {
    return transact('readwrite',(store,done)=>{store.get('state').onsuccess=event=>{
      const state=event.target.result||{},now=Date.now();
      if(state.leaseUntil>now || (state.checkedAt && now-state.checkedAt>=0 && now-state.checkedAt<DAY)
        || (state.attemptedAt && now-state.attemptedAt>=0 && now-state.attemptedAt<RETRY)){done(false);return;}
      store.put({...state,owner:token,attemptedAt:now,leaseUntil:now+45000},'state');done(true);
    };});
  }
  async function release(token,success) {
    return transact('readwrite',store=>{store.get('state').onsuccess=event=>{
      const state=event.target.result;
      if(state?.owner===token)store.put({...state,leaseUntil:0,...(success?{checkedAt:Date.now()}: {})},'state');
    };});
  }
  async function commit(value) {
    return transact('readwrite',(store,done)=>{store.get('active').onsuccess=event=>{
      let previous=event.target.result;
      try {if(validEnvelope(previous))compile(previous.rules);else previous=null;}catch(_){previous=null;}
      if(validEnvelope(previous) && !newer(value,previous)){done(previous);return;}
      store.put(value,'active');done(value);
    };});
  }
  async function refresh() {
    if(flight)return flight;
    flight=(async()=>{
      await init();
      const token=owner();let claimed=false,success=false;
      try {
        claimed=await claim(token);if(!claimed)return false;
        // Resolve a version first; both download hosts then serve that immutable revision.
        const metadata=(await fetchJSON(META,256*1024))?.[0];
        const version=metadata?.sha,updatedAt=metadata?.commit?.committer?.date;
        const next={schema:1,version,updatedAt};
        if(!validEnvelope(next) || Date.parse(updatedAt)>Date.now()+300000)throw Error('Invalid upstream version');
        if(catalog?.version===version){success=true;return true;}
        if(!newer(next,catalog))throw Error('Older catalog ignored');
        let failure;
        for(const url of sources(version)){
          try {
            const rules=await fetchJSON(url);compile(rules);
            const saved=await commit({...next,rules});
            if(newer(saved,catalog) || saved.version===catalog?.version)install(saved);
            success=true;return true;
          }catch(error){failure=error;}
        }
        throw failure;
      }catch(error){console.warn('Site catalog update deferred:',error);return false;}
      finally {if(claimed)await release(token,success).catch(()=>{});}
    })().finally(()=>{flight=null;});
    return flight;
  }
  function init() {
    if(initialization)return initialization;
    initialization=(async()=>{
      try {
        let cached;
        try {cached=await read('active');if(cached)install(cached);}catch(_){}
        if(!catalog){
          const builtin=await fetchJSON('assets/site-search-snapshot.json');install(builtin);
          await commit(builtin).catch(()=>{});
        }
      }catch(error){console.warn('Site catalog unavailable:',error);}
      finally {loaded=true;}
      setTimeout(()=>void refresh(),1500);
    })();
    window.addEventListener('online',()=>void refresh());
    window.addEventListener('focus',()=>void refresh());
    return initialization;
  }
  function lookup(text) {
    const needle=compact(text).replace(/^@/,'');
    if(!needle)return null;
    return sites.find(site=>site.aliases.includes(needle))
      || sites.find(site=>compact(site.name)===needle)
      || sites.find(site=>site.domain.replace(/^www\./,'')===needle) || null;
  }
  function find(text) {
    const needle=compact(text).replace(/^@/,''),popular=['gh','bilibili','yt','wikipedia','zhihu','npmjs'];
    return sites.map(site=>({site,score:!needle?100-popular.indexOf(site.id)*5:
      site.aliases.includes(needle)?200:compact(site.name)===needle?180:
      site.aliases.some(alias=>alias.startsWith(needle))?100:
      compact(site.name).startsWith(needle)?90:site.domain.startsWith(needle)?80:0}))
      .filter(row=>needle?row.score>0:popular.includes(row.site.id))
      .sort((a,b)=>b.score-a.score || a.site.id.length-b.site.id.length).slice(0,6).map(row=>row.site);
  }
  function parsePrefix(text) {
    const match=String(text).match(/^@([^\s]+)\s+([\s\S]*)$/);
    if(!match)return null;
    const site=lookup(match[1]);return site?{site,query:match[2]}:null;
  }
  function buildURL(site,query) {
    let text=String(query).trim();if(!text)return null;
    if(site.flags.includes('url_encode_placeholder'))text=encodeURIComponent(text);
    if(site.flags.includes('url_encode_space_to_plus'))text=text.replace(/%20/g,'+').replace(/ /g,'+');
    const url=new URL(site.template.replaceAll('{{{s}}}',text));
    const origin=new URL(site.template.replaceAll('{{{s}}}','__query__')).origin;
    if(!['http:','https:'].includes(url.protocol) || url.username || url.password || url.origin!==origin)throw Error('Invalid search destination');
    return url.href;
  }
  function history(site,query='') {
    try {return JSON.parse(localStorage.getItem('minimalSiteSearchHistory')||'[]')
      .filter(row=>row.site===site.id && typeof row.text==='string' && normalize(row.text).includes(normalize(query)))
      .slice(0,3).map(row=>({type:'history',text:row.text}));}catch(_){return [];}
  }
  function remember(site,text) {
    try {
      const previous=JSON.parse(localStorage.getItem('minimalSiteSearchHistory')||'[]');
      const rows=Array.isArray(previous)?previous.filter(row=>row.site!==site.id || row.text!==text):[];
      localStorage.setItem('minimalSiteSearchHistory',JSON.stringify([{site:site.id,text},...rows].slice(0,100)));
    }catch(_){}
  }
  window.SiteSearch=Object.freeze({init,refresh,lookup,find,parsePrefix,buildURL,history,remember,normalizeRule,compile,
    get loaded(){return loaded;},get version(){return catalog?.version||null;},get count(){return sites.length;}});
})();
