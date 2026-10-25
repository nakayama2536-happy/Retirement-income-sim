import {validateAgeInputUi} from './age-input-case.mjs';
import {validateUnemploymentUi} from './unemployment-case.mjs';
import {validateWithdrawalUi} from './withdrawal-case.mjs';
import {validateFullPlanUi} from './full-plan-case.mjs';
import {validateDetailUi,validateLaborTrendUi} from './detail-case.mjs';
// Runs only against fresh, loopback-only fixtures and synthetic input.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import {createTestServer} from './server.mjs';
import {dateWithAge} from '../../date-display.mjs';
import {APP_BUILD} from '../../backup-compatibility.mjs';
const here=path.dirname(fileURLToPath(import.meta.url));
const out=path.join(here,'browser-results');
await fs.mkdir(out,{recursive:true});
const report={date:new Date().toISOString(),scope:'same-build lifecycle and pinned current-main to PR-candidate compatibility',cases:[],status:'not-run'};
const normalize=x=>{const y=structuredClone(x);delete y.exportedAt;return y;};
async function openTab(page,id){
 const button=page.locator(`[data-tab="${id}"]`);const group=await button.getAttribute('data-group-item');
 if(group)await page.locator(`[data-group="${group}"]`).click();await button.click();
}
async function snapshot(page){
 const home=await page.evaluate(()=>Object.fromEntries(['currentAsset','finalAsset','finalThreshold','reserve','afterReserve','safeAssetMinimum','reserveUsedThreshold'].map(id=>[id,document.getElementById(id).textContent])));
 await openTab(page,'scenarios');
 const scenarios=await page.locator('.scenario-check').evaluateAll(nodes=>nodes.map(n=>({id:n.querySelector('input').dataset.scenarioSelect,selected:n.querySelector('input').checked,name:n.querySelector('strong').firstChild.textContent.trim()})));
 const comparison=await page.locator('#scenarioCompare tbody tr').evaluateAll(rows=>rows.map(row=>[...row.querySelectorAll('td')].map(cell=>cell.textContent)));
 const hasDedicatedBackupTab=(await page.locator('[data-tab="backup"]').count())===1;
 await openTab(page,hasDedicatedBackupTab?'backup':'settings');
 assert.equal(await page.locator(hasDedicatedBackupTab?'#backup #exportFullBtn':'#settings #exportFullBtn').count(),1,'backup export stays in the correct old/new tab');
 const pending=page.waitForEvent('download');
 await page.locator('#exportFullBtn').click();
 const download=await pending;
 const stream=await download.createReadStream();const chunks=[];
 for await(const chunk of stream)chunks.push(chunk);
 const data=JSON.parse(Buffer.concat(chunks).toString());
 // Date formatting intentionally changes. Check both expected representations
 // before canonicalizing only those cells; preserve all amounts and settings.
 const selected=data.scenarios.filter(s=>s.selected).slice(0,3);
 for(const row of comparison){
  if(!['本人バイト終了','本人年金開始'].includes(row[0]))continue;
  selected.forEach((s,i)=>{
   const raw=(row[0]==='本人バイト終了'?s.config.employment?.primary?.sideWork?.endDate:s.config.income?.pensions?.primary?.startDate)?.slice(0,7);
   assert.ok([raw||'—',dateWithAge(raw,s.config)].includes(row[i+1]));
   row[i+1]=raw||null;
  });
 }
 // Missing targets intentionally change from the old implicit 0 to 未設定.
 // Verify that exact display separately, retaining all numeric/storage checks.
 if(!Object.hasOwn(data.config.management?.thresholds??{},data.config.plan.endAge)){
  const candidate=await page.locator('#finalTargetLabel').count();
  assert.equal(home.finalThreshold,candidate?'未設定':'0万円');
  home.finalThreshold=null;
 }
 // Preserve the original snapshot helper's postcondition for existing tests.
 if(hasDedicatedBackupTab)await openTab(page,'settings');
 return {home,scenarios,comparison,data:normalize(data)};
}
async function open(context,url){
 const page=await context.newPage();page.setDefaultTimeout(15000);
 await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});await page.locator('#importFile').waitFor({state:'attached'});
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
  // Playwright does not promise serviceWorkers() ordering. Identify the
  // candidate by the cache token injected by this isolated test server.
  let candidate=null;
  if(mode==='new'){
   for(const worker of context.serviceWorkers()){
    if((await worker.evaluate(()=>CACHE)).endsWith('isolated-test-new')){candidate=worker;break;}
   }
   assert(candidate,'new worker must be identified before closing the old client');
  }
  await page.close();
  if(candidate)await candidate.evaluate(async()=>{
   const end=Date.now()+15000;
   // The old active worker can still appear in this registration snapshot.
   // Require the identified candidate's own activation event as well.
   while(!self.__TEST_ACTIVATION_STARTED||self.registration.active?.state!=='activated'||self.registration.waiting){
    if(Date.now()>end)throw Error('activation timeout');
    await new Promise(r=>setTimeout(r,100));
   }
  });
  await context.setOffline(true);
  page=await open(context,fixture.url);
  await page.locator('#dashboard').waitFor({state:'visible'});
  const after=await snapshot(page);
  if(id==='C1'){
   // A new app release must correctly mark the producer of its newly exported backup.
   // Only this expected provenance change is excluded from the stored-plan comparison.
   assert.equal(before.data.recoveryCompatibility.producerBuild,'v0.9.7-i08-recovery-1');
   assert.equal(after.data.recoveryCompatibility.producerBuild,APP_BUILD);
   // New optional 100-year comparison rows extend the display without changing
   // the previously persisted 95-year figures. Check the new rows first, then
   // compare all existing rows and saved state exactly as before.
   const age100Labels=['最終評価年齢','各案の最終年齢末資産（評価年齢に注意）','100歳末資産'];
   const extra=after.comparison.filter(row=>age100Labels.includes(row[0]));
   assert.deepEqual(extra.map(row=>row[0]),age100Labels);
   assert.equal(extra[0][1],'95歳末');
   assert.equal(extra[2][1],'対象外');
   const withoutProducer=snapshot=>{
    const copy=structuredClone(snapshot);
    delete copy.data.recoveryCompatibility.producerBuild;
    copy.comparison=copy.comparison.filter(row=>!age100Labels.includes(row[0]));
    return copy;
   };
   assert.deepEqual(withoutProducer(after),withoutProducer(before));
  }else assert.deepEqual(after,before);
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
  await openTab(page,'home');await page.screenshot({path:path.join(out,id+'.png'),fullPage:true});
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
   await openTab(page,'backup');
   const backup=page.locator('article').filter({has:page.locator('#exportFullBtn')});
   const recovery=page.locator('article').filter({has:page.locator('#recoveryCheckResult')});
   await page.locator('#recoveryCheckResult').evaluate(n=>{for(let p=n.parentElement;p;p=p.parentElement)if(p.tagName==='DETAILS')p.open=true;});
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

