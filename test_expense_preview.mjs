import test from 'node:test';
import assert from 'node:assert/strict';
import {createExpenseDraft,previewExpenseChanges as preview,revalidateExpensePreview} from './expense-preview.mjs';
import {inspectCashflowSources} from './cashflow-sources.mjs';
import {migrateConfig} from './storage.mjs';
const WORK='work-v0.9.7',PUBLIC='public-v0.9';
const rent='expense/key:housing/key:rent',housing='expense/key:housing';
function fixture(){
 const c=migrateConfig({people:{primary:{birthDate:'1980-08-27'},spouse:{birthDate:'1981-05-01'}},plan:{startAge:64,endAge:67,startDate:'2044-08-27',initialAsset:1234,initialAssetIncludesIdeco:false,afterTaxReturn:0,inflation:3},employment:{primary:{mainRetirement:{baseDate:'2045-08-27'},sideWork:{monthlyGross:0}},spouse:{sideWork:{monthlyGross:0}}},income:{pensions:{primary:{annualAtStart:0},spouse:{annualAtStart:0}}},budgets:[{fromAge:65,toAge:90,annualBudget:120,travelReference:12,travelMin:3,travelMax:24,certainty:'plan',future:{a:[1]}}],unemployment:{baselineMode:'none'},events:[]});
 c.cashflow={periodOverrides:[],expenseCategories:[{key:'housing',items:[{key:'rent',periods:[{fromAge:64,toAge:90,amount:8,note:'period',future:{x:1}}]}]}],travel:[{fromAge:64,toAge:90,annualAmount:12}],taxSocialMode:'manual'};
 c.expenseDetail={monthlyCategories:[{key:'housing',items:[{key:'rent',amount:5,note:'keep',future:{x:2}}]}],travelAnnualBase:12};
 c.actuals={};c.reviews={65:{note:'keep'}};c.future={unknown:[1,2]};
 return {config:c,scenarios:[{id:'a',name:'案A',role:'scenario',selected:true,config:structuredClone(c)},{id:'b',name:'案B',role:'reference',selected:false,config:structuredClone(c)}],futureState:{keep:true}};
}
function draft(s,{kind='detail',profile=WORK,itemId=rent,amount=6,path}={}){
 const d=createExpenseDraft(s,{sourceProfile:profile,kind}),v=inspectCashflowSources(s.config,{sourceProfile:profile});
 const r=v.rules.find(r=>r.profile===profile&&r.itemId===itemId&&(!path||r.sourceRefs[0].path===path));assert.ok(r);
 d.edits=[{itemId,ruleRef:r.ruleRef,amount,unit:r.unit,priceBasis:r.priceBasis}];return d;
}
const funded=p=>p.months.find(m=>m.scope==='asset-funded');
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
test('detail-only changes one value, preserves budget/assets/scenarios and unknown fields',()=>{
 const s=freeze(fixture()),d=draft(s),p=preview(s,d),copy=structuredClone(s);copy.config.expenseDetail.monthlyCategories[0].items[0].amount=6;
 assert.deepEqual(p.candidate,copy);assert.equal(p.calculationUnchanged,true);assert.equal(p.finalAssetBefore,p.finalAssetAfter);assert.equal(p.saved,false);assert.equal(p.stage,'preview-only');assert.ok(funded(p).detailAfter>funded(p).detailBefore);assert.deepEqual(revalidateExpensePreview(s,p),p);
});
test('budget-only changes asset expenses without adding travel or detail',()=>{
 const s=fixture(),p=preview(s,draft(s,{kind:'budget',itemId:'management-budget',amount:144}));assert.equal(p.calculationUnchanged,false);assert.ok(p.finalAssetAfter<p.finalAssetBefore);assert.equal(funded(p).detailAfter,funded(p).detailBefore);assert.deepEqual(p.candidate.config.expenseDetail,s.config.expenseDetail);const b=structuredClone(p.candidate.config.budgets[0]);b.annualBudget=120;assert.deepEqual(b,s.config.budgets[0]);
});
test('detail and budget must not be mixed',()=>{
 const s=fixture(),d=draft(s);d.edits.push(...draft(s,{kind:'budget',itemId:'management-budget',amount:144}).edits);assert.throws(()=>preview(s,d),/混在/);
});
test('public periods change without touching Work fixed values',()=>{
 const s=fixture(),p=preview(s,draft(s,{profile:PUBLIC,amount:9}));assert.equal(p.candidate.config.cashflow.expenseCategories[0].items[0].periods[0].amount,9);assert.deepEqual(p.candidate.config.expenseDetail,s.config.expenseDetail);assert.equal(p.calculationUnchanged,true);
});
test('travel detail changes do not alter management budget',()=>{
 const s=fixture(),p=preview(s,draft(s,{itemId:'travel-plan',amount:24}));assert.equal(p.calculationUnchanged,true);assert.deepEqual(p.candidate.config.budgets,s.config.budgets);assert.equal(p.candidate.config.expenseDetail.travelAnnualBase,24);
});
test('public fallback travel reference changes only that metadata field',()=>{
 const s=fixture();delete s.config.cashflow.travel;const p=preview(s,draft(s,{profile:PUBLIC,itemId:'travel-plan',amount:18,path:'/budgets/0'}));assert.equal(p.calculationUnchanged,true);assert.equal(p.candidate.config.budgets[0].annualBudget,120);assert.equal(p.candidate.config.budgets[0].travelReference,18);assert.equal(p.candidate.config.budgets[0].travelMax,24);
});
test('budget overshoot is visible even with unknown tax',()=>{
 const s=fixture();s.config.expenseDetail.monthlyCategories.push({key:'taxSocial',amount:2});const p=preview(s,draft(s,{amount:20}));assert.ok(p.overBudgetMonths.length);assert.ok(p.unresolvedMonths.length);assert.equal(funded(p).detailAfter,null);assert.equal(funded(p).gapAfter,null);assert.equal(p.calculationUnchanged,true);
});
test('automatic tax rule cannot be overwritten as a known monthly value',()=>{
 const s=fixture();s.config.expenseDetail.monthlyCategories.push({key:'taxSocial',amount:2});assert.throws(()=>preview(s,draft(s,{itemId:'expense/key:taxSocial',amount:3})),/未計算/);
});
test('parent override replacement preserves children and their metadata',()=>{
 const s=fixture();s.config.cashflow.periodOverrides=[{kind:'expense',key:'housing',fromAge:64,toAge:90,amount:4,unit:'monthly',future:{id:'keep'}}];
 const p=preview(s,draft(s,{itemId:housing,amount:7,path:'/cashflow/periodOverrides/0'}));assert.deepEqual(p.candidate.config.expenseDetail,s.config.expenseDetail);assert.equal(p.candidate.config.cashflow.periodOverrides[0].future.id,'keep');assert.equal(p.calculationUnchanged,true);
});
test('fully suppressed child cannot be changed invisibly',()=>{
 const s=fixture();s.config.cashflow.periodOverrides=[{kind:'expense',key:'housing',fromAge:64,toAge:90,amount:4,unit:'monthly'}];assert.throws(()=>preview(s,draft(s)),/置換/);
});
test('partially suppressed source lists affected and suppressed months',()=>{
 const s=fixture();s.config.cashflow.periodOverrides=[{kind:'expense',key:'housing',fromAge:65,toAge:65,amount:4,unit:'monthly'}];const p=preview(s,draft(s));assert.equal(p.patches[0].suppressedMonths.length,12);assert.equal(p.patches[0].applicableMonths.length,36);
});
test('parent and child updates in one proposal are refused',()=>{
 const s=fixture();s.config.cashflow.periodOverrides=[{kind:'expense',key:'housing',fromAge:65,toAge:65,amount:4,unit:'monthly'}];const d=draft(s);d.edits.push(...draft(s,{itemId:housing,amount:7,path:'/cashflow/periodOverrides/0'}).edits);assert.throws(()=>preview(s,d),/親項目/);
});
test('duplicate scoped ID is not selected by array position',()=>{
 const s=fixture();s.config.expenseDetail.monthlyCategories[0].items.push({key:'rent',amount:1});assert.throws(()=>preview(s,draft(s)),/内部ID/);
});
test('same legacy key across parents with ambiguous override is blocked',()=>{
 const s=fixture();s.config.expenseDetail.monthlyCategories.push({key:'other',items:[{key:'rent',amount:1}]});s.config.cashflow.periodOverrides=[{kind:'expense',key:'rent',fromAge:65,toAge:65,amount:1,unit:'monthly'}];assert.throws(()=>preview(s,draft(s)),/競合/);
});
for(const amount of ['',null,undefined,'6',NaN,Infinity,-1])test(`invalid amount ${String(amount)} is never coerced`,()=>{
 const s=fixture(),d=draft(s);d.edits[0].amount=amount;assert.throws(()=>preview(s,d),/有限数値/);
});
test('explicit zero is allowed without treating missing as zero',()=>{
 const s=fixture(),p=preview(s,draft(s,{amount:0}));assert.equal(p.candidate.config.expenseDetail.monthlyCategories[0].items[0].amount,0);assert.equal(p.calculationUnchanged,true);
});
test('unit and price basis cannot be silently changed',()=>{
 for(const field of ['unit','priceBasis']){const s=fixture(),d=draft(s);d.edits[0][field]='wrong';assert.throws(()=>preview(s,d),/価格基準/);}
});
test('unknown source and wrong kind require explicit choice',()=>{
 const s=fixture();assert.throws(()=>createExpenseDraft(s,{kind:'detail',sourceProfile:'unknown'}),/出典/);assert.throws(()=>createExpenseDraft(s,{kind:'both',sourceProfile:WORK}),/分けて/);
});
test('same field twice and forged rule reference are rejected',()=>{
 const s=fixture(),d=draft(s);d.edits.push(structuredClone(d.edits[0]));assert.throws(()=>preview(s,d),/重複/);d.edits.pop();d.edits[0].ruleRef='/plan/initialAsset';assert.throws(()=>preview(s,d),/一意/);
});
test('stale draft includes scenario and actual changes in guard',()=>{
 for(const which of ['scenario','actual','reorder']){const s=fixture(),d=draft(s);if(which==='scenario')s.scenarios[0].name='new';else if(which==='actual')s.config.actuals={64:{endAsset:1000}};else s.config.budgets.reverse(),s.config.budgets.push({fromAge:91,toAge:92,annualBudget:120});assert.throws(()=>preview(s,d),/再確認/);}
});
test('tampered preview and stale prepared proposal require recalculation',()=>{
 const s=fixture(),p=preview(s,draft(s));p.candidate.config.plan.initialAsset=999;assert.throws(()=>revalidateExpensePreview(s,p),/再試算/);const clean=preview(s,draft(s));s.scenarios[0].selected=false;assert.throws(()=>revalidateExpensePreview(s,clean),/古い試算/);
});
test('same amount is a no-change proposal with deterministic output',()=>{
 const s=fixture(),d=draft(s,{amount:5}),p=preview(s,d);assert.equal(p.changed,false);assert.deepEqual(p.candidate,s);assert.deepEqual(preview(s,d),p);
});
test('saved calendar mode and actual forecast are preserved for detail update',()=>{
 const s=fixture();s.config.plan.calendarMode='anchored-months-v1';s.config.actuals={65:{endAsset:1000}};const p=preview(s,draft(s));assert.equal(p.calendarMode,'anchored-months-v1');assert.deepEqual(p.forecastBefore,p.forecastAfter);assert.deepEqual(p.candidate.config.actuals,s.config.actuals);
});
test('budget override changes only existing annual amount and preserves metadata',()=>{
 const s=fixture();s.config.cashflow.periodOverrides=[{kind:'budget',key:'budget',fromAge:65,toAge:65,amount:120,unit:'annual',future:{keep:1}}];const p=preview(s,draft(s,{kind:'budget',itemId:'management-budget',path:'/cashflow/periodOverrides/0',amount:144}));assert.deepEqual(p.candidate.config.budgets,s.config.budgets);assert.equal(p.candidate.config.cashflow.periodOverrides[0].future.keep,1);assert.equal(p.calculationUnchanged,false);
});
test('public budget cannot be proposed over a different actual Work override',()=>{
 const s=fixture();s.config.cashflow.periodOverrides=[{kind:'budget',key:'budget',fromAge:65,toAge:65,amount:240,unit:'annual'}];assert.throws(()=>preview(s,draft(s,{profile:PUBLIC,kind:'budget',itemId:'management-budget',amount:144})),/計算元/);
});
test('proposal does not read or write browser storage',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'localStorage');Object.defineProperty(globalThis,'localStorage',{configurable:true,get(){throw new Error('Storage accessed');}});
 try{const s=fixture();assert.equal(preview(s,draft(s)).saved,false);}finally{if(descriptor)Object.defineProperty(globalThis,'localStorage',descriptor);else delete globalThis.localStorage;}
});
test('salary household reference is not compared to zero asset expense',()=>{
 const s=fixture();s.config.cashflow.salaryLife={mode:'net-transfer-v1',lastSalaryMonth:'2045-07',monthlyAddition:0,monthlyWithdrawal:0,postSalaryLabor:{mode:'none'},idecoFunding:{before:{source:'salary'},after:{source:'household'}}};
 const p=preview(s,draft(s,{amount:7}));assert.equal(p.calculationUnchanged,true);assert.equal(p.assetExpenseChanged,false);assert.equal(p.months[0].scope,'family-reference');assert.equal(p.months[0].assessmentAfter,'family-reference-only');assert.equal(p.months[0].gapAfter,null);assert.equal(p.candidate.config.cashflow.salaryLife.monthlyWithdrawal,0);
});
test('yearly child override edits native annual field without changing its unit',()=>{
 const s=fixture();s.config.cashflow.periodOverrides=[{kind:'expense',key:'rent',fromAge:64,toAge:90,amount:60,unit:'annual'}];const p=preview(s,draft(s,{amount:72,path:'/cashflow/periodOverrides/0'}));assert.equal(p.patches[0].unit,'annual');assert.equal(p.candidate.config.cashflow.periodOverrides[0].amount,72);assert.equal(p.candidate.config.expenseDetail.monthlyCategories[0].items[0].amount,5);assert.equal(p.calculationUnchanged,true);
});
test('overlapping budget rules are not resolved by row order',()=>{
 const s=fixture();s.config.budgets.push({fromAge:65,toAge:90,annualBudget:144});assert.throws(()=>preview(s,draft(s,{kind:'budget',itemId:'management-budget',amount:156})),/競合/);
});
test('input that overflows calculations is not returned as a valid proposal',()=>{
 const s=fixture();s.config.plan.inflation=100000;assert.throws(()=>preview(s,draft(s,{kind:'budget',itemId:'management-budget',amount:Number.MAX_VALUE})),/数値範囲/);
});
