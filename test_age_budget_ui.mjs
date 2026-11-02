import test from 'node:test';import assert from 'node:assert/strict';
import {migrateConfig} from './storage.mjs';
import {mountAgeBudgetComparison} from './age-budget-ui.mjs';
class Element {
 constructor(tag){this.tagName=tag;this.children=[];this.listeners=new Map();this.disabled=false;this.textContent='';}
 append(...parts){this.children.push(...parts);}replaceChildren(...parts){this.children=parts;}
 setAttribute(){}addEventListener(name,fn){this.listeners.set(name,fn);}
 click(){this.listeners.get('click')?.();}
}
const documentRef={createElement:tag=>new Element(tag)};
const config=()=>migrateConfig({people:{primary:{birthDate:'1980-08-27'},spouse:{birthDate:'1981-05-01'}},plan:{startAge:79,endAge:87,startDate:'2059-08-27',initialAsset:5000,initialAssetIncludesIdeco:false,afterTaxReturn:0,inflation:0},employment:{primary:{mainRetirement:{baseDate:'2045-08-27'}}},income:{pensions:{primary:{startDate:'2045-08-01',annualAtStart:0},spouse:{startDate:'2046-05-01',annualAtStart:0}}},budgets:[{fromAge:65,toAge:120,annualBudget:528}],unemployment:{baselineMode:'none'},cashflow:{periodOverrides:[]},events:[]});
test('比較画面の試算とCSVは本人設定を更新しない',()=>{
 let state=config(),created=0,revoked=0;const before=structuredClone(state),messages=[];
 const root=new Element('div');
 const ui=mountAgeBudgetComparison({container:root,getConfig:()=>state,documentRef,notice:t=>messages.push(t),urlRef:{createObjectURL:()=>{created++;return 'blob:example';},revokeObjectURL:()=>{revoked++;}}});
 const shell=root.children[0],run=shell.children[2],exportBtn=shell.children[3];
 assert.equal(exportBtn.disabled,true);run.click();assert.equal(exportBtn.disabled,false);exportBtn.click();
 assert.equal(created,1);assert.equal(revoked,1);assert.deepEqual(state,before);
 ui.reset();assert.equal(exportBtn.disabled,true);
});
test('設定が試算後に変わると旧比較CSVを拒否',()=>{
 let state=config(),created=0;const messages=[],root=new Element('div');
 mountAgeBudgetComparison({container:root,getConfig:()=>state,documentRef,notice:t=>messages.push(t),urlRef:{createObjectURL:()=>{created++;return 'blob:example';},revokeObjectURL:()=>{}}});
 const shell=root.children[0],run=shell.children[2],exportBtn=shell.children[3];run.click();
 state={...state,plan:{...state.plan,initialAsset:5100}};exportBtn.click();
 assert.equal(created,0);assert.equal(exportBtn.disabled,true);assert.ok(messages.some(x=>x.includes('再試算')));
});

test('同一オブジェクトの予算更新も検知し旧CSVを出力しない',()=>{
 const state=config(),root=new Element('div'),messages=[];let created=0;
 mountAgeBudgetComparison({container:root,getConfig:()=>state,documentRef,notice:t=>messages.push(t),urlRef:{createObjectURL:()=>{created++;return 'blob:example';},revokeObjectURL:()=>{}}});
 const shell=root.children[0],run=shell.children[2],exportBtn=shell.children[3];
 run.click();assert.equal(exportBtn.disabled,false);
 state.budgets[0].annualBudget+=12;
 exportBtn.click();
 assert.equal(created,0);assert.equal(exportBtn.disabled,true);
 assert.ok(messages.some(x=>x.includes('再試算')));
});
