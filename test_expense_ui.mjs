import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mountExpenseSheet,assertExpenseScreenMatches} from './expense-ui.mjs';
import {migrateConfig,STATE_KEY} from './storage.mjs';
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
class Element{
 value='';checked=false;disabled=false;hidden=false;textContent='';children=[];listeners={};
 addEventListener(type,fn){this.listeners[type]=fn;}
 append(e){this.children.push(e);}
 replaceChildren(){this.children=[];this.value='';}
 async emit(type){if(type==='click'&&this.disabled)return;return this.listeners[type]?.();}
}
function setup({raw=false,brokenCommit=false}={}){
 const nodes=new Map([...html.matchAll(/\bid="(expense[^"]+)"/g)].map(x=>[x[1],new Element()]));
 const doc={getElementById:id=>nodes.get(id),createElement:()=>new Element()};
 const node=id=>doc.getElementById('expense'+id);node('Kind').value='detail';
 const c=migrateConfig({people:{primary:{birthDate:'1980-08-27'},spouse:{birthDate:'1981-05-01'}},plan:{startAge:64,endAge:67,startDate:'2044-08-27',initialAsset:1234,initialAssetIncludesIdeco:false,afterTaxReturn:0,inflation:0},income:{pensions:{primary:{annualAtStart:0},spouse:{annualAtStart:0}}},budgets:[{fromAge:65,toAge:90,annualBudget:120}],unemployment:{baselineMode:'none'},events:[]});
 c.expenseDetail={monthlyCategories:[{key:'housing',label:'住居',items:[{key:'rent',label:'家賃',amount:5}]}],travelAnnualBase:12};
 if(raw)delete c.certainty;
 let state={config:c,scenarios:[{id:'a',name:'比較A',role:'scenario',selected:true,config:structuredClone(c)},{id:'b',name:'比較B',role:'reference',config:structuredClone(c)}],future:{keep:1}};
 let display={config:migrateConfig(c),scenarios:state.scenarios.map(x=>({...x,config:migrateConfig(x.config)}))};
 const storage={raw:JSON.stringify(state),fail:false,writes:0,getItem(k){assert.equal(k,STATE_KEY);return this.raw;},setItem(k,v){assert.equal(k,STATE_KEY);if(this.fail)throw new Error('QuotaExceeded');this.writes++;this.raw=v;}};
 const notices=[];
 const api=mountExpenseSheet({doc,storage,getState:()=>display,onCommit:n=>{if(brokenCommit)throw new Error('render');state=n.state;display={config:migrateConfig(state.config),scenarios:state.scenarios.map(x=>({...x,config:migrateConfig(x.config)}))};api.render();},showNotice:s=>notices.push(s)});api.render();
 async function choose(kind='detail'){
  node('Source').value='work-v0.9.7';node('Kind').value=kind;await node('Source').emit('change');
  if(kind==='detail'){node('Rule').value=String(node('Rule').children.findIndex(x=>x.textContent.includes('家賃')));await node('Rule').emit('change');}
 }
 async function trial(kind='detail',amount='6'){await choose(kind);node('Amount').value=amount;await node('Amount').emit('input');await node('Trial').emit('click');}
 async function confirm(){node('Reviewed').checked=true;await node('Reviewed').emit('change');}
 return {node,api,storage,trial,confirm,choose,get:()=>JSON.parse(storage.raw),setDisplay:s=>display=s,display:()=>display,notices};
}
test('expense UI requires explicit source; opening never writes',()=>{const t=setup();assert.equal(t.storage.writes,0);assert.equal(t.node('Trial').disabled,true);assert.equal(t.node('Apply').disabled,true);});
test('detail preview and confirmation then apply/reload/undo retain scenarios and unknown fields',async()=>{
 const t=setup();const before=t.get();await t.trial();assert.equal(t.node('Preview').hidden,false);assert.match(t.node('PreviewBody').textContent,/資産推移は変更しません/);assert.equal(t.node('Apply').disabled,true);await t.confirm();await t.node('Apply').emit('click');
 assert.equal(t.get().config.expenseDetail.monthlyCategories[0].items[0].amount,6);assert.deepEqual(t.get().scenarios,before.scenarios);assert.deepEqual(t.get().future,before.future);assert.match(t.node('History').textContent,/日本時間/);assert.equal(t.node('Status').textContent,'反映済み');await t.node('Undo').emit('click');assert.equal(t.get().config.expenseDetail.monthlyCategories[0].items[0].amount,5);
});
test('budget preview clearly changes budget and applies only its amount',async()=>{const t=setup();await t.trial('budget','144');assert.match(t.node('PreviewBody').textContent,/管理予算の変更案/);await t.confirm();await t.node('Apply').emit('click');assert.equal(t.get().config.budgets[0].annualBudget,144);assert.equal(t.get().config.expenseDetail.monthlyCategories[0].items[0].amount,5);});
test('failure keeps draft/preview/adoption and retry succeeds',async()=>{const t=setup();await t.trial();await t.confirm();const before=t.storage.raw;t.storage.fail=true;await t.node('Apply').emit('click');assert.equal(t.storage.raw,before);assert.equal(t.node('Amount').value,'6');assert.equal(t.node('Preview').hidden,false);assert.match(t.node('Error').textContent,/入力は保持/);t.storage.fail=false;await t.node('Apply').emit('click');assert.equal(t.storage.writes,1);});
test('double click produces one save',async()=>{const t=setup();await t.trial();await t.confirm();await Promise.all([t.node('Apply').emit('click'),t.node('Apply').emit('click')]);assert.equal(t.storage.writes,1);assert.equal(t.get().config.expenseWorkflow.history.length,1);});
test('editing input invalidates preview and checkbox',async()=>{const t=setup();await t.trial();await t.confirm();t.node('Amount').value='7';await t.node('Amount').emit('input');assert.equal(t.node('Apply').disabled,true);assert.equal(t.node('Reviewed').checked,false);});
for(const amount of ['','-1','Infinity','abc'])test(`invalid amount ${JSON.stringify(amount)} never enables apply`,async()=>{const t=setup();await t.trial('detail',amount);assert.equal(t.node('Apply').disabled,true);assert.equal(t.storage.writes,0);assert.match(t.node('Error').textContent,/0以上/);});
test('unchanged amount is no-save',async()=>{const t=setup();await t.trial('detail','5');await t.confirm();assert.equal(t.node('Apply').disabled,true);assert.match(t.node('Status').textContent,/保存不要/);});
test('external storage notification retains input and blocks all actions',async()=>{const t=setup();await t.trial();t.api.invalidate();assert.equal(t.node('Amount').value,'6');assert.equal(t.node('Apply').disabled,true);assert.equal(t.node('Trial').disabled,true);assert.equal(t.node('Undo').disabled,true);});
test('another same-page edit blocks preview on render',async()=>{const t=setup();await t.trial();const n=t.get();n.config.plan.inflation=2;t.storage.raw=JSON.stringify(n);t.setDisplay(n);t.api.render();assert.equal(t.node('Amount').value,'6');assert.equal(t.node('Apply').disabled,true);assert.match(t.node('Error').textContent,/設定が更新/);});
test('silent outside change before apply cannot overwrite',async()=>{const t=setup();await t.trial();await t.confirm();const n=t.get();n.config.plan.inflation=2;t.storage.raw=JSON.stringify(n);await t.node('Apply').emit('click');assert.equal(t.storage.writes,0);assert.equal(t.node('Amount').value,'6');assert.match(t.node('Error').textContent,/表示中/);});
test('raw fields are not normalized into storage during UI save',async()=>{const t=setup({raw:true});await t.trial();await t.confirm();await t.node('Apply').emit('click');assert.equal(t.get().config.certainty,undefined);});
test('render failure after save is explicitly saved and blocks further work',async()=>{const t=setup({brokenCommit:true});await t.trial();await t.confirm();await t.node('Apply').emit('click');assert.equal(t.storage.writes,1);assert.equal(t.node('Apply').disabled,true);assert.match(t.node('Error').textContent,/保存済み|表示中/);});
test('raw/view match checks every scenario too',()=>{const t=setup();const d=structuredClone(t.display());d.scenarios[0].selected=false;assert.throws(()=>assertExpenseScreenMatches(t.get(),d),/表示中/);});
test('overspending and unresolved warning are always present',async()=>{const t=setup();await t.trial('detail','200');assert.match(t.node('PreviewBody').textContent,/予算超過月：204/);assert.match(t.node('PreviewBody').textContent,/未計算・未確定/);assert.match(t.node('PreviewBody').textContent,/0円とは扱いません/);});
test('UI is wired into refresh/import/storage events and cache includes dependency closure',()=>{
 const app=fs.readFileSync(new URL('./app.mjs',import.meta.url),'utf8'),sw=fs.readFileSync(new URL('./sw.js',import.meta.url),'utf8');
 for(const s of ['expenseSheet.render()','expenseSheet.reset()','expenseSheet.invalidate()','config=updated.state.config'])assert.ok(app.includes(s));
 for(const s of ['expense-ui','expense-workflow','expense-preview','cashflow-sources','cashflow-reconciliation'])assert.ok(sw.includes(s+'.mjs'));
 assert.ok(html.includes('inputmode="decimal"'));assert.ok(html.includes('未反映の入力はこの画面内だけ'));
});
