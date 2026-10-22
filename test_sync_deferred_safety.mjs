// Deferred real-device acceptance: synthetic safety cases only.
// No Firebase SDK, Hosting calls, accounts, personal JSON, or external network.
import test from 'node:test';
import assert from 'node:assert/strict';
import {FakeCipherCloud} from './sync-policy.mjs';
import {createSyncCoordinator} from './sync-controller.mjs';

const PHRASE='fictional-deferred-only-long-passphrase-2026';
const fixture=()=>({
 config:{
  meta:{label:'架空検証専用'},plan:{startDate:'2044-01-01',initialAsset:1000},
  actuals:{70:{endAsset:920,note:'架空PC実績'}},
  reviews:{70:{items:{fictional_check:true},note:'架空PC年次点検'}}
 },
 scenarios:[{id:'synthetic-baseline',role:'baseline',config:{fictional:1}},
            {id:'synthetic-reference',role:'reference',config:{fictional:2}}],
 futureEnvelope:{keep:[null,0,'日本語']}
});
const duplicate=x=>structuredClone(x);
function device(cloud=new FakeCipherCloud(),initial=fixture()){
 let adopted=duplicate(initial),marker=null,connected=true,canImport=true,canUpload=true;
 let backupFails=false,replaceFails=false,rollback=[],replacements=0,applied=0,untrustedWrites=0;
 function open(){
  return createSyncCoordinator({
   projectId:'demo-only-project',uid:'synthetic-test-owner',passphrase:PHRASE,
   loadLocal:()=>duplicate(adopted),
   validateLocal:x=>{if(!x?.config||!Array.isArray(x.scenarios))throw Error('invalid synthetic full state');},
   applyLocal:(next,expected)=>{
    if(replaceFails)throw Error('simulated quota error');
    if(JSON.stringify(adopted)!==JSON.stringify(expected))throw Error('concurrent adoption rejected');
    adopted=duplicate(next);replacements++;
    return duplicate(adopted);
   },
   saveBeforeReplace:x=>{if(backupFails)throw Error('simulated backup error');rollback.push(duplicate(x));},
   readMarker:()=>duplicate(marker),
   writeMarker:x=>{marker=duplicate(x);},
   readRemote:()=>cloud.read(),casRemote:(expected,next)=>{untrustedWrites++;return cloud.compareAndSwap(expected,next);},
   online:()=>connected,canAutoImport:()=>canImport,canAutoUpload:()=>canUpload,
   onApplied:()=>{applied++;}
  });
 }
 let coordinator=open();
 return {
  cloud,now:()=>coordinator,restart:()=>{coordinator=open();return coordinator;},
  get saved(){return duplicate(adopted);},get marker(){return duplicate(marker);},
  get backups(){return duplicate(rollback);},get replacements(){return replacements;},
  get applied(){return applied;},get attempts(){return untrustedWrites;},
  offline:()=>{connected=false;},online:()=>{connected=true;},
  edit:fn=>fn(adopted),blockImport:()=>{canImport=false;},blockUpload:()=>{canUpload=false;},
  failBackup:()=>{backupFails=true;},failReplace:()=>{replaceFails=true;}
 };
}
async function linked(){
 const cloud=new FakeCipherCloud(),pc=device(cloud),phone=device(cloud,{
  ...fixture(),config:{...fixture().config,plan:{startDate:'2044-01-01',initialAsset:987}},scenarios:[fixture().scenarios[0]]
 });
 assert.equal((await pc.now().initialUpload({backupConfirmed:true})).status,'INITIAL_UPLOADED');
 assert.equal((await phone.now().previewRemote()).status,'PREVIEW');
 assert.equal((await phone.now().initialDownload({backupConfirmed:true})).status,'DOWNLOADED');
 assert.deepEqual(phone.saved,pc.saved);
 assert.equal(cloud.writes,1);
 return {cloud,pc,phone};
}

test('two independently edited offline devices: first upload wins, second stops without overwriting',async()=>{
 const {cloud,pc,phone}=await linked();
 pc.offline();phone.offline();
 pc.edit(s=>s.config.plan.initialAsset=1010);
 phone.edit(s=>s.config.plan.initialAsset=1020);
 assert.equal((await pc.now().runAuto()).status,'PENDING_OFFLINE');
 assert.equal((await phone.now().runAuto()).status,'PENDING_OFFLINE');
 assert.equal(cloud.writes,1);assert.equal(phone.attempts,0);
 pc.online();phone.online();
 assert.equal((await pc.now().runAuto()).status,'UPLOADED');
 assert.equal((await phone.now().runAuto()).status,'CONFLICT');
 assert.equal(cloud.writes,2);
 assert.equal(pc.saved.config.plan.initialAsset,1010);
 assert.equal(phone.saved.config.plan.initialAsset,1020);
 assert.equal(phone.marker.baseRevision,1);
 assert.equal(pc.marker.baseRevision,2);
 assert.equal(phone.replacements,1);
 assert.equal(phone.backups.length,1);
 assert.equal(phone.saved.config.actuals['70'].endAsset,920);
 assert.equal(phone.saved.config.reviews['70'].note,'架空PC年次点検');
 assert.equal(phone.saved.scenarios.length,2);
});

