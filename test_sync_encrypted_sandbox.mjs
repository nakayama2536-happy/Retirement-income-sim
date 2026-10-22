import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createSandboxStore,runEncryptedSandboxCheck,assertSandboxTarget,LIVE_PROJECT,DEMO_PROJECT,sameTestRecord} from './tools/firebase-emulator/encrypted-sandbox-check.mjs';
const clone=v=>structuredClone(v),uid='fictional-test-user';
const denied=()=>Promise.reject(Object.assign(new Error('denied'),{code:'permission-denied'}));
function fixture(){
 const cloud={state:null,writes:0,deletes:0,tail:Promise.resolve()},snapshot=()=>{const v=clone(cloud.state);return {exists:()=>v!==null,data:()=>v};};
 const sdk={
  doc(_db,...path){assert.deepEqual(path,['sandbox',uid,'snapshots','trial']);return {};},
  getDocFromServer:async()=>snapshot(),serverTimestamp:()=>({testTimestamp:true}),
  runTransaction(_db,fn){
   const task=cloud.tail.then(async()=>{let pending;
    const output=await fn({get:async()=>snapshot(),set(_r,v){pending=clone(v);},delete(){pending=null;}});
    if(pending!==undefined){cloud.state=pending;if(pending===null)cloud.deletes++;else cloud.writes++;}
    return output;
   });cloud.tail=task.catch(()=>{});return task;
  }
 };
 const store=()=>createSandboxStore({sdk,database:{app:{options:{projectId:LIVE_PROJECT}}},projectId:LIVE_PROJECT,uid});
 return {cloud,sdk,writer:store(),reader:store(),unauthenticatedRead:denied};
}
const fakeRecord=()=>({ownerUid:uid,formatVersion:1,revision:1,digest:'a'.repeat(64),ciphertext:{different:'preexisting'}});
test('encrypted diagnostic completes twelve stages, two writes and conditional cleanup',async()=>{
 const f=fixture(),result=await runEncryptedSandboxCheck(f);
 assert.equal(result.ok,true,JSON.stringify(result));assert.deepEqual(result.steps,Array.from({length:12},(_,i)=>i+1));
 assert.equal(result.cleanup,'confirmed');assert.equal(f.cloud.writes,2);assert.equal(f.cloud.deletes,1);assert.equal(f.cloud.state,null);
 assert.equal(result.personalDataUsed,false);assert.equal(result.realDeviceSyncVerified,false);
 assert.equal(JSON.stringify(result).includes(uid),false);
});
test('actual project outside sandbox is rejected before SDK access',()=>{
 let calls=0;assert.throws(()=>createSandboxStore({sdk:{doc(){calls++;}},database:{},projectId:'lifeplan-private-sync',uid}),/wrong-sandbox-target/);assert.equal(calls,0);
});
test('emulator target requires exact demo ID and loopback',()=>{
 assert.doesNotThrow(()=>assertSandboxTarget({environment:'emulator',projectId:DEMO_PROJECT,host:'127.0.0.1',uid}));
 for(const x of [{projectId:LIVE_PROJECT,host:'127.0.0.1'},{projectId:DEMO_PROJECT,host:'remote.example'},{projectId:DEMO_PROJECT}])assert.throws(()=>assertSandboxTarget({environment:'emulator',uid,...x}));
});
test('SDK database must belong to the checked sandbox',()=>{
 assert.throws(()=>createSandboxStore({projectId:LIVE_PROJECT,uid,database:{app:{options:{projectId:'other'}}},sdk:{}}),/database-project-mismatch/);
});
test('identity cannot inject a document path',()=>{
 for(const invalid of ['',null,'bad/path'])assert.throws(()=>assertSandboxTarget({projectId:LIVE_PROJECT,uid:invalid}),/invalid-test-identity/);
});
test('single reused client is not reported as independent receiver',async()=>{
 const f=fixture();f.reader=f.writer;const r=await runEncryptedSandboxCheck(f);assert.equal(r.ok,false);assert.equal(f.cloud.writes,0);
});
test('preexisting document is never overwritten or cleaned up',async()=>{
 const f=fixture();f.cloud.state=fakeRecord();const saved=clone(f.cloud.state),r=await runEncryptedSandboxCheck(f);
 assert.equal(r.errorCode,'trial-already-exists');assert.equal(r.cleanup,'not-needed');assert.deepEqual(f.cloud.state,saved);assert.equal(f.cloud.deletes,0);assert.equal(f.cloud.writes,0);
});
test('missing unauthenticated probe fails before writing',async()=>{
 const f=fixture();delete f.unauthenticatedRead;const r=await runEncryptedSandboxCheck(f);assert.equal(r.ok,false);assert.equal(f.cloud.writes,0);
});
test('network error is not accepted as access rejection and own document is cleaned',async()=>{
 const f=fixture();f.unauthenticatedRead=()=>Promise.reject(Object.assign(new Error('offline'),{code:'unavailable'}));const r=await runEncryptedSandboxCheck(f);
 assert.equal(r.ok,false);assert.equal(r.steps.includes(7),false);assert.equal(r.cleanup,'confirmed');assert.equal(f.cloud.state,null);
});
test('unexpected unauthenticated access fails closed and cleans up',async()=>{
 const f=fixture();f.unauthenticatedRead=async()=>({exists:true});const r=await runEncryptedSandboxCheck(f);assert.equal(r.errorCode,'unauthenticated-read-not-denied');assert.equal(r.cleanup,'confirmed');
});
test('acknowledgement lost after initial commit still cleans exact owned ciphertext',async()=>{
 const f=fixture(),original=f.writer.compareAndSwap;f.writer.compareAndSwap=async(a,b)=>{await original(a,b);throw Object.assign(new Error('unknown'),{code:'unavailable'});};
 const r=await runEncryptedSandboxCheck(f);assert.equal(r.ok,false);assert.equal(r.cleanup,'confirmed');assert.equal(f.cloud.state,null);assert.equal(f.cloud.deletes,1);
});
test('ambiguous rejected initial write with absence is not reported as safe completion',async()=>{
 const f=fixture();f.writer.compareAndSwap=async()=>{throw Object.assign(new Error('unknown'),{code:'unavailable'});};const r=await runEncryptedSandboxCheck(f);
 assert.equal(r.ok,false);assert.equal(r.cleanup,'unconfirmed');assert.equal(f.cloud.writes,0);
});
test('failure on second write cleans first owned version without claiming success',async()=>{
 const f=fixture(),original=f.writer.compareAndSwap;f.writer.compareAndSwap=async(a,b)=>{if(a)throw Error('injected');return original(a,b);};const r=await runEncryptedSandboxCheck(f);
 assert.equal(r.ok,false);assert.equal(r.cleanup,'confirmed');assert.equal(f.cloud.state,null);assert.equal(f.cloud.writes,1);
});
test('a concurrent initial record is neither overwritten nor deleted',async()=>{
 const f=fixture(),original=f.writer.compareAndSwap;f.writer.compareAndSwap=async(a,b)=>{f.cloud.state=fakeRecord();return original(a,b);};const r=await runEncryptedSandboxCheck(f);
 assert.equal(r.errorCode,'stale-sandbox-record');assert.equal(r.cleanup,'unconfirmed');assert.deepEqual(f.cloud.state,fakeRecord());assert.equal(f.cloud.deletes,0);
});
test('cleanup refuses a record changed by another operation',async()=>{
 const f=fixture(),original=f.writer.removeOwnedAttempt;f.writer.removeOwnedAttempt=async attempts=>{f.cloud.state={...fakeRecord(),revision:3};return original(attempts);};const r=await runEncryptedSandboxCheck(f);
 assert.equal(r.ok,false);assert.equal(r.cleanup,'unconfirmed');assert.equal(f.cloud.state.revision,3);assert.equal(f.cloud.deletes,0);
});
test('logging failure cannot bypass verification or cleanup',async()=>{
 const f=fixture();f.onProgress=()=>{throw Error('UI logging failed');};const r=await runEncryptedSandboxCheck(f);assert.equal(r.ok,true);assert.equal(f.cloud.state,null);
});
test('record comparison ignores only timestamp and detects ciphertext changes',()=>{
 const a=fakeRecord();assert.equal(sameTestRecord(a,{...a,updatedAt:9}),true);assert.equal(sameTestRecord(a,{...a,ciphertext:{different:'changed'}}),false);
 assert.equal(sameTestRecord(null,null),true);assert.equal(sameTestRecord(a,null),false);
});
test('live page is local-only, lazy-connect, memory-auth and has no personal-file input',()=>{
 const page=readFileSync(new URL('./tools/firebase-emulator/live-encrypted.html',import.meta.url),'utf8');
 for(const text of ["location.hostname!=='127.0.0.1'",'inMemoryPersistence','localStorage.setItem(marker,','localStorage.removeItem(marker)','token.claims.aud!==LIVE_PROJECT','navigator.locks.request','await dbSdk.terminate(database)','await core.deleteApp(app)'])assert.ok(page.includes(text),text);
 assert.ok(page.indexOf("form.addEventListener('submit'")<page.indexOf("import(root+'firebase-app.js')"));
 assert.ok(!/type=["']file["']/.test(page));assert.ok(!page.includes('lifeplan-sim-state-v1'));assert.ok(!/console\.log/.test(page));
});
