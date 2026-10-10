// Runs only against fresh, loopback-only fixtures and synthetic input.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {createTestServer} from './server.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const out=path.join(here,'browser-results');
await fs.mkdir(out,{recursive:true});
const report={date:new Date().toISOString(),scope:'same-build lifecycle and pinned current-main to PR-candidate compatibility',cases:[],status:'not-run'};
const normalize=x=>{const y=structuredClone(x);delete y.exportedAt;return y;};
async function snapshot(page){
 const home=await page.locator('#home .hero-grid').innerText();
 await page.locator('[data-tab="scenarios"]').click();
 const scenarios=await page.locator('#scenarioList').innerText();
 const comparison=await page.locator('#scenarioCompare').innerText();
 await page.locator('[data-tab="settings"]').click();
 const pending=page.waitForEvent('download');
 await page.locator('#exportFullBtn').click();
 const download=await pending;
 const stream=await download.createReadStream();const chunks=[];
 for await(const chunk of stream)chunks.push(chunk);
 const data=JSON.parse(Buffer.concat(chunks).toString());
 return {home,scenarios,comparison,data:normalize(data)};
}
async function open(context,url){
 const page=await context.newPage();page.setDefaultTimeout(15000);
 await page.goto(url);await page.locator('#importFile').waitFor({state:'attached'});
 return page;
}
async function load(page,file){
 await page.locator('#importFile').setInputFiles(file);
 await page.locator('#dashboard').waitFor({state:'visible'});
}
async function swReady(page){
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
 await page.reload();
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
}
async function state(page){return page.evaluate(async()=>{
 const r=await navigator.serviceWorker.getRegistration();
 return {controller:navigator.serviceWorker.controller?.scriptURL,active:r?.active?.state,waiting:r?.waiting?.state,caches:await caches.keys()};
});}
async function update(page){return page.evaluate(async()=>{
 const r=await navigator.serviceWorker.getRegistration();
 window.__oldWorker=navigator.serviceWorker.controller;window.__candidateState=null;
 r.addEventListener('updatefound',()=>{const w=r.installing;if(w){window.__candidateState=w.state;w.addEventListener('statechange',()=>window.__candidateState=w.state);}});
 try{await r.update();return {ok:true};}catch(e){return {ok:false,error:String(e)};}
});}
async function run(browser,id,mode){
 const fixture=await createTestServer({crossRelease:id==='C1'});
 const context=await browser.newContext({acceptDownloads:true,serviceWorkers:'allow'});
 const record={id,status:'running'};report.cases.push(record);
 try{
  let page=await open(context,fixture.url);
  await load(page,path.join(here,'synthetic-full.json'));await swReady(page);
  const before=await snapshot(page);record.before=await state(page);
  assert(record.before.caches.some(x=>x.endsWith('isolated-test-old')));
  fixture.setMode(mode);record.update=await update(page);
  if(mode==='new'){
   assert(record.update.ok);
   await page.waitForFunction(async()=>!!(await navigator.serviceWorker.getRegistration())?.waiting);
   assert(await page.evaluate(()=>navigator.serviceWorker.controller===window.__oldWorker));
   record.waiting=await state(page);
  }else if(mode==='asset-failure'){
   await page.waitForFunction(()=>window.__candidateState==='redundant');
   assert(fixture.log.some(x=>x.path==='/calc.mjs'&&x.status===503));
  }else{
   assert(!record.update.ok);
   assert(fixture.log.some(x=>x.path==='/sw.js'&&x.status===503));
  }
  // Probe is outside SW scope, so closing the application releases all clients.
  const probe=await context.newPage();await probe.goto('about:blank');
  const candidate=mode==='new'?context.serviceWorkers().at(-1):null;
  await page.close();
  if(candidate)await candidate.evaluate(async()=>{
   const end=Date.now()+15000;
   while(self.registration.active?.state!=='activated'||self.registration.waiting){
    if(Date.now()>end)throw Error('activation timeout');
    await new Promise(r=>setTimeout(r,100));
   }
  });
  await context.setOffline(true);
  page=await open(context,fixture.url);
  await page.locator('#dashboard').waitFor({state:'visible'});
  const after=await snapshot(page);assert.deepEqual(after,before);
  record.after=await state(page);
  assert(record.after.caches.some(x=>x.endsWith('isolated-test-old')));
  record.controllerCache=await page.evaluate(()=>new Promise((resolve,reject)=>{
   const channel=new MessageChannel();const timer=setTimeout(()=>reject(Error('controller identity timeout')),5000);
   channel.port1.onmessage=e=>{clearTimeout(timer);resolve(e.data);};
   navigator.serviceWorker.controller.postMessage('TEST_CACHE_ID',[channel.port2]);
  }));
  assert(record.controllerCache.endsWith(mode==='new'?'isolated-test-new':'isolated-test-old'));
  await fs.writeFile(path.join(out,id+'-before.json'),JSON.stringify(before,null,2));
  await fs.writeFile(path.join(out,id+'-after.json'),JSON.stringify(after,null,2));
  await page.locator('[data-tab="home"]').click();await page.screenshot({path:path.join(out,id+'.png'),fullPage:true});
  if(id==='U1'||id==='C1'){
   await context.setOffline(false);
   const restoreServer=await createTestServer({crossRelease:id==='C1'});const restoreContext=await browser.newContext({acceptDownloads:true});
   try{
    const backup=path.join(out,'recovery-input.json');await fs.writeFile(backup,JSON.stringify(before.data));
    const restoredPage=await open(restoreContext,restoreServer.url);await load(restoredPage,backup);
    assert.deepEqual(await snapshot(restoredPage),before);
    report.cases.push({id:id==='C1'?'C1-R':'R1',status:'pass',scope:'corresponding pre-update backup restored into original body, separate origin'});
   }finally{await restoreContext.close();await restoreServer.close();}
  }
  if(id==='C1'){
   await page.locator('[data-tab="settings"]').click();
   const backup=page.locator('article').filter({has:page.locator('#exportFullBtn')});
   const recovery=page.locator('article').filter({has:page.locator('#recoveryCheckResult')});
   record.layout=[];
   for(const width of [390,1280]){
    await page.setViewportSize({width,height:900});
    for(const [name,card,expected] of [['backup',backup,'未反映の下書き'],['recovery',recovery,'復元は行いません']]){
     assert((await card.innerText()).includes(expected));
     await card.scrollIntoViewIfNeeded();
     const bounds=await card.boundingBox();
     assert(bounds&&bounds.x>=0&&bounds.x+bounds.width<=width+1);
     await card.screenshot({path:path.join(out,'C1-'+width+'-'+name+'.png')});
     record.layout.push({width,name,bounds,status:'pass'});
    }
   }
  }
  record.status='pass';
 }catch(e){record.status='failed-or-harness-error';record.error=e.stack;throw e;}
 finally{record.serverLog=fixture.log;await context.close();await fixture.close();}
}
let browser;
try{
 const modulePath=process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES;
 const {chromium}=modulePath?await import(pathToFileURL(path.join(modulePath,'playwright/index.mjs'))):await import('playwright');
 const executablePath=process.env.LIFEPLAN_TEST_BROWSER;
 if(executablePath)await fs.access(executablePath);
 browser=await chromium.launch({headless:true,...(executablePath?{executablePath}:{})});
 report.browser=browser.version();
 for(const [id,mode] of [['U1','new'],['U2','asset-failure'],['U3','worker-failure'],['C1','new']])await run(browser,id,mode);
 report.status='completed';
}catch(e){report.status=browser?'incomplete':'environment-blocked';report.error=String(e);process.exitCode=2;}
finally{if(browser)await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,cases:report.cases.map(x=>({id:x.id,status:x.status}))}));}
