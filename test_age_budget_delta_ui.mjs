import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateConfig} from './storage.mjs';
import {mountAgeBudgetDeltaComparison} from './age-budget-delta-ui.mjs';
class Element {
 constructor(tag){this.tagName=tag;this.children=[];this.listeners=new Map();this.disabled=false;this.textContent='';this.value='';this.dataset={};}
 append(...items){this.children.push(...items);}replaceChildren(...items){this.children=items;}
 setAttribute(){}addEventListener(n,f){this.listeners.set(n,f);}click(){this.listeners.get('click')?.();}change(){this.listeners.get('change')?.();}
}
const documentRef={createElement:tag=>new Element(tag)};
const cfg=()=>migrateConfig({people:{primary:{birthDate:'1980-08-27'},spouse:{birthDate:'1981-05-01'}},plan:{startAge:79,endAge:87,startDate:'2059-08-27',initialAsset:5000,initialAssetIncludesIdeco:false,afterTaxReturn:0,inflation:0,priceBaseMonth:'2059-08'},employment:{primary:{mainRetirement:{baseDate:'2045-08-27'}}},income:{pensions:{primary:{startDate:'2045-08-01',annualAtStart:0},spouse:{startDate:'2046-05-01',annualAtStart:0}}},budgets:[{fromAge:65,toAge:120,annualBudget:600}],unemployment:{baselineMode:'none'},cashflow:{periodOverrides:[]},events:[]});
test('unknown categories block preview and CSV without adopted changes',()=>{
 const state=cfg(),snapshot=structuredClone(state),root=new Element('div');
 const ui=mountAgeBudgetDeltaComparison({container:root,getConfig:()=>state,documentRef});
 ui.run.click();assert.equal(ui.csv.disabled,true);assert.match(ui.status.textContent,/未確認/);
 assert.deepEqual(state,snapshot);
});
test('confirmed values display preview and enable CSV without plan writes',()=>{
 const state=cfg(),root=new Element('div'),snapshot=structuredClone(state);
 let made=0,revoked=0;
 const ui=mountAgeBudgetDeltaComparison({container:root,getConfig:()=>state,documentRef,urlRef:{createObjectURL:()=>{made++;return 'blob:synthetic'},revokeObjectURL:()=>revoked++}});
 ui.selectors.medical.value='not-in-budget';ui.selectors.car.value='already-in-budget';ui.selectors.transport.value='not-in-budget';
 ui.run.click();
 assert.equal(ui.csv.disabled,false);assert.match(ui.status.textContent,/未採用の差額比較/);
 ui.csv.click();assert.equal(made,1);assert.equal(revoked,1);assert.deepEqual(state,snapshot);
});
test('change of source budget or reviewed status invalidates CSV',()=>{
 let state=cfg(),root=new Element('div'),made=0;
 const ui=mountAgeBudgetDeltaComparison({container:root,getConfig:()=>state,documentRef,urlRef:{createObjectURL:()=>{made++;return 'blob:synthetic'},revokeObjectURL:()=>{}}});
 Object.values(ui.selectors).forEach(s=>s.value='not-in-budget');ui.run.click();assert.equal(ui.csv.disabled,false);
 state.budgets[0].annualBudget+=12;ui.csv.click();assert.equal(made,0);assert.equal(ui.csv.disabled,true);
 ui.run.click();ui.selectors.car.value='already-in-budget';ui.csv.click();assert.equal(made,0);assert.equal(ui.csv.disabled,true);
 ui.run.click();assert.equal(ui.csv.disabled,false);ui.selectors.medical.value='';ui.selectors.medical.change();assert.equal(ui.csv.disabled,true);
});