test('conflict survives coordinator restart, repeated checks and re-review; no implicit merge or write',async()=>{
 const {cloud,pc,phone}=await linked();
 pc.edit(s=>s.config.plan.initialAsset=1010);
 phone.edit(s=>s.config.plan.initialAsset=1020);
 assert.equal((await pc.now().runAuto()).status,'UPLOADED');
 assert.equal((await phone.now().runAuto()).status,'CONFLICT');
 const before=phone.saved;
 const read=phone.restart();
 assert.equal((await read.runAuto()).status,'CONFLICT');
 assert.equal((await read.previewRemote()).status,'PREVIEW');
 assert.equal((await read.acceptLocalUpdate()).status,'CONFLICT');
 assert.equal((await read.acceptRemoteUpdate()).status,'CONFLICT');
 assert.deepEqual(phone.saved,before);
 assert.equal(cloud.writes,2);
 assert.equal(phone.backups.length,1);
 assert.equal(phone.replacements,1);
 assert.equal(phone.attempts,0);
});

test('two overlapping updates on one coordinator cannot duplicate cloud generations',async()=>{
 const {cloud,pc}=await linked();
 pc.edit(s=>s.config.plan.initialAsset=1050);
 const results=await Promise.all([pc.now().runAuto(),pc.now().runAuto(),pc.now().runAuto()]);
 assert.equal(results.filter(x=>x.status==='UPLOADED').length,1);
 assert.equal(results.filter(x=>x.status==='STOP').length,2);
 assert.equal(cloud.writes,2);
 assert.equal(cloud.latest.revision,2);
 assert.equal(pc.marker.baseRevision,2);
 assert.equal((await pc.now().runAuto()).status,'SYNCED');
 assert.equal(cloud.writes,2);
});

test('remote snapshot disappearance does not trigger recreation or overwrite local data',async()=>{
 const {cloud,pc,phone}=await linked();
 const originalPc=pc.saved,originalPhone=phone.saved;
 cloud.latest=null; // synthetic failure injection, no real cloud delete
 assert.equal((await pc.now().runAuto()).status,'STOP');
 assert.equal((await phone.now().runAuto()).status,'STOP');
 assert.deepEqual(pc.saved,originalPc);
 assert.deepEqual(phone.saved,originalPhone);
 assert.equal(cloud.writes,1);
 assert.equal(pc.attempts,1);
 assert.equal(phone.attempts,0);
});

test('tampered newer remote ciphertext is rejected before backup overwrite or local replacement',async()=>{
 const {cloud,pc,phone}=await linked();
 pc.edit(s=>s.config.plan.initialAsset=1055);
 assert.equal((await pc.now().runAuto()).status,'UPLOADED');
 const local=phone.saved,beforeMarker=phone.marker,backups=phone.backups;
 // Leave structurally valid record, but break authenticated ciphertext body.
 cloud.latest.ciphertext.data='AAAA'+cloud.latest.ciphertext.data.slice(4);
 assert.equal((await phone.now().runAuto()).status,'STOP');
 assert.deepEqual(phone.saved,local);
 assert.deepEqual(phone.marker,beforeMarker);
 assert.deepEqual(phone.backups,backups);
 assert.equal(phone.replacements,1);
 assert.equal(cloud.writes,2);
});

test('backup failure or replacement failure stops import and protects adopted local state',async()=>{
 const {cloud,pc,phone}=await linked();
 pc.edit(s=>s.config.plan.initialAsset=1060);
 assert.equal((await pc.now().runAuto()).status,'UPLOADED');
 const original=phone.saved,oldMarker=phone.marker;
 phone.failBackup();
 assert.equal((await phone.now().runAuto()).status,'STOP');
 assert.deepEqual(phone.saved,original);
 assert.deepEqual(phone.marker,oldMarker);
 assert.equal(phone.replacements,1);
 const newcomer=device(cloud,{...fixture(),config:{...fixture().config,plan:{initialAsset:888,startDate:'2044-01-01'}}});
 assert.equal((await newcomer.now().previewRemote()).status,'PREVIEW');
 newcomer.failReplace();
 assert.equal((await newcomer.now().initialDownload({backupConfirmed:true})).status,'STOP');
 assert.equal(newcomer.saved.config.plan.initialAsset,888);
 assert.equal(newcomer.replacements,0);
 assert.equal(newcomer.backups.length,1);
 assert.equal(cloud.writes,2);
});

test('large fictional state is rejected before initial cloud write',async()=>{
 const initial=fixture();
 initial.futureEnvelope.syntheticBlob='X'.repeat(510000);
 const d=device(new FakeCipherCloud(),initial);
 const original=d.saved;
 assert.equal((await d.now().initialUpload({backupConfirmed:true})).status,'STOP');
 assert.equal(d.cloud.writes,0);
 assert.equal(d.attempts,0);
 assert.deepEqual(d.saved,original);
 assert.equal(d.marker,null);
});

test('no automatic upload without prior initial-source consent after reconnection or restart',async()=>{
 const empty=device(new FakeCipherCloud());
 empty.offline();
 assert.equal((await empty.now().runAuto()).status,'ENROLLMENT_REQUIRED');
 empty.online();
 assert.equal((await empty.restart().runAuto()).status,'ENROLLMENT_REQUIRED');
 assert.equal((await empty.now().initialUpload()).status,'STOP');
 assert.equal(empty.cloud.writes,0);
 const {pc,phone,cloud}=await linked();
 phone.edit(s=>s.config.plan.initialAsset=1070);
 phone.blockUpload();
 assert.equal((await phone.now().runAuto()).status,'LOCAL_PENDING_REVIEW');
 assert.equal((await phone.restart().runAuto()).status,'LOCAL_PENDING_REVIEW');
 assert.equal(cloud.writes,1);
 assert.equal(pc.saved.config.plan.initialAsset,1000);
});
