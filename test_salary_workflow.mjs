import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateConfig,saveState,loadState,configSignature} from './storage.mjs';
import {runRetirementPlan} from './calc.mjs';
import {salaryDraftFromConfig,previewSalary,applySalaryPreview,undoSalaryApply,salaryUndoAvailable,saveSalaryScenario,saveSalaryDraft,loadSalaryDraft,clearSalaryDraft,salaryDraftMatches} from './salary-workflow.mjs';

class MemoryStorage {
  data=new Map();writes=0;fail=false;
  getItem(k){return this.data.get(k)??null;}
  setItem(k,v){if(this.fail)throw new Error('QuotaExceededError');this.writes++;this.data.set(k,String(v));}
  removeItem(k){this.data.delete(k);}
}
function config(){return migrateConfig({
  people:{primary:{birthDate:'1980-08-27'},spouse:{birthDate:'1981-05-01'}},
  plan:{startAge:64,endAge:70,startDate:'2044-08-27',initialAsset:1000,afterTaxReturn:0,inflation:0,initialAssetIncludesIdeco:false},
  employment:{primary:{mainRetirement:{baseDate:'2045-08-27'},sideWork:{monthlyGross:0}},spouse:{sideWork:{monthlyGross:5}}},
  income:{pensions:{primary:{startDate:'2050-08-27',annualAtStart:12},spouse:{startDate:'2051-05-01',annualAtStart:6}}},
  budgets:[{fromAge:65,toAge:70,annualBudget:36}],unemployment:{baselineMode:'none'},events:[],actuals:{}
});}
function seed(){globalThis.localStorage=new MemoryStorage();const c=config();saveState({config:c,scenarios:[{id:'baseline',name:'基準',role:'baseline',selected:true,config:structuredClone(c)},{id:'other',name:'比較',role:'scenario',selected:true,config:structuredClone(c)}]});return loadState();}
function draft(c){const d=salaryDraftFromConfig(c);Object.assign(d.settings,{monthlyAddition:0,monthlyWithdrawal:0,pre65MonthlyBudget:3,lastSalaryMonth:'2045-06',postSalaryLabor:{mode:'none'}});d.monthsConfirmed='yes';return d;}
const onlyState=x=>({config:x.config,scenarios:x.scenarios});

