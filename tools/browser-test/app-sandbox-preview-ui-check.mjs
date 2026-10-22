// Browser-only validation; HTTPS routes are fully mocked, no real Firebase endpoints.
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
if(process.argv.length!==3)throw Error('Usage: node preview-browser.mjs STAGED_CANDIDATE');
const path=resolve(process.argv[2]),origin='https://lifeplan-sync-sandbox--app-sync-check-fict01.web.app';
const list=JSON.parse(await readFile(resolve(path,'PREVIEW_SHA256.json'),'utf8'));
const allow=new Set(list.files.map(x=>'/'+x.name));
const report={scope:'isolated synthetic preview PC Chromium and mobile WebKit, mocked HTTP only',cases:[],realFirebase:false,personalData:false};
const network=[],match=[];
let chromiumBrowser,webkitBrowser,contexts=[];
async function create(browser,width){
 const ctx=await browser.newContext({viewport:{width,height:840},serviceWorkers:'block'});
 await ctx.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin!==origin){network.push(url.origin);return route.abort();}
  if(req.method()!=='GET')throw Error('Unexpected write method '+req.method());
  if(url.pathname==='/__/firebase/init.json')
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({projectId:'lifeplan-sync-sandbox',authDomain:'lifeplan-sync-sandbox.firebaseapp.com',apiKey:'synthetic-web-public-key',appId:'synthetic-public-app-id'})});
  const file=url.pathname==='/'?'/index.html':url.pathname;
  if(!allow.has(file))return route.fulfill({status:404,body:'not an allowed file'});
  const data=await readFile(resolve(path,'public',file.slice(1)));
  const types={'.html':'text/html','.mjs':'text/javascript','.css':'text/css','.png':'image/png','.json':'application/json','.webmanifest':'application/manifest+json'};
  return route.fulfill({status:200,body:data,contentType:types[extname(file)]||'application/octet-stream'});
 });
 contexts.push(ctx);return ctx;
}
const state=page=>page.evaluate(()=>({state:JSON.parse(localStorage.getItem('lifeplan-sim-state-v1')||'null'),run:localStorage.getItem('lifeplan-app-sandbox-source-run-v1'),publicConfig:JSON.parse(localStorage.getItem('lifeplan-private-sync-config-v1')||'null')}));
const pass=label=>{report.cases.push(label);console.log('SANDBOX_APP_BROWSER_PASS '+label);};
async function check(browser,width,button){
 const ctx=await create(browser,width),page=await ctx.newPage();page.setDefaultTimeout(20000);
 await page.goto(origin+'/setup.html',{waitUntil:'domcontentloaded'});
 assert.equal((await state(page)).state,null);
 assert.equal(await page.locator('#'+button).isEnabled(),true);
 await page.locator('#'+button).click();
 await page.waitForFunction(()=>!!localStorage.getItem('lifeplan-sim-state-v1'));
 const snap=await state(page);
 assert(snap.state&&snap.state.syntheticEvidence?.tag==='LIFEPLAN-APP-SANDBOX-SYNTHETIC-ONLY');
 assert.equal(snap.publicConfig?.projectId,'lifeplan-sync-sandbox');
 assert.equal(await page.locator('#seedPc').isDisabled(),true);
 assert.equal(await page.locator('#seedPhone').isDisabled(),true);
 assert.equal(await page.locator('#cleanup').isEnabled(),button==='seedPc');
 assert.equal(snap.state.scenarios.length,button==='seedPc'?2:1);
 assert.equal(snap.state.config.plan.initialAsset,button==='seedPc'?1000:987);
 assert.equal(Boolean(snap.run),button==='seedPc');
 await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
 await page.locator('#privateSyncContainer [name="syncApiKey"]').waitFor({state:'attached'});
 assert.equal(await page.locator('.sandbox-preview-banner').isVisible(),true);
 for(const id of ['importFile','importFile2','recoveryCheckFile'])
  assert.equal(await page.locator('#'+id).isDisabled(),true);
 assert.equal(await page.locator('#privateSyncContainer [name="syncProjectId"]').inputValue(),'lifeplan-sync-sandbox');
 const saved=await state(page);
 assert.equal(saved.state.syntheticEvidence.runId,snap.state.syntheticEvidence.runId);
 await page.close();
 pass(button==='seedPc'?'pc-fixture-isolated-from-real-state':'webkit-phone-fixture-isolated-from-real-state');
}
try{
 chromiumBrowser=await chromium.launch({headless:true});webkitBrowser=await webkit.launch({headless:true});
 await check(chromiumBrowser,1280,'seedPc');await check(webkitBrowser,390,'seedPhone');
 assert.deepEqual(network,[]);
 pass('no-outbound-Firebase-or-personal-network-requests');
 report.status='pass';console.log('SANDBOX_APP_BROWSER_OK '+report.cases.length);
}catch(e){report.status='fail';report.error=e.stack;process.exitCode=1;console.error('SANDBOX_APP_BROWSER_FAILED '+e.stack);}
finally{
 await mkdir('tools/browser-test/mobile-results/app-sandbox-preview',{recursive:true});
 await writeFile('tools/browser-test/mobile-results/app-sandbox-preview/report.json',JSON.stringify(report,null,2)+'\n');
 for(const ctx of contexts)await ctx.close();
 if(chromiumBrowser)await chromiumBrowser.close();if(webkitBrowser)await webkitBrowser.close();
}
