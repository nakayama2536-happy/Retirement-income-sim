import test from 'node:test';
import assert from 'node:assert/strict';
import {runRetirementPlan} from './calc.mjs';
import {migrateConfig} from './storage.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const sums=['investmentGain','labor','pension','primaryPension','spousePension','idecoAnnuity','unemployment','extraIncome','totalIncome','expense','extraExpense','householdAddition','householdWithdrawal','idecoContributionFromAsset'];
function fixture(mode='legacy',inflation=0){
  const c=migrateConfig({people:{primary:{birthDate:'1980-08-27'},spouse:{birthDate:'1981-05-01'}},plan:{startAge:64,endAge:72,startDate:'2044-08-27',initialAsset:1234,initialAssetIncludesIdeco:false,afterTaxReturn:2,inflation},employment:{primary:{mainRetirement:{baseDate:'2045-08-27'},sideWork:{monthlyGross:0}},spouse:{sideWork:{monthlyGross:0}}},income:{pensions:{primary:{startDate:'2050-08-27',annualAtStart:120},spouse:{startDate:'2051-05-01',annualAtStart:60}}},ideco:{asOfDate:'2044-08-27',currentBalance:200,monthlyContribution:1,contributionEndDate:'2045-08-27',lumpDate:'2045-08-27',accumulationReturn:2,lumpPercent:50,annuityPercent:50,annuityYears:5,annuityReturn:1},budgets:[{fromAge:65,toAge:69,annualBudget:120},{fromAge:70,toAge:80,annualBudget:100}],unemployment:{baselineMode:'none'},events:[{date:'2046-09-01',type:'income',amount:40,fundingTreatment:'separate'},{date:'2047-01-01',type:'expense',amount:20,inflationAdjusted:true,fundingTreatment:'separate'},{date:'2047-02-01',type:'expense',amount:10,inflationAdjusted:false,fundingTreatment:'separate'}]});
  if(mode==='new')c.cashflow.salaryLife={mode:'net-transfer-v1',lastSalaryMonth:'2045-07',monthlyAddition:0,monthlyWithdrawal:0,postSalaryLabor:{mode:'none'},idecoFunding:{before:{source:'salary'},after:{source:'household'}}};
  return c;
}
function check(c,options={}){
  const before=structuredClone(c),plain=runRetirementPlan(c,options),r=runRetirementPlan(c,{...options,includeMonthlyDetails:true});
  const {monthlyDetails,...rest}=r;assert.deepEqual(rest,plain);assert.deepEqual(c,before);
  assert.ok(monthlyDetails.length);
  for(const [i,a] of r.rows.entries()){
    const months=monthlyDetails.filter(m=>m.annualRowIndex===i);assert.ok(months.length);
    near(months[0].startAsset,a.startAsset);near(months.at(-1).endAsset,a.endAsset);
    for(const key of sums)if(Object.hasOwn(a,key))near(months.reduce((n,m)=>n+m[key],0),a[key]);
    assert.deepEqual(months.flatMap(m=>m.events),a.events);
    assert.ok(months.every(m=>m.annualAge===a.age));
  }
  for(const [i,m] of monthlyDetails.entries()){
    near(m.endAsset,m.startAsset+m.investmentGain+m.totalIncome-m.expense-m.extraExpense);
    near(m.totalIncome,m.labor+m.pension+m.idecoAnnuity+m.unemployment+m.extraIncome);
    near(m.pension,m.primaryPension+m.spousePension);
    near(m.extraExpense,m.scheduledExtraExpense+m.householdWithdrawal+(m.idecoFunding?.separateExpense??0));
    if(m.budget)near(m.expense,m.budget.baseAnnualAmount*m.budget.priceFactor/12);else assert.equal(m.expense,0);
    if(i)near(m.startAsset,monthlyDetails[i-1].endAsset);
  }
  near(monthlyDetails.at(-1).endAsset,r.finalAsset);return r;
}
for(const mode of ['legacy','new'])for(const inflation of [0,1,12])test(`monthly/annual and unchanged result: ${mode}, inflation ${inflation}`,()=>check(fixture(mode,inflation)));
test('output is opt-in with literal true; default shape is unchanged',()=>{
  for(const flag of [undefined,false,'true',1])assert.equal(Object.hasOwn(runRetirementPlan(fixture(),{includeMonthlyDetails:flag}),'monthlyDetails'),false);
});
test('salary switch records zero asset living expense before the switch',()=>{
  const r=check(fixture('new')),a=r.monthlyDetails.find(m=>m.month==='2045-07'),b=r.monthlyDetails.find(m=>m.month==='2045-08');
  assert.equal(a.phase,'salary');assert.equal(a.expense,0);assert.equal(a.idecoFunding.source,'salary');assert.equal(a.idecoContributionFromAsset,0);
  assert.equal(b.phase,'asset-funded');assert.equal(b.expense,10);assert.equal(b.budget.baseAnnualAmount,120);
});
test('early switch uses only the explicit pre65 budget before age 65',()=>{
  const c=fixture('new');Object.assign(c.cashflow.salaryLife,{lastSalaryMonth:'2045-05',pre65MonthlyBudget:3});
  const r=check(c),m=r.monthlyDetails.find(m=>m.month==='2045-06');assert.equal(m.expense,3);assert.equal(m.budget.source,'salaryLife.pre65MonthlyBudget');
  assert.equal(r.monthlyDetails.find(m=>m.month==='2045-08').expense,10);
});
for(const accounting of ['separate','withdrawal'])test(`iDeCo asset funding ${accounting} is an informational subcomponent`,()=>{
  const c=fixture('new');c.cashflow.salaryLife.monthlyAddition=2;c.cashflow.salaryLife.monthlyWithdrawal=1;
  c.cashflow.salaryLife.idecoFunding.before={source:'plan_asset',accounting};
  const m=check(c).monthlyDetails[0];assert.equal(m.householdAddition,2);assert.equal(m.householdWithdrawal,1);assert.equal(m.idecoContributionFromAsset,1);
  assert.equal(m.extraExpense,accounting==='separate'?2:1);
});
test('iDeCo budget inclusion after early switch does not add another expense',()=>{
  const c=fixture('new');Object.assign(c.cashflow.salaryLife,{lastSalaryMonth:'2045-05',pre65MonthlyBudget:3});c.cashflow.salaryLife.idecoFunding.after={source:'plan_asset',accounting:'budget'};
  const m=check(c).monthlyDetails.find(m=>m.month==='2045-06');assert.equal(m.expense,3);assert.equal(m.extraExpense,0);assert.equal(m.idecoContributionFromAsset,1);
});
for(const mode of ['legacy','new'])test(`F-01 forecast retains original price basis: ${mode}`,()=>{
  const c=fixture(mode,3),base=check(c),row=base.rows.find(r=>r.age===68);
  const r=check(c,{startDate:'2049-08-27',initialAsset:row.endAsset});
  assert.deepEqual(r.rows,base.rows.filter(r=>r.age>68));assert.equal(r.monthlyDetails[0].baseDate,'2044-08-27');assert.equal(r.monthlyDetails[0].monthsFromBase,60);
  const expected=base.monthlyDetails.filter(m=>m.month>='2049-08');
  for(let i=0;i<expected.length;i++){assert.equal(r.monthlyDetails[i].expense,expected[i].expense);assert.equal(r.monthlyDetails[i].endAsset,expected[i].endAsset);}
});
for(const mode of ['legacy','new'])test(`partial age-period restart keeps only executed months: ${mode}`,()=>{
  const c=fixture(mode,1),r=check(c,{startDate:'2048-11-27',initialAsset:900});
  assert.equal(r.monthlyDetails[0].month,'2048-11');assert.equal(r.monthlyDetails.filter(m=>m.annualRowIndex===0).length,9);
});
for(const mode of ['legacy','new'])for(const day of ['01-31','02-29'])test(`month-end/leap source behavior is retained: ${mode}, ${day}`,()=>{
  const c=fixture(mode,1);c.people.primary.birthDate=`1980-${day}`;c.plan.startDate=`2044-${day}`;c.plan.endAge=66;
  c.employment.primary.mainRetirement.baseDate=day==='01-31'?'2045-01-31':'2045-02-28';
  delete c.ideco;c.events=[];
  if(mode==='new')c.cashflow.salaryLife.lastSalaryMonth=day==='01-31'?'2044-12':'2045-01';
  check(c);
});
test('age period is explicit and distinct from calendar year',()=>{
  const r=check(fixture());const rows=r.monthlyDetails.filter(m=>m.annualRowIndex===0);
  assert.deepEqual([...new Set(rows.map(m=>m.month.slice(0,4)))],['2044','2045']);assert.equal(rows.length,12);
});
test('events and output do not alias annual records or input',()=>{
  const c=fixture(),r=check(c),m=r.monthlyDetails.find(m=>m.events.length);const before=structuredClone(r.rows);
  m.events[0].label='changed';assert.deepEqual(r.rows,before);assert.notEqual(c.events[0].label,'changed');
});
test('legacy does not fabricate iDeCo contribution accounting',()=>{
  const r=check(fixture());assert.ok(r.monthlyDetails.every(m=>m.idecoFunding===null&&m.idecoContributionFromAsset===null));
});
