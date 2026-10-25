import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createFirebaseStore,validateFirebaseConfig} from './sync-firebase.mjs';
import {createSyncCoordinator} from './sync-controller.mjs';
import {encryptSnapshot,snapshotDigest,decryptSnapshot} from './sync-crypto.mjs';
import {FakeCipherCloud} from './sync-policy.mjs';
import {CLOUD_ACTIONS,cloudResultText,hasExternalEditorFocus} from './sync-panel.mjs';
const config={apiKey:'fictional-web-key',authDomain:'fixture.example.test',projectId:'fictional-project',appId:'1:0:web:fixture'};
function sdkMock(existing=true){
 let signed=existing?{uid:'fictional-owner'}:null,loginCalls=0,reads=0,writes=0,persisted=false,ready=false;
 const listeners=new Set();
 const auth={get currentUser(){return signed;},async authStateReady(){ready=true;}};
 const modules={
  'firebase-app.js':{getApps:()=>[],initializeApp:(cfg,name)=>({options:cfg,name})},
  'firebase-auth.js':{getAuth:()=>auth,browserLocalPersistence:'local',setPersistence:async()=>{persisted=true;},
   signInWithEmailAndPassword:async(a,email,password)=>{loginCalls++;assert.ok(email&&password);signed={uid:'fictional-owner'};for(const f of listeners)f(signed);return {user:signed};},
   signOut:async()=>{signed=null;for(const f of listeners)f(null);},
   onAuthStateChanged:(a,f)=>{listeners.add(f);f(signed);return()=>listeners.delete(f);}},
  'firebase-firestore.js':{getFirestore:()=>({}),doc:()=>({}),getDocFromServer:async()=>{reads++;return {exists:()=>false};},
   runTransaction:async()=>{writes++;throw Error('unexpected');}}
 };
 return {loader:async url=>modules[url.split('/').at(-1)],counts:()=>({loginCalls,reads,writes,persisted,ready,listeners:listeners.size})};
}
const phrase='fictional test passphrase 20261024';
const state=()=>({config:{plan:{startDate:'2042-01-15',initialAsset:1200}},scenarios:[],opaque:{keep:'fictional'}});
async function harness(){
 let local=state(),savedMarker=null,applies=0,rollback=null,allow=true;
 const cloud=new FakeCipherCloud(),identity={projectId:'fictional-project',uid:'fictional-owner'};
 const make=()=>createSyncCoordinator({...identity,passphrase:phrase,loadLocal:()=>structuredClone(local),
  validateLocal:s=>assert.ok(s?.config&&Array.isArray(s.scenarios)),applyLocal:s=>{applies++;local=structuredClone(s);return local;},
  saveBeforeReplace:s=>{rollback=structuredClone(s);},readMarker:()=>savedMarker,writeMarker:m=>{savedMarker=m;},
  readRemote:()=>cloud.read(),casRemote:(e,n)=>cloud.compareAndSwap(e,n),writeAllowed:()=>allow});
 const c=make();assert.equal((await c.initialUpload({backupConfirmed:true})).status,'INITIAL_UPLOADED');
 return {c,cloud,local:()=>local,edit:f=>f(local),marker:()=>savedMarker,applies:()=>applies,rollback:()=>rollback,
  forbid:()=>{allow=false;},async remoteEdit(f){const next=state();f(next);const enc=await encryptSnapshot(next,phrase);cloud.latest={formatVersion:1,revision:cloud.latest.revision+1,digest:enc.digest,ciphertext:enc.payload};}};
}
test('Auth-only session inspection waits for Firebase restoration and does not read financial data',async()=>{
 const m=sdkMock(),s=await createFirebaseStore(config,{moduleLoader:m.loader});
 assert.deepEqual(s.getSessionIdentity(),{uid:'fictional-owner',projectId:'fictional-project'});
 assert.deepEqual(m.counts(),{loginCalls:0,reads:0,writes:0,persisted:true,ready:true,listeners:0});
});
test('persisted authentication does not require another password login',async()=>{
 const m=sdkMock(),s=await createFirebaseStore(config,{moduleLoader:m.loader});await s.signIn('','');assert.equal(m.counts().loginCalls,0);
});
test('missing session is not reported as signed in and explicit credentials are required',async()=>{
 const m=sdkMock(false),s=await createFirebaseStore(config,{moduleLoader:m.loader});
 assert.equal(s.getSessionIdentity(),null);await assert.rejects(s.signIn('',''));
 await s.signIn('fictional@example.test','fixture-password');assert.equal(m.counts().loginCalls,1);
});
test('authentication observer detects sign-out and can be unsubscribed',async()=>{
 const m=sdkMock(),s=await createFirebaseStore(config,{moduleLoader:m.loader}),events=[];
 const off=s.watchSession(x=>events.push(x));await s.signOut();assert.equal(events.length,2);assert.equal(events[1],null);off();assert.equal(m.counts().listeners,0);
});
test('SDK/project config validation still rejects empty configuration',()=>assert.throws(()=>validateFirebaseConfig({projectId:'x'})));
test('read-only preview exposes unchanged direction, without cloud or local mutation',async()=>{
 const h=await harness(),before=structuredClone(h.marker());const r=await h.c.previewRemote();
 assert.equal(r.syncAction,'UNCHANGED');assert.equal(r.differs,false);assert.equal(h.cloud.writes,1);assert.equal(h.applies(),0);assert.deepEqual(h.marker(),before);
});
test('preview detects a local-only change but never uploads it',async()=>{
 const h=await harness();h.edit(s=>{s.config.note='fictional-local';});const r=await h.c.previewRemote();
 assert.equal(r.syncAction,'UPLOAD_CAS');assert.equal(r.differs,true);assert.equal(h.cloud.writes,1);assert.equal(h.applies(),0);
 assert.equal((await h.c.acceptLocalUpdate()).status,'UPLOADED');assert.equal(h.cloud.writes,2);
});
test('preview detects cloud-only change; reviewed import preserves old state and unknown data',async()=>{
 const h=await harness(),old=structuredClone(h.local());await h.remoteEdit(s=>{s.config.note='fictional-cloud';});
 assert.equal((await h.c.previewRemote()).syncAction,'DOWNLOAD_VALIDATED');assert.equal(h.applies(),0);
 assert.equal((await h.c.acceptRemoteUpdate()).status,'DOWNLOADED');assert.deepEqual(h.rollback(),old);assert.equal(h.local().opaque.keep,'fictional');
});
test('both sides changed still stops without forced cloud-master overwrite',async()=>{
 const h=await harness();h.edit(s=>{s.config.note='local';});await h.remoteEdit(s=>{s.config.note='remote';});
 assert.equal((await h.c.previewRemote()).syncAction,'CONFLICT');assert.equal((await h.c.acceptRemoteUpdate()).status,'CONFLICT');
 assert.equal((await h.c.acceptLocalUpdate()).status,'CONFLICT');assert.equal(h.cloud.writes,1);assert.equal(h.applies(),0);
});
test('review cannot be reused after a further local save',async()=>{
 const h=await harness();h.edit(s=>{s.config.note='local-one';});await h.c.previewRemote();h.edit(s=>{s.config.note='local-two';});
 assert.equal((await h.c.acceptLocalUpdate()).status,'STOP');assert.equal(h.cloud.writes,1);
});
test('offline result leaves both records unchanged',async()=>{
 const h=await harness();h.cloud.offline=true;const before=structuredClone(h.local());assert.equal((await h.c.runAuto()).status,'STOP');assert.deepEqual(h.local(),before);assert.equal(h.cloud.writes,1);
});
test('read-only writer lock is still enforced for writes',async()=>{
 const h=await harness();h.edit(s=>{s.config.note='local';});await h.c.previewRemote();h.forbid();assert.equal((await h.c.acceptLocalUpdate()).status,'STOP');assert.equal(h.cloud.writes,1);
});
test('initial upload is never a way to replace an existing cloud snapshot',async()=>{
 const h=await harness();assert.equal((await h.c.initialUpload({backupConfirmed:true})).status,'STOP');assert.equal(h.cloud.writes,1);
});
test('current encryption remains AES-GCM with the same format and full-state preservation',async()=>{
 const enc=await encryptSnapshot(state(),phrase);assert.equal(enc.payload.algorithm,'AES-256-GCM/PBKDF2-SHA256');assert.equal(enc.payload.iterations,600000);
 assert.deepEqual(await decryptSnapshot(enc.payload,phrase,enc.digest),state());await assert.rejects(decryptSnapshot(enc.payload,'wrong fixture passphrase',enc.digest));
});
test('seven daily/initial action numbers remain stable and ③-B is an explicitly separate conflict action',()=>{
 assert.deepEqual(Object.keys(CLOUD_ACTIONS),['1','2','3','4','5','6','7','3b']);assert.equal(new Set(Object.values(CLOUD_ACTIONS)).size,8);
 assert.match(CLOUD_ACTIONS['3b'],/クラウドを採用/);
 for(const name of Object.values(CLOUD_ACTIONS))assert.doesNotMatch(name,/クラウドへ同期/);
});
test('error and offline presentation never claims successful cloud saving',()=>{
 for(const status of ['STOP','PENDING_OFFLINE','PENDING_LOCAL_UPDATE'])assert.doesNotMatch(cloudResultText({status}),/保存済み|書込みが完了/);
 assert.match(cloudResultText({status:'UPLOADED'}),/書込みが完了/);
});
test('sync-field focus remains distinct from a dirty financial editor',()=>{
 const focus=isSync=>({closest:s=>s==='#dashboard input, #dashboard select, #dashboard textarea'?{}:s==='#privateSyncContainer'&&isSync?{}:null});
 assert.equal(hasExternalEditorFocus({activeElement:focus(true)}),false);assert.equal(hasExternalEditorFocus({activeElement:focus(false)}),true);
});
test('UI initialization does not embed user credentials or weaken storage/crypto defaults',()=>{
 const s=fs.readFileSync(new URL('./sync-panel.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(s,/console\.(log|info|debug)/);assert.doesNotMatch(s,/setItem\([^\n]*(?:secret|passphrase|pwd|phrase\.value|password\.value)/);
 assert.match(s,/if\(!registered\(\)\|\|safeGet\(SYNC_AUTO_RESUME_KEY\)==='stopped'\)return/);
});
