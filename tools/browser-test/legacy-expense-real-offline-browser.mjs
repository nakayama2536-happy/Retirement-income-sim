/** Real Chromium offline launch test of unpublished, isolated bundle.
 * No actual user storage, no public deployment, no remote network.
 */
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=process.argv[2]&&path.resolve(process.argv[2]);
if(!root||!await fs.stat(path.join(root,'sw.js')).then(x=>x.isFile()).catch(()=>false))throw Error('Requires isolated candidate bundle directory');
const mime={'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.png':'image/png','.webmanifest':'application/manifest+json'};
let server,browser;
try{
 server=createServer(async(req,res)=>{
  const filename=new URL(req.url,'http://127.0.0.1').pathname.slice(1)||'index.html';
  if(!/^[\w./-]+$/.test(filename)||filename.startsWith('.')||filename.split('/').includes('..')||filename.startsWith('tools/')){res.writeHead(404);res.end();return;}
  const file=path.resolve(root,filename);
  if(!file.startsWith(root+path.sep)){res.writeHead(404);res.end();return;}
  try{const b=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(b);}
  catch{res.writeHead(404);res.end();}
 });
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 const url='http://127.0.0.1:'+server.address().port+'/';
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({serviceWorkers:'allow'});
 const page=await context.newPage();
 await page.goto(url,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(async()=>{
   const reg=await navigator.serviceWorker.ready;
   const scope=reg.scope;
   const key='lifeplan-sim:'+encodeURIComponent(scope)+':v0.9.39-legacy-expense-unification-20261107';
   const cache=await caches.open(key);
   return (await cache.keys()).length===84;
 },null,{timeout:30000});
 await page.reload({waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller,null,{timeout:20000});
 const prior=await page.evaluate(async()=>{
   const scope=(await navigator.serviceWorker.ready).scope;
   const old='lifeplan-sim:'+encodeURIComponent(scope)+':v0.9.38-complete-numbering-20261107';
   const cache=await caches.open(old);
   await cache.put(scope+'app.mjs',new Response('synthetic-previous-cache'));
   localStorage.setItem('unification-offline-test-marker','fictional-only');
   return old;
 });
 await context.setOffline(true);
 await page.reload({waitUntil:'domcontentloaded',timeout:20000});
 const state=await page.evaluate(async()=>{
   const urls=['./app.mjs','./cashflow-sources.mjs','./expense-unification-coverage.mjs','./lifeplan-expense-unification-adoption-ui.mjs','./annual-csv.mjs','./full-backup.mjs','./styles.css'];
   const responses=await Promise.all(urls.map(u=>fetch(u)));
   const names=await caches.keys();
   const old=names.find(x=>x.endsWith('v0.9.38-complete-numbering-20261107'));
   const saved=old&&await(await caches.open(old)).match('./app.mjs');
   return {version:document.getElementById('appVersion')?.textContent||'',status:responses.map(x=>x.status),cached:responses.every(x=>x.ok),oldRetained:!!saved&&await saved.text()==='synthetic-previous-cache',marker:localStorage.getItem('unification-offline-test-marker'),controlled:!!navigator.serviceWorker.controller,cacheCount:names.length};
 });
 assert.ok(state.version.includes('v0.9.39-legacy-expense-unification-20261107'),JSON.stringify(state));
 assert.equal(state.cached,true,JSON.stringify(state));
 assert.equal(state.oldRetained,true,JSON.stringify(state));
 assert.equal(state.marker,'fictional-only');
 assert.equal(state.controlled,true);
 assert.ok(state.cacheCount>=2);
 console.log(JSON.stringify({suite:'real-chromium-offline-unpublished-bundle',status:'pass',synthetic:true,source:'staged-only',assets:84,oldCacheRetained:true,personalStorageUsed:false}));
 await context.close();
}finally{
 if(browser)await browser.close();
 if(server)await new Promise(ok=>server.close(ok));
}
