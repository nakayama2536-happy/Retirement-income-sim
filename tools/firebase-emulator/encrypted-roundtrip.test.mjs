// Actual Web SDK + local Rules interpreter; never a real Firebase project.
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertFails} from '@firebase/rules-unit-testing';
import * as sdk from 'firebase/firestore';
import {createSyncCoordinator} from '../../sync-controller.mjs';
import {createSandboxStore,runEncryptedSandboxCheck,DEMO_PROJECT} from './encrypted-sandbox-check.mjs';
const owner='synthetic-encrypted-owner',host='127.0.0.1',port=8087;
if(process.env.FIRESTORE_EMULATOR_HOST!==host+':'+port)throw Error('Explicit loopback emulator required');
const template=readFileSync(new URL('../../docs/firebase-sync-sandbox.rules.example',import.meta.url),'utf8');
const env=await initializeTestEnvironment({projectId:DEMO_PROJECT,firestore:{host,port,rules:template.replaceAll('__SET_SANDBOX_TEST_UID_PRIVATELY__',owner)}});
let passed=0;
const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
try{
 await env.clearFirestore();
 const first=env.authenticatedContext(owner).firestore(),second=env.authenticatedContext(owner).firestore();
 const guest=env.unauthenticatedContext().firestore(),foreign=env.authenticatedContext('synthetic-foreign').firestore();
 const store=database=>createSandboxStore({sdk,database,projectId:DEMO_PROJECT,uid:owner,environment:'emulator',host});
 const writer=store(first),reader=store(second),path=database=>sdk.doc(database,'sandbox',owner,'snapshots','trial');
 const result=await runEncryptedSandboxCheck({writer,reader,unauthenticatedRead:()=>sdk.getDocFromServer(path(guest)),onProgress:n=>console.log('ENCRYPTED_STEP_PASS '+n)});
 assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.steps.length,12);assert.equal(result.cleanup,'confirmed');passed+=12;
 await check('foreign identity cannot read even the cleaned-up document',()=>assertFails(sdk.getDocFromServer(path(foreign))));
 await check('existing document is not overwritten or deleted',async()=>{
  const original={ownerUid:owner,formatVersion:1,revision:1,digest:'d'.repeat(64),ciphertext:{version:1,algorithm:'AES-256-GCM/PBKDF2-SHA256',iterations:600000,salt:'AAAAAA==',iv:'AAAAAA==',data:'AQABAg=='},updatedAt:sdk.serverTimestamp()};
  await sdk.setDoc(path(first),original);
  const stopped=await runEncryptedSandboxCheck({writer,reader,unauthenticatedRead:()=>sdk.getDocFromServer(path(guest))});
  assert.equal(stopped.ok,false);assert.equal(stopped.errorCode,'trial-already-exists');assert.equal(stopped.cleanup,'not-needed');
  assert.equal((await writer.read()).digest,original.digest);
  // This fixture belongs to this emulator test only, not to the shared runner.
  await sdk.deleteDoc(path(first));assert.equal(await reader.read(),null);
 });
 await check('lost acknowledgement after commit cleans only its own ciphertext',async()=>{
  const uncertain={...writer,async compareAndSwap(a,b){await writer.compareAndSwap(a,b);throw Object.assign(new Error('ack-lost'),{code:'unavailable'});}};
  const stopped=await runEncryptedSandboxCheck({writer:uncertain,reader,unauthenticatedRead:()=>sdk.getDocFromServer(path(guest))});
  assert.equal(stopped.ok,false);assert.equal(stopped.cleanup,'confirmed');assert.equal(await writer.read(),null);
 });
 await check('actual coordinator source-to-receiver, reviewed updates and conflicts preserve both sides',async()=>{
  const phrase='synthetic-emulator-only-long-phrase';
  const source={config:{plan:{initialAsset:1234},future:{sequence:1}},scenarios:[{id:'synthetic',selected:true}],futureEnvelope:{keep:true}};
  const receiverOriginal={config:{plan:{initialAsset:100},future:{sequence:0}},scenarios:[],futureEnvelope:{receiver:true}};
  const attempts=[];
  const device=(initial,remoteStore)=>{
   const state={local:structuredClone(initial),marker:null,backups:[]};
   const coordinator=createSyncCoordinator({projectId:DEMO_PROJECT,uid:owner,passphrase:phrase,
    loadLocal:()=>structuredClone(state.local),
    validateLocal:v=>{assert.ok(v.config);assert.ok(Array.isArray(v.scenarios));},
    applyLocal:(next,expected)=>{assert.deepEqual(state.local,expected);state.local=structuredClone(next);return structuredClone(next);},
    saveBeforeReplace:v=>{state.backups.push(structuredClone(v));},
    readMarker:()=>structuredClone(state.marker),writeMarker:v=>{state.marker=structuredClone(v);},
    readRemote:remoteStore.read,
    casRemote:async(expected,next)=>{
     const before=await remoteStore.read();
     assert.equal(before?.revision??0,expected.revision);assert.equal(before?.digest??null,expected.digest);
     const candidate={...next,ownerUid:owner};attempts.push(candidate);
     await remoteStore.compareAndSwap(before,candidate);return remoteStore.read();
    },canAutoImport:()=>false
   });return {state,coordinator};
  };
  const pc=device(source,writer),receiver=device(receiverOriginal,reader);
  try{
   assert.equal((await pc.coordinator.initialUpload()).status,'STOP');assert.equal(await writer.read(),null);
   assert.equal((await pc.coordinator.initialUpload({backupConfirmed:true})).status,'INITIAL_UPLOADED');
   assert.equal((await receiver.coordinator.initialDownload({backupConfirmed:true})).status,'STOP');
   assert.deepEqual(receiver.state.local,receiverOriginal);
   assert.equal((await receiver.coordinator.previewRemote()).status,'PREVIEW');
   assert.equal((await receiver.coordinator.initialDownload({backupConfirmed:true})).status,'DOWNLOADED');
   assert.deepEqual(receiver.state.local,source);assert.deepEqual(receiver.state.backups[0],receiverOriginal);
   pc.state.local.config.future.sequence=2;
   assert.equal((await pc.coordinator.runAuto()).status,'UPLOADED');
   assert.equal((await receiver.coordinator.runAuto()).status,'REMOTE_PENDING_REVIEW');
   assert.equal(receiver.state.local.config.future.sequence,1);
   assert.equal((await receiver.coordinator.previewRemote()).status,'PREVIEW');
   assert.equal((await receiver.coordinator.acceptRemoteUpdate()).status,'DOWNLOADED');
   assert.deepEqual(receiver.state.local,pc.state.local);
   pc.state.local.config.future.sequence=3;receiver.state.local.config.future.sequence=99;
   assert.equal((await pc.coordinator.runAuto()).status,'UPLOADED');
   assert.equal((await receiver.coordinator.runAuto()).status,'CONFLICT');
   assert.equal(receiver.state.local.config.future.sequence,99);assert.equal(pc.state.local.config.future.sequence,3);
   assert.equal((await writer.read()).revision,3);
  }finally{await writer.removeOwnedAttempt(attempts);assert.equal(await reader.read(),null);}
 });
 console.log('FIREBASE_ENCRYPTED_EMULATOR_OK '+passed+' checks; no real Firebase access; all disposable documents absent.');
}catch(e){process.exitCode=1;console.error(e);}finally{await env.cleanup();}
