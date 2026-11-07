/** Read-only, synthetic full-engine regression for an adopted proposal.
 * Run exclusively in a temporary app checkout with the coverage guard patched.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {migrateConfig} from './storage.mjs';
import {runRetirementPlan} from './calc.mjs';
import {reconcileCashflow} from './cashflow-reconciliation.mjs';
import {inspectMortalityExpenseBudget} from './mortality-itemized.mjs';
import {buildExpenseUnificationAdoption,undoExpenseUnificationAdoption} from './lifeplan-expense-unification-adoption.mjs';
const enabled=process.env.LIFEPLAN_UNIFICATION_OVERLAY==='1';
function synthetic(){
 const fixture=JSON.parse(readFileSync(new URL('./tools/browser-test/mortality-synthetic.json',import.meta.url)));
 const c=migrateConfig(fixture.config);
 c.plan.endAge=99;c.budgets=[{fromAge:70,toAge:99,annualBudget:660}];
 c.expenseDetail={monthlyCategories:[]};
 c.cashflow={...c.cashflow,expenseCategories:[{key:'living',label:'生活費',items:[{key:'food',label:'食費',periods:[{fromAge:70,toAge:95,amount:12}]}]}],periodOverrides:[],detailSourceProfile:'public-v0.9'};
 delete c.cashflow.travel;delete c.cashflow.manualIncomeItems;
 return c;
}
const ageRow=(trace,age)=>trace.months.find(m=>m.age===age&&m.scope==='asset-funded');
const expenseLeaf=(row)=>row.details.flatMap(x=>x.children||[])[0];
test('adopted work profile preserves 95, retains 96 as missing, and preserves monthly + age-period assets',{skip:!enabled},()=>{
 const before=synthetic();const prior=runRetirementPlan(before,{includeMonthlyDetails:true});
 const legacy=reconcileCashflow(before,{sourceProfile:'public-v0.9'});
 const proposal=buildExpenseUnificationAdoption(before);
 assert.equal(proposal.status,'adoption-proposal-only',JSON.stringify(proposal.codes||[]));
 const next=proposal.config;assert.equal(next.cashflow.expenseCategories,undefined);
 const work=reconcileCashflow(next,{sourceProfile:'work-v0.9.7'});
 assert.equal(expenseLeaf(ageRow(legacy,95)).base.status,'resolved');
 assert.equal(expenseLeaf(ageRow(work,95)).base.status,'resolved');
 assert.equal(expenseLeaf(ageRow(work,95)).base.amount,expenseLeaf(ageRow(legacy,95)).base.amount);
 assert.equal(expenseLeaf(ageRow(legacy,96)).base.status,'missing');
 assert.equal(expenseLeaf(ageRow(work,96)).base.status,'missing');
 assert.equal(expenseLeaf(ageRow(work,96)).base.amount,null);
 const now=runRetirementPlan(next,{includeMonthlyDetails:true});
 assert.deepEqual(now.monthlyDetails.map(x=>[x.expense,x.endAsset]),prior.monthlyDetails.map(x=>[x.expense,x.endAsset]));
 assert.deepEqual(now.rows.map(x=>[x.age,x.expense]),prior.rows.map(x=>[x.age,x.expense]));
 const restored=undoExpenseUnificationAdoption(next);assert.equal(restored.status,'undo-proposal-only');assert.deepEqual(restored.config,before);
});
test('adopted expense references do not invent 96-year-old death-case reduction',{skip:!enabled},()=>{
 const proposed=buildExpenseUnificationAdoption(synthetic());assert.equal(proposed.status,'adoption-proposal-only');
 const next=proposed.config,months=runRetirementPlan(next,{includeMonthlyDetails:true}).monthlyDetails;
 const m=inspectMortalityExpenseBudget(next,months,{sourceProfile:'work-v0.9.7'}).months;
 const age95=months.find(x=>x.age===95),age96=months.find(x=>x.age===96);
 const x=m.find(x=>x.month===age95.month),y=m.find(x=>x.month===age96.month);
 assert.ok(x.known>0);assert.equal(y.known,0);assert.equal(y.unallocated,y.expense);
});