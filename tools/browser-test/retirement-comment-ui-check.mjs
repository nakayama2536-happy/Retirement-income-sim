// Full current app, synthetic browser profile, loopback only. No real Firebase.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
import {chromium} from 'playwright';
const root=resolve('.'),out=resolve('stage2-evidence');await mkdir(out,{recursive:true});
const fixture=JSON.parse(await readFile('tools/browser-test/synthetic-full.json','utf8'));
fixture.config.retirement ??= {amount:250,serviceYears:20,receiveDate:'2042-06-15',companyStartDate:'2022-06-15',retirementDeclarationFiled:true};
const report={scope:'actual app / isolated Chromium / fictional fixture / no cloud',cases:[],status:'running'};
const mark=name=>{report.cases.push({name,pass:true});console.log('COMMENT_UI_PASS '+name);};
const server=createServer(async(req,res)=>{
 try{
  if(req.method!=='GET'){res.writeHead(405);res.end();return;}
  const path=new URL(req.url,'http://localhost').pathname;
  const target=resolve(root,'.'+(path==='/'?'/index.html':decodeURIComponent(path)));
  const types={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.png':'image/png','.ico':'image/x-icon'};
  if(!target.startsWith(root+sep)||!types[extname(target)]||target.includes('/.git/')){res.writeHead(404);res.end();return;}
  const bytes=await readFile(target);res.writeHead(200,{'Content-Type':types[extname(target)],'Cache-Control':'no-store'});res.end(bytes);
 }catch{res.writeHead(404);res.end();}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const origin='http://127.0.0.1:'+server.address().port;
let browser,context;
try{
 browser=await chromium.launch({headless:true});report.engine=browser.version();
 context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'});
 const blocked=[],errors=[];
 await context.route('**/*',route=>{if(new URL(route.request().url()).origin===origin)return route.continue();blocked.push(route.request().url());return route.abort();});
 await context.addInitScript(seed=>{if(localStorage.getItem('lifeplan-sim-state-v1')===null)localStorage.setItem('lifeplan-sim-state-v1',JSON.stringify(seed));},fixture);
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin,{waitUntil:'networkidle'});await page.locator('#dashboard').waitFor({state:'visible'});
 const tab=async id=>{await page.locator('[data-group="'+(id==='retirement'?'income':'manage')+'"]').click();await page.locator('[data-tab="'+id+'"]').click();};
 const state=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('lifeplan-sim-state-v1')));
 const financial=()=>page.evaluate(async()=>{const {runRetirementPlan}=await import('/calc.mjs');return runRetirementPlan(JSON.parse(localStorage.getItem('lifeplan-sim-state-v1')).config,{includeMonthlyDetails:true});});
 await tab('retirement');
 const host=page.locator('#detail-retirement'),field=host.locator('[name="conceptComment"]');
 await field.waitFor();assert.equal(await field.inputValue(),'');assert.equal(await field.getAttribute('maxlength'),'2000');
 const before=await state(),numbers=await financial();
 const note='架空の構想コメント\n使途は検討中です。\n</textarea><img src=x onerror="window.__commentXss=1">';
 await field.fill(note);assert.deepEqual(await state(),before);
 await host.locator('button[type="submit"]').click();await host.locator('[data-apply]').waitFor({state:'visible'});
 assert.deepEqual(await state(),before);mark('input-and-preview-do-not-save');
 await host.locator('[data-reset]').click();assert.equal(await field.inputValue(),'');assert.deepEqual(await state(),before);mark('cancel-draft-restores-field-only');
 await field.fill(note);await host.locator('button[type="submit"]').click();await host.locator('[data-apply]').click();
 await page.waitForFunction(expected=>JSON.parse(localStorage.getItem('lifeplan-sim-state-v1')).config.retirement.conceptComment===expected,note);
 assert.equal((await state()).config.retirement.conceptComment,note);
 assert.deepEqual((await state()).scenarios,before.scenarios);assert.deepEqual(await financial(),numbers);mark('apply-persists-comment-without-calculation-or-scenario-change');
 assert.equal(await page.evaluate(()=>window.__commentXss??null),null);assert.equal(await host.locator('img').count(),0);mark('html-like-comment-is-inert-text');
 for(const width of [390,1280]){
  await page.setViewportSize({width,height:900});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert(await field.evaluate(el=>el.scrollWidth<=el.clientWidth+1));
  await host.screenshot({path:resolve(out,'comment-'+width+'.png')});
 }
 mark('390-and-1280-layout-no-horizontal-overflow');
 await tab('settings');await page.locator('#settingsGroup-maintenance').evaluate(el=>el.open=true);await page.locator('#detailUndo').click();
 assert.deepEqual((await state()).config.retirement,before.config.retirement);assert.deepEqual((await state()).scenarios,before.scenarios);mark('undo-applied-comment-restores-original-retirement');
 await tab('retirement');await field.fill(note);await host.locator('button[type="submit"]').click();await host.locator('[data-apply]').click();
 await page.reload({waitUntil:'networkidle'});await page.locator('#dashboard').waitFor({state:'visible'});await tab('retirement');
 assert.equal(await field.inputValue(),note);assert.deepEqual(await financial(),numbers);mark('reload-retains-multiline-comment');
 await field.fill('');await host.locator('button[type="submit"]').click();await host.locator('[data-apply]').click();
 await page.reload({waitUntil:'networkidle'});await tab('retirement');assert.equal(await field.inputValue(),'');assert.equal((await state()).config.retirement.conceptComment,'');mark('explicit-empty-comment-clears-and-persists');
 assert.deepEqual(blocked,[]);assert.deepEqual(errors,[]);mark('no-external-network-or-page-errors');report.status='passed';
}catch(error){report.status='failed';report.error=error.stack;process.exitCode=1;console.error(error.stack);}
finally{
 await writeFile(resolve(out,'browser-report.json'),JSON.stringify(report,null,2)+'\n');
 if(context)await context.close();if(browser)await browser.close();await new Promise(ok=>server.close(ok));
}
