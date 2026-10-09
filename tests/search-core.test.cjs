'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const window = {};
const context = vm.createContext({window, URL, Date, AbortController, setTimeout, clearTimeout});
for (const name of ['query-analyzer.js','frecency.js','candidate-pipeline.js']) {
  vm.runInContext(readFileSync(path.resolve(__dirname,'..',name),'utf8'),context,{filename:name});
}
const {QueryAnalyzer, FrecencyRank, CandidatePipeline} = window;
const plain = value => JSON.parse(JSON.stringify(value));

test('URL recognition is conservative, default search stays intact', () => {
  assert.equal(QueryAnalyzer.analyze('github.com').type,'url');
  assert.equal(QueryAnalyzer.analyze('localhost:3000').url,'http://localhost:3000/');
  assert.equal(QueryAnalyzer.analyze('192.168.1.10:5000').url,'http://192.168.1.10:5000/');
  assert.equal(QueryAnalyzer.analyze('https://example.com/a').url,'https://example.com/a');
  assert.equal(QueryAnalyzer.analyze('github.com/repo?tab=readme#top').url,'https://github.com/repo?tab=readme#top');
  assert.equal(QueryAnalyzer.analyze('github.com?tab=readme').url,'https://github.com/?tab=readme');
  assert.equal(QueryAnalyzer.analyze('localhost:3000?debug=1').url,'http://localhost:3000/?debug=1');
  for (const query of ['ai agent','hello','a@b.com','javascript:alert(1)','example.com:99999','999.999.999.999','https://user:pass@example.com']) {
    assert.equal(QueryAnalyzer.analyze(query).type,'search',query);
  }
});

test('Submit resolution: explicit choice > URL intent > ordinary search', () => {
  assert.deepEqual(plain(QueryAnalyzer.resolve('github.com')), {type:'navigate',url:'https://github.com/'});
  assert.deepEqual(plain(QueryAnalyzer.resolve('localhost:3000')), {type:'navigate',url:'http://localhost:3000/'});
  assert.deepEqual(plain(QueryAnalyzer.resolve('golang 教程')), {type:'search',query:'golang 教程'});
  assert.deepEqual(plain(QueryAnalyzer.resolve('github.com 怎么用')), {type:'search',query:'github.com 怎么用'});
  assert.deepEqual(plain(QueryAnalyzer.resolve('github.com', {type:'search',text:'github.com'})),
    {type:'search',query:'github.com'});
  assert.deepEqual(plain(QueryAnalyzer.resolve('github', {type:'bookmark',text:'GitHub',url:'https://github.com/'})),
    {type:'navigate',url:'https://github.com/'});
  assert.deepEqual(plain(QueryAnalyzer.resolve('github.com', {type:'bookmark',text:'Documentation',url:'https://docs.github.com/'})),
    {type:'navigate',url:'https://docs.github.com/'});
  // A selected suggestion remains an explicit search even when its text is a URL.
  assert.deepEqual(plain(QueryAnalyzer.resolve('github', {type:'online',text:'github.com'})),
    {type:'search',query:'github.com'});
  assert.deepEqual(plain(QueryAnalyzer.resolve('github.com', {type:'bookmark',text:'Unsafe',url:'javascript:alert(1)'})),
    {type:'search',query:'Unsafe'});
  assert.deepEqual(plain(QueryAnalyzer.resolve('')), {type:'empty'});
});

test('Explicit search action is not deduplicated with recent-search text', () => {
  const ranked=plain(CandidatePipeline.rank([
    {type:'url',text:'github.com',url:'https://github.com/'},
    {type:'search',text:'github.com'},
    {type:'history',text:'github.com'}
  ],'github.com'));
  assert.equal(ranked.length,3);
  assert.deepEqual(ranked.map(row=>row.type),['url','search','history']);
});

test('Frecency rewards prefix, recent usage, and local sources', () => {
  const now = Date.now();
  const ranked = FrecencyRank.sort([
    {type:'online',text:'github actions'},
    {type:'history',text:'github',count:4,lastUsed:now},
    {type:'history',text:'not related'},
    {type:'bookmark',text:'my github guide',url:'https://example.com/github'},
  ],'github');
  assert.equal(ranked[0].text,'github');
  assert.equal(ranked.at(-1).text,'github actions');
  assert.equal(ranked.some(item=>item.text==='not related'),false);
  assert(FrecencyRank.score({type:'history',text:'github',count:3,lastUsed:now},'git') >
         FrecencyRank.score({type:'history',text:'github',count:3,lastUsed:now-45*86400000},'git'));
});

test('Provider collection runs concurrently, deduplicates, and updates progressively', async () => {
  const received=[];
  const unregA=CandidatePipeline.register({provide: async()=>[{type:'history',text:'alpha'}]});
  const unregB=CandidatePipeline.register({provide: async()=>{
    await new Promise(resolve=>setTimeout(resolve,25));
    return [{type:'online',text:'alpha'},{type:'online',text:'alphabet'}];
  }});
  const final=await CandidatePipeline.collect({query:'alpha'},items=>received.push(plain(items)));
  assert.equal(received.length,2);
  assert.equal(received[0].length,1);
  assert.equal(final.length,2);
  assert.equal(final[0].type,'history');
  unregA();unregB();
});

test('Provider precedence stays deterministic when a lower-priority provider responds first', async () => {
  const unregLocal=CandidatePipeline.register({name:'local',provide: async()=>{
    await new Promise(resolve=>setTimeout(resolve,25));
    return [{type:'history',text:'duplicate search'}];
  }});
  const unregRemote=CandidatePipeline.register({name:'remote',provide: async()=>[
    {type:'online',text:'duplicate search'}, {type:'online',text:'duplicate search tips'}
  ]});
  const stages=[], timings=[];
  const final=await CandidatePipeline.collect({query:'duplicate',onProviderSettled:x=>timings.push(x)},
    items=>stages.push(plain(items)));
  assert.equal(final.length,2);
  assert.equal(final.find(item=>item.text==='duplicate search').type,'history');
  assert.equal(stages.at(-1).find(item=>item.text==='duplicate search').type,'history');
  assert.equal(timings.length,2);
  assert(timings.every(item=>item.elapsedMs>=0 && Number.isFinite(item.elapsedMs)));
  unregLocal();unregRemote();
});

test('Synchronous providers share one progressive update', async () => {
  const offA=CandidatePipeline.register({name:'a',provide:async()=>[{type:'history',text:'coalesce one'}]});
  const offB=CandidatePipeline.register({name:'b',provide:async()=>[{type:'online',text:'coalesce two'}]});
  const updates=[];
  await CandidatePipeline.collect({query:'coalesce'},values=>updates.push(plain(values)));
  assert.equal(updates.length,1);
  assert.equal(updates[0].length,2);
  offA();offB();
});

test('Aborted collections do not emit stale results', async () => {
  const controller = new AbortController();
  const unreg=CandidatePipeline.register({provide: async()=>{
    await new Promise(resolve=>setTimeout(resolve,15));
    return [{type:'online',text:'alpha'}];
  }});
  const changes=[];
  const pending=CandidatePipeline.collect({query:'alpha',signal:controller.signal},r=>changes.push(r));
  controller.abort();
  assert.equal((await pending).length,0);
  assert.equal(changes.length,0);
  unreg();
});
