import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateConfig} from './storage.mjs';
import {mountFullPlanComparisonCard} from './full-plan-ui.mjs';
class Element{
 constructor(tag,doc){this.tagName=tag;this.ownerDocument=doc;this.attributes={};this.children=[];this.listeners={};this.value='';this.disabled=false;this.textContent='';}
 setAttribute(k,v){this.attributes[k]=String(v);if(k==='name')this.name=v;}
 appendChild(x){this.children.push(x);return x;}
 append(...a){this.children.push(...a);}
 replaceChildren(...a){this.children=a;}
 addEventListener(k,f){(this.listeners[k]??=[]).push(f);}
 emit(k){for(const f of this.listeners[k]??[])f({target:this});}
}
const doc={createElement(tag){return new Element(tag,doc)}};
const walk=(e,p)=>[e,...(e.children??[]).flatMap(x=>walk(x,p))].filter(p);
const find=(r,n)=>walk(r,x=>x.attributes?.name===n)[0];
const button=(r,s)=>walk(r,x=>x.tagName==='button'&&x.textContent===s)[0];
const fixture=()=>migrateConfig({
 people:{primary:{birthDate:'1980-08-27'},spouse:{birthDate:'1981-05-01'}},
 plan:{startAge:64,endAge:95,startDate:'2044-08-27',initialAsset:100,initialAssetIncludesIdeco:false,afterTaxReturn:0,inflation:0},
 ideco:{asOfDate:'2044-08-27',currentBalance:120,monthlyContribution:0,contributionEndDate:'2044-08-27',lumpDate:'2044-08-27',lumpPercent:50,annuityPercent:50,annuityYears:5,accumulationReturn:0,annuityReturn:0},
 employment:{primary:{mainRetirement:{baseDate:'2045-08-27'},sideWork:{monthlyGross:0}},spouse:{sideWork:{monthlyGross:0}}},income:{pensions:{primary:{annualAtStart:0},spouse:{annualAtStart:0}}},
 budgets:[{fromAge:65,toAge:95,annualBudget:0}],unemployment:{baselineMode:'none'},
 cashflow:{salaryLife:{mode:'net-transfer-v1',lastSalaryMonth:'2044-08',monthlyAddition:0,monthlyWithdrawal:0,pre65MonthlyBudget:0,postSalaryLabor:{mode:'none'},receiptTreatment:{ideco:'separate',pension:'separate',unemployment:'separate'}}},events:[],management:{thresholds:{70:40,95:0}}
});
const opening=()=>({startMonth:'2044-09',salaryLastMonth:'2044-08',priceBaseMonth:'2044-08',openingAsOfMonth:'2044-08',openingAmount:100,openingConfirmed:true,idecoAssetScope:'received-lump-only-v1',replaceLegacyScope:true,annuityStartMonth:'2044-09'});
const setup=()=>{const config=fixture(),original=structuredClone(config),root=new Element('div',doc),ui=mountFullPlanComparisonCard(root,{getConfig:()=>config,getOpeningDraft:opening});return {root,config,original,ui};};
function fill(root,name,value){const x=find(root,name);assert.ok(x,name);x.value=String(value);x.emit('input');}
test('full plan UI is read-only until explicit trial and has no apply/save action',()=>{
 const {root,config,original,ui}=setup();
 assert.ok(find(root,'fullPlanBudgetAmount0'));assert.ok(button(root,'全条件を比較（未反映）'));
 assert.equal(ui.getState().hasTrial,false);assert.deepEqual(config,original);
 assert.equal(button(root,'全体シミュレーションに反映'),undefined);
});
test('explicit inputs produce checked year-end comparison without adopting',()=>{
 const {root,config,original,ui}=setup();
 fill(root,'fullPlanSideMonth','2045-10');fill(root,'fullPlanBudgetAmount0','12');
 button(root,'全条件を比較（未反映）').emit('click');
 assert.equal(ui.getState().hasTrial,true,walk(root,x=>x.tagName==='p').map(x=>x.textContent).join(' / '));
 assert.match(walk(root,x=>x.attributes.role==='status')[0].textContent,/年齢期CSVの照合が完了/);
 assert.deepEqual(config,original);assert.equal(root.children.at(-1).disabled,false);
});
test('input and opening changes invalidate old result and csv eligibility',()=>{
 const {root,ui}=setup();fill(root,'fullPlanSideMonth','2045-10');button(root,'全条件を比較（未反映）').emit('click');
 assert.equal(ui.getState().hasTrial,true,walk(root,x=>x.tagName==='p').map(x=>x.textContent).join(' / '));fill(root,'fullPlanBudgetAmount0','12');assert.equal(ui.getState().hasTrial,false);
 button(root,'全条件を比較（未反映）').emit('click');assert.equal(ui.getState().hasTrial,true,walk(root,x=>x.tagName==='p').map(x=>x.textContent).join(' / '));
 ui.invalidate();assert.equal(ui.getState().hasTrial,false);assert.equal(root.children.at(-1).disabled,true);
});
test('missing labor month and malformed event cannot be silently adopted',()=>{
 const {root,config,original,ui}=setup();button(root,'全条件を比較（未反映）').emit('click');
 assert.equal(ui.getState().hasTrial,false);fill(root,'fullPlanSideMonth','2045-10');
 button(root,'臨時収支を追加').emit('click');
 button(root,'全条件を比較（未反映）').emit('click');assert.equal(ui.getState().hasTrial,false);assert.deepEqual(config,original);
});
test('concurrent update resets candidate before calculation',()=>{
 const {root,config,ui}=setup();fill(root,'fullPlanSideMonth','2045-10');
 config.plan.inflation=1;
 button(root,'全条件を比較（未反映）').emit('click');assert.equal(ui.getState().hasTrial,false);
 assert.match(walk(root,x=>x.attributes.role==='status')[0].textContent,/別画面/);
});
