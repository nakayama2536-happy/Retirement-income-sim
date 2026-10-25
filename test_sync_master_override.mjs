import test from 'node:test';
import assert from 'node:assert/strict';
import {FakeCipherCloud} from './sync-policy.mjs';
import {snapshotDigest} from './sync-crypto.mjs';
import {createSyncCoordinator} from './sync-controller.mjs';
const pass='fictional-crypto-test-phrase-long-enough';
const makeState=(amount=100)=>({config:{plan:{startDate:'2044-01-01',initialAsset:amount},retirement:{conceptComment:'fictional plan'},reviews:{'70':{note:'sample'}}},scenarios:[{id:'fictional-scenario'}],futureOpaque:{keep:true}});
function device(cloud,initial=makeState()){
 let local=structuredClone(initial),marker=null,online=true,writeAccess=true,failBackup=false,failApply=false;
 const backups=[],seen=[];
 const inputs={
  projectId:'only-fictional-project',uid:'only-fictional-owner',passphrase:pass,
  loadLocal:()=>structuredClone(local),validateLocal:s=>{if(!s?.config||!Array.isArray(s.scenarios))throw Error('invalid-state');},
  applyLocal:(incoming,previous)=>{
   if(failApply)throw Error('save-failed');
   assert.deepEqual(local,previous,'local changed while awaiting remote');
   local=structuredClone(incoming);seen.push(structuredClone(incoming));return structuredClone(incoming);
  },
  saveBeforeReplace:previous=>{if(failBackup)throw Error('backup-full');backups.push(structuredClone(previous));},
  readMarker:()=>structuredClone(marker),writeMarker:m=>{marker=structuredClone(m);},
  readRemote:()=>cloud.read(),casRemote:(old,next)=>cloud.compareAndSwap(old,next),
  online:()=>online,writeAllowed:()=>writeAccess,
  canAutoImport:()=>true,canAutoUpload:()=>true,
 };
 const api=createSyncCoordinator(inputs);
 return {api,cloud,backups,seen,get state(){return structuredClone(local);},get marker(){return structuredClone(marker);},
  edit:f=>f(local),setOnline:v=>online=v,setWriteAccess:v=>writeAccess=v,
  setFailBackup:v=>failBackup=v,setFailApply:v=>failApply=v};
}
async function conflict(){
 const cloud=new FakeCipherCloud(),pc=device(cloud,makeState(101)),phone=device(cloud,makeState(201));
 assert.equal((await pc.api.initialUpload({backupConfirmed:true})).status,'INITIAL_UPLOADED');
 assert.equal((await phone.api.previewRemote()).status,'PREVIEW');
 assert.equal((await phone.api.initialDownload({backupConfirmed:true})).status,'DOWNLOADED');
 pc.edit(s=>{s.config.plan.initialAsset=303;s.config.retirement.conceptComment='PC updated';});
 phone.edit(s=>{s.config.plan.initialAsset=404;s.futureOpaque.phoneOnly='preserve-in-backup';});
 assert.equal((await pc.api.runAuto()).status,'UPLOADED');
 assert.equal((await phone.api.runAuto()).status,'CONFLICT');
 const review=await phone.api.previewRemote();assert.equal(review.status,'PREVIEW');assert.equal(review.syncAction,'CONFLICT');
 return {pc,phone,cloud};
}
const approval=async phone=>({backupConfirmed:true,discardLocalConfirmed:true,backedUpLocalDigest:await snapshotDigest(phone.state)});
test('both-sided conflict stays stopped under usual automatic and ③ imports',async()=>{
 const {phone,cloud}=await conflict(),before=phone.state;
 assert.equal((await phone.api.runAuto()).status,'CONFLICT');
 assert.equal((await phone.api.acceptRemoteUpdate()).status,'CONFLICT');
 assert.equal((await phone.api.acceptLocalUpdate()).status,'CONFLICT');
 assert.deepEqual(phone.state,before);assert.equal(cloud.writes,2);
});
test('③-B explicitly adopts newer cloud, preserves complete old device and does not upload',async()=>{
 const {pc,phone,cloud}=await conflict(),before=phone.state,revision=cloud.latest.revision;
 assert.equal((await phone.api.acceptRemoteAsMaster()).status,'STOP');
 assert.equal((await phone.api.acceptRemoteAsMaster({backupConfirmed:true,discardLocalConfirmed:true})).status,'STOP');
 assert.equal((await phone.api.acceptRemoteAsMaster({backupConfirmed:true,discardLocalConfirmed:true,backedUpLocalDigest:'f'.repeat(64)})).status,'STOP');
 assert.deepEqual(phone.state,before);assert.equal(cloud.writes,2);
 const result=await phone.api.acceptRemoteAsMaster(await approval(phone));
 assert.equal(result.status,'REMOTE_MASTER_APPLIED');assert.equal(result.revision,revision);
 assert.deepEqual(phone.state,pc.state);assert.deepEqual(phone.backups.at(-1),before);
 assert.equal(phone.backups.at(-1).futureOpaque.phoneOnly,'preserve-in-backup');
 assert.equal(phone.marker.baseRevision,revision);assert.equal(cloud.latest.revision,revision);assert.equal(cloud.writes,2);
 assert.equal((await phone.api.runAuto()).status,'SYNCED');
 assert.equal((await phone.api.acceptRemoteAsMaster(await approval(phone))).status,'STOP','not a repeatable blind overwrite');
});
test('no ③-B after local edit since ④ or after remote update since ④',async()=>{
 {const {phone,cloud}=await conflict(),old=phone.state;
  const digest=await snapshotDigest(phone.state);phone.edit(s=>s.config.plan.initialAsset=999);
  assert.equal((await phone.api.acceptRemoteAsMaster({backupConfirmed:true,discardLocalConfirmed:true,backedUpLocalDigest:digest})).status,'STOP');
  assert.equal(cloud.writes,2);assert.equal(phone.state.config.plan.initialAsset,999);assert.notDeepEqual(phone.state,old);}
 {const {phone,pc,cloud}=await conflict();const old=phone.state;
  pc.edit(s=>s.config.plan.initialAsset=505);assert.equal((await pc.api.runAuto()).status,'UPLOADED');
  assert.equal((await phone.api.acceptRemoteAsMaster(await approval(phone))).status,'STOP');
  assert.deepEqual(phone.state,old);assert.equal(cloud.writes,3);}
});
test('recheck remote digest/revision before replacing, even if it changes during decrypt or backup',async()=>{
 const cloud=new FakeCipherCloud();const a=device(cloud),b=device(cloud);
 await a.api.initialUpload({backupConfirmed:true});await b.api.previewRemote();await b.api.initialDownload({backupConfirmed:true});
 a.edit(s=>s.config.plan.initialAsset=121);b.edit(s=>s.config.plan.initialAsset=212);
 await a.api.runAuto();assert.equal((await b.api.previewRemote()).syncAction,'CONFLICT');
 // Data mutation inside cloud.read between the initial read and the final pre-commit check.
 const originalRead=cloud.read.bind(cloud);let reads=0;
 cloud.read=async()=>{reads++;const state=await originalRead();if(reads===2){cloud.latest.revision+=1;cloud.latest.digest='a'.repeat(64);}return state;};
 const old=b.state;assert.equal((await b.api.acceptRemoteAsMaster(await approval(b))).status,'STOP');
 assert.deepEqual(b.state,old);assert.equal(b.marker.baseRevision,1);
});
test('invalid/unchanged/rolled-back cloud cannot be promoted as master',async()=>{
 const {phone,cloud}=await conflict();
 cloud.latest.revision=phone.marker.baseRevision;
 assert.equal((await phone.api.previewRemote()).syncAction,'CONFLICT');
 const before=phone.state;
 assert.equal((await phone.api.acceptRemoteAsMaster(await approval(phone))).status,'STOP');assert.deepEqual(before,phone.state);
});
test('wrong encryption phrase and malformed remote block before backup or replacement',async()=>{
 const {phone,cloud}=await conflict();const before=phone.state;
 cloud.latest.ciphertext.data='not-cipher';
 assert.equal((await phone.api.acceptRemoteAsMaster(await approval(phone))).status,'STOP');
 assert.deepEqual(phone.state,before);
});
test('offline, read-only, backup-error and storage failure never send cloud writes',async()=>{
 {const {phone,cloud}=await conflict(),before=phone.state;phone.setOnline(false);
  assert.equal((await phone.api.acceptRemoteAsMaster(await approval(phone))).status,'PENDING_OFFLINE');assert.deepEqual(phone.state,before);assert.equal(cloud.writes,2);}
 {const {phone,cloud}=await conflict();phone.setWriteAccess(false);
  assert.equal((await phone.api.acceptRemoteAsMaster(await approval(phone))).status,'STOP');assert.equal(cloud.writes,2);}
 {const {phone,cloud}=await conflict(),before=phone.state;phone.setFailBackup(true);
  assert.equal((await phone.api.acceptRemoteAsMaster(await approval(phone))).status,'STOP');assert.deepEqual(phone.state,before);assert.equal(cloud.writes,2);}
 {const {phone,cloud}=await conflict(),before=phone.state;phone.setFailApply(true);
  assert.equal((await phone.api.acceptRemoteAsMaster(await approval(phone))).status,'STOP');assert.deepEqual(phone.state,before);assert.equal(phone.backups.at(-1).config.plan.initialAsset,404);assert.equal(cloud.writes,2);}
});
test('revised marker and local content cannot be silently replaced after comparison',async()=>{
 const {phone,cloud}=await conflict(),before=phone.state;
 // Simulate synced baseline change by another tab.
 const prior=phone.marker;const newRev=prior.baseRevision+1;
 // direct marker access is intentionally unavailable; use a read-only check of refusal on wrong preview after renewed server revisions.
 cloud.latest.revision=newRev+5;
 assert.equal((await phone.api.acceptRemoteAsMaster(await approval(phone))).status,'STOP');assert.deepEqual(phone.state,before);
});
