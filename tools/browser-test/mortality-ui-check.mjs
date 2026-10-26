// Full application gate. Synthetic contexts only, no production calls or deployment.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {chromium,webkit} from 'playwright';
import {runRetirementPlan} from '../../calc.mjs';
import {calculateMortalityComparison,fictionalMortalityAllocation} from '../../mortality-comparison.mjs';
const root=resolve('.'),out=resolve('mortality-browser-evidence');await mkdir(out,{recursive:true});
const seed=JSON.parse(await readFile(resolve(root,'tools/browser-test/mortality-synthetic.json'),'utf8'));
const report={scope:'Full PWA modules; isolated synthetic data; no production cloud or user data',status:'running',checks:[],blockedExternal:[],pageErrors:[]};
const mark=(engine,name)=>{report.checks.push({engine,name,status:'pass'});console.log('MORTALITY_UI_PASS',engine,name);};
const server=createServer(async(req,res)=>{
 try{if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  const loc=new URL(req.url,'http://localhost'),target=resolve(root,'.'+(loc.pathname==='/'?'/index.html':decodeURIComponent(loc.pathname)));
  const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'};
  if(!target.startsWith(root+sep)||!types[extname(target)]||target.includes('/.git/')){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':types[extname(target)],'Cache-Control':'no-store'});res.end(await readFile(target));
 }catch{res.writeHead(404);res.end();}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const origin='http://127.0.0.1:'+server.address().port;
let browser;
const expected=calculateMortalityComparison({config:seed.config,baseline:runRetirementPlan(seed.config),deathPerson:'primary',deathMonth:'2060-01',survivorTotalAnnual:210,funeralExpenseMan:0,allocation:fictionalMortalityAllocation(),planCalculator:runRetirementPlan,acknowledged:true});
const formatted=n=>new Intl.NumberFormat('ja-JP',{maximumFractionDigits:1}).format(n)+'万円';
const saved=page=>page.evaluate(()=>localStorage.getItem('lifeplan-sim-state-v1'));
const allStorage=page=>page.evaluate(()=>({local:Object.fromEntries(Object.keys(localStorage).sort().map(k=>[k,localStorage.getItem(k)])),session:Object.fromEntries(Object.keys(sessionStorage).sort().map(k=>[k,sessionStorage.getItem(k)]))}));
const openMortality=async page=>{await page.locator('[data-group="results"]').click();await page.locator('[data-tab="mortality"]').click();};
const runTrial=async(page,{confirmRights=false}={})=>{
 await openMortality(page);
 await page.locator('#mortalityForm [name=deathMonth]').fill('2060-01');
 await page.locator('#mortalityForm [name=survivorPension]').fill('210');
 await page.locator('#mortalityFictionalCosts').click();
 if(confirmRights){
  const details=page.locator('#mortalityForm details');
  if(!await details.evaluate(n=>n.open))await details.locator('summary').click();
  for(const name of ['entitlement','claimed','deferral'])await page.locator(`#mortalityForm [name=${name}]`).check();
 }
 await page.locator('#mortalityForm [name=reviewed]').check();await page.locator('#mortalityRun').click();
 await page.locator('#mortalityResults').waitFor({state:'visible'});
};
const assertInvalidated=async(page,reason=/無効/)=>{
 await page.locator('#mortalityResults').waitFor({state:'hidden'});
 for(const name of ['reviewed','entitlement','claimed','deferral'])assert.equal(await page.locator(`#mortalityForm [name=${name}]`).isChecked(),false);
 assert.match(await page.locator('#mortalityState').innerText(),reason);
};
const isReadOnly=page=>page.evaluate(async()=>{const {assertWriteAccess}=await import('/write-access.mjs');try{assertWriteAccess();return false;}catch{return true;}});
try{
 for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
  browser=await type.launch({headless:true});const ctx=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
  await ctx.route('**/*',r=>{if(new URL(r.request().url()).origin===origin)return r.continue();report.blockedExternal.push(r.request().url());return r.abort();});
  await ctx.addInitScript(f=>{if(localStorage.getItem('lifeplan-sim-state-v1')===null)localStorage.setItem('lifeplan-sim-state-v1',JSON.stringify(f));globalThis.__mortalityWrites=0;for(const method of ['setItem','removeItem','clear']){const original=Storage.prototype[method];Storage.prototype[method]=function(...a){globalThis.__mortalityWrites++;return Reflect.apply(original,this,a);};}},seed);
  const page=await ctx.newPage();page.on('pageerror',e=>report.pageErrors.push({engine,message:e.message}));
  await page.goto(origin,{waitUntil:'networkidle'});await page.locator('#dashboard').waitFor({state:'visible'});
  assert.equal(await page.locator('#appVersion').innerText(),'v0.9.7-mortality-review-20261026');
  const before=await saved(page),storageBefore=await allStorage(page),writes=await page.evaluate(()=>__mortalityWrites);
  await openMortality(page);
  assert.equal(await page.locator('#mortality-share-unallocated').inputValue(),'100');mark(engine,'starts-unallocated-with-no-adoption');
  await page.locator('#mortalityForm [name=deathMonth]').fill('2060-01');await page.locator('#mortalityForm [name=survivorPension]').fill('210');await page.locator('#mortalityFictionalCosts').click();
  assert.equal(await page.locator('#mortalityForm [name=reviewed]').isChecked(),false);
  await page.locator('#mortalityForm [name=reviewed]').check();await page.locator('#mortalityRun').click();await page.locator('#mortalityResults').waitFor({state:'visible'});
  assert.equal(await page.locator('[data-metric=trial] strong').innerText(),formatted(expected.mortality.finalAsset));mark(engine,'full-app-result-matches-real-node-ledger');
  assert.match(await page.locator('#mortalityMonthlyTransition').innerText(),/公的年金/);assert.match(await page.locator('#mortalityResults').innerText(),/死亡費用込/);mark(engine,'income-transition-and-extra-costs-displayed');
  for(const width of [390,1280]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:resolve(out,engine+'-mortality-'+width+'.png'),fullPage:true});mark(engine,'no-horizontal-overflow-'+width);}
  await page.locator('#mortalityForm [name=survivorPension]').fill('');assert.equal(await page.locator('#mortalityResults').isHidden(),true);await page.locator('#mortalityForm [name=reviewed]').check();await page.locator('#mortalityRun').click();assert.equal(await page.locator('#mortalityResults').isHidden(),true);mark(engine,'blank-and-edited-input-invalidates-not-saves');
  await page.locator('#mortalityForm [name=survivorPension]').fill('0');await page.locator('#mortalityForm [name=reviewed]').check();await page.locator('#mortalityRun').click();assert.equal(await page.locator('#mortalityResults').isVisible(),true);mark(engine,'explicit-zero-kept');
  await page.locator('#mortalityClear').click();assert.equal(await page.locator('#mortalityResults').isHidden(),true);
  assert.equal(await saved(page),before);assert.deepEqual(await allStorage(page),storageBefore);assert.equal(await page.evaluate(()=>__mortalityWrites),writes);mark(engine,'config-saved-scenarios-and-storage-writes-unchanged');
  // Reload with a live result and non-empty inputs, not after clearing the result.
  await runTrial(page,{confirmRights:true});
  assert.equal(await page.locator('[data-metric=trial] strong').innerText(),formatted(expected.mortality.finalAsset));
  assert.equal(await page.locator('#mortalityForm [name=deathMonth]').inputValue(),'2060-01');
  assert.equal(await page.locator('#mortalityForm [name=reviewed]').isChecked(),true);
  await page.reload({waitUntil:'networkidle'});await page.locator('#dashboard').waitFor({state:'visible'});await openMortality(page);
  assert.equal(await page.locator('#mortalityResults').isHidden(),true);
  for(const name of ['deathMonth','survivorPension'])assert.equal(await page.locator(`#mortalityForm [name=${name}]`).inputValue(),'');
  for(const name of ['reviewed','entitlement','claimed','deferral'])assert.equal(await page.locator(`#mortalityForm [name=${name}]`).isChecked(),false);
  assert.equal(await page.locator('#mortality-share-unallocated').inputValue(),'100');
  assert.equal(await saved(page),before);assert.deepEqual(await allStorage(page),storageBefore);mark(engine,'reload-does-not-persist-live-result-or-comparison-draft');

  await runTrial(page,{confirmRights:true});
  assert.equal(await isReadOnly(page),false,'first full-app page must own the edit lock');
  const second=await ctx.newPage();second.on('pageerror',e=>report.pageErrors.push({engine,message:e.message}));
  await second.goto(origin,{waitUntil:'networkidle'});await second.locator('#dashboard').waitFor({state:'visible'});
  assert.equal(await isReadOnly(second),true,'second full-app page must remain read-only');
  const secondBefore=await allStorage(second),secondWrites=await second.evaluate(()=>__mortalityWrites);
  await runTrial(second,{confirmRights:true});
  assert.equal(await second.locator('[data-metric=trial] strong').innerText(),formatted(expected.mortality.finalAsset));
  assert.equal(await isReadOnly(second),true);
  assert.deepEqual(await allStorage(second),secondBefore);assert.equal(await second.evaluate(()=>__mortalityWrites),secondWrites);
  mark(engine,'read-only-full-app-can-compare-without-storage-mutation');

  // An ordinary settings save in the lock owner must invalidate both its own
  // mortality result and the other tab's result through the real storage event.
  const canonicalBefore=await page.evaluate(async()=>{const {loadState}=await import('/storage.mjs');return loadState();});
  await page.locator('[data-group="manage"]').click();await page.locator('[data-tab="settings"]').click();
  const finance=page.locator('#settingsGroup-finance');
  if(!await finance.evaluate(n=>n.open))await finance.locator(':scope > summary').click();
  await page.locator('#settingsForm [name=afterTaxReturn]').fill('2.5');await page.locator('#settingsForm button[type=submit]').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('lifeplan-sim-state-v1')).config.plan.afterTaxReturn===2.5);
  const adopted=JSON.parse(await saved(page));
  const expectedConfig=structuredClone(canonicalBefore.config);expectedConfig.plan.afterTaxReturn=2.5;
  assert.deepEqual(adopted.config,expectedConfig);assert.deepEqual(adopted.scenarios,canonicalBefore.scenarios);
  assert.deepEqual(adopted.syntheticEvidence,seed.syntheticEvidence);
  await openMortality(page);await assertInvalidated(page);mark(engine,'settings-adoption-invalidates-result-and-confirmations');
  await assertInvalidated(second,/再読み込み/);assert.equal(await second.evaluate(()=>__mortalityWrites),secondWrites);
  for(const id of ['mortalityRun','mortalityEstimatePension','mortalitySuggestAge'])assert.equal(await second.locator('#'+id).isDisabled(),true);
  mark(engine,'real-other-tab-storage-event-blocks-stale-retrial-until-reload');
  const recalculated=calculateMortalityComparison({config:adopted.config,baseline:runRetirementPlan(adopted.config),deathPerson:'primary',deathMonth:'2060-01',survivorTotalAnnual:210,funeralExpenseMan:0,allocation:fictionalMortalityAllocation(),planCalculator:runRetirementPlan,acknowledged:true});
  const externalAdoptedBytes=await saved(second);
  await second.reload({waitUntil:'networkidle'});await second.locator('#dashboard').waitFor({state:'visible'});await openMortality(second);
  for(const id of ['mortalityRun','mortalityEstimatePension','mortalitySuggestAge'])assert.equal(await second.locator('#'+id).isDisabled(),false);
  assert.equal(await isReadOnly(second),true,'reload must not take the other page edit lock');
  const reloadedStorage=await allStorage(second),reloadedWrites=await second.evaluate(()=>__mortalityWrites);
  await runTrial(second);
  assert.equal(await second.locator('[data-metric=trial] strong').innerText(),formatted(recalculated.mortality.finalAsset));
  assert.equal(await saved(second),externalAdoptedBytes);assert.deepEqual(await allStorage(second),reloadedStorage);assert.equal(await second.evaluate(()=>__mortalityWrites),reloadedWrites);
  mark(engine,'external-update-reload-uses-new-settings-and-keeps-read-only-storage');
  await second.close();
  const adoptedBytes=await saved(page),adoptedStorage=await allStorage(page),adoptedWrites=await page.evaluate(()=>__mortalityWrites);
  await runTrial(page);
  assert.equal(await page.locator('[data-metric=trial] strong').innerText(),formatted(recalculated.mortality.finalAsset));
  assert.equal(await saved(page),adoptedBytes);assert.deepEqual(await allStorage(page),adoptedStorage);assert.equal(await page.evaluate(()=>__mortalityWrites),adoptedWrites);
  mark(engine,'retrial-uses-newly-adopted-settings-without-additional-save');
  await ctx.close();await browser.close();browser=null;
 }
 assert.deepEqual(report.blockedExternal,[]);assert.deepEqual(report.pageErrors,[]);report.status='pass';
}catch(e){report.status='failed';report.error=e.stack||String(e);process.exitCode=1;}
finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks.length}));}
