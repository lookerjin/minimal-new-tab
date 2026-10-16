'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const window={};
const values=new Map();
const localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
vm.runInContext(readFileSync(path.join(__dirname,'..','site-search.js'),'utf8'),
  vm.createContext({window,URL,localStorage}));
const api=window.SiteSearch;
const snapshot=JSON.parse(readFileSync(path.join(__dirname,'..','assets','site-search-snapshot.json'),'utf8'));
const base={s:'Example',d:'example.com',t:'ex',u:'https://example.com/search?q={{{s}}}'};

test('bundled catalog has broad usable coverage and real GitHub aliases',()=>{
  const sites=api.compile(snapshot.rules);
  assert.ok(sites.length>10000);
  const gh=sites.find(site=>site.id==='gh');
  assert.ok(gh.aliases.includes('github'));
  assert.equal(api.buildURL(gh,'Go 中文 & # + /'),
    'https://github.com/search?q=Go+%E4%B8%AD%E6%96%87+%26+%23+%2B+%2F');
});

test('invalid or executable templates and unsupported substitutions are rejected',()=>{
  for(const patch of [{u:'javascript:alert("{{{s}}}")'},{u:'https://user:pass@example.com/?q={{{s}}}'},
    {u:'https://{{{s}}}.example.com/'},{u:'file:///{{{s}}}'},{u:'https://example.com/'},
    {x:[]},{fmt:['unsupported']},{t:'bad shortcut'},{u:'https://example.com/$1?q={{{s}}}'}]){
    assert.equal(api.normalizeRule({...base,...patch}),null,JSON.stringify(patch));
  }
  assert.throws(()=>api.compile([base]),/Invalid/);
  assert.throws(()=>api.compile(Array(100).fill({})),/Incomplete/);
});

test('template encoding flags support plus, percent spaces, path and repeated placeholders',()=>{
  const percent=api.normalizeRule({...base,fmt:['url_encode_placeholder'],
    u:'https://example.com/{{{s}}}?q={{{s}}}'});
  assert.equal(api.buildURL(percent,'a b/中文'),
    'https://example.com/a%20b%2F%E4%B8%AD%E6%96%87?q=a%20b%2F%E4%B8%AD%E6%96%87');
  assert.equal(api.buildURL(percent,'   '),null);
  const raw=api.normalizeRule({...base,fmt:[],u:'https://example.com/{{{s}}}'});
  assert.equal(new URL(api.buildURL(raw,'\\evil.test/path')).origin,'https://example.com');
});

test('site history is isolated, submission-only, deduplicated and bounded',()=>{
  const one=api.normalizeRule(base),two=api.normalizeRule({...base,t:'two'});
  assert.equal(api.history(one).length,0);
  api.remember(one,'中文 tutorial');api.remember(two,'other');api.remember(one,'中文 tutorial');
  assert.equal(api.history(one,'中文').length,1);
  assert.equal(api.history(two)[0].text,'other');
  for(let i=0;i<110;i++)api.remember(one,`query ${i}`);
  assert.equal(JSON.parse(localStorage.getItem('minimalSiteSearchHistory')).length,100);
  assert.equal(api.history(one).length,3);
  localStorage.setItem('minimalSiteSearchHistory','{}');
  assert.equal(api.history(one).length,0);
});
