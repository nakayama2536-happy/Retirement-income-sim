import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {saveState,loadState,loadStateForTransfer,savePensionDraft,loadPensionDraft,clearPensionDraft,STATE_KEY} from './storage.mjs';
import {saveMortalityDraft,readMortalityDraft,clearMortalityDraft} from './mortality-draft.mjs';
import {saveSalaryDraft,loadSalaryDraft,clearSalaryDraft,salaryDraftFromConfig} from './salary-workflow.mjs';
import {pensionDraftContext,pensionDraftFromConfig} from './pension.mjs';
import {createFullBackup,restoreFullBackup} from './full-backup.mjs';
import {validateSavedState} from './migration.mjs';
import {snapshotDigest} from './sync-crypto.mjs';
import {inspectBackupCompatibility} from './backup-compatibility.mjs';
const sample=JSON.parse(readFileSync(new URL('./tools/browser-test/mortality-synthetic.json',import.meta.url),'utf8'));
class Memory{items=new Map();writes=0;fail=false;getItem(k){return this.items.get(k)??null;}setItem(k,v){if(this.fail)throw Error('QuotaExceeded');this.items.set(k,String(v));this.writes++;}removeItem(k){this.items.delete(k);this.writes++;}}
function fixture(){return {config:structuredClone(sample.config),scenarios:[]};}
function setup(){globalThis.localStorage=new Memory();saveState(fixture());return loadState();}
function payload(){return {deceased:'primary',deathMonth:'2060-01',survivorPension:'210',preClaimPension:'0',funeral:'100',sourceProfile:'work-v0.9.7',residualFactor:'0.8',entitlement:'true'};}
test('万一の入力値だけを一括バックアップと同期対象の統合状態に保存、採用設定と結果は維持',()=>{
 const base=setup(),copy=structuredClone(base.config);
 assert.equal(saveMortalityDraft(base.config,payload(),{'food':'0.6'}),true);
 const s=loadStateForTransfer(),b=createFullBackup(s);
 assert.deepEqual(s.config,copy);
 assert.equal(b.savedInputs.mortality.values.deathMonth,'2060-01');
 assert.equal(b.savedInputs.mortality.values.survivorPension,'210');
 assert.equal(b.savedInputs.mortality.values.entitlement,undefined);
 assert.equal(b.savedInputs.mortality.factors.food,'0.6');
 assert.equal(b.savedInputs.mortality.monthly,undefined);
 assert.equal(b.savedInputs.mortality.results,undefined);
 assert.equal(b.recoveryCompatibility.requiredFeatures.includes('comparison-input-snapshot-v1'),true);
 assert.equal(inspectBackupCompatibility(b).compatible,true);
});
test('PCバックアップからスマホへ復元して万一入力を再現、旧端末固有の下書きは優先しない',()=>{
 const pc=setup();saveMortalityDraft(pc.config,payload(),{food:'0.6'});
 const backup=createFullBackup(loadStateForTransfer());
 globalThis.localStorage=new Memory();saveState(fixture());
 localStorage.setItem('lifeplan-mortality-input-draft-v1',JSON.stringify({version:1,context:'old',values:{deathMonth:'1900-01'},factors:{}}));
 restoreFullBackup(loadState(),backup);
 assert.equal(readMortalityDraft(loadState().config).values.deathMonth,'2060-01');
 assert.equal(readMortalityDraft(loadState().config).factors.food,'0.6');
 assert.equal(localStorage.getItem('lifeplan-mortality-input-draft-v1')!==null,true);
});
test('年金・給与生活の未採用入力は統合状態に保持し、計算条件には採用しない',()=>{
 const s=setup(),source=structuredClone(s.config);
 const p={context:pensionDraftContext(source),draft:pensionDraftFromConfig(source)};
 savePensionDraft(p);
 const d=salaryDraftFromConfig(source);
 saveSalaryDraft(source,d);
 const backup=createFullBackup(loadStateForTransfer());
 assert.deepEqual(backup.config,source);
 assert.deepEqual(backup.savedInputs.pension,p);
 assert.deepEqual(backup.savedInputs.salary.draft,d);
 assert.deepEqual(loadPensionDraft(),p);
 assert.deepEqual(loadSalaryDraft(source),d);
 clearSalaryDraft();clearPensionDraft();
 assert.equal(loadSalaryDraft(source),null);
 assert.equal(loadPensionDraft(),null);
});
test('旧3種の端末単独下書きを一括出力・同期スナップショットへ読取りだけで移行し保存済み原本を変更しない',()=>{
 const s=setup(),legacyMortality={version:1,context:'older-context',values:{deathMonth:'2060-01',entitlement:'true'},factors:{food:'0.6'}};
 const legacyPension={context:pensionDraftContext(s.config),draft:pensionDraftFromConfig(s.config)};
 const legacySalary={context:'old-salary',draft:salaryDraftFromConfig(s.config)};
 localStorage.setItem('lifeplan-mortality-input-draft-v1',JSON.stringify(legacyMortality));
 localStorage.setItem('lifeplan-sim-pension-draft-v0.9',JSON.stringify(legacyPension));
 localStorage.setItem('lifeplan-sim-salary-draft-v1',JSON.stringify(legacySalary));
 const count=localStorage.writes,b=loadStateForTransfer();
 assert.equal(localStorage.writes,count);
 assert.equal(b.savedInputs.mortality.values.entitlement,undefined);
 assert.deepEqual(b.savedInputs.pension,legacyPension);
 assert.deepEqual(b.savedInputs.salary,legacySalary);
 assert.equal(b.savedInputs.mortality.values.deathMonth,'2060-01');
 const out=createFullBackup(b);assert.deepEqual(out.savedInputs,b.savedInputs);
 assert.equal(localStorage.getItem('lifeplan-sim-salary-draft-v1')!==null,true);
});
test('同期対象の変更検出に比較入力の違いを含めるが、同一スナップショットは同一判定',async()=>{
 const s=setup(),before=await snapshotDigest(loadStateForTransfer());
 saveMortalityDraft(s.config,payload(),{food:'0.6'});
 const after=await snapshotDigest(loadStateForTransfer());
 assert.notEqual(before,after);
 assert.equal(await snapshotDigest(loadStateForTransfer()),after);
});
test('旧形式一括バックアップ復元は旧ブラウザ下書きを再出現させない',()=>{
 const s=setup();localStorage.setItem('lifeplan-mortality-input-draft-v1',JSON.stringify({version:1,context:'x',values:{deathMonth:'1960-01'},factors:{}}));
 const legacy={...s};const restored=restoreFullBackup(loadState(),legacy);
 assert.deepEqual(restored.savedInputs,{version:1,mortality:null,salary:null,pension:null});
 assert.equal(readMortalityDraft(loadState().config),null);
 assert.equal(loadStateForTransfer().savedInputs.mortality,null);
});
test('未対応版・破損・未知キー・過大スナップショットは復元前に全体拒否',()=>{
 const s=setup(),old=JSON.stringify(loadState());
 for(const invalid of [{version:2},{version:1,mortality:{version:1,context:'x',values:{entitlement:'true'},factors:{}}},{version:1,pension:{context:'x',draft:{},secret:'token'}},{version:1,token:'secret'},{version:1,salary:{context:'x',draft:{mass:'a'.repeat(130000)}}}]){
  const b=createFullBackup(s);b.savedInputs=invalid;
  assert.throws(()=>restoreFullBackup(s,b));
  assert.equal(JSON.stringify(loadState()),old);
 }
});
test('保存容量不足や別画面の同時変更で統合パラメータを部分保存しない',()=>{
 const s=setup();localStorage.fail=true;
 assert.equal(saveMortalityDraft(s.config,payload(),{food:'0.6'}),false);
 localStorage.fail=false;assert.deepEqual(loadState(),s);
 const external=loadState();external.config.plan.initialAsset+=2;saveState(external,s);
 assert.throws(()=>saveState({...s,savedInputs:{version:1,mortality:null}},s),/別画面/);
 assert.equal(loadState().config.plan.initialAsset,external.config.plan.initialAsset);
});
test('設定を変更した場合、古い万一の比較入力を別条件へ誤適用しない',()=>{
 const s=setup();saveMortalityDraft(s.config,payload(),{});
 const changed=structuredClone(s.config);changed.plan.initialAsset+=100;
 assert.equal(readMortalityDraft(changed),null);
 assert.equal(readMortalityDraft(s.config).values.deathMonth,'2060-01');
 clearMortalityDraft();assert.equal(readMortalityDraft(s.config),null);
});

