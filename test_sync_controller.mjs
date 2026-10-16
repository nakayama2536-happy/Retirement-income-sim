import test from 'node:test';
import assert from 'node:assert/strict';
import {FakeCipherCloud} from './sync-policy.mjs';
import {createSyncCoordinator} from './sync-controller.mjs';
const pass='completely-fictional-long-encryption-passphrase';
const state=()=>({config:{people:{primary:{birthDate:'1980-01-15'}},plan:{startDate:'2044-02-15',initialAsset:101}},scenarios:[{id:'fictional-a',role:'baseline',config:{fake:1}}],unknownEnvelope:{future:'keep'}});
const harness=(cloud=new FakeCipherCloud(),initial=state())=>{
 let local=structuredClone(initial),meta=null,failBackup=false,failWrite=false,online=true,writeAccess=true,canImport=true,backups=[],replacements=0,applied=0;
 const controller=()=>createSyncCoordinator({
  projectId:'test-project',uid:'test-person',passphrase:pass,
  loadLocal:()=>structuredClone(local),
  validateLocal:s=>{if(!s?.config||!Array.isArray(s.scenarios))throw Error('invalid-full-state');},
  applyLocal:(next,old)=>{if(failWrite)throw Error('StorageQuotaError');if(JSON.stringify(local)!==JSON.stringify(old))throw Error('concurrent-local-change');local=structuredClone(next);replacements++;},
  saveBeforeReplace:old=>{if(failBackup)throw Error('BackupWriteError');backups.push(structuredClone(old));},
  readMarker:()=>structuredClone(meta),writeMarker:x=>{meta=structuredClone(x);},
  readRemote:()=>cloud.read(),casRemote:(old,next)=>cloud.compareAndSwap(old,next),
  online:()=>online,writeAllowed:()=>writeAccess,canAutoImport:()=>canImport,onApplied:()=>{applied++;}
 });
 return {controller,cloud,get local(){return structuredClone(local);},get meta(){return structuredClone(meta);},get backups(){return structuredClone(backups);},
 get replacements(){return replacements;},get applied(){return applied;},
 edit:f=>f(local),setOnline:v=>online=v,setWriteAllowed:v=>writeAccess=v,setCanImport:v=>canImport=v,setFailBackup:v=>failBackup=v,setFailWrite:v=>failWrite=v};
};
test('no first-device enrollment or upload without full backup consent',async()=>{
 const h=harness();assert.equal((await h.controller().runAuto()).status,'ENROLLMENT_REQUIRED');
 assert.equal((await h.controller().initialUpload()).status,'STOP');assert.equal(h.cloud.writes,0);
});
test('first device uploads one encrypted snapshot and stores no plaintext on remote',async()=>{
 const h=harness(),c=h.controller(),result=await c.initialUpload({backupConfirmed:true});
 assert.equal(result.status,'INITIAL_UPLOADED');assert.equal(h.cloud.writes,1);
 assert.equal(h.cloud.latest.revision,1);assert(!JSON.stringify(h.cloud.latest).includes('initialAsset'));
 assert.equal(h.meta.baseRevision,1);assert.deepEqual(h.local,state());
 assert.equal((await c.runAuto()).status,'SYNCED');
});
test('second device requires an explicit first download; backup failure stops before replace',async()=>{
 const a=harness();await a.controller().initialUpload({backupConfirmed:true});
 const b=harness(a.cloud,{config:{plan:{initialAsset:999}},scenarios:[],oldField:'retain'});
 assert.equal((await b.controller().runAuto()).status,'ENROLLMENT_REQUIRED');
 b.setFailBackup(true);const failed=await b.controller().initialDownload({backupConfirmed:true});
 assert.equal(failed.status,'STOP');assert.equal(b.replacements,0);
 b.setFailBackup(false);const ok=await b.controller().initialDownload({backupConfirmed:true});
 assert.equal(ok.status,'DOWNLOADED');assert.deepEqual(b.local,a.local);
 assert.equal(b.backups.length,1);assert.equal(b.backups[0].oldField,'retain');
});
test('device A changes sync through CAS and clean device B downloads safely',async()=>{
 const a=harness(),b=harness(a.cloud,{config:{plan:{initialAsset:999}},scenarios:[]});
 await a.controller().initialUpload({backupConfirmed:true});
 await b.controller().initialDownload({backupConfirmed:true});
 a.edit(s=>{s.config.plan.initialAsset=222;s.unknownEnvelope.keep=1;});
 assert.equal((await a.controller().runAuto()).status,'UPLOADED');
 assert.equal((await b.controller().runAuto()).status,'DOWNLOADED');assert.deepEqual(b.local,a.local);
 assert.equal(b.cloud.writes,2);assert.equal(b.applied,2);
});
test('parallel edits raise CONFLICT; losing device does not overwrite either',async()=>{
 const a=harness(),b=harness(a.cloud,{config:{plan:{initialAsset:999}},scenarios:[]});
 await a.controller().initialUpload({backupConfirmed:true});await b.controller().initialDownload({backupConfirmed:true});
 a.edit(s=>s.config.plan.initialAsset=202);b.edit(s=>s.config.plan.initialAsset=303);
 assert.equal((await a.controller().runAuto()).status,'UPLOADED');
 assert.equal((await b.controller().runAuto()).status,'CONFLICT');assert.equal(a.cloud.writes,2);
 assert.equal(b.local.config.plan.initialAsset,303);
});
test('offline local edit remains pending and uploads when online returns',async()=>{
 const h=harness();await h.controller().initialUpload({backupConfirmed:true});h.setOnline(false);h.edit(s=>s.config.plan.initialAsset=42);
 assert.equal((await h.controller().runAuto()).status,'PENDING_OFFLINE');assert.equal(h.cloud.writes,1);
 h.setOnline(true);assert.equal((await h.controller().runAuto()).status,'UPLOADED');assert.equal(h.cloud.writes,2);
});
test('missing write access never creates cloud writes',async()=>{
 const h=harness();h.setWriteAllowed(false);
 assert.equal((await h.controller().initialUpload({backupConfirmed:true})).status,'STOP');assert.equal(h.cloud.writes,0);
});
test('corrupt cipher or incorrect passphrase prevents import and protects local',async()=>{
 const a=harness();await a.controller().initialUpload({backupConfirmed:true});
 const b=harness(a.cloud,{config:{plan:{initialAsset:999}},scenarios:[]});
 a.cloud.latest.digest='0'.repeat(64);
 assert.equal((await b.controller().initialDownload({backupConfirmed:true})).status,'STOP');
 assert.equal(b.replacements,0);assert.equal(b.backups.length,0);
});
test('failure after rollback backup protects existing local data',async()=>{
 const a=harness();await a.controller().initialUpload({backupConfirmed:true});
 const b=harness(a.cloud,{config:{plan:{initialAsset:999}},scenarios:[]});b.setFailWrite(true);
 assert.equal((await b.controller().initialDownload({backupConfirmed:true})).status,'STOP');
 assert.equal(b.local.config.plan.initialAsset,999);assert.equal(b.backups.length,1);
});

test('uncommitted UI edits block automatic cloud download until explicit review',async()=>{
 const a=harness(),b=harness(a.cloud,{config:{plan:{initialAsset:999}},scenarios:[]});
 await a.controller().initialUpload({backupConfirmed:true});await b.controller().initialDownload({backupConfirmed:true});
 a.edit(x=>x.config.plan.initialAsset=888);assert.equal((await a.controller().runAuto()).status,'UPLOADED');
 b.setCanImport(false);
 const before=b.local;
 const pending=await b.controller().runAuto();
 assert.equal(pending.status,'REMOTE_PENDING_REVIEW');
 assert.deepEqual(b.local,before);assert.equal(b.replacements,1);
 const review=await b.controller().previewRemote();assert.equal(review.status,'PREVIEW');
 const imported=await b.controller().acceptRemoteUpdate();assert.equal(imported.status,'DOWNLOADED');
 assert.equal(b.local.config.plan.initialAsset,888);
});
