/** Synthetic-only browser adoption, backup, reload, undo, comparison and storage checks.
 * Runs on an isolated patched git worktree, never public Pages. */
import {chromium} from 'playwright';
import {createServer} from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(process.argv[2]||'');
assert.ok(process.argv[2]&&root!==path.resolve(here,'../..'));
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lifeplan-unification-save-browser-'));
let server,browser;
const evidence={suite:'legacy-unification-adoption-reload-undo',data:'synthetic-only',published:false,cases:[]};
try{
 const base=JSON.parse(await fs.readFile(path.join(here,'synthetic-full.json'),'utf8'));
 const fixture=structuredClone(base);
 fixture.config.plan.endAge=99;
 fixture.config.budgets=fixture.config.budgets.map(row=>({...row,toAge:99}));
 fixture.config.cashflow.expenseCategories=[{key:'living',label:'生活費',items:[{key:'food',label:'食費',periods:[{fromAge:64,toAge:95,amount:2}]}]}];
 fixture.config.cashflow.detailSourceProfile='public-v0.9';
 const input=path.join(temp,'fictional-full.json');
 await fs.writeFile(input,JSON.stringify(fixture));
 server=createServer(async(req,res)=>{
   const name=new URL(req.url,'http://127.0.0.1').pathname.slice(1)||'index.html';
   if(!/^[A-Za-z0-9_./-]+$/.test(name)||name.startsWith('.')||name.split('/').includes('..')||name.startsWith('tools/')){res.writeHead(404);res.end();return;}
   const file=path.resolve(root,name);
   if(!file.startsWith(root+path.sep)){res.writeHead(404);res.end();return;}
   const mime={'.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.png':'image/png','.webmanifest':'application/manifest+json'};
   try{const b=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(b);}
   catch{res.writeHead(404);res.end();}
 });
 await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
 browser=await chromium.launch({headless:true});
 const context=await browser.newContext({serviceWorkers:'block',acceptDownloads:true});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const url='http://127.0.0.1:'+server.address().port+'/';
 const openExpense=async()=>{
   await page.locator('[data-group="expense"]').click();
   await page.locator('[data-tab="expenses"]').click();
   const c=page.locator('#expenseUnificationReview');await c.waitFor({state:'attached'});
   if(!(await c.evaluate(el=>el.open)))await c.locator('summary').click();
   return c;
 };
 const state=()=>page.evaluate(()=>localStorage.getItem('lifeplan-sim-state-v1'));
 await page.goto(url,{waitUntil:'domcontentloaded'});
 await page.locator('#importFile').setInputFiles(input);
 await page.locator('#dashboard').waitFor({state:'visible',timeout:30000});
 const before=await state();assert.ok(before);
 const card=await openExpense();
 await card.locator('#expenseUnificationAdoption button').nth(0).click();
 const ui=card.locator('#expenseUnificationAdoption');
 const prepared=(await ui.locator('[role="status"]').innerText()).trim();
 assert.match(prepared,/移行候補を作成しました/,prepared);
 const downloadP=page.waitForEvent('download',{timeout:20000});
 await ui.locator('button').nth(1).click();
 const downloaded=await downloadP;
 assert.match(downloaded.suggestedFilename(),/before-legacy-expense-unification/);
 const backupPath=path.join(temp,'pre-migration.json');
 await downloaded.saveAs(backupPath);
 const backup=JSON.parse(await fs.readFile(backupPath,'utf8'));
 assert.equal(backup.config.cashflow.expenseCategories[0].items[0].periods[0].amount,2);
 await ui.locator('input[type="checkbox"]').check();
 await ui.locator('button').nth(2).click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('lifeplan-sim-state-v1')).config.expenseUnificationArchive!=null);
 const adopted=JSON.parse(await state());
 assert.equal(adopted.config.cashflow.detailSourceProfile,'work-v0.9.7');
 assert.equal(adopted.config.cashflow.expenseCategories,undefined);
 assert.equal(adopted.config.expenseUnificationArchive.original.legacy[0].items[0].periods[0].amount,2);
 assert.ok(adopted.config.recoveryCompatibility.requiredFeatures.includes('legacy-expense-unification-v1'));
 assert.deepEqual(adopted.scenarios,JSON.parse(before).scenarios);
 const coverage=await page.evaluate(async()=>{
   const {inspectCashflowSources,resolveBaseAmount}=await import('./cashflow-sources.mjs');
   const cfg=JSON.parse(localStorage.getItem('lifeplan-sim-state-v1')).config;
   const view=inspectCashflowSources(cfg,{sourceProfile:'work-v0.9.7'});
   const match=view.items.find(i=>i.variants.some(v=>v.profile==='work-v0.9.7'&&v.kind==='expense'&&v.key==='food'));
   if(!match)return {error:'FOOD_NOT_FOUND'};
   const a=resolveBaseAmount(view,{itemId:match.itemId,age:95});
   const z=resolveBaseAmount(view,{itemId:match.itemId,age:96});
   return {at95:a.status,amount95:a.amount,at96:z.status,amount96:z.amount,reason96:z.reason};
 });
 assert.deepEqual({at95:coverage.at95,amount95:coverage.amount95,at96:coverage.at96,amount96:coverage.amount96},
   {at95:'resolved',amount95:2,at96:'missing',amount96:null},JSON.stringify(coverage));
 evidence.cases.push({id:'backup-and-adoption',status:'pass',backupDownloaded:true});
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#dashboard').waitFor({state:'visible',timeout:30000});
 assert.ok((await state())===JSON.stringify(adopted),'Reload did not change persisted state');
 const csvComparison=await page.evaluate(async()=>{
   const {annualCsvRows,annualCsvText}=await import('./annual-csv.mjs');
   const cfg=JSON.parse(localStorage.getItem('lifeplan-sim-state-v1')).config;
   const rows=annualCsvRows(cfg,{sourceProfile:'work-v0.9.7'});
   const find=age=>rows.find(x=>x.age===age);
   const r95=find(95),r96=find(96);
   const text=annualCsvText(cfg,{sourceProfile:'work-v0.9.7'});
   return {r95,r96,startsBom:text.startsWith('\uFEFF'),containsStandard:text.includes('Work v0.9.7形式'),lineCount:text.split('\r\n').length-1};
 });
 assert.ok(csvComparison.r95&&csvComparison.r96,'CSV must include ages 95 and 96');
 assert.equal(csvComparison.r95.managementExpense,csvComparison.r96.managementExpense,'Migration must not change adopted management budget');
 assert.ok(csvComparison.r95.referenceKnownSubtotal>0,'Registered age 95 detail must remain known');
 assert.equal(csvComparison.r96.referenceKnownSubtotal,0,'Unregistered age 96 detail must not be invented');
 assert.ok(csvComparison.r96.unresolvedMonthCount>0,'Missing age 96 must remain unresolved');
 assert.equal(csvComparison.startsBom,true);
 assert.equal(csvComparison.containsStandard,true);
 assert.ok(csvComparison.lineCount>30);
 evidence.cases.push({id:'reload-annual-csv-95-96',status:'pass',missing96Unresolved:true});
 const card2=await openExpense();
 await card2.locator('#expenseUnificationAdoption button').nth(3).click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('lifeplan-sim-state-v1')).config.expenseUnificationArchive===undefined);
 const restored=JSON.parse(await state());
 assert.equal(restored.config.cashflow.expenseCategories[0].items[0].periods[0].amount,2);
 assert.equal(restored.config.cashflow.detailSourceProfile,'public-v0.9');
 assert.equal(restored.config.expenseUnificationCandidate,undefined);
 assert.deepEqual(restored.scenarios,JSON.parse(before).scenarios);
 evidence.cases.push({id:'reload-and-targeted-undo',status:'pass',settingsRestored:true});
 assert.deepEqual(errors,[],'Browser page errors: '+errors.join(' | '));
 await context.close();
}finally{
 if(browser)await browser.close();
 if(server)await new Promise(ok=>server.close(ok));
 await fs.mkdir(path.join(here,'browser-results'),{recursive:true});
 await fs.writeFile(path.join(here,'browser-results','legacy-expense-adoption.json'),JSON.stringify(evidence,null,2)+'\n');
 await fs.rm(temp,{recursive:true,force:true});
}
