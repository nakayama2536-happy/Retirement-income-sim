import test from 'node:test';
import assert from 'node:assert/strict';
import {reconcileCashflow as reconcile,priceBaseForMonth as price} from './cashflow-reconciliation.mjs';
import {runRetirementPlan} from './calc.mjs';
import {migrateConfig} from './storage.mjs';
const WORK='work-v0.9.7',PUBLIC='public-v0.9';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function fixture(){
 const c=migrateConfig({people:{primary:{birthDate:'1980-08-27'},spouse:{birthDate:'1981-05-01'}},plan:{startAge:64,endAge:67,startDate:'2044-08-27',initialAsset:1234,initialAssetIncludesIdeco:false,afterTaxReturn:0,inflation:12},employment:{primary:{mainRetirement:{baseDate:'2045-08-27'},sideWork:{monthlyGross:0}},spouse:{sideWork:{monthlyGross:0}}},budgets:[{fromAge:65,toAge:90,annualBudget:120,travelReference:12}],unemployment:{baselineMode:'none'},events:[]});
 c.cashflow={periodOverrides:[]};c.expenseDetail={monthlyCategories:[{key:'housing',items:[{key:'rent',amount:5}]}],travelAnnualBase:12};
 return c;
}
const run=(c=fixture(),options={})=>reconcile(c,{sourceProfile:WORK,...options});
const funded=r=>r.months.find(m=>m.scope==='asset-funded');
const freeze=x=>{if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x;};
test('base/month conversion and factor are applied once',()=>{
 const m=funded(run());near(m.priceFactor,1.12);near(m.budget.actualExpense,11.2);near(m.detailTotal,6*1.12);near(m.gap,4*1.12);assert.equal(m.assessment,'within-budget');
});
test('calculation and input remain unchanged; repeated reads deterministic',()=>{
 const c=freeze(fixture()),before=structuredClone(c),r=run(c);assert.deepEqual(r.calculation,runRetirementPlan(c,{includeMonthlyDetails:true}));assert.deepEqual(c,before);assert.deepEqual(run(c),r);
});
test('parent override replaces children instead of double adding',()=>{
 const c=fixture();c.cashflow.periodOverrides=[{kind:'expense',key:'housing',amount:2,unit:'monthly',fromAge:65,toAge:90}];
 const m=funded(run(c));near(m.detailTotal,3*m.priceFactor);assert.ok(m.details[0].base.suppressedRules.length);
});
test('child annual override converts once',()=>{
 const c=fixture();c.cashflow.periodOverrides=[{kind:'expense',key:'rent',amount:24,unit:'annual',fromAge:65,toAge:90}];near(funded(run(c)).detailTotal,3*1.12);
});
test('uncomputed tax is not zero and cannot imply spare budget',()=>{
 const c=fixture();c.expenseDetail.monthlyCategories.push({key:'taxSocial',amount:2});const m=funded(run(c));assert.equal(m.detailTotal,null);assert.equal(m.gap,null);assert.equal(m.assessment,'unresolved');
});
test('known subtotal over budget is signalled even with unknown tax',()=>{
 const c=fixture();c.expenseDetail.monthlyCategories[0].items[0].amount=20;c.expenseDetail.monthlyCategories.push({key:'taxSocial',amount:null});const m=funded(run(c));assert.equal(m.assessment,'over-budget');assert.equal(m.gap,null);
});
test('missing travel remains missing; explicit zero is accepted',()=>{
 const c=fixture();delete c.expenseDetail.travelAnnualBase;assert.equal(funded(run(c)).detailTotal,null);c.expenseDetail.travelAnnualBase=0;near(funded(run(c)).detailTotal,5*1.12);
});
test('public and Work source differences require explicit selection',()=>{
 const c=fixture();c.cashflow.expenseCategories=[{key:'housing',items:[{key:'rent',periods:[{fromAge:64,toAge:90,amount:8}]}]}];c.cashflow.travel=[{fromAge:64,toAge:90,annualAmount:12}];
 assert.equal(funded(run(c,{sourceProfile:'unknown'})).detailTotal,null);near(funded(run(c,{sourceProfile:PUBLIC})).detailTotal,9*1.12);near(funded(run(c)).detailTotal,6*1.12);
});
test('public manual tax uses target nominal value without inflation',()=>{
 const c=fixture();c.cashflow.expenseCategories=[{key:'housing',items:[{key:'rent',periods:[{fromAge:64,toAge:90,amount:5}]}]},{key:'taxSocial',fallbackMonthly:2}];c.cashflow.travel=[{fromAge:64,toAge:90,annualAmount:12}];c.cashflow.taxSocialMode='manual';near(funded(run(c,{sourceProfile:PUBLIC})).detailTotal,6*1.12+2);
});
for(const basis of ['nominal-fixed','target-period-nominal'])test(`nominal basis ${basis} uses no price escalation`,()=>{assert.equal(price({status:'resolved',amount:120,unit:'annual',priceBasis:basis},2).amount,10);});
test('unsupported units, missing factor, nonfinite values fail closed',()=>{
 for(const base of [{status:'missing'}, {status:'resolved',amount:1,unit:'once',priceBasis:'nominal-fixed'},{status:'resolved',amount:Infinity,unit:'monthly',priceBasis:'nominal-fixed'},{status:'resolved',amount:1,unit:'monthly',priceBasis:'tax-method-dependent'},{status:'resolved',amount:1,unit:'monthly',priceBasis:'plan-start-base'}])assert.equal(price(base,null).amount,null);
});
test('salary family reference does not compare asset zero with living costs',()=>{
 const c=fixture();c.cashflow.salaryLife={mode:'net-transfer-v1',lastSalaryMonth:'2045-07',monthlyAddition:0,monthlyWithdrawal:0,postSalaryLabor:{mode:'none'},idecoFunding:{before:{source:'salary'},after:{source:'household'}}};
 const m=run(c).months[0];assert.equal(m.scope,'family-reference');assert.equal(m.budget.actualExpense,0);assert.equal(m.details[0].base.amount,5);assert.equal(m.priceFactor,null);assert.equal(m.detailTotal,null);assert.equal(m.assessment,'family-reference-only');
});
test('early salary termination uses explicit pre65 budget',()=>{
 const c=fixture();c.cashflow.salaryLife={mode:'net-transfer-v1',lastSalaryMonth:'2045-05',pre65MonthlyBudget:3,monthlyAddition:0,monthlyWithdrawal:0,postSalaryLabor:{mode:'none'},idecoFunding:{before:{source:'salary'},after:{source:'household'}}};
 const m=funded(run(c));assert.equal(m.month,'2045-06');assert.equal(m.budget.base.amount,36);near(m.budget.actualExpense,3*m.priceFactor);assert.equal(m.assessment,'over-budget');
});
test('source budget mismatch is explicit, not silently aligned',()=>{
 const c=fixture();c.cashflow.periodOverrides=[{kind:'budget',key:'budget',amount:240,unit:'annual',fromAge:65,toAge:90}];
 const m=funded(run(c,{sourceProfile:PUBLIC}));assert.equal(m.budget.check.status,'mismatch');assert.equal(m.gap,null);
});
test('legacy and candidate month counts remain distinct',()=>{
 const c=fixture();c.people.primary.birthDate='1980-01-31';c.plan.startDate='2044-01-31';c.employment.primary.mainRetirement.baseDate='2045-01-31';
 const a=run(c),b=run(c,{calculationOptions:{calendarMode:'anchored-months-v1'}});assert.equal(a.calendarMode,'legacy');assert.equal(b.calendarMode,'anchored-months-v1');assert.equal(a.periods[0].monthCount,13);assert.equal(b.periods[0].monthCount,12);assert.ok(b.months.every(m=>m.calendarMode===b.calendarMode));
});
test('partial restart keeps actual month count and F01 original factors',()=>{
 const c=fixture(),a=run(c),b=run(c,{calculationOptions:{startDate:'2046-11-27',initialAsset:900}});assert.equal(b.periods[0].monthCount,9);assert.equal(b.months[0].baseDate,'2044-08-27');assert.equal(b.months[0].priceFactor,a.months.find(m=>m.month==='2046-11').priceFactor);assert.ok(b.periods.every(p=>p.annualExpenseMatches));
});
test('extra expenses, transfers and reference income do not add to budget details',()=>{
 const c=fixture();c.events=[{date:'2046-09-01',type:'expense',amount:20,inflationAdjusted:false}];c.cashflow.manualIncomeItems=[{key:'memo',unit:'annual',periods:[{fromAge:64,toAge:90,amount:240}]}];
 const m=run(c).months.find(m=>m.month==='2046-09');near(m.detailTotal,6*m.priceFactor);assert.equal(m.actual.extraExpense,20);assert.ok(m.references.every(r=>r.includedInBudgetComparison===false));
});
test('malformed rows prevent false complete totals',()=>{
 const c=fixture();c.expenseDetail.monthlyCategories.push(null);const m=funded(run(c));assert.equal(m.detailTotal,null);assert.equal(m.gap,null);
});
test('result mutation does not alias inputs or later reads',()=>{
 const c=fixture(),a=run(c);a.months[12].details[0].base.amount=999;assert.equal(funded(run(c)).details[0].base.amount,5);assert.equal(c.expenseDetail.monthlyCategories[0].items[0].amount,5);
});
test('unknown child tax still retains known sibling excess',()=>{
 const c=fixture();c.expenseDetail.monthlyCategories[0].items=[{key:'rent',amount:20},{key:'taxSocial',amount:null}];const m=funded(run(c));assert.equal(m.detailTotal,null);assert.equal(m.assessment,'over-budget');near(m.knownSubtotal,21*1.12);
});
test('annual totals use actual funded months without adding family months',()=>{
 const r=run();for(const p of r.periods){assert.equal(p.assetFundedMonthCount+p.familyReferenceMonthCount,p.monthCount);assert.equal(p.annualExpenseMatches,true);if(!p.assetFundedMonthCount)assert.equal(p.detailTotal,null);}
});
test('absent expense categories do not mean living costs are zero',()=>{
 const c=fixture();c.expenseDetail.monthlyCategories=[];const m=funded(run(c));assert.equal(m.detailTotal,null);assert.equal(m.assessment,'unresolved');
});
