// Browser integration of the real candidate app and sync panel. Entirely fictional data.
// Two independent browser storage areas, real WebCrypto, loopback-only mock Firebase.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {dirname,resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
const dir=dirname(fileURLToPath(import.meta.url)),output=resolve(dir,'mobile-results/actual-app-sync');
await mkdir(output,{recursive:true});
const manifest=JSON.parse(await readFile(resolve(dir,'manifest.json'),'utf8'));
const allowed=new Set(manifest.files.map(f=>'/'+f.path));
const fixture=JSON.parse(await readFile(resolve(dir,'synthetic-full.json'),'utf8'));
const pcSeed=structuredClone(fixture),phoneSeed=structuredClone(fixture);
pcSeed.futureEnvelope={kind:'fictional-pc',keep:[0,null,'日本語']};
pcSeed.config.actuals['70']={endAsset:920,expense:10,taxSocial:1,note:'架空PC実績',updatedAt:'2026-10-20T00:00:00.000Z'};
pcSeed.config.reviews['70']={items:{synthetic_review:true},note:'架空PC年次点検',updatedAt:'2026-10-20T00:00:00.000Z'};
phoneSeed.config.plan.initialAsset=987;
phoneSeed.config.actuals['69']={endAsset:777,note:'架空iPhone旧実績'};
phoneSeed.config.reviews['69']={items:{},note:'架空iPhone旧点検'};
phoneSeed.futureEnvelope={kind:'fictional-phone-original'};
const uid='synthetic-ui-owner',project='synthetic-ui-project',passphrase='synthetic-only-encryption-passphrase';
const cloud={document:null,writes:0,reads:0,conflicts:0},blocked=[];
const write=(res,code,obj)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(obj));};
const server=createServer(async(req,res)=>{
 const pathname=new URL(req.url,'http://127.0.0.1').pathname;
 if(pathname==='/__test__/read'&&req.method==='GET'){
  cloud.reads++;return write(res,200,{document:cloud.document});
 }
 if(pathname==='/__test__/cas'&&req.method==='POST'){
  let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>900000)return write(res,413,{error:'too-large'});}
  let body;try{body=JSON.parse(raw);}catch{return write(res,400,{error:'invalid'});}
  const before=cloud.document;
  if(body?.uid!==uid||body?.next?.ownerUid!==uid||body?.next?.formatVersion!==1||
    body?.next?.revision!==(before?.revision??0)+1||
    body?.expected?.revision!==(before?.revision??0)||
    (body?.expected?.digest??null)!==(before?.digest??null)){
   cloud.conflicts++;return write(res,409,{error:'stale'});
  }
  cloud.document=structuredClone(body.next);cloud.writes++;
  return write(res,200,{ok:true});
 }
 if(!['GET','HEAD'].includes(req.method))return write(res,405,{error:'method'});
 const file=pathname==='/'?'/index.html':pathname;
 if(!allowed.has(file))return write(res,404,{error:'no-file'});
 try{
  const bytes=await readFile(resolve(dir,'app',file.slice(1)));
  const types={'.html':'text/html','.mjs':'text/javascript','.css':'text/css','.webmanifest':'application/manifest+json','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
  res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':'no-store'});
  res.end(req.method==='HEAD'?null:bytes);
 }catch{return write(res,404,{error:'not-staged'});}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const origin='http://127.0.0.1:'+server.address().port;
const appJs=[
 'const apps=[];',
 'export function getApps(){return apps;}',
 'export function initializeApp(options,name){if(options.projectId!=="synthetic-ui-project")throw Error("wrong-project");const x={options,name};apps.push(x);return x;}'
].join('\n');
const authJs=[
 'export const browserLocalPersistence={type:"synthetic-browser-persistence"};',
 'export function getAuth(app){const active=localStorage.getItem("__synthetic_auth")==="synthetic-ui-owner";return {app,currentUser:active?{uid:"synthetic-ui-owner"}:null,authStateReady:async()=>{}};}',
 'export async function setPersistence(auth,value){if(value!==browserLocalPersistence)throw Error("wrong-persistence");}',
 'export async function signInWithEmailAndPassword(auth,email,password){if(email!=="fictional@example.invalid"||password!=="synthetic-firebase-password")throw Error("bad-test-login");auth.currentUser={uid:"synthetic-ui-owner"};localStorage.setItem("__synthetic_auth","synthetic-ui-owner");return {user:auth.currentUser};}',
 'export async function signOut(auth){auth.currentUser=null;localStorage.removeItem("__synthetic_auth");}'
].join('\n');
const firestoreJs=[
 'export function getFirestore(app){return {app};}',
 'export function doc(db,...parts){if(parts.join("/")!=="owners/synthetic-ui-owner/snapshots/current")throw Error("not-test-path");return {db};}',
 'async function read(){const response=await fetch("/__test__/read",{cache:"no-store"});if(!response.ok)throw Error("unavailable");return (await response.json()).document;}',
 'export async function getDocFromServer(ref){const record=await read();return {exists:()=>record!==null,data:()=>structuredClone(record)};}',
 'export function serverTimestamp(){return {__synthetic_server_timestamp:true};}',
 'export async function runTransaction(db,fn){let observed,record;const tx={async get(ref){if(ref.db!==db)throw Error("wrong-db");const state=await read();observed={revision:state?.revision??0,digest:state?.digest??null};return {exists:()=>state!==null,data:()=>structuredClone(state)};},set(ref,value){if(ref.db!==db||!observed)throw Error("read-required");record=structuredClone(value);}};const result=await fn(tx);if(record){const response=await fetch("/__test__/cas",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({uid:"synthetic-ui-owner",expected:observed,next:record})});if(!response.ok)throw Error("sync-conflict: stale revision");}return result;}'
].join('\n');
const sdk={'firebase-app.js':appJs,'firebase-auth.js':authJs,'firebase-firestore.js':firestoreJs};
const report={scope:'candidate app UI, real sync/crypto, desktop Chromium + mobile WebKit, isolated in-memory cloud, no real Firebase or personal data',cases:[]};
const mark=(name)=>{report.cases.push({name,pass:true});console.log('ACTUAL_APP_TWO_DEVICE_PASS '+name);};
const readState=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('lifeplan-sim-state-v1')));
const canonicalState=page=>page.evaluate(async()=>{const {loadState}=await import('/storage.mjs');return loadState();});
const readMarker=page=>page.evaluate(()=>JSON.parse(localStorage.getItem('lifeplan-private-sync-marker-v1')));
const status=page=>page.locator('#privateSyncContainer [role="status"]').innerText();
const wait=async(page,text)=>{await page.waitForFunction(expected=>{const s=document.querySelector('#privateSyncContainer [role="status"]')?.textContent??'';return s.includes(expected)||s.includes('同期停止');},text,{timeout:30000});const observed=await status(page);if(!observed.includes(text)){const debug=await page.evaluate(()=>({activeTag:document.activeElement?.tagName,activeId:document.activeElement?.id,activeName:document.activeElement?.getAttribute?.('name'),inSync:!!document.activeElement?.closest?.('#privateSyncContainer'),otherFocused:!!document.activeElement?.closest?.('#dashboard input, #dashboard select, #dashboard textarea'),pensionDirty:document.querySelector('#pensionState')?.dataset?.dirty,salaryDirty:document.querySelector('#salaryState')?.dataset?.dirty,externalEvents:(window.__testExternalEvents||[]).slice(-12)}));throw Error('Unexpected sync status ('+text+'): '+observed.slice(0,250)+' GUARD '+JSON.stringify(debug));}};
const click=(page,label)=>page.getByRole('button',{name:label,exact:true}).click();
const edit=(page,value)=>page.evaluate(value=>{const k='lifeplan-sim-state-v1';const state=JSON.parse(localStorage.getItem(k));state.config.plan.initialAsset=value;localStorage.setItem(k,JSON.stringify(state));},value);
let pcBrowser,phoneBrowser,pcContext,phoneContext,pc,phone;
async function context(browser,seed,viewport){
 const result=await browser.newContext({viewport,acceptDownloads:true,serviceWorkers:'block'});
 await result.addInitScript(seed=>{if(!localStorage.getItem('lifeplan-sim-state-v1'))localStorage.setItem('lifeplan-sim-state-v1',JSON.stringify(seed));window.__testExternalEvents=[];for(const type of ['input','change'])document.addEventListener(type,event=>{const el=event.target;if(el?.closest?.('#dashboard')&&!el?.closest?.('#privateSyncContainer'))window.__testExternalEvents.push({type,tag:el.tagName,id:el.id||'',name:el.getAttribute?.('name')||''});},true);},seed);
 await result.route('**/*',async route=>{
  const u=new URL(route.request().url());
  if(u.origin===origin)return route.continue();
  const file=u.pathname.split('/').at(-1);
  if(u.origin==='https://www.gstatic.com'&&u.pathname.startsWith('/firebasejs/12.19.0/')&&Object.hasOwn(sdk,file))
   return route.fulfill({status:200,contentType:'text/javascript',headers:{'Access-Control-Allow-Origin':'*'},body:sdk[file]});
  blocked.push(u.hostname);return route.abort();
 });
 return result;
}
async function open(ctx){
 const page=await ctx.newPage();page.setDefaultTimeout(25000);
 await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
 await page.locator('#privateSyncContainer [name="syncApiKey"]').waitFor({state:'attached'});
 await page.locator('[data-group="manage"]').click();
 await page.locator('[data-tab="settings"]').click();
 const details=page.locator('#privateSyncCard details');
 if(!(await details.getAttribute('open')))await details.locator('summary').click();
 return page;
}
async function login(page,persisted=false){
 for(const [name,value] of Object.entries({
  syncApiKey:'synthetic-key',syncAuthDomain:project+'.firebaseapp.com',
  syncProjectId:project,syncAppId:'synthetic-web-id',
  syncEmail:persisted?'':'fictional@example.invalid',
  syncPassword:persisted?'':'synthetic-firebase-password',
  syncPhrase:passphrase
 }))await page.locator('[name="'+name+'"]').fill(value);
 await click(page,'Firebaseに本人ログインして確認');
 // After restart, successful connection may advance directly from "connected" to
 // "synced" or "uploaded" before a status-text waiter runs. Observe the
 // enabled authenticated control instead of depending on transient wording.
 await page.waitForFunction(()=>{
  const buttons=[...document.querySelectorAll('#privateSyncContainer button')];
  const b=buttons.find(x=>x.textContent==='同期状態を確認');
  return Boolean(b&&!b.disabled);
 },null,{timeout:30000});
 const connectedStatus=await status(page);
 assert(!connectedStatus.startsWith('同期停止'),connectedStatus);
}
try{
 pcBrowser=await chromium.launch({headless:true});phoneBrowser=await webkit.launch({headless:true});
 report.engines={desktop:'Chromium '+pcBrowser.version(),mobile:'WebKit '+phoneBrowser.version()};
 pcContext=await context(pcBrowser,pcSeed,{width:1280,height:800});
 phoneContext=await context(phoneBrowser,phoneSeed,{width:390,height:844});
 pc=await open(pcContext);phone=await open(phoneContext);
 assert.equal((await readState(pc)).config.plan.initialAsset,1000);
 assert.equal((await readState(phone)).config.plan.initialAsset,987);
 assert.equal(cloud.writes,0);mark('independent-real-app-saved-states');
 await login(pc);
 assert.equal(cloud.writes,0);
 assert.equal(await pc.getByRole('button',{name:'この端末を初回の同期元にする'}).isDisabled(),true);
 mark('no-initial-write-without-explicit-backup-and-source');
 await pc.locator('[name="syncBackupConfirmed"]').check();
 await click(pc,'この端末を初回の同期元にする');await wait(pc,'初回の暗号化クラウド保存が完了');
 assert.equal(cloud.writes,1);assert.equal(cloud.document.revision,1);
 assert.equal(JSON.stringify(cloud.document).includes('initialAsset'),false);
 assert.equal((await readMarker(pc)).baseRevision,1);
 mark('pc-encrypted-first-upload');
 await login(phone);await phone.locator('[name="syncBackupConfirmed"]').check();
 assert.equal(await phone.getByRole('button',{name:'確認したクラウドをこの端末へ初回取込'}).isDisabled(),true);
 await click(phone,'クラウド内容と端末内容を照合（書込みなし）');
 await wait(phone,'クラウド内容を読み取り検証しました');
 assert.equal((await readState(phone)).config.plan.initialAsset,987);
 const phoneBeforeImport=await canonicalState(phone);
 assert.equal(cloud.writes,1,'preview must not write cloud');
 await click(phone,'確認したクラウドをこの端末へ初回取込');
 await wait(phone,'クラウド内容を検証して端末に反映しました');
 assert.equal((await readState(phone)).config.plan.initialAsset,1000);
 assert.deepEqual((await readState(phone)).futureEnvelope,pcSeed.futureEnvelope);
 const receiverBackup=await phone.evaluate(()=>JSON.parse(localStorage.getItem('lifeplan-private-sync-previous-v1')));
 assert.deepEqual(receiverBackup.state,phoneBeforeImport,'original receiver state must be recoverable');
 assert.deepEqual(await canonicalState(phone),await canonicalState(pc),
  'all adopted settings, comparison scenarios, actuals, reviews, unknown fields must transfer intact');
 assert.equal((await readState(phone)).config.actuals['70'].endAsset,920);
 assert.equal((await readState(phone)).config.reviews['70'].note,'架空PC年次点検');
 assert.equal((await readState(phone)).scenarios.length,2);
 assert.equal((await readMarker(phone)).baseRevision,1);
 assert.equal(cloud.writes,1,'the import must not create another cloud write');
 mark('phone-reviewed-import-with-previous-backup');
 mark('complete-settings-scenarios-actuals-reviews-and-unknown-fields-preserved');
 const previous=await readState(phone);
 await phone.reload({waitUntil:'domcontentloaded'});
 await phone.locator('[data-group="manage"]').click();
 await phone.locator('[data-tab="settings"]').click();
 await phone.locator('#privateSyncCard summary').click();
 assert.deepEqual(await readState(phone),previous);
 await login(phone,true);await wait(phone,'同期済み');
 mark('mobile-restart-persistent-state-marker-and-auth');
 await edit(pc,1025);await pc.reload({waitUntil:'domcontentloaded'});
 await pc.locator('[data-group="manage"]').click();await pc.locator('[data-tab="settings"]').click();
 await pc.locator('#privateSyncCard summary').click();
 await login(pc,true);await wait(pc,'この端末の変更を暗号化して同期しました');
 assert.equal(cloud.document.revision,2);
 await click(phone,'同期状態を確認');
 await wait(phone,'クラウド内容を検証して端末に反映しました');
 assert.equal((await readState(phone)).config.plan.initialAsset,1025);
 assert.deepEqual(await canonicalState(phone),await canonicalState(pc),
   'revision 2 must not drop scenarios, actuals or annual review');
 assert.equal((await readMarker(phone)).baseRevision,2);
 mark('pc-update-to-phone-verified-remote-update');
 await edit(pc,1030);await edit(phone,1040);
 await pc.close();await phone.close();
 pc=await open(pcContext);phone=await open(phoneContext);
 await login(pc,true);await wait(pc,'この端末の変更を暗号化して同期しました');
 assert.equal(cloud.document.revision,3);
 await login(phone,true);await wait(phone,'同期停止');
 assert.match(await status(phone),/両端末|競合|衝突/);
 assert.equal((await readState(phone)).config.plan.initialAsset,1040);
 assert.equal((await readState(pc)).config.plan.initialAsset,1030);
 assert.equal((await readMarker(phone)).baseRevision,2);
 assert.equal((await readState(phone)).config.actuals['70'].endAsset,920);
 assert.equal((await readState(phone)).config.reviews['70'].note,'架空PC年次点検');
 assert.equal((await readState(phone)).scenarios.length,2);
 mark('parallel-edits-stop-without-overwriting-or-merging');
 assert.deepEqual(blocked,[]);
 const storageChecks=await Promise.all([pc,phone].map(p=>p.evaluate(()=>{
  const values=Object.entries(localStorage).map(([key,val])=>key+'='+val).join('\n');
  return {password:values.includes('synthetic-firebase-password'),phrase:values.includes('synthetic-only-encryption-passphrase')};
 })));
 assert(storageChecks.every(v=>!v.password&&!v.phrase));
 mark('no-secret-persistence-or-external-network');
 await pc.screenshot({path:resolve(output,'desktop-synthetic.png'),fullPage:true});
 await phone.screenshot({path:resolve(output,'webkit-synthetic.png'),fullPage:true});
 report.status='passed';report.cloud={writes:cloud.writes,revision:cloud.document.revision,realFirebase:false};
 console.log('ACTUAL_APP_TWO_DEVICE_OK '+report.cases.length+' checks, no real Firebase or personal state');
}catch(error){
 report.status='failed';report.error=error.stack;process.exitCode=1;console.error('ACTUAL_APP_TWO_DEVICE_FAILED '+error.stack);
}finally{
 await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2)+'\n');
 if(pcContext)await pcContext.close();if(phoneContext)await phoneContext.close();
 if(pcBrowser)await pcBrowser.close();if(phoneBrowser)await phoneBrowser.close();
 await new Promise(ok=>server.close(ok));
}