async function validateHomeUi(browser){
 const fixture=await createTestServer();const context=await browser.newContext({acceptDownloads:true});
 const record={id:'S1',status:'running',scope:'simulation home, pending navigation and storage preservation'};report.cases.push(record);
 try{
  const data=JSON.parse(await fs.readFile(path.join(here,'synthetic-full.json'),'utf8'));
  data.config.income.pensions.spouse.certainty='unknown';
  data.config.retirement={...data.config.retirement,majorSpendDetailStatus:'pending'};
  data.config.care={...data.config.care,facilityRoomType:''};
  data.config.taxPolicy={...data.config.taxPolicy,rulesAsOf:'2026-01-01'};
  data.config.management.thresholds={'80':900,'95':500};
  data.config.actuals={'70':{endAsset:920}};
  const file=path.join(out,'home-synthetic.json');await fs.writeFile(file,JSON.stringify(data));
  const page=await open(context,fixture.url);await load(page,file);
  const before=(await snapshot(page)).data;
  for(const width of [390,1280]){
   await page.setViewportSize({width,height:900});await openTab(page,'home');
   assert(!(await page.locator('#migrationPanel').isVisible()));
   assert(!(await page.locator('[data-tab="actuals"]').isVisible()));
   assert(!(await page.locator('.forecast-card').isVisible()));
   assert.deepEqual(await page.locator('#keyAges').locator('xpath=../thead/tr/th').allTextContents(),['年齢末','目標資産額','予測資産額','差額']);
   assert((await page.locator('#simulationPeriod').innerText()).includes('保存済みの計画'));
   assert.equal(await page.locator('#finalThreshold').innerText(),'500万円');
   assert.equal(await page.locator('#status').innerText(),'達成');
   assert((await page.locator('#targetStatusNote').innerText()).includes('80歳末'));
   const card=page.locator('.target-overview');const box=await card.boundingBox();assert(box&&box.x>=0&&box.x+box.width<=width+1);
   const amounts=await page.locator('#finalAsset,#finalThreshold,#finalMargin,#currentAsset,#reserve').evaluateAll(nodes=>nodes.map(n=>({size:getComputedStyle(n).fontSize,width:n.clientWidth,scroll:n.scrollWidth})));
   assert.equal(new Set(amounts.map(n=>n.size)).size,1);assert(amounts.every(n=>n.scroll<=n.width+1));
   const cards=await page.locator('#currentAsset,#reserve').evaluateAll(nodes=>nodes.map(n=>n.parentElement.getBoundingClientRect().width));assert(Math.abs(cards[0]-cards[1])<1);
   await page.screenshot({path:path.join(out,'S1-home-'+width+'.png'),fullPage:true});
  }
  for(const id of ['spousePensionAmount','initialAssetInput','expenseKind','ruleCards']){
   await openTab(page,'home');
   await page.locator('#home details.home-pending').evaluate(el=>el.open=true);
   await page.locator(`[data-focus-target="${id}"]`).click();
   assert(await page.locator('#'+id).isVisible());assert.equal(await page.evaluate(()=>document.activeElement.id),id);
  }
  await openTab(page,'settings');await page.locator('#settingsGroup-maintenance').evaluate(el=>el.open=true);await page.locator('#showActuals').check();
  assert(await page.locator('[data-tab="actuals"]').isVisible());
  await openTab(page,'home');assert(await page.locator('.forecast-card').isVisible());
  await openTab(page,'settings');await page.locator('#settingsGroup-maintenance').evaluate(el=>el.open=true);await page.locator('#showActuals').uncheck();
  assert.deepEqual((await snapshot(page)).data,before);
  await page.reload({waitUntil:'domcontentloaded'});await page.locator('#dashboard').waitFor({state:'visible'});
  assert(!(await page.locator('[data-tab="actuals"]').isVisible()));
  assert.deepEqual((await snapshot(page)).data,before);
  record.status='pass';
 }catch(e){record.status='failed-or-harness-error';record.error=e.stack;throw e;}
 finally{await context.close();await fixture.close();}
}

