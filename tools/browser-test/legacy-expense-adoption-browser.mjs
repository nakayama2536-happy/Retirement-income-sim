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
 evidence.cases.push({id:'backup-and-adoption',status:'pass',backupDownloaded:true});
 await page.reload({waitUntil:'domcontentloaded'});
 await page.locator('#dashboard').waitFor({state:'visible',timeout:30000});
 assert.ok((await state())===JSON.stringify(adopted),'Reload did not change persisted state');
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
