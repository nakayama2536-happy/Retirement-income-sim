// Actual full-app rendering checks for the seven user UX improvement requests.
// Synthetic local storage only. No Firebase logon, no personal data, no deploy.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright';
const root=resolve('.'),out=resolve('ux-review-browser-evidence');
await mkdir(out,{recursive:true});
const fixture=JSON.parse(await readFile('tools/browser-test/synthetic-full.json','utf8'));
fixture.config.plan.endAge=95;
const report={scope:'seven UX requests / full app / synthetic 95-year plan / no external network',status:'running',cases:[]};
const mark=name=>{report.cases.push({name,status:'pass'});console.log('UX_REVIEW_PASS '+name);};
const server=createServer(async(req,res)=>{
 try{
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  const loc=new URL(req.url,'http://localhost'),target=resolve(root,'.'+(loc.pathname==='/'?'/index.html':decodeURIComponent(loc.pathname)));
  const type={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.ico':'image/x-icon'};
  if(!target.startsWith(root+sep)||!type[extname(target)]||target.includes('/.git/')){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':type[extname(target)],'Cache-Control':'no-store'});res.end(await readFile(target));
 }catch{res.writeHead(404);res.end();}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const origin='http://127.0.0.1:'+server.address().port;
let browser,context;
try{
 browser=await chromium.launch({headless:true});report.browser=browser.version();
 context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 const blocked=[],errors=[];
 await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();blocked.push(route.request().url());return route.abort();});
 await context.addInitScript(seed=>{if(localStorage.getItem('lifeplan-sim-state-v1')===null)localStorage.setItem('lifeplan-sim-state-v1',JSON.stringify(seed));},fixture);
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 const snapshot=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lifeplan-sim-state-v1')));
 const openTab=async(group,tab)=>{await page.locator(`[data-group="${group}"]`).click();await page.locator(`[data-tab="${tab}"]`).click();};
 await page.goto(origin,{waitUntil:'networkidle'});await page.locator('#dashboard').waitFor({state:'visible'});
 const before=await snapshot(),beforeEnd=before.config.plan.endAge;
 assert.equal(beforeEnd,95);
 assert.equal(await page.locator('.topbar h1').innerText(),'ライフプランシミュレーター');
 assert.equal(await page.locator('.topbar p').count(),0);
 assert.match(await page.locator('#appVersion').innerText(),/^v0\.9\.23-family-results-meaning-20261031（端末で実行中）$/);
 assert.match(await page.locator('#rulesVersion').innerText(),/2026-09-24/);
 assert.match(await page.locator('#cloudDataSavedAt').innerText(),/未確認/);
 mark('concise-header-build-rule-date-and-unverified-cloud-time');
 assert.equal(await page.locator('.simulation-context').count(),0);
 assert.match(await page.locator('#simulationPeriod').innerText(),/現在の計画/);
 mark('compact-home-replaces-large-current-simulation-banner');
 assert.equal(await page.locator('#initialAssetLabel').innerText(),`${before.config.plan.startAge-1}歳期末資産`);
 assert.match(await page.locator('#initialAssetHelp').innerText(),/計算開始残高/);
 assert.equal(await page.locator('#home details.home-explanation').count(),4);
 assert.equal(await page.locator('#home .home-pending > summary #pendingCount').count(),1);
 assert.deepEqual(await snapshot(),before,'home label/disclosures must not alter adopted state');
 mark('ux-request-previous-age-year-end-and-individual-home-disclosures');
 await openTab('results','cashflow');
 for (const width of [390,1280]) {
   await page.setViewportSize({width,height:900});
   const table=page.locator('.cashflow-table-scroll');
   const column=page.locator('#yearCashflowTable tbody tr:first-child td:first-child');
   const colX=(await column.boundingBox()).x;
   await table.evaluate(el=>el.scrollLeft=420);
   assert(Math.abs((await column.boundingBox()).x-colX)<2,'sticky age column '+width);
   const header=page.locator('#yearCashflowTable thead th').first();
   const top=(await header.boundingBox()).y;
   await table.evaluate(el=>el.scrollTop=350);
   assert(Math.abs((await header.boundingBox()).y-top)<2,'sticky year header '+width);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'annual table overflow '+width);
   await page.screenshot({path:resolve(out,`ux-request-year-table-${width}.png`),fullPage:true});
 }
 await openTab('income','salary');
 const steps=page.locator('#salaryInputs details.salary-step');
 assert.equal(await steps.count(),4);
 assert.equal(await steps.nth(0).evaluate(el=>el.open),true);
 await steps.nth(1).locator('summary').click();
 assert.equal(await steps.nth(1).evaluate(el=>el.open),true);
 assert.deepEqual(await snapshot(),before,'salary accordion must not save');
 mark('ux-request-sticky-annual-head-and-salary-disclosures');
 await openTab('manage','settings');
 const expected=['finance','goals','compare','maintenance'];
 const groups=page.locator('#settings > .settings-category');
 assert.deepEqual(await groups.evaluateAll(ns=>ns.map(n=>n.dataset.settingsGroup)),expected);
 assert.equal(await page.locator('#settings #settingsGroup-backup').count(),0);
 assert.equal(await page.locator('#backup #settingsGroup-backup').count(),1);
 assert.equal(await page.locator('#settingsGroup-finance').evaluate(n=>n.open),false);
 await page.locator('#settingsGroup-finance > summary').click();
 assert(await page.locator('#settingsForm').isVisible());
 await page.locator('#settingsGroup-finance > summary').click();
 mark('settings-top-level-collapsible-sections-preserve-original-controls');
 await page.locator('#settingsGroup-goals > summary').click();
 const goal=page.locator('#detail-goal form');
 assert.equal(await goal.locator('[name=age] option[value="100"]').count(),1);
 await goal.locator('[name=age]').selectOption('100');
 assert.match(await goal.locator('[data-goal-period-hint]').innerText(),/現在の計算対象外/);
 await goal.locator('[name=amount]').fill('2345');
 await goal.locator('button[type=submit]').click();
 await page.locator('#detail-goal [data-apply]').waitFor({state:'visible'});
 assert.deepEqual(await snapshot(),before,'goal preview must not save');
 mark('age-100-goal-offered-when-current-horizon-95-preview-is-read-only');
 await page.locator('#detail-goal [data-apply]').click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('lifeplan-sim-state-v1')).config.management.thresholds[100]===2345);
 const adopted=await snapshot();
 assert.equal(adopted.config.plan.endAge,95);assert.deepEqual(adopted.scenarios,before.scenarios);
 assert.deepEqual(adopted.config.management.thresholds[95],before.config.management.thresholds[95]);
 assert.equal(adopted.config.management.thresholds[100],2345);
 mark('age-100-goal-saved-without-extending-age-horizon-or-changing-scenarios');
 await openTab('manage','backup');
 assert.equal(await page.locator('#backup #exportFullBtn').count(),1);
 assert.equal(await page.locator('#backup #recoveryCheckFile').count(),1);
 await page.locator('#privateSyncCard > details > summary').click();
 assert.match(await page.locator('#privateSyncContainer .cloud-current h4').innerText(),/状態表示/);
 assert.match(await page.locator('#privateSyncContainer').innerText(),/日常の確認/);
 assert.match(await page.locator('#privateSyncContainer').innerText(),/手動の書込み・読込み/);
 assert(await page.locator('[data-sync-action="4"]').isVisible());
 assert.equal(await page.locator('#privateSyncContainer [data-sync-action="2"]').count(),1);
 assert.deepEqual(await snapshot(),adopted,'opening cloud UI must not write local state');
 assert.match(await page.locator('[data-sync-action="4"]').innerText(),/^②/);
 assert.match(await page.locator('[data-sync-action="2"]').innerText(),/^③/);
 assert.match(await page.locator('[data-sync-action="3"]').innerText(),/^④/);
 mark('cloud-state-and-action-groups-are-distinct-with-numbered-buttons');
 mark('ux-request-independent-backup-tab-and-secure-action-numbers');
 for(const width of [390,1280]){
  await page.setViewportSize({width,height:900});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'settings overflow '+width);
  await page.screenshot({path:resolve(out,'settings-'+width+'.png'),fullPage:true});
  for(const tab of ['nisa','ideco']){
   await openTab('income',tab);
   const kind=tab==='nisa'?'nisaWithdrawal':'idecoWithdrawal';
   const form=page.locator(`#detail-${kind} .form-grid`);
   await form.waitFor({state:'visible'});
   const valid=await form.evaluate(node=>{
    const rect=node.getBoundingClientRect();
    const labs=[...node.children].filter(x=>x.tagName==='LABEL'&&x.getClientRects().length);
    const boxes=labs.map(x=>x.getBoundingClientRect());
    const overlaps=boxes.some((a,i)=>boxes.slice(i+1).some(b=>a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1));
    const widgets=labs.flatMap(x=>[...x.querySelectorAll('input,select')]);
    const within=widgets.every(el=>{const b=el.getBoundingClientRect();return b.left>=rect.left-2&&b.right<=rect.right+2;});
    return {overlaps,within,labels:labs.length};
   });
   assert.equal(valid.overlaps,false,`${kind} overlaps on ${width}px: ${JSON.stringify(valid)}`);
   assert.equal(valid.within,true,`${kind} input width on ${width}px`);
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${kind} horizontal overflow ${width}`);
   await page.screenshot({path:resolve(out,`${tab}-${width}.png`),fullPage:true});
  }
 }
 mark('nisa-ideco-withdrawal-fields-no-overlap-on-390-and-1280');
 assert.deepEqual(await snapshot(),adopted,'layout checks must not change saved data');

 // H-UI-02 acceptance: actual form events and storage, not just source inspection.
 // Run on the same fictional state in a separate view; no Firebase Auth/production.
 await openTab('manage','settings');
 if(!await page.locator('#settingsGroup-finance').evaluate(n=>n.open))await page.locator('#settingsGroup-finance > summary').click();
 const financialForm=page.locator('#settingsForm');
 await financialForm.locator('[name=initialAsset]').fill('');
 await financialForm.locator('button[type=submit]').click();
 assert.deepEqual(await snapshot(),adopted,'blank initial asset must be rejected without saving 0');
 assert.match(await page.locator('#notice').innerText(),/未入力/);
 await financialForm.locator('[name=initialAsset]').fill(String(adopted.config.plan.initialAsset));
 mark('hui02-blank-number-rejected-without-touching-adopted-state');

 await openTab('expense','expenses');
 assert.match(await page.locator('#expensesPriceBase').innerText(),/2044年1月/);
 assert.match(await page.locator('#expensesPriceBase').innerText(),/従来方式/);
 await openTab('expense','budget');
 assert.match(await page.locator('#budgetPriceBase').innerText(),/2044年1月/);
 const periodForm=page.locator('#periodEditForm');
 const periodDetails=periodForm.locator('xpath=ancestor::details[1]');
 if(!await periodDetails.evaluate(n=>n.open))await periodDetails.locator('summary').first().click();
 assert(await periodForm.isVisible());
 assert.match(await page.locator('#periodPriceBase').innerText(),/2044年1月/);
 await periodForm.locator('[name=kind]').selectOption('expense');
 await periodForm.locator('[name=key]').fill('synthetic-ui-audit-expense');
 await periodForm.locator('[name=label]').fill('架空の生活費内訳');
 await periodForm.locator('[name=fromAge]').fill('65');
 await periodForm.locator('[name=toAge]').fill('66');
 await periodForm.locator('[name=amount]').fill('2.5');
 await periodForm.locator('[name=unit]').selectOption('monthly');
 await periodForm.locator('button[type=submit]').click();
 assert(await page.locator('#periodChangePreview').isVisible());
 assert.match(await page.locator('#periodChangeSummary').innerText(),/架空の生活費内訳/);
 assert.equal(await page.locator('#periodChangeApply').isEnabled(),false);
 assert.deepEqual(await snapshot(),adopted,'preview should not save the new expense');
 await page.locator('#periodChangeCancel').click();
 assert.deepEqual(await snapshot(),adopted,'cancel preview must not save');
 mark('hui02-period-preview-and-cancel-do-not-save');

 await periodForm.locator('button[type=submit]').click();
 await page.locator('#periodChangeReviewed').check();
 assert.equal(await page.locator('#periodChangeApply').isEnabled(),true);
 // Changing the input must invalidate the checkbox and preview; then re-preview.
 await periodForm.locator('[name=amount]').fill('3');
 assert.equal(await page.locator('#periodChangePreview').isVisible(),false);
 assert.equal(await page.locator('#periodChangeApply').isEnabled(),false);
 assert.deepEqual(await snapshot(),adopted,'edited stale preview must not save');
 await periodForm.locator('button[type=submit]').click();
 await page.locator('#periodChangeReviewed').check();
 await page.locator('#periodChangeApply').click();
 await page.waitForFunction(()=>{
  const s=JSON.parse(localStorage.getItem('lifeplan-sim-state-v1'));
  return s.config.cashflow.periodOverrides.some(x=>x.key==='synthetic-ui-audit-expense'&&x.amount===3);
 });
 const afterInsert=await snapshot();
 assert.deepEqual(afterInsert.scenarios,adopted.scenarios);
 assert.equal(afterInsert.config.plan.initialAsset,adopted.config.plan.initialAsset);
 assert.equal(afterInsert.config.budgets[0].annualBudget,adopted.config.budgets[0].annualBudget);
 mark('hui02-expense-written-only-after-explicit-review-and-confirmation');

 const remove=page.locator('#periodOverrideRows [data-delete-period]');
 await remove.last().click();
 assert(await page.locator('#periodChangePreview').isVisible());
 assert.match(await page.locator('#periodChangeSummary').innerText(),/削除/);
 assert.deepEqual(await snapshot(),afterInsert,'delete first click is non-destructive');
 for(const width of [390,1280]){
  await page.setViewportSize({width,height:900});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`HUI02 preview overflow ${width}`);
  await page.screenshot({path:resolve(out,`hui02-expense-preview-${width}.png`),fullPage:true});
 }
 await page.locator('#periodChangeReviewed').check();
 await page.locator('#periodChangeApply').click();
 await page.waitForFunction(()=>{
  const s=JSON.parse(localStorage.getItem('lifeplan-sim-state-v1'));
  return !s.config.cashflow.periodOverrides.some(x=>x.key==='synthetic-ui-audit-expense');
 });
 assert.deepEqual(await snapshot(),adopted,'explicit deletion must restore fictional state without disturbing scenarios');
 mark('hui02-delete-requires-review-and-preserves-state-390-1280');

 assert.deepEqual(blocked,[],'no external Firebase or other network');
 assert.deepEqual(errors,[],'no browser page errors');
 mark('read-only-viewing-preserves-state-and-causes-no-external-network');
 report.status='passed';
}catch(e){report.status='failed';report.error=e.stack;process.exitCode=1;console.error(e.stack);}
finally{
 await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');
 if(context)await context.close();if(browser)await browser.close();await new Promise(ok=>server.close(ok));
}
