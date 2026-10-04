// Event wiring with a minimal DOM double; not a browser/iPhone test.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mountCalendarSheet} from './calendar-ui.mjs';
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
 const c=migrateConfig({people:{primary:{birthDate:'1980-01-31'},spouse:{birthDate:'1981-05-01'}},plan:{startAge:64,endAge:67,startDate:'2044-01-31',initialAsset:1234,initialAssetIncludesIdeco:false,afterTaxReturn:0,inflation:0},employment:{primary:{mainRetirement:{baseDate:'2045-01-31'},sideWork:{monthlyGross:0}},spouse:{sideWork:{monthlyGross:0}}},income:{pensions:{primary:{annualAtStart:0},spouse:{annualAtStart:0}}},budgets:[{fromAge:65,toAge:90,annualBudget:36}],unemployment:{baselineMode:'none'},events:[]});
 let current={config:c,scenarios:[{id:'a',name:'A',role:'scenario',config:structuredClone(c)}]};saveState(current);const notices=[];
 const api=mountCalendarSheet({getState:()=>current,onCommit:n=>{current={config:n.config,scenarios:n.scenarios};api.render();},showNotice:s=>notices.push(s)});api.render();
 const node=id=>document.getElementById(id);
 function trial(){node('calendarMode').value='anchored-months-v1';node('calendarMode').emit('change');node('calendarTrial').emit('click');}
 function confirm(){node('calendarReviewed').checked=true;node('calendarReviewed').emit('change');}
 return {api,node,trial,confirm,get:()=>current,set:s=>current=s,notices};
}
test('UI trial requires review before adoption; undo and Japanese timestamp visible',()=>{
 const t=setup();t.trial();assert.equal(t.node('calendarPreview').hidden,false);assert.match(t.node('calendarPreviewBody').textContent,/49 → 48/);assert.equal(t.node('calendarApply').disabled,true);assert.equal(t.get().config.plan.calendarMode,undefined);
 t.confirm();t.node('calendarApply').emit('click');assert.equal(t.get().config.plan.calendarMode,'anchored-months-v1');assert.match(t.node('calendarHistory').textContent,/日本時間/);assert.equal(t.node('calendarUndo').disabled,false);t.node('calendarUndo').emit('click');assert.equal(t.get().config.plan.calendarMode,undefined);assert.equal(t.get().scenarios[0].role,'scenario');
});
test('UI save failure retains candidate, preview and current adopted value',()=>{
 const t=setup();t.trial();t.confirm();localStorage.fail=true;t.node('calendarApply').emit('click');assert.equal(t.get().config.plan.calendarMode,undefined);assert.equal(t.node('calendarMode').value,'anchored-months-v1');assert.equal(t.node('calendarPreview').hidden,false);assert.equal(t.node('calendarApply').disabled,false);assert.match(t.node('calendarError').textContent,/保存できません/);localStorage.fail=false;t.node('calendarApply').emit('click');assert.equal(loadState().config.plan.calendarMode,'anchored-months-v1');
});
test('UI changing selected mode invalidates prior preview and confirmation',()=>{
 const t=setup();t.trial();t.confirm();t.node('calendarMode').value='legacy';t.node('calendarMode').emit('change');assert.equal(t.node('calendarApply').disabled,true);assert.equal(t.node('calendarReviewed').checked,false);assert.equal(t.node('calendarPreview').hidden,true);
});
test('UI refresh after another edit blocks stale apply',()=>{
 const t=setup();t.trial();t.confirm();const n=structuredClone(t.get());n.config.plan.inflation=4;t.set(n);t.api.render();assert.equal(t.node('calendarApply').disabled,true);assert.match(t.node('calendarError').textContent,/再試算/);assert.equal(t.node('calendarMode').value,'anchored-months-v1');
});
test('UI storage notification blocks both write buttons until reload',()=>{
 const t=setup();t.trial();t.confirm();t.api.invalidate();assert.equal(t.node('calendarTrial').disabled,true);assert.equal(t.node('calendarApply').disabled,true);assert.equal(t.node('calendarUndo').disabled,true);assert.match(t.node('calendarError').textContent,/再読み込み/);
});
test('UI blocks actual-period conflict even after review checkbox',()=>{
 const t=setup(),n=structuredClone(t.get());n.config.actuals={64:{endAsset:1000}};t.set(n);saveState(n);t.trial();t.confirm();assert.equal(t.node('calendarApply').disabled,true);assert.match(t.node('calendarPreviewBody').textContent,/反映不可/);
});
test('UI reset uses adopted mode, without adoption or old preview',()=>{
 const t=setup();t.trial();t.api.reset();assert.equal(t.node('calendarMode').value,'legacy');assert.equal(t.node('calendarPreview').hidden,true);assert.equal(loadState().config.plan.calendarMode,undefined);
});
test('UI repeated click after save cannot append history',()=>{
 const t=setup();t.trial();t.confirm();t.node('calendarApply').emit('click');t.node('calendarApply').emit('click');assert.equal(loadState().config.calendarWorkflow.history.length,1);
});
