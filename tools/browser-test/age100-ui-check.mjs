// Complete local app; fictional browser storage; zero access to real Firebase.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright';
const root=resolve('.'),out=resolve('age100-browser-evidence');await mkdir(out,{recursive:true});
const fixture=JSON.parse(await readFile('tools/browser-test/synthetic-full.json','utf8'));
fixture.config.plan.endAge=95;
const report={scope:'age 100 / actual full app / fictional local state / no cloud',status:'running',cases:[]};
const mark=name=>{report.cases.push({name,status:'pass'});console.log('AGE100_UI_PASS '+name);};
const server=createServer(async(req,res)=>{
 try{
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  const path=new URL(req.url,'http://localhost').pathname,target=resolve(root,'.'+(path==='/'?'/index.html':decodeURIComponent(path)));
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
 const plan=()=>page.evaluate(async()=>{const {runRetirementPlan}=await import('/calc.mjs');return runRetirementPlan(JSON.parse(localStorage.getItem('lifeplan-sim-state-v1')).config,{includeMonthlyDetails:true});});
 const openSettings=async()=>{await page.locator('[data-group="manage"]').click();await page.locator('[data-tab="settings"]').click();};
 await page.goto(origin,{waitUntil:'networkidle'});await page.locator('#dashboard').waitFor({state:'visible'});
 assert.match(await page.locator('#appVersion').innerText(),/^v0\.9\.7-hui02-20261025$/);
 let before=await snapshot(),beforePlan=await plan();assert.equal(before.config.plan.endAge,95);mark('existing-95-plan-preserved-on-first-open');
 await openSettings();await page.locator('#settingsGroup-goals').evaluate(el=>el.open=true);const host=page.locator('#detail-horizon'),submit=host.locator('button[type="submit"]');await submit.waitFor({state:'visible'});
 assert.equal(await host.locator('[name="endAge"]').inputValue(),'100');
 await submit.click();assert(await host.locator('[name="extensionAnnualBudget"]').evaluate(el=>el.validity.valueMissing));assert.deepEqual(await snapshot(),before);mark('missing-budget-rejected');
 await host.locator('[name="extensionAnnualBudget"]').fill('10');await host.locator('[name="reviewed"]').check();
 await submit.click();await host.locator('[data-apply]').waitFor({state:'visible'});
 assert.match(await host.locator('.detail-preview').innerText(),/100歳末/);assert.match(await host.locator('.detail-preview').innerText(),/未設定/);
 assert.deepEqual(await snapshot(),before);mark('preview-not-saved-and-target-not-inferred');
 for(const width of [390,1280]){
  await page.setViewportSize({width,height:900});await openSettings();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow '+width);
  await host.screenshot({path:resolve(out,'horizon-'+width+'.png')});
 }
 mark('390-1280-layout-has-no-horizontal-overflow');
 await host.locator('[data-apply]').click();await page.waitForFunction(()=>JSON.parse(localStorage.getItem('lifeplan-sim-state-v1')).config.plan.endAge===100);
 let after=await snapshot(),afterPlan=await plan();
 assert.equal(after.config.plan.endAge,100);assert.equal(afterPlan.rows.at(-1).age,100);
 assert.deepEqual(after.scenarios,before.scenarios);assert.deepEqual(afterPlan.rows.slice(0,beforePlan.rows.length),beforePlan.rows);
 assert.deepEqual(afterPlan.monthlyDetails.slice(0,beforePlan.monthlyDetails.length),beforePlan.monthlyDetails);
 assert.equal(after.config.management.thresholds?.[100],undefined);mark('explicit-apply-keeps-95-years-and-saved-comparisons');
 await openSettings();await page.locator('#settingsGroup-maintenance').evaluate(el=>el.open=true);await page.locator('#detailUndo').click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('lifeplan-sim-state-v1')).config.plan.endAge===95);
 assert.deepEqual((await snapshot()).config,before.config);mark('undo-restores-only-extension');
 // Re-apply by explicit user action; only then test restart persistence.
 await host.locator('[name="extensionAnnualBudget"]').fill('10');await host.locator('[name="reviewed"]').check();
 await submit.click();await host.locator('[data-apply]').click();
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('lifeplan-sim-state-v1')).config.plan.endAge===100);
 await page.reload({waitUntil:'networkidle'});await page.locator('#dashboard').waitFor({state:'visible'});
 assert.equal((await snapshot()).config.plan.endAge,100);assert.match(await page.locator('#targetStatusLabel').innerText(),/100歳末/);
 assert.match(await page.locator('#finalThreshold').innerText(),/未設定/);mark('reload-shows-unset-100-goal-not-zero');
 assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);mark('no-unexpected-external-requests-or-page-errors');
 report.status='passed';
}catch(e){report.status='failed';report.error=e.stack;process.exitCode=1;console.error(e.stack);}
finally{
 await writeFile(resolve(out,'browser-report.json'),JSON.stringify(report,null,2)+'\n');
 if(context)await context.close();if(browser)await browser.close();await new Promise(ok=>server.close(ok));
}
