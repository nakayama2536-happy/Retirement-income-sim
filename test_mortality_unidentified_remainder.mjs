import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {runRetirementPlan} from './calc.mjs';
import {migrateConfig} from './storage.mjs';
import {inspectMortalityExpenseBudget,applyMortalityExpenseMultipliers} from './mortality-itemized.mjs';
function fixture(){
 const original=JSON.parse(fs.readFileSync(new URL('./tools/browser-test/mortality-synthetic.json',import.meta.url),'utf8')).config;
 const c=migrateConfig(structuredClone(original));
 c.plan.afterTaxReturn=0;c.plan.inflation=0;
 c.budgets=[{fromAge:65,toAge:95,annualBudget:660}];
 c.cashflow||={};c.cashflow.detailSourceProfile='work-v0.9.7';c.cashflow.periodOverrides=[];
 c.expenseDetail={monthlyCategories:[
   {key:'housing',label:'不動産',items:[{key:'rent',label:'住居',amount:15}]},
   {key:'food',label:'食費',amount:10},
   {key:'utilities',label:'光熱費',amount:5},
 ],travelAnnualBase:0};
 return c;
}
test('missing current expense identity remains in unallocated budget without changing adopted config',()=>{
 const c=fixture();
 c.expenseDetail.monthlyCategories[0].items.push({label:'識別番号なしの参考費目',amount:8});
 const before=structuredClone(c);
 const raw=runRetirementPlan(c,{includeMonthlyDetails:true});
 const model=inspectMortalityExpenseBudget(c,raw.monthlyDetails,{sourceProfile:'work-v0.9.7'});
 const month=model.months.find(m=>m.expense===55);
 assert.ok(month);
 assert.ok(model.unidentifiedItemCount>=1);
 assert.equal(model.items.some(i=>i.label==='識別番号なしの参考費目'),false);
 assert.ok(Math.abs(month.known-30)<1e-6);
 assert.ok(Math.abs(month.unallocated-25)<1e-6);
 const priced=applyMortalityExpenseMultipliers(raw.monthlyDetails,model,{factors:Object.fromEntries(model.items.map(i=>[i.id,1])),unallocatedFactor:0.8});
 assert.ok(priced.monthlyRows.some(m=>m.month===month.month&&Math.abs(m.itemizedExpensePreview-50)<1e-6));
 assert.deepEqual(c,before);
});
test('duplicate identified items remain blocked',()=>{
 const c=fixture();
 c.expenseDetail.monthlyCategories.push({key:'food',label:'別の食費',amount:5});
 const raw=runRetirementPlan(c,{includeMonthlyDetails:true});
 assert.throws(()=>inspectMortalityExpenseBudget(c,raw.monthlyDetails,{sourceProfile:'work-v0.9.7'}),/duplicate|競合|不整合/);
});
