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
  for (const query of ['ai agent','hello','a@b.com','javascript:alert(1)','example.com:99999','999.999.999.999','https://user:pass@example.com']) {
    assert.equal(QueryAnalyzer.analyze(query).type,'search',query);
  }
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
