/** Run ONLY inside temporary checkout of pinned v0.9.38 with coverage patch installed.
 * Read-only synthetic age boundary, budget, CSV source and death cost reference integration.
 * Never imports personal or persisted data. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {migrateConfig} from './storage.mjs';
import {runRetirementPlan} from './calc.mjs';
import {reconcileCashflow} from './cashflow-reconciliation.mjs';
import {inspectMortalityExpenseBudget} from './mortality-itemized.mjs';
import {prepareExpenseUnification} from './lifeplan-expense-unification-candidate.mjs';
function synthetic(){
 const s=JSON.parse(readFileSync(new URL('./tools/browser-test/mortality-synthetic.json',import.meta.url)));
 const c=migrateConfig(s.config);
 c.plan.endAge=99;
 c.budgets=[{fromAge:70,toAge:99,annualBudget:660}];
 c.expenseDetail={monthlyCategories:[]};
 c.cashflow={...c.cashflow,expenseCategories:[{key:'living',label:'生活費',items:[{key:'food',label:'食費',periods:[{fromAge:70,toAge:95,amount:12}]}]}],periodOverrides:[]};
 delete c.cashflow.travel;
 delete c.cashflow.manualIncomeItems;
 return c;
}
function rowAt(result,age){return result.months.find(m=>m.age===age&&m.scope==='asset-funded');}
function leafAt(row){return row.details.flatMap(d=>d.children||[]).find(d=>d.base?.sourceRefs?.some(r=>r.path?.includes('items/0')));}
test('real engine keeps age 95 expense and does not invent age 96 amount',()=>{
 const original=synthetic();
 const before=runRetirementPlan(original,{includeMonthlyDetails:true});
 const prepared=prepareExpenseUnification(original);
 assert.equal(prepared.status,'candidate-only',JSON.stringify(prepared.errors));
 const candidate=prepared.candidate;
 const oldTrace=reconcileCashflow(original,{sourceProfile:'public-v0.9'});
 const newTrace=reconcileCashflow(candidate,{sourceProfile:'work-v0.9.7'});
 const old95=leafAt(rowAt(oldTrace,95)),new95=leafAt(rowAt(newTrace,95));
 assert.equal(old95?.base?.status,'resolved');
 assert.equal(new95?.base?.status,'resolved');
 assert.equal(old95.base.amount,new95.base.amount);
 const old96=leafAt(rowAt(oldTrace,96)),new96=leafAt(rowAt(newTrace,96));
 assert.equal(old96?.base?.status,'missing');
 assert.equal(new96?.base?.status,'missing');
 assert.equal(new96?.base?.amount,null);
 assert.equal(new96?.base?.reason,'outside-original-coverage');
 const after=runRetirementPlan(candidate,{includeMonthlyDetails:true});
 assert.deepEqual(after.monthlyDetails.map(m=>m.expense),before.monthlyDetails.map(m=>m.expense));
 assert.deepEqual(after.monthlyDetails.map(m=>m.endAsset),before.monthlyDetails.map(m=>m.endAsset));
 assert.equal(candidate.expenseUnificationCandidate.adopted,false);
 assert.equal(original.expenseUnificationCandidate,undefined);
});
test('death-expense reference keeps unresolved item in remainder instead of inventing zero',()=>{
 const original=synthetic();
 const prepared=prepareExpenseUnification(original);assert.equal(prepared.status,'candidate-only');
 const candidate=prepared.candidate;
 const months=runRetirementPlan(candidate,{includeMonthlyDetails:true}).monthlyDetails;
 const comparison=inspectMortalityExpenseBudget(candidate,months,{sourceProfile:'work-v0.9.7'});
 const m95=comparison.months.find(m=>m.month===months.find(x=>x.age===95).month);
 const m96=comparison.months.find(m=>m.month===months.find(x=>x.age===96).month);
 assert.ok(m95.known>0);
 assert.equal(m96.known,0);
 assert.equal(m96.unallocated,m96.expense);
 // This is the existing comparison's limitation, not evidence that cost is zero.
});