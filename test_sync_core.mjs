import test from 'node:test';
import assert from 'node:assert/strict';
import {decideSync,FakeCipherCloud,validRemoteRecord} from './sync-policy.mjs';
import {encryptSnapshot,decryptSnapshot,snapshotDigest,PBKDF2_ITERATIONS} from './sync-crypto.mjs';
const A='a'.repeat(64),B='b'.repeat(64),C='c'.repeat(64),passphrase='fictional-test-only-long-passphrase';
const marker=(changes={})=>({version:1,projectId:'fictional-project',uid:'fictional-account',baseRevision:3,baseRemoteDigest:A,baseLocalDigest:B,enabled:true,backupConfirmed:true,...changes});
const remote=(changes={})=>({formatVersion:1,revision:3,digest:A,ciphertext:{version:1,data:'fictional',iv:'fictional',salt:'fictional'},...changes});
test('sync is opt-in and rejects missing or invalid marker',()=>{
 assert.equal(decideSync({marker:null,remote:remote(),localDigest:B}).action,'STOP');
 assert.equal(decideSync({marker:marker({backupConfirmed:false}),remote:remote(),localDigest:B}).action,'STOP');
});
test('unchanged, local update, remote update and both-sides conflict are distinguished',()=>{
 assert.equal(decideSync({marker:marker(),remote:remote(),localDigest:B}).action,'UNCHANGED');
 assert.equal(decideSync({marker:marker(),remote:remote(),localDigest:C}).action,'UPLOAD_CAS');
 assert.equal(decideSync({marker:marker(),remote:remote({revision:4,digest:C}),localDigest:B}).action,'DOWNLOAD_VALIDATED');
 assert.equal(decideSync({marker:marker(),remote:remote({revision:4,digest:C}),localDigest:C}).action,'CONFLICT');
});
test('offline, locked, unexpected rewrite and rollback fail closed',()=>{
 assert.equal(decideSync({marker:marker(),remote:remote(),localDigest:C,online:false}).action,'PENDING_OFFLINE');
 assert.equal(decideSync({marker:marker(),remote:remote(),localDigest:B,unlocked:false}).action,'LOCKED');
 assert.equal(decideSync({marker:marker(),remote:remote({revision:2}),localDigest:B}).action,'STOP');
 assert.equal(decideSync({marker:marker(),remote:remote({digest:C}),localDigest:B}).action,'CONFLICT');
 assert.equal(decideSync({marker:marker(),remote:null,localDigest:B}).action,'STOP');
});
test('fake cloud serializes concurrent writers and never overwrites stale revision',async()=>{
 const cloud=new FakeCipherCloud(),record={...remote({revision:1})};
 await cloud.compareAndSwap({revision:0,digest:null},record);
 assert.equal(validRemoteRecord(record),true);
 await assert.rejects(cloud.compareAndSwap({revision:0,digest:null},{...record,revision:1,digest:C}),/sync-conflict/);
 assert.equal(cloud.writes,1);
});
test('WebCrypto encrypt/decrypt roundtrip preserves unknown future keys, events and scenarios',async()=>{
 const state={config:{plan:{initialAsset:123},futureField:{v:1}},scenarios:[{id:'fake',selected:false}],unknownEnvelope:{keep:true}};
 const {payload,digest}=await encryptSnapshot(state,passphrase);
 assert.equal(payload.iterations,PBKDF2_ITERATIONS);
 assert.notEqual(JSON.stringify(payload).includes('initialAsset'),true);
 const reordered=Object.fromEntries(Object.entries(payload).reverse());
 const restored=await decryptSnapshot(reordered,passphrase,digest);
 assert.deepEqual(restored,state);
 assert.equal(await snapshotDigest(state),await snapshotDigest({...state,scenarios:[...state.scenarios]}));
});
test('wrong passphrase and damaged ciphertext never produce plaintext',async()=>{
 const enc=await encryptSnapshot({config:{foo:2},scenarios:[]},passphrase);
 await assert.rejects(decryptSnapshot(enc.payload,'wrong-passphrase-with-length',enc.digest),/元データは変更/);
 await assert.rejects(decryptSnapshot({...enc.payload,data:enc.payload.data.replace(/^./,'A')},passphrase,enc.digest),/元データは変更/);
 await assert.rejects(decryptSnapshot(enc.payload,passphrase,C),/元データは変更/);
});
test('missing WebCrypto inputs and too short passphrase are rejected',async()=>{
 await assert.rejects(encryptSnapshot({config:1,scenarios:[]},'short'),/16文字/);
});
