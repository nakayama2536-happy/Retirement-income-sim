import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateConfig,saveState,loadState,STATE_KEY} from './storage.mjs';
import {createFullBackup,restoreFullBackup,isFullBackup} from './full-backup.mjs';

function config(asset=100){return migrateConfig({people:{primary:{birthDate:'1980-01-01'},spouse:{birthDate:'1981-01-01'}},plan:{startAge:64,endAge:66,startDate:'2044-01-01',initialAsset:asset,afterTaxReturn:0,inflation:0},employment:{primary:{mainRetirement:{baseDate:'2045-01-01'},sideWork:{monthlyGross:0}},spouse:{sideWork:{monthlyGross:0}}},income:{pensions:{primary:{annualAtStart:0},spouse:{annualAtStart:0}}},budgets:[{fromAge:65,toAge:66,annualBudget:10}],unemployment:{baselineMode:'none'},events:[]});}
function state(){const c=config();return {config:c,scenarios:[{id:'s1',name:'比較1',role:'scenario',selected:true,customScenario:{keep:1},config:structuredClone(c)},{id:'s2',name:'比較2',role:'reference',selected:false,config:structuredClone(c)}],actualLedger:{source:'future',rows:[1]},annualChecks:{64:{memo:'keep'}},unknownEnvelope:{deep:{value:7},futureAnnotation:'future-state-v2'},schemaVersion:'0.9'};}
class Memory{values=new Map();writes=0;fail=false;getItem(k){return this.values.get(k)??null;}setItem(k,v){if(this.fail)throw new Error('QuotaExceeded');this.writes++;this.values.set(k,String(v));}}
test('一括バックアップは未知の最上位・シナリオ属性を保持し、入力を変更しない',()=>{
 const s=state(),before=structuredClone(s),b=createFullBackup(s,{now:new Date('2026-09-29T09:00:00Z')});
 assert.equal(b.exportedAt,'2026-09-29T09:00:00.000Z');assert.equal(b.schemaVersion,'0.9');assert.deepEqual(b.unknownEnvelope,s.unknownEnvelope);assert.deepEqual(b.actualLedger,s.actualLedger);assert.deepEqual(b.annualChecks,s.annualChecks);assert.deepEqual(b.scenarios,s.scenarios);assert.deepEqual(s,before);
});
test('出力時刻だけを更新し、再出力で未知フィールドを減らさない',()=>{
 const first=createFullBackup(state(),{now:new Date('2026-09-29T09:00:00Z')}),second=createFullBackup(first,{now:new Date('2026-09-30T09:00:00Z')}),a=structuredClone(first),b=structuredClone(second);delete a.exportedAt;delete b.exportedAt;assert.deepEqual(b,a);
});
test('復元は未知フィールド、比較案ID・名前・役割・選択状態を一括保存',()=>{
 globalThis.localStorage=new Memory();const current={config:config(1),scenarios:[],oldOnly:{keep:false}};saveState(current);const backup=createFullBackup(state());const restored=restoreFullBackup(loadState(),backup),reloaded=loadState();
 assert.deepEqual(reloaded,backup);assert.deepEqual(restored.config,reloaded.config);assert.deepEqual(restored.scenarios,reloaded.scenarios);assert.deepEqual(reloaded.unknownEnvelope,backup.unknownEnvelope);assert.deepEqual(reloaded.actualLedger,backup.actualLedger);assert.deepEqual(reloaded.scenarios,backup.scenarios);assert.equal(reloaded.oldOnly,undefined);assert.equal(localStorage.writes,2);
});
test('基準役割がない比較案にも役割を新造しない',()=>{
 globalThis.localStorage=new Memory();saveState({config:config(),scenarios:[]});const backup=createFullBackup(state());restoreFullBackup(loadState(),backup);assert.deepEqual(loadState().scenarios.map(s=>s.role),['scenario','reference']);
});
test('保存失敗は現在状態とバックアップ候補を保持',()=>{
 globalThis.localStorage=new Memory();saveState({config:config(1),scenarios:[],top:{old:true}});const before=loadState(),backup=createFullBackup(state()),copy=structuredClone(backup);localStorage.fail=true;
 assert.throws(()=>restoreFullBackup(before,backup),/Quota/);localStorage.fail=false;assert.deepEqual(loadState(),before);assert.deepEqual(backup,copy);
});
test('別画面更新後の古い復元は拒否する',()=>{
 globalThis.localStorage=new Memory();saveState({config:config(1),scenarios:[]});const stale=loadState(),other=loadState();other.config.plan.initialAsset=2;saveState(other,stale);
 assert.throws(()=>restoreFullBackup(stale,createFullBackup(state())),/別画面/);assert.equal(loadState().config.plan.initialAsset,2);
});
test('破損・設定だけ・比較案だけを一括バックアップとして扱わない',()=>{
 for(const value of [null,{},[],{config:config()},{scenarios:[]},{config:null,scenarios:[]}]){assert.equal(isFullBackup(value),false);assert.throws(()=>createFullBackup(value));}
});
test('不正な実績・比較案・重複基準は保存前に全体拒否',()=>{
 globalThis.localStorage=new Memory();saveState({config:config(),scenarios:[]});const before=loadState();let b=createFullBackup(state());b.config.actuals={999:{endAsset:1}};assert.throws(()=>restoreFullBackup(before,b));
 b=createFullBackup(state());b.scenarios[0].config={};assert.throws(()=>restoreFullBackup(before,b));
 b=createFullBackup(state());b.scenarios.forEach(s=>s.role='baseline');assert.throws(()=>restoreFullBackup(before,b),/重複/);assert.deepEqual(loadState(),before);
});
test('保存JSONを再読込・再出力して意図した時刻以外が完全一致',()=>{
 globalThis.localStorage=new Memory();saveState({config:config(1),scenarios:[]});const exported=createFullBackup(state(),{now:new Date('2026-09-29T09:00:00Z')});restoreFullBackup(loadState(),JSON.parse(JSON.stringify(exported)));const again=createFullBackup(loadState(),{now:new Date('2026-09-30T09:00:00Z')});delete exported.exportedAt;delete again.exportedAt;assert.deepEqual(again,exported);
});
test('状態の読取りと出力だけではストレージへ書かない',()=>{
 globalThis.localStorage=new Memory();saveState(state());const writes=localStorage.writes;createFullBackup(loadState());assert.equal(localStorage.writes,writes);assert.ok(localStorage.getItem(STATE_KEY));
});
