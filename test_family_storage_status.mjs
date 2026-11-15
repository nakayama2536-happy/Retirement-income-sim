import test from 'node:test';
import assert from 'node:assert/strict';
import {familyStorageStatus} from './family-storage-status.mjs';
const state=(changes={})=>({localReadable:true,connected:true,registered:true,reviewPending:false,pendingEdits:false,working:false,outcome:{status:'SYNCED'},...changes});
test('login alone never asserts synchronization',()=>{
  for(const v of [{connected:false,outcome:{status:'AUTH_READY'}},{connected:true,registered:false,outcome:{status:'AUTH_READY'}},{connected:true,registered:true,outcome:{status:'AUTH_READY'}}]){
    const x=familyStorageStatus(state(v));
    assert.match(x.cloud,/未確認/);assert.doesNotMatch(x.cloud,/一致を確認/);
  }
});
test('authenticated and unlocked are not enough: explicit evidence is needed',()=>{
  const x=familyStorageStatus(state({outcome:{status:'UNCONNECTED'}}));
  assert.match(x.cloud,/未確認/);
});
test('verified unchanged preview and sync permit qualified statement only',()=>{
  for(const x of [{status:'SYNCED'},{status:'PREVIEW',differs:false}]){
    const s=familyStorageStatus(state({outcome:x}));
    assert.match(s.cloud,/この起動中に/);
    assert.match(s.cloud,/その後の変更/);
  }
});
test('upload success is not guaranteed all-device equality',()=>{
 const s=familyStorageStatus(state({outcome:{status:'UPLOADED'}}));
 assert.match(s.cloud,/書込み成功/);assert.match(s.cloud,/他端末の状態は未確認/);
});
test('pending edits, restore barrier and working take priority over old success',()=>{
 for(const change of [{reviewPending:true},{pendingEdits:true},{working:true}]){
  const s=familyStorageStatus(state(change));assert.match(s.cloud,/未確認/);assert.doesNotMatch(s.cloud,/一致を確認/);
 }
});
test('conflict and offline do not assert cloud completion',()=>{
 for(const outcome of [{status:'CONFLICT'},{status:'PENDING_OFFLINE'},{status:'PREVIEW',differs:true}]){
  const s=familyStorageStatus(state({outcome}));assert.doesNotMatch(s.cloud,/一致を確認/);
 }
});
test('backup file existence can never be inferred by app',()=>{
 for(const v of [state(),state({connected:false}),{localReadable:false}]){
  const x=familyStorageStatus(v);assert.match(x.backup,/確認できません/);assert.ok(Object.isFrozen(x));
 }
});
test('readability and storage success are not confused, no personal data exposed',()=>{
 const s=familyStorageStatus({localReadable:true,outcome:{status:'SYNCED'},personalValue:908000});
 assert.match(s.local,/読込み/);assert.match(s.local,/保存完了を意味しません/);
 assert.doesNotMatch(JSON.stringify(s),/908000/);
});
