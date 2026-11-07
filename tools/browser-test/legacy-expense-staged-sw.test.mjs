/** Isolated actual staged Service Worker VM tests.
 * The candidate must exist on disk and contain sw.js + its complete runtime.
 * Never access personal storage or alter the candidate directory.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
const dir=process.env.LIFEPLAN_STAGE_DIR&&path.resolve(process.env.LIFEPLAN_STAGE_DIR);
if(!dir||!fs.existsSync(path.join(dir,'sw.js')))throw Error('Candidate directory with sw.js is required');
const sw=fs.readFileSync(path.join(dir,'sw.js'),'utf8');
const scope='https://example.test/lifeplan-isolated/';
const prefix='lifeplan-sim:'+encodeURIComponent(scope)+':';
const version='v0.9.39-legacy-expense-unification-20261107';
function harness(){
 const stores=new Map(),hooks={},network=[],deleted=[],flags={failInstall:false,partial:false},readOnlyPersonal={reads:0};
 const key=x=>typeof x==='string'?x:x.url;
 const caches={
  open:async name=>({
   addAll:async requestList=>{
    if(flags.failInstall)throw Error('OFFLINE_DOWNLOAD_FAILURE');
    const values=new Map(requestList.map(req=>[key(req),new Response('cached:'+key(req))]));
    if(flags.partial)values.delete(key(requestList.at(-1)));
    stores.set(name,values);
   },
   match:async req=>stores.get(name)?.get(key(req))
  }),
  delete:async name=>{deleted.push(name);return stores.delete(name);},
  match:()=>{throw Error('ORIGIN_WIDE_CACHE_NOT_ALLOWED')},
  keys:async()=>[...stores.keys()]
 };
 const self={registration:{scope},addEventListener:(n,fn)=>hooks[n]=fn,skipWaiting:()=>{throw Error('FORCED_TAKEOVER')},clients:{claim:()=>{throw Error('FORCED_CLAIM')}}};
 const ctx={self,caches,URL,Request,Response,fetch:async req=>{network.push(key(req));throw Error('OFFLINE')}};
 Object.defineProperty(ctx,'localStorage',{get(){readOnlyPersonal.reads++;throw Error('PERSONAL_STORAGE_ACCESS')}});
 Object.defineProperty(ctx,'indexedDB',{get(){readOnlyPersonal.reads++;throw Error('PERSONAL_DATABASE_ACCESS')}});
 vm.runInNewContext(sw,ctx,{filename:'unpublished-sw.js'});
 const run=async name=>{let done;hooks[name]({waitUntil:p=>done=p});if(!done)throw Error('NO_WAIT_UNTIL');return await done;};
 const request=async url=>{let result;hooks.fetch({request:new Request(url),respondWith:p=>result=p});return result?{handled:true,response:await result}:{handled:false}};
 return {stores,hooks,network,deleted,flags,readOnlyPersonal,run,request,key};
}
test('candidate identity and package contents align with SW',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(dir,'distribution-manifest.json'),'utf8'));
 const rel=JSON.parse(fs.readFileSync(path.join(dir,'release-info.json'),'utf8'));
 assert.equal(manifest.runtime,version);assert.equal(rel.appBuild,version);
 assert.match(sw,/const CACHE=[^\n]+v0\.9\.39-legacy-expense-unification-20261107/);
 assert.equal(manifest.files.length,86);
 for(const f of manifest.files)assert.ok(fs.existsSync(path.join(dir,f.name)),f.name);
 for(const module of ['expense-unification-coverage.mjs','lifeplan-expense-unification-adoption-ui.mjs','lifeplan-expense-unification-transaction.mjs'])assert.ok(manifest.files.some(f=>f.name===module));
});
test('failed new version install preserves old cache and no personal storage touches',async()=>{
 const h=harness(),old=prefix+'v0.9.38-complete-numbering-20261107';
 const original=new Map([[scope+'app.mjs',new Response('old-release')]]);
 h.stores.set(old,original);h.flags.failInstall=true;
 await assert.rejects(h.run('install'),/OFFLINE_DOWNLOAD_FAILURE/);
 assert.equal(h.stores.get(old),original);assert.deepEqual(h.deleted,[]);
 assert.equal(h.readOnlyPersonal.reads,0);
});
test('incomplete new cache refuses activation and retains old files',async()=>{
 const h=harness(),old=prefix+'v0.9.38-complete-numbering-20261107';
 h.stores.set(old,new Map([[scope+'app.mjs',new Response('old-release')]]));
 h.flags.partial=true;
 await assert.rejects(h.run('install'),/不足/);
 assert.equal(await h.stores.get(old).get(scope+'app.mjs').text(),'old-release');
 assert.deepEqual(h.deleted,[]);
});
test('complete staged offline install serves only its own 84 resources',async()=>{
 const h=harness(),old=prefix+'v0.9.38-complete-numbering-20261107',oldMap=new Map([[scope+'app.mjs',new Response('old-release')]]);
 h.stores.set(old,oldMap);
 await h.run('install');await h.run('activate');
 const name=prefix+version;
 const current=h.stores.get(name);
 assert.ok(current);assert.equal(current.size,84);
 for(const url of current.keys()){
  const result=await h.request(url);
  assert.equal(result.handled,true);
  assert.equal(await result.response.text(),'cached:'+url);
 }
 assert.equal(h.stores.get(old),oldMap);
 assert.deepEqual(h.deleted,[]);
 assert.deepEqual(h.network,[]);
 assert.equal(h.readOnlyPersonal.reads,0);
});
test('missing module does not silently mix old and new caches',async()=>{
 const h=harness();await h.run('install');const name=prefix+version;
 h.stores.get(name).delete(scope+'cashflow-sources.mjs');
 h.stores.set(prefix+'v0.9.38-complete-numbering-20261107',new Map([[scope+'cashflow-sources.mjs',new Response('legacy')]]));
 const x=await h.request(scope+'cashflow-sources.mjs');
 assert.equal(x.response.status,503);assert.deepEqual(h.network,[]);assert.deepEqual(h.deleted,[]);
});
test('unrelated and personal URLs are excluded',async()=>{
 const h=harness();
 for(const url of ['https://example.test/unrelated/app.mjs',scope+'personal-backup.json',scope+'app.mjs?other=1']){
  const x=await h.request(url);assert.equal(x.handled,false);
 }
 assert.equal(h.stores.size,0);assert.deepEqual(h.deleted,[]);assert.equal(h.readOnlyPersonal.reads,0);
});
