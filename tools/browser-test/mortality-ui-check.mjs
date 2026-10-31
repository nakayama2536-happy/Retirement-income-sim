// H-MORT-07: real full app, Chromium/WebKit, synthetic-only, no production calls.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {chromium,webkit} from 'playwright';
const root=resolve('.'),out=resolve('mortality-browser-evidence');await mkdir(out,{recursive:true});
const seed=JSON.parse(await readFile(resolve(root,'tools/browser-test/mortality-synthetic.json'),'utf8'));
/* This gate's independently expected 55→45 monthly example is nominal, with
   zero inflation and return. Do not mix it with a 10-year inflated budget. */
for(const c of [seed.config,...(seed.scenarios||[]).map(x=>x.config)]){
  c.plan.inflation=0;c.plan.afterTaxReturn=0;
}
const report={scope:'H-MORT-07 real application; isolated synthetic inputs, no deploy',status:'running',checks:[],blockedExternal:[],pageErrors:[]};
const mark=(engine,name)=>{report.checks.push({engine,name,status:'pass'});console.log('MORTALITY_UI_PASS',engine,name);};
const server=createServer(async(req,res)=>{
 try{
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  const loc=new URL(req.url,'http://localhost'),dest=resolve(root,'.'+(loc.pathname==='/'?'/index.html':decodeURIComponent(loc.pathname)));
  const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png'};
  if(!dest.startsWith(root+sep)||!types[extname(dest)]||dest.includes('/.git/')){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'Content-Type':types[extname(dest)],'Cache-Control':'no-store'});res.end(await readFile(dest));
 }catch{res.writeHead(404);res.end();}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const origin='http://127.0.0.1:'+server.address().port;
const input=(p,n)=>p.locator('#mortalityForm [name="'+n+'"]');
const open=async p=>{await p.locator('[data-group=results]').click();await p.locator('[data-tab=mortality]').click();};
const number=async x=>Number((await x.innerText()).replace(/[,万円\s]/g,''));
const near=(x,y)=>assert.ok(Math.abs(x-y)<.11,String(x)+' != '+String(y));
const saved=page=>page.evaluate(()=>localStorage.getItem('lifeplan-sim-state-v1'));
const context=(browser)=>browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
const init=ctx=>ctx.addInitScript(data=>{
 if(localStorage.getItem('lifeplan-sim-state-v1')===null)localStorage.setItem('lifeplan-sim-state-v1',JSON.stringify(data));
 globalThis.__mortalityWrites=0;
 for(const method of ['setItem','removeItem','clear']){
  const orig=Storage.prototype[method];
  Storage.prototype[method]=function(...args){
   if((method==='clear'||args[0]==='lifeplan-sim-state-v1')&&this===localStorage)globalThis.__mortalityWrites++;
   return Reflect.apply(orig,this,args);
  };
 }
},seed);
async function baselineInputs(page){
 const settings=page.locator('#mortalityPensionSettings');
 if(!await settings.evaluate(n=>n.open))await settings.locator('summary').click();
 await input(page,'deathMonth').fill('2060-01');
 await input(page,'survivorPension').fill('210');
 await page.locator('#mortalityItemState').waitFor({state:'visible'});
 assert.match(await page.locator('#mortalityItemState').innerText(),/未照合残額/);
}
async function verifyPensionReference(page){
 const d=page.locator('#mortalityForm details');
 if(!await d.evaluate(n=>n.open))await d.locator('summary').click();
 for(const [name,value] of [['deceasedEarnings','160'],['survivorEmployee','50'],['survivorBasic','90']])await input(page,name).fill(value);
 for(const name of ['entitlement','claimed','deferral'])await input(page,name).check();
 await page.locator('#mortalityEstimatePension').click();
 assert.equal(await input(page,'survivorPension').inputValue(),'210');
 assert.equal(await page.locator('#mortalityPensionBreakdown').getAttribute('data-pension-state'),'reference');
 for(const [key,want] of [['own-basic',90],['own-employee',50],['own-total',140],['survivor-topup',70],['total',210]])
  assert.equal(await number(page.locator('[data-pension-component="'+key+'"]')),want);
}
const factorRow=(page,label)=>page.locator('#mortalityItemHost .mortality-item-row').filter({hasText:label}).locator('input');
async function factors(page){
 await factorRow(page,'食費').fill('0.6');
 await factorRow(page,'水道光熱費').fill('0.8');
 await factorRow(page,'住居').fill('1');
 await page.locator('#mortalityRemainderFactor').fill('0.8');
}
async function submit(page){await input(page,'reviewed').check();await page.locator('#mortalityRun').click();await page.locator('#mortalityResults').waitFor({state:'visible'});}
let browser=null;
try{
 for(const [engine,cls] of [['chromium',chromium],['webkit',webkit]]){
  browser=await cls.launch({headless:true});
  const ctx=await context(browser);await init(ctx);
  await ctx.route('**/*',r=>{if(new URL(r.request().url()).origin===origin)return r.continue();report.blockedExternal.push(r.request().url());return r.abort();});
  const page=await ctx.newPage();page.on('pageerror',e=>report.pageErrors.push({engine,error:e.message}));
  await page.goto(origin,{waitUntil:'networkidle'});await page.locator('#dashboard').waitFor({state:'visible'});
  assert.equal(await page.locator('#appVersion').innerText(),'v0.9.16-missing-id-guidance-20261031（端末で実行中）');
  const before=await saved(page);await open(page);await baselineInputs(page);
  assert.equal(Number(await page.locator('#mortalityRemainderFactor').inputValue()),1,'初期の残額倍率は100%であること');
  for(const label of ['食費','水道光熱費','住居'])assert.ok(await factorRow(page,label).count()>0,label);
  mark(engine,'actual-saved-expense-items-loaded-without-fabricated-shares');
  await submit(page);
  assert.equal(await number(page.locator('[data-budget-term=baseline]')),55);
  assert.equal(await number(page.locator('[data-budget-term=result]')),55);
  mark(engine,'all-default-one-keeps-original-budget');
  await factors(page);
  assert.equal(await page.locator('#mortalityResults').isHidden(),true,'changing factors invalidates old trial');
  await submit(page);
  for(const [part,want] of [['baseline',55],['reduction',10],['result',45]])
    near(await number(page.locator('[data-budget-term="'+part+'"]')),want);
  const annual=(age,field)=>page.locator('#mortalityAnnualComparison tr[data-age="'+age+'"] [data-field="'+field+'"]');
  near(await number(annual(80,'expenseReduction')),110);
  near(await number(annual(81,'expenseReduction')),120);
  mark(engine,'actual-items-plus-remaining25-are-factored-once-monthly-and-annual');
  await verifyPensionReference(page);
  await submit(page);
  assert.equal(await page.locator('#mortalityPensionBreakdown').getAttribute('data-pension-state'),'reference');
  const costD=page.locator('#mortalityResults details');await costD.locator('summary').click();
  assert.match(await page.locator('#mortalityCostBreakdown').innerText(),/未照合の管理予算残額/);
  mark(engine,'survivor-reference-formula-and-unreconciled-budget-visible');
  for(const width of [390,1280]){
   await page.setViewportSize({width,height:900});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow '+width);
   await page.screenshot({path:resolve(out,engine+'-HMORT07-'+width+'.png'),fullPage:true});
   mark(engine,'aligned-responsive-comparison-'+width);
  }
  assert.equal(await saved(page),before);assert.equal(await page.evaluate(()=>__mortalityWrites),0);
  mark(engine,'comparison-writes-no-adopted-settings-or-scenarios');
  await page.reload({waitUntil:'networkidle'});await page.locator('#dashboard').waitFor({state:'visible'});await open(page);
  assert.equal(await input(page,'deathMonth').inputValue(),'2060-01');
  assert.equal(await input(page,'survivorPension').inputValue(),'210');
  assert.equal(await factorRow(page,'食費').inputValue(),'0.6');
  assert.equal(await page.locator('#mortalityRemainderFactor').inputValue(),'0.8');
  assert.equal(await page.locator('#mortalityResults').isHidden(),true);
  for(const key of ['reviewed','entitlement','claimed','deferral'])assert.equal(await input(page,key).isChecked(),false);
  mark(engine,'reload-retains-draft-values-but-not-calculation-or-eligibility');
  await page.locator('#mortalityClearInputs').click();
  assert.equal(await input(page,'deathMonth').inputValue(),'');
  assert.equal(Number(await page.locator('#mortalityRemainderFactor').inputValue()),1,'入力クリア後の残額倍率は100%');
  assert.equal(await saved(page),before);
  mark(engine,'clear-draft-alone-preserves-adopted-plan');
  await baselineInputs(page);await factors(page);await submit(page);
  const second=await ctx.newPage();second.on('pageerror',e=>report.pageErrors.push({engine,error:e.message}));
  await second.goto(origin,{waitUntil:'networkidle'});await second.locator('#dashboard').waitFor({state:'visible'});await open(second);
  await baselineInputs(second);await factors(second);await submit(second);
  const checkReadOnly=async p=>p.evaluate(async()=>{const {assertWriteAccess}=await import('/write-access.mjs');try{assertWriteAccess();return false;}catch{return true;}});
  assert.equal(await checkReadOnly(second),true);
  assert.equal(await saved(second),before);
  mark(engine,'second-tab-readonly-comparison-without-adoption');
  // The owner changes another setting; the second tab must invalidate the stale trial.
  await page.locator('[data-group=manage]').click();await page.locator('[data-tab=settings]').click();
  const finance=page.locator('#settingsGroup-finance');
  if(!await finance.evaluate(n=>n.open))await finance.locator(':scope > summary').click();
  await page.locator('#settingsForm [name=afterTaxReturn]').fill('2.5');
  await page.locator('#settingsForm button[type=submit]').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('lifeplan-sim-state-v1')).config.plan.afterTaxReturn===2.5);
  await second.locator('#mortalityResults').waitFor({state:'hidden'});
  assert.equal(await second.locator('#mortalityRun').isDisabled(),true);
  mark(engine,'cross-tab-adopted-change-blocks-stale-mortality-trial');
  await second.close();await ctx.close();await browser.close();browser=null;
 }
 assert.deepEqual(report.blockedExternal,[]);assert.deepEqual(report.pageErrors,[]);report.status='pass';
}catch(e){report.status='failed';report.error=e.stack||String(e);process.exitCode=1;}
finally{if(browser)await browser.close();await new Promise(ok=>server.close(ok));await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks.length}));}
