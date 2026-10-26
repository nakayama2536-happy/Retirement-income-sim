import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {runRetirementPlan} from './calc.mjs';
import {migrateConfig} from './storage.mjs';
import {pensionDraftFromConfig,previewPension,applyPensionPreview,undoPensionApply,pensionUndoAvailable} from './pension.mjs';
import {inspectMortalityExpenseBudget,applyMortalityExpenseMultipliers} from './mortality-itemized.mjs';
import {calculateMortalityComparison} from './mortality-comparison.mjs';
import {readMortalityDraft,saveMortalityDraft,clearMortalityDraft} from './mortality-draft.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,String(a)+' != '+String(b));
const original=JSON.parse(fs.readFileSync(new URL('./tools/browser-test/mortality-synthetic.json',import.meta.url),'utf8')).config;
function fixture(){
 const c=migrateConfig(structuredClone(original));
 c.plan.afterTaxReturn=0;c.plan.inflation=0;c.budgets=[{fromAge:65,toAge:95,annualBudget:660}];
 c.cashflow||={};c.cashflow.detailSourceProfile='work-v0.9.7';c.cashflow.periodOverrides=[];
 c.expenseDetail={monthlyCategories:[
   {key:'housing',label:'不動産',items:[{key:'rent',label:'住居',amount:15}]},
   {key:'food',label:'食費',amount:10},
   {key:'utilities',label:'光熱費',amount:5},
 ],travelAnnualBase:0};
 return c;
}
test('the adopted plan remains unchanged when pension evidence only is edited',()=>{
 const c=fixture(),before=runRetirementPlan(c).finalAsset,d=pensionDraftFromConfig(c);
 d.primary.breakdownAtStart={basicAnnual:90,employeeAnnual:210,otherAnnual:0,source:'Synthetic statement'};
 d.primary.survivorReference={earningsBeforeDeferralAnnual:160,source:'Synthetic statement'};
 const trial=previewPension(c,d);assert.deepEqual(trial.changedPeople,['primary']);
 near(trial.result.finalAsset,before);assert.equal(c.income.pensions.primary.breakdownAtStart,undefined);
 const applied=applyPensionPreview(c,trial,()=>{}).config;
 near(runRetirementPlan(applied).finalAsset,before);
 assert.equal(applied.income.pensions.primary.breakdownAtStart.basicAnnual,90);
 assert.equal(applied.income.pensions.primary.survivorReference.earningsBeforeDeferralAnnual,160);
 assert.equal(pensionUndoAvailable(applied),true);
 const undone=undoPensionApply(applied,()=>{}).config;
 assert.equal(undone.income.pensions.primary.breakdownAtStart,undefined);
 near(runRetirementPlan(undone).finalAsset,before);
});
test('65-year base evidence is distinct from 70-year adopted pension amount',()=>{
 const c=fixture(),d=pensionDraftFromConfig(c),old=structuredClone(c);
 // 65-year estimate is 210, but selected claim-year amount stays 300.
 d.primary.reference65={
   basicAnnual:80,employeeEarningsAnnual:129.9,transitionalAnnual:.1,totalAnnual:210,
   source:'Synthetic age-65 statement'
 };
 const trial=previewPension(c,d);
 assert.equal(trial.candidate.income.pensions.primary.annualAtStart,300);
 assert.equal(trial.candidate.income.pensions.primary.reference65.employeeEarningsAnnual,129.9);
 assert.deepEqual(c,old);
 d.primary.reference65.totalAnnual=211;
 assert.throws(()=>previewPension(c,d),/65歳年金内訳.*一致/);
});
test('pension split mismatch, negative evidence, blank/zero are distinguished',()=>{
 const c=fixture(),d=pensionDraftFromConfig(c);
 d.primary.breakdownAtStart={basicAnnual:90,employeeAnnual:210,otherAnnual:1,source:'Synthetic'};
 assert.throws(()=>previewPension(c,d),/一致/);
 d.primary.breakdownAtStart.otherAnnual=0;d.primary.breakdownAtStart.basicAnnual='';
 assert.doesNotThrow(()=>previewPension(c,d));
 d.primary.breakdownAtStart.basicAnnual=-1;assert.throws(()=>previewPension(c,d),/不正/);
 d.primary.breakdownAtStart.basicAnnual=90;
 d.primary.survivorReference={earningsBeforeDeferralAnnual:'',source:'Synthetic'};
 assert.throws(()=>previewPension(c,d),/報酬比例/);
});
test('registered items 15/10/5 plus 25 remainder, each multiplied once, without sharing percentages',()=>{
 const c=fixture(),raw=runRetirementPlan(c,{includeMonthlyDetails:true});
 const model=inspectMortalityExpenseBudget(c,raw.monthlyDetails);
 const month=model.months.find(m=>m.expense===55);
 assert.ok(month);near(month.known,30);near(month.unallocated,25);
 const factors=Object.fromEntries(model.items.map(x=>[x.id,x.label==='食費'?.6:x.label==='光熱費'?.8:1]));
 const priced=applyMortalityExpenseMultipliers(raw.monthlyDetails,model,{factors,unallocatedFactor:.8});
 const row=priced.monthlyRows.find(x=>x.month===month.month);
 near(row.itemizedExpensePreview,45);near(Object.values(row.expenseComponents).reduce((a,b)=>a+b,0),55);
 const trial=calculateMortalityComparison({config:c,baseline:raw,deathPerson:'primary',deathMonth:'2060-01',
   survivorTotalAnnual:210,funeralExpenseMan:0,itemFactors:factors,unallocatedFactor:.8,planCalculator:runRetirementPlan,acknowledged:true});
 const next=trial.mortality.monthly.find(m=>m.postDeath);near(next.expense,45);
 near(next.expenseReduction,10);
});
test('itemized overbudget and invalid factor stop without altering adopted data',()=>{
 const c=fixture(),raw=runRetirementPlan(c,{includeMonthlyDetails:true});
 c.expenseDetail.monthlyCategories[1].amount=100;
 assert.throws(()=>inspectMortalityExpenseBudget(c,raw.monthlyDetails),/管理予算|超え/);
 const ok=fixture(),p=runRetirementPlan(ok,{includeMonthlyDetails:true}),m=inspectMortalityExpenseBudget(ok,p.monthlyDetails);
 const factors=Object.fromEntries(m.items.map(i=>[i.id,1]));
 assert.throws(()=>applyMortalityExpenseMultipliers(p.monthlyDetails,m,{factors,unallocatedFactor:3.1}),/倍率/);
});
test('separate draft retains inputs but never eligibility confirmations or adopted config',()=>{
 class MemoryStore { m=new Map();getItem(k){return this.m.get(k)||null;}setItem(k,v){this.m.set(k,v);}removeItem(k){this.m.delete(k);} }
 const old=globalThis.localStorage;globalThis.localStorage=new MemoryStore();
 try{
   const c=fixture(),before=JSON.stringify(c);
   assert.equal(saveMortalityDraft(c,{deathMonth:'2060-01',survivorPension:'210',deceased:'primary',entitlement:'true'},{food:'0.6'}),true);
   const d=readMortalityDraft(c);
   assert.equal(d.values.deathMonth,'2060-01');assert.equal(d.values.entitlement,undefined);
   assert.equal(JSON.stringify(c),before);
   assert.equal(readMortalityDraft({...c,plan:{...c.plan,initialAsset:999}}),null);
   assert.equal(clearMortalityDraft(),true);assert.equal(readMortalityDraft(c),null);
 }finally{if(old===undefined)delete globalThis.localStorage;else globalThis.localStorage=old;}
});
