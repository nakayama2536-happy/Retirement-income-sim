// DOM event wiring test using a minimal test double, NOT a browser/iPhone visual test.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mountSalarySheet} from './salary-ui.mjs';
import {migrateConfig,saveState,loadState} from './storage.mjs';
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
class Element {
  value='';textContent='';hidden=false;disabled=false;dataset={};listeners={};_html='';
  constructor(id,document){this.id=id;this.document=document;}
  set innerHTML(value){this._html=value;this.document.parse(value);}
  get innerHTML(){return this._html;}
  addEventListener(type,fn){(this.listeners[type]||=[]).push(fn);}
  emit(type,target=this){if(type==='click'&&this.disabled)return;for(const fn of this.listeners[type]||[])fn({target,preventDefault(){}});}
  scrollIntoView(){}
}
class DOM {
  nodes=new Map();
  parse(text){for(const [,id] of text.matchAll(/\bid="([^"]+)"/g))this.nodes.set(id,new Element(id,this));}
  getElementById(id){return this.nodes.get(id)||null;}
}
class Storage {
  values=new Map();fail=false;
  getItem(k){return this.values.get(k)??null;}
  setItem(k,v){if(this.fail)throw new Error('QuotaExceededError');this.values.set(k,String(v));}
  removeItem(k){this.values.delete(k);}
}
function setup(){
  globalThis.document=new DOM();document.parse(html);globalThis.localStorage=new Storage();
  const c=migrateConfig({people:{primary:{birthDate:'1980-08-27'},spouse:{birthDate:'1981-01-01'}},plan:{startAge:64,endAge:70,startDate:'2044-08-27',initialAsset:1000,afterTaxReturn:0,inflation:0,initialAssetIncludesIdeco:false},employment:{primary:{mainRetirement:{baseDate:'2045-08-27'},sideWork:{monthlyGross:0}},spouse:{sideWork:{monthlyGross:0}}},income:{pensions:{primary:{startDate:'2050-08-27',annualAtStart:12},spouse:{startDate:'2051-01-01',annualAtStart:6}}},budgets:[{fromAge:65,toAge:70,annualBudget:36}],unemployment:{baselineMode:'none'},events:[]});
  let current={config:c,scenarios:[{id:'base',role:'baseline',config:structuredClone(c)}]};saveState(current);
  const notices=[];
  const api=mountSalarySheet({getState:()=>current,onCommit:next=>{current={config:next.config,scenarios:next.scenarios};api.render();},showNotice:msg=>notices.push(msg)});
  api.render();
  const node=id=>document.getElementById(id);
  function set(id,value){node(id).value=value;node('salaryForm').emit('input',node(id));}
  function trial(){node('salaryZero').emit('click');set('salary_laborMode','none');set('salary_lastSalaryMonth','2045-06');set('salary_pre65MonthlyBudget','3');set('salary_monthsConfirmed','yes');node('salaryForm').emit('submit');}
  return {api,node,set,trial,getState:()=>current,setState:v=>current=v,notices};
}
test('模擬DOM：入力→試算→反映→取消、ボタンが対応する処理へ接続',()=>{
  const t=setup();t.trial();assert.equal(t.node('salaryError').hidden,true);assert.equal(t.node('salaryPreview').hidden,false);assert.equal(t.node('salaryApply').disabled,false);
  assert.match(t.node('salaryPreviewBody').innerHTML,/新方式・65歳基準/);
  t.node('salaryApply').emit('click');assert.equal(t.getState().config.cashflow.salaryLife.lastSalaryMonth,'2045-06');assert.equal(t.node('salaryState').textContent,'反映済み');assert.equal(t.node('salaryUndo').disabled,false);
  t.node('salaryUndo').emit('click');assert.equal(t.getState().config.cashflow.salaryLife,undefined);assert.equal(t.node('salaryUndo').disabled,true);
});
test('模擬DOM：試算後の入力変更で反映ボタンを無効化、月変更は再確認',()=>{
  const t=setup();t.trial();t.set('salary_lastSalaryMonth','2045-05');
  assert.equal(t.node('salary_monthsConfirmed').value,'');assert.equal(t.node('salaryPreview').hidden,true);assert.equal(t.node('salaryApply').disabled,true);
  t.node('salaryForm').emit('submit');assert.match(t.node('salaryError').textContent,/確認/);
});
test('模擬DOM：保存失敗時も入力と採用値を保持して再試行',()=>{
  const t=setup();t.trial();localStorage.fail=true;t.node('salaryApply').emit('click');
  assert.equal(t.getState().config.cashflow.salaryLife,undefined);assert.equal(t.node('salary_lastSalaryMonth').value,'2045-06');assert.match(t.node('salaryError').textContent,/Quota/);
  assert.equal(t.node('salaryApply').disabled,false);localStorage.fail=false;t.node('salaryApply').emit('click');assert.ok(t.getState().config.cashflow.salaryLife);
});
test('模擬DOM：比較案保存の連打は増殖せず、その後反映も可能',()=>{
  const t=setup();t.trial();t.node('salaryScenarioName').value='試す案';t.node('salarySaveScenario').emit('click');t.node('salarySaveScenario').emit('click');
  assert.equal(t.getState().scenarios.length,2);assert.equal(t.getState().config.cashflow.salaryLife,undefined);
  t.node('salaryApply').emit('click');assert.ok(t.getState().config.cashflow.salaryLife);assert.equal(t.getState().scenarios.length,2);
});
test('模擬DOM：別の条件更新による再描画で古い試算を無効化',()=>{
  const t=setup();t.trial();const s=structuredClone(t.getState());s.config.plan.afterTaxReturn=1;t.setState(s);t.api.render();
  assert.equal(t.node('salaryApply').disabled,true);assert.match(t.node('salaryError').textContent,/前提/);
});
test('模擬DOM：未反映下書きの再表示は採用設定を変えない',()=>{
  const t=setup();t.trial();t.api.reset({forget:false});t.api.render();
  assert.equal(t.node('salary_lastSalaryMonth').value,'2045-06');assert.equal(loadState().config.cashflow.salaryLife,undefined);
});
