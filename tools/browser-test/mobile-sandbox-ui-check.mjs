// HTTPS fixture only: real Chromium/WebKit + WebCrypto, mocked Firebase. No live login.
import {chromium,webkit} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {FILES,HEADERS} from '../firebase-mobile/prepare.mjs';
import {PROJECT,MARKER,LOCK,BUILD} from '../firebase-mobile/mobile-policy.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const variant=process.env.MOBILE_CONFIG_VARIANT??'with-app-id';
assert.ok(['with-app-id','without-app-id'].includes(variant));
const out=resolve(root,'tools/browser-test/mobile-results',variant);await mkdir(out,{recursive:true});
const host='lifeplan-sync-sandbox--encrypted-mobile-synthetic.web.app';
const cfg={projectId:PROJECT,authDomain:PROJECT+'.firebaseapp.com',apiKey:'synthetic-api-key',appId:'synthetic-app'};
if(variant==='without-app-id')delete cfg.appId;
const headers=Object.fromEntries(HEADERS.map(x=>[x.key,x.value]));
const core=`
export function initializeApp(options,name){globalThis.__cloud??={doc:null,writes:0,deletes:0,closed:0,tail:Promise.resolve()};return {options,name};}
export async function deleteApp(){globalThis.__cloud.closed++;}
`;
function auth(mode){return `
export const inMemoryPersistence='memory';
export function initializeAuth(app,options){if(${variant==='without-app-id'}&&Object.hasOwn(app.options,'appId'))throw Error('fabricated-app-id');if(options.persistence!=='memory')throw Error('unsafe-persistence');return {app};}
export async function signInWithEmailAndPassword(auth,email,password){if(!email||!password)throw Error('missing');auth.app.signedIn=true;return {user:{uid:'synthetic-mobile-user'}};}
export async function getIdTokenResult(user){return {claims:{aud:'lifeplan-sync-sandbox',iss:'${mode==='wrong'?'https://securetoken.google.com/other':'https://securetoken.google.com/lifeplan-sync-sandbox'}',sub:user.uid}};}
export async function signOut(auth){auth.app.signedIn=false;}
`;}
const database=`
export function getFirestore(app){return {app};}
export function doc(database,...path){if(path.join('/')!=='sandbox/synthetic-mobile-user/snapshots/trial')throw Error('wrong-path');return {database};}
const snap=()=>{const v=structuredClone(globalThis.__cloud.doc);return {exists:()=>v!==null,data:()=>v};};
export async function getDocFromServer(ref){if(!ref.database.app.signedIn)throw Object.assign(new Error('denied'),{code:'permission-denied'});return snap();}
export function serverTimestamp(){return {syntheticTimestamp:true};}
export function runTransaction(db,fn){const c=globalThis.__cloud;const task=c.tail.then(async()=>{if(!db.app.signedIn)throw Object.assign(new Error('denied'),{code:'permission-denied'});let pending;const value=await fn({get:async()=>snap(),set(_r,v){pending=structuredClone(v);},delete(){pending=null;}});if(pending!==undefined){c.doc=pending;if(pending===null)c.deletes++;else c.writes++;}return value;});c.tail=task.catch(()=>{});return task;}
export async function terminate(){}
`;
const report={build:BUILD,variant,scope:'isolated HTTPS fixtures; real browser crypto; mocked Firebase; no real iPhone, cloud or personal data',engines:[]};
for(const [name,engine] of [['chromium',chromium],['webkit',webkit]]){
 const record={name,version:null,cases:[]};report.engines.push(record);let browser;
 const passed=title=>{record.cases.push({name:title,pass:true});console.log('MOBILE_PASS '+name+' '+title);};
 try{
  browser=await engine.launch({headless:true});record.version=browser.version();
  const open=async({domain=host,configMode='valid',authMode='valid',noLocks=false}={})=>{
   const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1});
   if(noLocks)await context.addInitScript(()=>Object.defineProperty(navigator,'locks',{value:undefined}));
   const requests={config:0,sdk:0,blocked:[]};
   const modules={'firebase-app.js':core,'firebase-auth.js':auth(authMode),'firebase-firestore.js':database};
   await context.route('**/*',async route=>{
    const u=new URL(route.request().url());
    if(u.origin==='https://'+domain){
     if(u.pathname==='/__/firebase/init.json'){
      requests.config++;await route.fulfill({status:200,contentType:'application/json',headers,body:JSON.stringify(configMode==='valid'?cfg:{...cfg,projectId:'not-sandbox'})});return;
     }
     const source=FILES[u.pathname==='/'?'index.html':u.pathname.slice(1)];
     if(source){await route.fulfill({status:200,headers,contentType:source.endsWith('.html')?'text/html':source.endsWith('.css')?'text/css':'text/javascript',body:await readFile(resolve(root,source),'utf8')});return;}
     await route.fulfill({status:404,body:'Not found'});return;
    }
    const file=u.pathname.split('/').at(-1);
    if(u.origin==='https://www.gstatic.com'&&u.pathname.startsWith('/firebasejs/12.19.0/')&&modules[file]){
     requests.sdk++;await route.fulfill({status:200,contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'},body:modules[file]});return;
    }
    requests.blocked.push(u.origin);await route.abort();
   });
   const page=await context.newPage();await page.goto('https://'+domain+'/');
   await page.waitForFunction(()=>document.querySelector('#setupStatus').textContent!=='未接続。実行環境を確認しています。');
   return {page,context,requests};
  };
  const fill=async page=>{
   await page.locator('#email').fill('fictional@example.invalid');await page.locator('#password').fill('fictional-only-password');await page.locator('#confirm').check();
  };
  let f=await open();let page=f.page;
  assert.equal(await page.locator('#prepare').isEnabled(),true);assert.equal(await page.locator('#email').isDisabled(),true);
  assert.deepEqual(f.requests,{config:0,sdk:0,blocked:[]});passed('initial load has no config, auth or cloud request');
  await page.locator('#prepare').click();await page.waitForFunction(()=>!document.querySelector('#fields').disabled);
  assert.equal(f.requests.config,1);assert.equal(f.requests.sdk,0);assert.equal(await page.locator('input').count(),3);
  if(variant==='without-app-id')assert.match(await page.locator('#setupStatus').innerText(),/appIdは提供されていない/);passed('automatic sandbox config replaces manual parameter entry');
  await page.evaluate(()=>localStorage.setItem('lifeplan-sim-state-v1','FICTIONAL-KEEP-UNCHANGED'));
  await fill(page);await page.locator('#run').click();
  await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('12/12 成功'),{},{timeout:45000});
  const values=await page.evaluate(marker=>({doc:__cloud.doc,writes:__cloud.writes,deletes:__cloud.deletes,closed:__cloud.closed,marker:localStorage.getItem(marker),saved:localStorage.getItem('lifeplan-sim-state-v1')}),MARKER);
  assert.deepEqual(values,{doc:null,writes:2,deletes:1,closed:3,marker:null,saved:'FICTIONAL-KEEP-UNCHANGED'});
  assert.equal(await page.locator('#email').inputValue(),'');assert.equal(await page.locator('#password').inputValue(),'');assert.equal(await page.locator('#run').isDisabled(),true);
  assert.equal(await page.locator('#steps li').count(),12);assert.equal(f.requests.sdk,3);assert.deepEqual(f.requests.blocked,[]);passed('12 encrypted stages, exact cleanup, logout and unrelated stored state retained');
  const text=await page.locator('#report').inputValue();assert.match(text,/12\/12 成功/);if(variant==='without-app-id')assert.match(text,/appId未提供/);assert.ok(!/fictional@example|synthetic-mobile-user|synthetic-api-key|fictional-only-password/.test(text));
  for(const width of [375,390,1280]){
   await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   assert.ok(await page.locator('#copy').evaluate(n=>n.getBoundingClientRect().height>=44));
   await page.screenshot({path:resolve(out,`${name}-success-${width}.png`),fullPage:true});
  }
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{value:undefined}));await page.locator('#copy').click();assert.match(await page.locator('#copyStatus').innerText(),/コピー操作/);
  passed('mobile widths, large touch controls and credential-free report with copy fallback');
  await page.evaluate(marker=>localStorage.setItem(marker,'1'),MARKER);await page.reload();await page.waitForFunction(()=>document.querySelector('#setupStatus').textContent.includes('未確認'));
  assert.equal(await page.locator('#prepare').isDisabled(),true);assert.equal(f.requests.config,1);assert.equal(f.requests.sdk,3);passed('unfinished marker blocks reconnect and repeated run');await f.context.close();
  f=await open({configMode:'wrong'});page=f.page;await page.locator('#prepare').click();await page.waitForFunction(()=>document.querySelector('#setupStatus').textContent.includes('一致しない'));
  assert.equal(await page.locator('#email').isDisabled(),true);assert.equal(f.requests.sdk,0);passed('wrong-project Hosting config blocks authentication');await f.context.close();
  f=await open({authMode:'wrong'});page=f.page;await page.locator('#prepare').click();await page.waitForFunction(()=>!document.querySelector('#fields').disabled);await fill(page);await page.locator('#run').click();
  await page.waitForFunction(()=>document.querySelector('#report').value.length>0);assert.match(await page.locator('#status').innerText(),/認証先/);
  assert.equal(await page.evaluate(()=>__cloud.writes),0);passed('wrong authenticated issuer stops before Firestore writes');await f.context.close();
  f=await open({domain:'lifeplan-private-sync.web.app'});assert.match(await f.page.locator('#setupStatus').innerText(),/HTTPSプレビュー/);assert.equal(await f.page.locator('#prepare').isDisabled(),true);assert.equal(f.requests.config+f.requests.sdk,0);passed('non-preview production-shaped origin rejected before connection');await f.context.close();
  f=await open({noLocks:true});assert.equal(await f.page.locator('#prepare').isDisabled(),true);assert.match(await f.page.locator('#setupStatus').innerText(),/必要なブラウザ機能/);assert.equal(f.requests.config+f.requests.sdk,0);passed('missing lock capability fails closed');await f.context.close();
  f=await open();page=f.page;await page.locator('#prepare').click();await page.waitForFunction(()=>!document.querySelector('#fields').disabled);
  await page.evaluate(name=>{navigator.locks.request(name,()=>new Promise(resolve=>{globalThis.__releaseLock=resolve;}));},LOCK);
  await page.waitForFunction(()=>typeof __releaseLock==='function');await fill(page);await page.locator('#run').click();await page.waitForFunction(()=>document.querySelector('#report').value.length>0);
  assert.match(await page.locator('#status').innerText(),/別の診断画面/);assert.equal(f.requests.sdk,0);await page.evaluate(()=>__releaseLock());passed('concurrent diagnostic cannot start or queue a second run');await f.context.close();
 }catch(error){record.error=error.message;process.exitCode=1;console.error('MOBILE_FAIL '+name+' '+error.message);}
 finally{if(browser)await browser.close();record.passed=record.cases.length;}
}
await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');
const total=report.engines.reduce((n,e)=>n+e.passed,0);console.log('MOBILE_BROWSER_SUMMARY '+JSON.stringify({total,variant,engines:report.engines.map(({name,passed,error})=>({name,passed,error})),realFirebase:false,realIPhone:false}));
