// Real pair-preview code in isolated Chromium and WebKit. Cloud and SDK mocked; no credentials or personal data.
import assert from 'node:assert/strict';
import {chromium,webkit} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
if(process.argv.length!==3)throw Error('Pass packaged candidate directory');
const root=resolve(process.argv[2]),out=resolve('tools/browser-test/mobile-results/paired-preview');
await mkdir(out,{recursive:true});
const paths=new Set(JSON.parse(await readFile(resolve(root,'bundle-sha256.json'),'utf8')).files.map(f=>'/'+f.path));
const origin='https://lifeplan-sync-sandbox--pair-check-synthetic.web.app';
const config={apiKey:'fictional-api',authDomain:'lifeplan-sync-sandbox.firebaseapp.com',projectId:'lifeplan-sync-sandbox',appId:'fictional-app'};
let remote=null,writes=0,deletes=0,reads=0,conflicts=0;const blocked=[];
const appCode=[
 'export function initializeApp(config,name){return {options:config,name};}',
 'export async function deleteApp(){globalThis.__closed=(globalThis.__closed||0)+1;}'
].join('\n');
const authCode=[
 'export const inMemoryPersistence="memory-only";',
 'export function initializeAuth(app,settings){if(settings.persistence!=="memory-only")throw Error("unsafe-persistence");return {app};}',
 'export async function signInWithEmailAndPassword(auth,email,password){if(email!=="fake@example.invalid"||password!=="fictional-password")throw Object.assign(Error("bad-credential"),{code:"auth/invalid-credential"});return {user:{uid:"fictional-owner"}};}',
 'export async function getIdTokenResult(user){return {claims:{aud:"lifeplan-sync-sandbox",iss:"https://securetoken.google.com/lifeplan-sync-sandbox",sub:user.uid}};}',
 'export async function signOut(){globalThis.__signedOut=(globalThis.__signedOut||0)+1;}'
].join('\n');
const firestoreCode=[
 'export function getFirestore(app){return {app};}',
 'export function doc(db,...path){if(path.join("/")!=="sandbox/fictional-owner/snapshots/trial")throw Error("wrong-path");return {db};}',
 'export async function terminate(){globalThis.__terminated=(globalThis.__terminated||0)+1;}',
 'export function serverTimestamp(){return {syntheticTimestamp:true};}',
 'async function read(){const r=await fetch("/__mock_cloud/read",{cache:"no-store"});return (await r.json()).remote;}',
 'const snap=x=>{const y=structuredClone(x);return {exists:()=>y!==null,data:()=>structuredClone(y)};};',
 'export async function getDocFromServer(){return snap(await read());}',
 'export async function runTransaction(db,fn){let previous,change;const tx={async get(ref){if(ref.db!==db)throw Error("other-db");previous=await read();return snap(previous);},set(ref,value){if(ref.db!==db)throw Error("other-db");change=structuredClone(value);},delete(ref){if(ref.db!==db)throw Error("other-db");change=null;}};const result=await fn(tx);if(change!==undefined){const response=await fetch("/__mock_cloud/write",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({previous,change})});if(!response.ok)throw Object.assign(Error("conflict"),{code:"stale-sandbox-record"});}return result;}'
].join('\n');
const sdk={'firebase-app.js':appCode,'firebase-auth.js':authCode,'firebase-firestore.js':firestoreCode};
async function newContext(browser,viewport){
 const ctx=await browser.newContext({viewport,serviceWorkers:'block'});
 await ctx.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.origin===origin){
   if(u.pathname==='/__/firebase/init.json')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(config)});
   if(u.pathname==='/__mock_cloud/read'){reads++;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({remote})});}
   if(u.pathname==='/__mock_cloud/write'){
    const data=route.request().postDataJSON();
    if(JSON.stringify(data.previous)!==JSON.stringify(remote)){conflicts++;return route.fulfill({status:409,body:'stale'});}
    if(data.change===null){if(remote===null)return route.fulfill({status:409,body:'missing'});remote=null;deletes++;}
    else{if(data.change.ownerUid!=='fictional-owner'||data.change.revision!==(remote?.revision??0)+1)return route.fulfill({status:400,body:'invalid'});remote=structuredClone(data.change);writes++;}
    return route.fulfill({status:200,body:'ok'});
   }
   const p=u.pathname==='/'?'/index.html':u.pathname;
   if(!paths.has(p))return route.fulfill({status:404,body:'not allowed'});
   const contents=await readFile(resolve(root,'public',p.slice(1)));
   const types={'.html':'text/html','.mjs':'text/javascript','.css':'text/css','.txt':'text/plain'};
   return route.fulfill({status:200,contentType:types[extname(p)]||'application/octet-stream',body:contents,headers:{'Cache-Control':'no-store'}});
  }
  const filename=u.pathname.split('/').at(-1);
  if(u.origin==='https://www.gstatic.com'&&u.pathname.startsWith('/firebasejs/12.19.0/')&&Object.hasOwn(sdk,filename)){
   return route.fulfill({status:200,contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'},body:sdk[filename]});
  }
  blocked.push(u.origin);return route.abort();
 });
 return ctx;
}
async function open(ctx){
 const page=await ctx.newPage();page.setDefaultTimeout(15000);
 await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
 await page.locator('#status').waitFor();return page;
}
async function run(page,action){
 await page.locator('#email').fill('fake@example.invalid');
 await page.locator('#password').fill('fictional-password');
 await page.locator('#phrase').fill('fictional-only-32-character-key');
 await page.locator('#consent').check();
 await page.locator('#'+action).click();
 await page.waitForFunction(()=>document.querySelector('#result')?.value.includes('結果：'),null,{timeout:45000});
 return page.locator('#result').inputValue();
}
const report={scope:'Chromium PC and WebKit iPhone-shaped separate browser storage; mocked SDK+Firestore, actual WebCrypto; no real Firebase or personal data',checks:[],realFirebase:false,realIPhone:false};
function pass(key){report.checks.push({name:key,passed:true});console.log('PAIR_BROWSER_PASS '+key);}
let chromiumInstance,webkitInstance,pcContext,phoneContext,pc,phone;
try{
 chromiumInstance=await chromium.launch({headless:true});webkitInstance=await webkit.launch({headless:true});
 pcContext=await newContext(chromiumInstance,{width:1280,height:800});
 phoneContext=await newContext(webkitInstance,{width:390,height:844});
 pc=await open(pcContext);phone=await open(phoneContext);
 assert.equal(writes,0);assert.equal(await pc.locator('#send').isEnabled(),true);
 assert.equal(await pc.locator('#finish').isDisabled(),true);
 assert.deepEqual(await pc.evaluate(()=>Object.keys(localStorage)),[]);
 pass('no-silent-auth-or-cloud');
 let result=await run(pc,'send');
 assert(result.includes('結果：成功'),result);assert.equal(remote.revision,1);assert.equal(writes,1);
 assert.equal(JSON.stringify(remote).includes('initialAsset'),false);
 assert.equal(await pc.evaluate(()=>Object.keys(localStorage).length),1);
 assert.equal(await phone.evaluate(()=>Object.keys(localStorage).length),0);
 pass('pc-auth-encrypt-send-rev1');
 result=await run(phone,'receive');
 assert(result.includes('結果：成功'),result);assert.equal(remote.revision,2);assert.equal(writes,2);
 assert.equal(await phone.evaluate(()=>Object.keys(localStorage).length),0);
 pass('webkit-remote-decrypt-and-ack-rev2');
 result=await run(pc,'finish');
 assert(result.includes('結果：成功'),result);assert(result.includes('削除・不存在確認済み'));
 assert.equal(remote,null);assert.equal(deletes,1);assert.equal(await pc.evaluate(()=>Object.keys(localStorage).length),0);
 pass('pc-ack-verified-conditional-delete-and-absence');
 result=await run(pc,'send');assert(result.includes('結果：成功'),result);
 assert.equal(remote.revision,1);await pc.reload({waitUntil:'domcontentloaded'});
 assert.equal(await pc.locator('#send').isDisabled(),true);
 assert.equal(await pc.locator('#cancel').isEnabled(),true);
 result=await run(pc,'cancel');assert(result.includes('結果：成功'),result);
 assert.equal(remote,null);assert.equal(deletes,2);
 assert.equal(await pc.evaluate(()=>Object.keys(localStorage).length),0);
 pass('interruption-marker-persists-until-safely-cancelled');
 for(const page of [pc,phone]){
  for(const name of ['#email','#password','#phrase'])assert.equal(await page.locator(name).inputValue(),'');
  const check=await page.evaluate(()=>({a:globalThis.__signedOut||0,b:globalThis.__closed||0,c:globalThis.__terminated||0,fit:document.documentElement.scrollWidth<=innerWidth}));
  assert(check.fit&&check.a>=1&&check.a===check.b&&check.b===check.c);
 }
 assert.deepEqual(blocked,[]);
 pass('logout-credentials-cleared-and-no-external-traffic');
 await pc.screenshot({path:resolve(out,'pc.png'),fullPage:true});
 await phone.screenshot({path:resolve(out,'webkit.png'),fullPage:true});
 report.result='pass';report.remote={writes,deletes,absent:remote===null};
 console.log('PAIR_BROWSER_OK '+report.checks.length+' synthetic scenarios, no real cloud');
}catch(error){report.result='fail';report.error=error.stack;process.exitCode=1;console.error('PAIR_BROWSER_FAILED '+error.stack);}
finally{
 await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');
 if(pcContext)await pcContext.close();if(phoneContext)await phoneContext.close();
 if(chromiumInstance)await chromiumInstance.close();if(webkitInstance)await webkitInstance.close();
}