test('未入力・月未確認は採用せず、試算は入力を変更しない',()=>{
  const state=seed(),original=structuredClone(state),d=salaryDraftFromConfig(state.config);
  assert.equal(d.settings.monthlyAddition,null);assert.equal(d.settings.monthlyWithdrawal,null);
  assert.throws(()=>previewSalary(state,d),/最終月/);
  d.monthsConfirmed='yes';assert.throws(()=>previewSalary(state,d),/未入力|0以上/);
  const p=previewSalary(state,draft(state.config));assert.equal(p.result.finalAsset-p.baselineResult.finalAsset,-3);
  assert.notEqual(p.before.finalAsset,p.baselineResult.finalAsset);assert.deepEqual(state,original);assert.deepEqual(loadState(),original);
});
test('反映は1回の保存、既存比較案・年金・実績を保持',()=>{
  const state=seed();state.config.actuals={64:{endAsset:900}};saveState(state);
  const d=draft(state.config),p=previewSalary(state,d),writes=localStorage.writes;
  const after=applySalaryPreview(state,p);
  assert.equal(localStorage.writes,writes+1);assert.equal(after.changed,true);
  assert.deepEqual(after.scenarios,state.scenarios);assert.deepEqual(after.config.actuals,state.config.actuals);
  assert.deepEqual(after.config.income,state.config.income);assert.deepEqual(after.config.ideco,state.config.ideco);
  assert.deepEqual(loadState(),onlyState(after));assert.ok(salaryUndoAvailable(after.config));
  assert.equal(salaryDraftMatches(after.config,d),true);
});
test('同じ試算の連打・同条件再試算は二重反映しない',()=>{
  const state=seed(),p=previewSalary(state,draft(state.config)),after=onlyState(applySalaryPreview(state,p));
  const writes=localStorage.writes;
  assert.equal(applySalaryPreview(after,p).changed,false);
  const nextPreview=previewSalary(after,draft(after.config));assert.equal(nextPreview.changed,false);
  assert.equal(applySalaryPreview(after,nextPreview).changed,false);
  assert.equal(localStorage.writes,writes);assert.equal(after.config.salaryWorkflow.history.length,1);
});
test('試算後の設定・比較案変更で古い反映を拒否',()=>{
  const state=seed(),p=previewSalary(state,draft(state.config));
  const changed=structuredClone(state);changed.config.plan.afterTaxReturn=1;
  assert.throws(()=>applySalaryPreview(changed,p),/試算後/);
  const changedScenario=structuredClone(state);changedScenario.scenarios[1].name='編集';
  assert.throws(()=>applySalaryPreview(changedScenario,p),/試算後/);assert.deepEqual(loadState(),state);
});
test('別画面が保存した新しい状態を上書きしない',()=>{
  const state=seed(),p=previewSalary(state,draft(state.config)),other=structuredClone(state);
  other.scenarios[1].name='他画面';saveState(other,state);
  assert.throws(()=>applySalaryPreview(state,p),/別画面/);assert.deepEqual(loadState(),other);
});
test('保存失敗は採用値・試算・下書きを保持し再試行できる',()=>{
  const state=seed(),d=draft(state.config);saveSalaryDraft(state.config,d);
  const p=previewSalary(state,d),original=structuredClone(p);
  localStorage.fail=true;assert.throws(()=>applySalaryPreview(state,p),/Quota/);
  assert.deepEqual(loadState(),state);assert.deepEqual(loadSalaryDraft(state.config),d);assert.deepEqual(p,original);
  localStorage.fail=false;assert.equal(applySalaryPreview(state,p).changed,true);
});
test('再読込後の取消は直前の所有項目だけ、後の年金・実績・比較案を保持',()=>{
  const state=seed();applySalaryPreview(state,previewSalary(state,draft(state.config)));
  const reloaded=loadState();reloaded.config.income.pensions.primary.annualAtStart=24;reloaded.config.actuals={64:{endAsset:850}};reloaded.scenarios[1].name='取消後も残す';saveState(reloaded);
  const undone=undoSalaryApply(loadState());
  assert.equal(undone.config.cashflow.salaryLife,undefined);assert.equal(undone.config.income.pensions.primary.annualAtStart,24);
  assert.deepEqual(undone.config.actuals,reloaded.config.actuals);assert.deepEqual(undone.scenarios,reloaded.scenarios);
  assert.equal(salaryUndoAvailable(undone.config),false);assert.equal(undone.config.salaryWorkflow.history.at(-1).action,'undo');
});
test('取消保存失敗でも元の反映と履歴が残る',()=>{
  const state=seed();applySalaryPreview(state,previewSalary(state,draft(state.config)));const after=loadState();
  localStorage.fail=true;assert.throws(()=>undoSalaryApply(after),/Quota/);assert.deepEqual(loadState(),after);
});
test('対象設定を後から変更した場合は取消を停止',()=>{
  const state=seed();const after=applySalaryPreview(state,previewSalary(state,draft(state.config)));
  after.config.cashflow.salaryLife.monthlyAddition=1;assert.equal(salaryUndoAvailable(after.config),false);assert.throws(()=>undoSalaryApply(after),/取消/);
});
test('臨時収支の計上先だけを戻し、別の行を消さない',()=>{
  const state=seed();state.config.events=[{date:'2044-09-01',type:'income',amount:1,label:'gift'}];saveState(state);
  const d=draft(state.config);d.eventTreatments[0]='separate';applySalaryPreview(state,previewSalary(state,d));
  const changed=loadState();changed.config.events.push({date:'2048-01-01',type:'income',amount:2,label:'other',fundingTreatment:'separate'});saveState(changed);
  const result=undoSalaryApply(changed);assert.equal(result.config.events[0].fundingTreatment,undefined);assert.deepEqual(result.config.events[1],changed.config.events[1]);
});
test('対象行が移動・変更されたら別の行へ誤って取消しない',()=>{
  const state=seed();state.config.events=[{date:'2044-09-01',type:'income',amount:1}];saveState(state);
  const d=draft(state.config);d.eventTreatments[0]='separate';const after=applySalaryPreview(state,previewSalary(state,d));
  after.config.events[0].amount=2;assert.equal(salaryUndoAvailable(after.config),false);
});
test('比較案の保存は採用値と既存2案を保持し、連打を重複保存しない',()=>{
  const state=seed(),p=previewSalary(state,draft(state.config));
  const saved=onlyState(saveSalaryScenario(state,p,'半年早める'));
  assert.deepEqual(saved.config,state.config);assert.deepEqual(saved.scenarios.slice(0,2),state.scenarios);
  assert.equal(saved.scenarios.length,3);assert.equal(saved.scenarios[2].role,'scenario');
  const writes=localStorage.writes;saveSalaryScenario(saved,p,'半年早める');assert.equal(localStorage.writes,writes);
  assert.equal(loadState().scenarios.length,3);
});
test('比較案の保存失敗は全体を保持',()=>{
  const state=seed(),p=previewSalary(state,draft(state.config));localStorage.fail=true;
  assert.throws(()=>saveSalaryScenario(state,p,'test'),/Quota/);assert.deepEqual(loadState(),state);
});
test('比較案保存後も再試算して反映できる、基準案を置換しない',()=>{
  const state=seed(),d=draft(state.config),p=previewSalary(state,d);
  const saved=onlyState(saveSalaryScenario(state,p,'trial'));
  const applied=applySalaryPreview(saved,previewSalary(saved,d));
  assert.deepEqual(applied.scenarios,saved.scenarios);assert.equal(applied.scenarios[0].id,'baseline');
});
test('下書きは再読込可能、別人・並び替えた収支に流用しない',()=>{
  const state=seed(),d=draft(state.config);saveSalaryDraft(state.config,d);assert.deepEqual(loadSalaryDraft(state.config),d);
  const other=structuredClone(state.config);other.people.primary.birthDate='1982-01-01';assert.equal(loadSalaryDraft(other),null);
  other.people=state.config.people;other.events=[{date:'2044-01-01',amount:2}];assert.equal(loadSalaryDraft(other),null);
  clearSalaryDraft();assert.equal(loadSalaryDraft(state.config),null);
});
test('方式移行・再起動でも計算結果が一致、旧設定の試算結果は不変',()=>{
  const state=seed(),before=runRetirementPlan(state.config),signature=configSignature(state.config);
  const p=previewSalary(state,draft(state.config));assert.equal(configSignature(state.config),signature);
  assert.deepEqual(runRetirementPlan(state.config),before);
  applySalaryPreview(state,p);assert.deepEqual(runRetirementPlan(loadState().config),p.result);
});
