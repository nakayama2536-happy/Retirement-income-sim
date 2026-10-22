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
const mockSdk={
 'firebase-app.js':[
  'export function initializeApp(config,name){return {config,name};}',
  'export async function deleteApp(){window.__authClosed=(window.__authClosed||0)+1;}'
 ].join('\n'),
 'firebase-auth.js':[
  'export const inMemoryPersistence={kind:"memory"};',
  'export function initializeAuth(app,{persistence}){if(persistence!==inMemoryPersistence)throw Error("bad-persistence");return {app};}',
  'export async function signInWithEmailAndPassword(auth,email,password){if(email!=="fake@example.invalid"||password!=="fictional-password")throw Error("bad-login");return {user:{uid:"fake-user"}};}',
  'export async function getIdTokenResult(u){return {claims:{aud:"lifeplan-sync-sandbox",sub:u.uid,iss:"https://securetoken.google.com/lifeplan-sync-sandbox"}};}',
  'export async function signOut(){window.__signedOut=(window.__signedOut||0)+1;}'
 ].join('\n'),
 'firebase-firestore.js':[
  'export function getFirestore(app){return {app};}',
  'export function doc(db,...parts){if(parts.join("/")!=="sandbox/fake-user/snapshots/trial")throw Error("wrong-document");return {db};}',
  'export async function getDocFromServer(){const value=window.__fakeDoc;return {exists:()=>value!=null,data:()=>structuredClone(value)};}',
  'export async function runTransaction(db,fn){const tx={async get(ref){if(ref.db!==db)throw Error("wrong-db");const value=window.__fakeDoc;return {exists:()=>value!=null,data:()=>structuredClone(value)};},delete(ref){if(ref.db!==db)throw Error("wrong-db");window.__fakeDoc=null;}};return await fn(tx);}',
  'export async function terminate(){window.__terminated=(window.__terminated||0)+1;}'
 ].join('\n')
};
let chromiumBrowser,webkitBrowser,contexts=[];
async function create(browser,width){
 const ctx=await browser.newContext({viewport:{width,height:840},serviceWorkers:'block'});
 await ctx.route('**/*',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.origin!==origin){
   const filename=url.pathname.split('/').at(-1);
   if(url.origin==='https://www.gstatic.com'&&url.pathname.startsWith('/firebasejs/12.19.0/')&&Object.hasOwn(mockSdk,filename))
    return route.fulfill({status:200,contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'},body:mockSdk[filename]});
   network.push(url.origin);return route.abort();
  }
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
 // The original PC's synthetic snapshot must be the only deletable payload.
 const pc=await contexts[0].newPage();
 await pc.goto(origin+'/setup.html',{waitUntil:'domcontentloaded'});
 const record=await pc.evaluate(async()=>{
   const state=JSON.parse(localStorage.getItem('lifeplan-sim-state-v1'));
   const {encryptSnapshot}=await import('/sync-crypto.mjs');
   const encrypted=await encryptSnapshot(state,'fictional-only-32-character-key');
   return {ownerUid:'fake-user',formatVersion:1,revision:2,
    digest:encrypted.digest,ciphertext:encrypted.payload,updatedAt:{synthetic:true}};
 });
 await pc.evaluate(value=>{window.__fakeDoc=value;},record);
 const invoke=async phrase=>{
   await pc.locator('#email').fill('fake@example.invalid');
   await pc.locator('#password').fill('fictional-password');
   await pc.locator('#phrase').fill(phrase);
   await pc.locator('#confirmed').check();
   await pc.locator('#cleanup').click();
   await pc.waitForFunction(()=>document.querySelector('#result')?.textContent?.includes('確認できません')||
     document.querySelector('#result')?.textContent?.includes('削除・不存在確認済み'),null,{timeout:25000});
   return await pc.locator('#result').textContent();
 };
 const wrong=await invoke('wrong-fictional-32-character-key');
 assert.match(wrong,/確認できません/);
 assert.equal(await pc.evaluate(()=>window.__fakeDoc?.revision),2);
 assert.equal(await pc.evaluate(()=>Boolean(localStorage.getItem('lifeplan-app-sandbox-source-run-v1'))),true);
 pass('incorrect-test-key-preserves-remote-and-owner-marker');
 const clean=await invoke('fictional-only-32-character-key');
 assert.match(clean,/削除・不存在確認済み/);
 assert.equal(await pc.evaluate(()=>window.__fakeDoc??null),null);
 assert.equal(await pc.evaluate(()=>localStorage.getItem('lifeplan-app-sandbox-source-run-v1')),null);
 pass('owned-and-decrypted-synthetic-only-conditional-delete');
 await pc.close();
 report.status='pass';console.log('SANDBOX_APP_BROWSER_OK '+report.cases.length);
}catch(e){report.status='fail';report.error=e.stack;process.exitCode=1;console.error('SANDBOX_APP_BROWSER_FAILED '+e.stack);}
finally{
 await mkdir('tools/browser-test/mobile-results/app-sandbox-preview',{recursive:true});
 await writeFile('tools/browser-test/mobile-results/app-sandbox-preview/report.json',JSON.stringify(report,null,2)+'\n');
 for(const ctx of contexts)await ctx.close();
 if(chromiumBrowser)await chromiumBrowser.close();if(webkitBrowser)await webkitBrowser.close();
}