test('架空PCの全保存条件を暗号化クラウドへ一括送信しスマホへ一括受信する',async()=>{
 const {createSyncCoordinator}=await import('./sync-controller.mjs');
 const {FakeCipherCloud}=await import('./sync-policy.mjs');
 const cloud=new FakeCipherCloud();
 let pc=fixture(),phone=fixture();phone.config.plan.initialAsset=999;
 pc.savedInputs={version:1,mortality:{version:1,context:'fictional',values:{deceased:'primary',deathMonth:'2060-01',survivorPension:'210'},factors:{food:'0.6'}},pension:{context:'fictional',draft:{primary:{annualAtStart:200}}},salary:null};
 pc.scenarios=[{id:'fictional-case',name:'合成比較',role:'scenario',config:structuredClone(pc.config)}];
 validateSavedState(pc);validateSavedState(phone);
 let pcMarker=null,phoneMarker=null,savedBeforePhone=null;
 const coordinator=(which)=>createSyncCoordinator({projectId:'fictional-app',uid:'fictional-user',passphrase:'only-fictional-passphrase-for-testing',
  loadLocal:()=>structuredClone(which==='pc'?pc:phone),validateLocal:validateSavedState,
  applyLocal:(candidate)=>{if(which==='phone')phone=structuredClone(candidate);else pc=structuredClone(candidate);return structuredClone(candidate);},
  saveBeforeReplace:local=>{if(which==='phone')savedBeforePhone=structuredClone(local);},
  readMarker:()=>which==='pc'?pcMarker:phoneMarker,writeMarker:m=>{if(which==='pc')pcMarker=m;else phoneMarker=m;},
  readRemote:()=>cloud.read(),casRemote:(e,n)=>cloud.compareAndSwap(e,n),online:()=>true,writeAllowed:()=>true
 });
 const source=coordinator('pc');
 assert.equal((await source.initialUpload({backupConfirmed:true})).status,'INITIAL_UPLOADED');
 const dest=coordinator('phone');assert.equal((await dest.previewRemote()).status,'PREVIEW');
 assert.equal((await dest.initialDownload({backupConfirmed:true})).status,'DOWNLOADED');
 assert.deepEqual(phone,pc);
 assert.equal(savedBeforePhone.config.plan.initialAsset,999);
 assert.deepEqual(phone.savedInputs.mortality.factors,{food:'0.6'});
 assert.equal(phone.scenarios.length,1);
 assert.equal((await dest.runAuto()).status,'SYNCED');
 assert.equal(cloud.writes,1);
});
