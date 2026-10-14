import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateConfig} from './storage.mjs';
import {mountStep8TrialCard} from './step8-trial-ui.mjs';
class Element{
 constructor(tag,doc){this.tagName=tag;this.ownerDocument=doc;this.attributes={};this.children=[];this.listeners={};this.value='';this.checked=false;this.textContent='';}
 setAttribute(k,v){this.attributes[k]=String(v);if(k==='name')this.name=v;}
 appendChild(x){this.children.push(x);return x;}
 append(...items){this.children.push(...items);}
 replaceChildren(...items){this.children=[...items];}
 addEventListener(n,fn){(this.listeners[n]??=[]).push(fn);}
 emit(n){for(const fn of this.listeners[n]??[])fn({target:this});}
}
const doc={createElement(tag){return new Element(tag,doc)},createTextNode(s){return {textContent:s}}};
const walk=(el,pred)=>[el,...(el.children??[]).flatMap(c=>walk(c,pred))].filter(pred);
const getField=(root,name)=>walk(root,e=>e.attributes?.name===name)[0];
const getButton=(root,label)=>walk(root,e=>e.tagName==='button'&&e.textContent===label)[0];
const fixture=()=>migrateConfig({
 people:{primary:{birthDate:'1980-08-27'},spouse:{birthDate:'1981-05-01'}},
 plan:{startAge:64,endAge:69,startDate:'2044-09-27',initialAsset:100,initialAssetIncludesIdeco:false,afterTaxReturn:0,inflation:0},
 ideco:{asOfDate:'2044-08-27',currentBalance:120,monthlyContribution:0,contributionEndDate:'2044-08-27',lumpDate:'2044-08-27',lumpPercent:50,annuityPercent:50,annuityYears:5,accumulationReturn:0,annuityReturn:0},
 employment:{primary:{mainRetirement:{baseDate:'2045-08-27'},sideWork:{monthlyGross:0}},spouse:{sideWork:{monthlyGross:0}}},income:{pensions:{primary:{annualAtStart:0},spouse:{annualAtStart:0}}},
 budgets:[{fromAge:65,toAge:95,annualBudget:0}],unemployment:{baselineMode:'none'},
 cashflow:{salaryLife:{mode:'net-transfer-v1',lastSalaryMonth:'2044-08',monthlyAddition:0,monthlyWithdrawal:0,pre65MonthlyBudget:0,postSalaryLabor:{mode:'none'}}},events:[],management:{thresholds:{65:400}}
});
function setup(){const root=new Element('section',doc),c=fixture(),before=structuredClone(c),ui=mountStep8TrialCard(root,()=>c);return {root,c,before,ui};}
function input(root,name,value){const target=getField(root,name);assert.ok(target,name);target.value=String(value);target.emit(name==='idecoAssetScope'?'change':'input');return target;}
function trialAll(root){for(const [k,v] of Object.entries({startMonth:'2044-09',salaryLastMonth:'2044-08',priceBaseMonth:'2044-08',openingAsOfMonth:'2044-08',openingAmount:100,annuityStartMonth:'2044-09',idecoAssetScope:'received-lump-only-v1'}))input(root,k,v);
 const inputs=walk(root,e=>e.tagName==='input'&&e.attributes.type==='checkbox');assert.equal(inputs.length,2);inputs[0].checked=true;inputs[0].emit('change');inputs[1].checked=true;inputs[1].emit('change');
 getButton(root,'変更後の資産を試算（未反映）').emit('click');}
test('mount shows separate date, balance, annuity fields but no apply button',()=>{const {root}=setup();for(const f of ['startMonth','salaryLastMonth','priceBaseMonth','openingAsOfMonth','openingAmount','annuityStartMonth'])assert.ok(getField(root,f));assert.equal(walk(root,e=>e.tagName==='button').length,2);assert.match(walk(root,e=>e.tagName==='p').map(x=>x.textContent).join(' '),/期末目標額とは違います/);});
test('trial action shows forecast, remains read-only and changing input clears trial',()=>{const {root,c,before,ui}=setup();trialAll(root);assert.equal(ui.getState().hasTrial,true);assert.equal(walk(root,e=>e.tagName==='pre')[0].textContent.includes('最終資産 160'),true);assert.deepEqual(c,before);input(root,'openingAmount',120);assert.equal(ui.getState().hasTrial,false);assert.equal(ui.getState().draft.openingConfirmed,false);assert.deepEqual(c,before);});
test('reset restores saved values and does not reuse prior confirmation',()=>{const {root,ui,c,before}=setup();trialAll(root);getButton(root,'入力を現在の保存設定に戻す').emit('click');assert.equal(ui.getState().hasTrial,false);assert.equal(ui.getState().draft.openingConfirmed,false);assert.equal(ui.getState().draft.openingAmount,null);assert.deepEqual(c,before);});
test('unconfirmed trial shows errors and never mutates source',()=>{const {root,c,before}=setup();getButton(root,'変更後の資産を試算（未反映）').emit('click');assert.ok(walk(root,e=>e.tagName==='pre')[0].textContent.includes('計算開始月'));assert.deepEqual(c,before);});
test('destroy removes UI only, not config',()=>{const {root,c,ui,before}=setup();ui.destroy();assert.equal(root.children.length,0);assert.deepEqual(c,before);});

test('salary boundary input is available, refresh invalidates the previous trial',()=>{
 const {root,c,before,ui}=setup();trialAll(root);
 assert.equal(ui.getState().hasTrial,true);
 input(root,'salaryLastMonth','2044-07');
 assert.equal(ui.getState().hasTrial,false);
 assert.equal(ui.getState().draft.openingConfirmed,false);
 assert.deepEqual(c,before);
});

// Windows 11 verification showed the invalidation message while the previous
// "final asset" result remained visible. A stale result must be removed.
for(const [label,change] of [
 ['price base month',root=>input(root,'priceBaseMonth','2044-07')],
 ['starting asset',root=>input(root,'openingAmount','120')],
 ['salary boundary',root=>input(root,'salaryLastMonth','2044-07')],
 ['annuity start',root=>input(root,'annuityStartMonth','2044-10')],
 ['iDeCo asset scope',root=>input(root,'idecoAssetScope','')],
 ['legacy scope confirmation',root=>{const e=walk(root,x=>x.tagName==='input'&&x.attributes.type==='checkbox')[0];e.checked=false;e.emit('change');}],
 ['opening asset confirmation',root=>{const e=walk(root,x=>x.tagName==='input'&&x.attributes.type==='checkbox')[1];e.checked=false;e.emit('change');}],
]){
 test('changing '+label+' hides stale trial output without saving',()=>{
   const {root,c,before,ui}=setup();trialAll(root);
   const output=walk(root,e=>e.tagName==='pre')[0];
   assert.match(output.textContent,/最終資産 160/);
   change(root);
   assert.equal(ui.getState().hasTrial,false);
   assert.equal(output.textContent,'');
   assert.deepEqual(c,before);
 });
}
test('reset clears any existing result and confirmation',()=>{
  const {root,ui}=setup();trialAll(root);
  const oldOutput=walk(root,e=>e.tagName==='pre')[0];
  assert.match(oldOutput.textContent,/最終資産 160/);
  getButton(root,'入力を現在の保存設定に戻す').emit('click');
  assert.equal(root.children.includes(oldOutput),false);
  assert.equal(walk(root,e=>e.tagName==='pre')[0].textContent,'');
  assert.equal(ui.getState().hasTrial,false);
});