async function validatePensionUi(browser){
 const fixture=await createTestServer();const context=await browser.newContext({acceptDownloads:true});
 const record={id:'P1',status:'running',scope:'age labels, pension estimate, draft/reset/apply, synthetic data'};report.cases.push(record);
 try{
  const data=JSON.parse(await fs.readFile(path.join(here,'synthetic-full.json'),'utf8'));
  data.config.income.pensions.primary={startDate:'2050-01-01',annualAtStart:170.4,certainty:'official_estimate',alternatives:{65:120}};
  const file=path.join(out,'pension-synthetic.json');await fs.writeFile(file,JSON.stringify(data));
  const page=await open(context,fixture.url);await load(page,file);
  const before=(await snapshot(page)).data;
  for(const width of [390,1280]){
   await page.setViewportSize({width,height:900});await openTab(page,'pension');
   await page.locator('#primaryPensionMonth').fill('2051-01');
   assert((await page.locator('#primaryPensionMonthAge').innerText()).includes('本人71歳'));
   assert((await page.locator('#primaryPensionEstimate').innerText()).includes('180.48'));
   await page.locator('#primaryPensionUseEstimate').click();
   assert.equal(await page.locator('#primaryPensionAmount').inputValue(),'180.48');
   await page.locator('#pensionForm button[type="submit"]').click();
   assert(await page.locator('#pensionPreview').isVisible());
   assert.deepEqual((await snapshot(page)).data,before);
   await openTab(page,'pension');
   const card=page.locator('#pensionForm');await card.scrollIntoViewIfNeeded();
   assert(await card.evaluate(n=>n.scrollWidth<=n.clientWidth+1));
   for(const id of ['primaryPensionMonth','primaryPensionUseEstimate','pensionReset']){
    const box=await page.locator('#'+id).boundingBox();assert(box&&box.x>=0&&box.x+box.width<=width+1);
   }
   await card.screenshot({path:path.join(out,'P1-pension-'+width+'.png')});
   await page.locator('#pensionReset').click();
   assert.equal(await page.locator('#primaryPensionMonth').inputValue(),'2050-01');
   assert.equal(await page.locator('#primaryPensionAmount').inputValue(),'170.4');
  }
  await page.locator('#primaryPensionMonth').fill('2051-01');await page.locator('#primaryPensionUseEstimate').click();
  await page.locator('#pensionForm button[type="submit"]').click();await page.locator('#pensionApply').click();
  const after=(await snapshot(page)).data;
  assert.equal(after.config.income.pensions.primary.annualAtStart,180.48);
  assert.equal(after.config.income.pensions.primary.startDate,'2051-01-01');
  assert.deepEqual(after.scenarios,before.scenarios);
  await openTab(page,'pension');await page.locator('#pensionUndo').click();
  const undone=(await snapshot(page)).data;
  assert.equal(undone.config.income.pensions.primary.annualAtStart,170.4);
  assert.deepEqual(undone.scenarios,before.scenarios);
  record.status='pass';
 }catch(e){record.status='failed-or-harness-error';record.error=e.stack;throw e;}
 finally{await context.close();await fixture.close();}
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
 await validateHomeUi(browser);
 await validatePensionUi(browser);
 try{report.cases.push(await validateDetailUi({browser,createTestServer,open,load,openTab,snapshot,here,out,fs,path}));}catch(e){if(e.detailRecord)report.cases.push(e.detailRecord);throw e;}
 try{report.cases.push(await validateAgeInputUi({browser,createTestServer,open,load,openTab,snapshot,here,out,fs,path}));}catch(e){if(e.detailRecord)report.cases.push(e.detailRecord);throw e;}
 try{report.cases.push(await validateLaborTrendUi({browser,createTestServer,open,load,openTab,snapshot,here,out,fs,path}));}catch(e){if(e.detailRecord)report.cases.push(e.detailRecord);throw e;}
 try{report.cases.push(await validateUnemploymentUi({browser,createTestServer,open,load,openTab,snapshot,here,out,fs,path}));}catch(e){if(e.detailRecord)report.cases.push(e.detailRecord);throw e;}
 try{report.cases.push(await validateWithdrawalUi({browser,createTestServer,open,load,openTab,snapshot,here,out,fs,path}));}catch(e){if(e.detailRecord)report.cases.push(e.detailRecord);throw e;}
 try{report.cases.push(await validateFullPlanUi({browser,createTestServer,open,load,openTab,snapshot,here,out,fs,path}));}catch(e){if(e.detailRecord)report.cases.push(e.detailRecord);throw e;}
 report.status='completed';
}catch(e){report.status=browser?'incomplete':'environment-blocked';report.error=String(e);process.exitCode=2;}
finally{if(browser)await browser.close();await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,cases:report.cases.map(x=>({id:x.id,status:x.status}))}));}
