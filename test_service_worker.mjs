// Execute the real worker handlers with simulated browser caches. Not a device test.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('./sw.js',import.meta.url),'utf8');
const prefix=scope=>`lifeplan-sim:${encodeURIComponent(scope)}:`;
const cacheVersion=source.match(/const CACHE=`\$\{CACHE_PREFIX\}([^`]+)`/)?.[1];
assert.ok(cacheVersion,'Service Worker must declare a versioned cache');
export function harness(scope='https://example.test/lifeplan/'){
  const stores=new Map(),deleted=[],requests=[],handlers={},flags={failInstall:false,offline:false},key=x=>typeof x==='string'?x:x.url;
  const cacheStore=name=>{
    if(!stores.has(name))stores.set(name,new Map());
    const data=stores.get(name);
    return {match:async x=>{if(flags.failMatch)throw new Error('CacheReadError');return data.get(key(x));},addAll:async items=>{
      requests.push(...items);
      if(flags.failInstall)throw new Error('NetworkError');
      const entries=items.map(x=>[key(x),new Response(`bundle:${key(x)}`)]);
      entries.forEach(([url,response])=>data.set(url,response));
      if(flags.partialInstall)data.delete(key(items.at(-1)));
      if(flags.badResponse)data.set(key(items.at(-1)),new Response('bad',{status:500}));
    }};
  };
  const caches={open:async name=>{if(flags.failOpen)throw new Error('CacheOpenError');return cacheStore(name);},keys:async()=>[...stores.keys()],delete:async name=>{if(flags.failDelete)throw new Error('DeleteError');deleted.push(name);return stores.delete(name);},match:()=>{throw new Error('Origin-wide lookup is forbidden');}};
  let takeovers=0;
  const self={registration:{scope},addEventListener:(name,fn)=>handlers[name]=fn,skipWaiting:()=>{takeovers++;},clients:{claim:()=>{takeovers++;}}};
  const network=[];
  const context={self,caches,URL,Request,Response,fetch:async request=>{network.push(key(request));if(flags.offline)throw new Error('offline');return new Response('network');}};
  Object.defineProperty(context,'localStorage',{get(){throw new Error('Personal settings must not be accessed');}});
  Object.defineProperty(context,'indexedDB',{get(){throw new Error('Personal database must not be accessed');}});
  vm.runInNewContext(source,context);
  const run=async type=>{let promise;handlers[type]({waitUntil:p=>promise=p});assert.ok(promise);return await promise;};
  const fetchRequest=async(request)=>{let promise;handlers.fetch({request,respondWith:p=>promise=p});return promise?{handled:true,response:await promise}:{handled:false};};
  return {scope,stores,deleted,requests,flags,network,run,fetchRequest,takeovers:()=>takeovers,current:()=>[...stores.keys()].find(k=>k.startsWith(prefix(scope))&&k.endsWith(cacheVersion))};
}
test('正常更新後も旧版と他アプリ・旧形式・隣接範囲を保持',async()=>{
  const h=harness(),own=prefix(h.scope)+'v0.9.6-1';
  const keep=['other-app-v1','lifeplan-sim-v0.9.6-1',prefix('https://example.test/lifeplan-copy/')+'v0.9.6-1',prefix('https://example.test/lifeplan/sub/')+'v0.9.6-1'];
  for(const k of [own,...keep])h.stores.set(k,new Map());
  await h.run('install');await h.run('activate');
  assert.deepEqual(h.deleted,[]);assert.ok(h.stores.has(own));keep.forEach(k=>assert.ok(h.stores.has(k)));assert.ok(h.stores.has(h.current()));
});
test('更新取得失敗は旧版キャッシュを保持し強制切替しない',async()=>{
  const h=harness(),old=prefix(h.scope)+'v0.9.6-1',data=new Map([['sentinel','old']]);h.stores.set(old,data);h.flags.failInstall=true;
  await assert.rejects(h.run('install'),/NetworkError/);assert.deepEqual(h.deleted,[]);assert.equal(h.stores.get(old),data);assert.equal(h.takeovers(),0);
});
test('不完全な更新キャッシュでactivateしても旧版を消さない',async()=>{
  const h=harness(),old=prefix(h.scope)+'v0.9.6-1';h.stores.set(old,new Map());
  await h.run('install');h.stores.get(h.current()).delete(h.scope+'calc.mjs');
  await assert.rejects(h.run('activate'),/不足/);assert.deepEqual(h.deleted,[]);assert.ok(h.stores.has(old));
});
test('旧キャッシュの掃除失敗だけで完全な更新を失敗扱いにしない',async()=>{
  const h=harness(),old=prefix(h.scope)+'v0.9.6-1';h.stores.set(old,new Map());h.flags.failDelete=true;
  await h.run('install');await h.run('activate');assert.ok(h.stores.has(old));
  const response=await h.fetchRequest(new Request(h.scope+'app.mjs'));assert.equal(await response.response.text(),`bundle:${h.scope}app.mjs`);
});
test('現在版だけから読込み、他アプリの同名URLを返さない',async()=>{
  const h=harness(),url=h.scope+'app.mjs';h.stores.set('other',new Map([[url,new Response('wrong')]]));
  await h.run('install');const fetched=await h.fetchRequest(new Request(url));
  assert.equal(fetched.handled,true);assert.equal(await fetched.response.text(),`bundle:${url}`);assert.deepEqual(h.network,[]);
});
test('現在版で見つからない場合は明示停止、ネットワークや旧版へ混在させない',async()=>{
  const h=harness(),url=h.scope+'calc.mjs';await h.run('install');h.stores.get(h.current()).delete(url);h.stores.set('legacy',new Map([[url,new Response('old')]]));
  const fetched=await h.fetchRequest(new Request(url));assert.equal(fetched.response.status,503);assert.match(await fetched.response.text(),/保存データは変更/);assert.deepEqual(h.network,[]);
});
for(const [label,url,method] of [
  ['他アプリ','https://example.test/another/app.mjs','GET'],
  ['外部URL','https://elsewhere.test/app.mjs','GET'],
  ['個人JSON','https://example.test/lifeplan/private-backup.json','GET'],
  ['POST','https://example.test/lifeplan/app.mjs','POST'],
  ['未知のクエリ','https://example.test/lifeplan/app.mjs?private=1','GET']
])test(`${label}をキャッシュ処理しない`,async()=>{
  const h=harness();const result=await h.fetchRequest(new Request(url,{method}));assert.equal(result.handled,false);assert.equal(h.stores.size,0);assert.deepEqual(h.network,[]);
});
test('インストール済みの画面・全モジュールをオフラインで取得',async()=>{
  const h=harness();await h.run('install');await h.run('activate');h.flags.offline=true;
  for(const request of h.requests){const r=await h.fetchRequest(request);assert.equal(r.handled,true);assert.ok(r.response);}
  assert.equal(h.takeovers(),0);assert.deepEqual(h.network,[]);
});
test('HTTPキャッシュを再利用せず全ファイルを取得、配布ファイルの不足なし',async()=>{
  const h=harness();await h.run('install');assert.equal(h.requests.length,37);
  assert.ok(h.requests.some(r=>r.url===h.scope+'annual-cashflow.mjs'));
  assert.ok(h.requests.some(r=>r.url===h.scope+'annual-csv.mjs'));
  assert.ok(h.requests.some(r=>r.url===h.scope+'full-backup.mjs'));
  for(const module of ['income-preview.mjs','income-workflow.mjs','income-ui.mjs'])assert.ok(h.requests.some(r=>r.url===h.scope+module));
  assert.ok(h.requests.some(r=>r.url===h.scope+'tax-social-audit.mjs'));
  for(const module of ['calendar-mode.mjs','calendar-workflow.mjs','calendar-ui.mjs','salary-life.mjs','salary-workflow.mjs','salary-ui.mjs','state.mjs','migration.mjs','migration-ui.mjs'])assert.ok(h.requests.some(r=>r.url===h.scope+module));
  for(const request of h.requests){assert.equal(request.cache,'reload');const relative=request.url.slice(h.scope.length)||'index.html';assert.ok(fs.existsSync(new URL('./'+relative,import.meta.url)),relative);}
  assert.match(fs.readFileSync(new URL('./app.mjs',import.meta.url),'utf8'),/updateViaCache:'none'/);
});
