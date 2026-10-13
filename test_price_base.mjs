// Step 5: execute in a local checkout after apply_step5.py --apply.
// All fixtures are fictional; the personal backup must NOT be copied here.
import test from 'node:test';
import assert from 'node:assert/strict';
import {runRetirementPlan,runForecastFromLatestActual} from './calc.mjs';
import {migrateConfig} from './storage.mjs';
const near=(a,b,msg='')=>assert.ok(Math.abs(a-b)<1e-8,`${msg}: ${a} !== ${b}`);
function fixture(){
  return migrateConfig({
    people:{primary:{birthDate:'1980-08-27'},spouse:{birthDate:'1981-05-01'}},
    plan:{startAge:64,endAge:67,startDate:'2044-08-27',initialAsset:1000,initialAssetIncludesIdeco:false,afterTaxReturn:0,inflation:12},
    employment:{primary:{mainRetirement:{baseDate:'2045-08-27'},sideWork:{monthlyGross:0}},spouse:{sideWork:{monthlyGross:0}}},
    income:{pensions:{primary:{annualAtStart:0},spouse:{annualAtStart:0}}},
    budgets:[{fromAge:65,toAge:95,annualBudget:120}],unemployment:{baselineMode:'none'},
    cashflow:{salaryLife:{mode:'net-transfer-v1',lastSalaryMonth:'2045-07',monthlyAddition:0,monthlyWithdrawal:0,postSalaryLabor:{mode:'none'}}},events:[]
  });
}
for(const inflation of [0,1,3,12])test(`first asset-funded month uses separately selected inflation base ${inflation}%`,()=>{
  const c=fixture();c.plan.inflation=inflation;c.plan.priceBaseMonth='2044-07';const before=structuredClone(c);
  const r=runRetirementPlan(c,{includeMonthlyDetails:true});const m=r.monthlyDetails.find(x=>x.month==='2045-08');
  const expected=10*Math.pow(1+inflation/100,13/12);near(m.expense,expected,'first funded expense');
  assert.equal(m.baseDate,'2044-07-01');assert.equal(m.monthsFromBase,13);assert.deepEqual(c,before);
});
test('old setting remains exactly unchanged when optional field is absent',()=>{
  const c=fixture(); const old=runRetirementPlan(c,{includeMonthlyDetails:true});
  c.plan.priceBaseMonth='2044-08';const modified=runRetirementPlan(c,{includeMonthlyDetails:true});
  assert.equal(old.finalAsset,modified.finalAsset);
  for(let i=0;i<old.rows.length;i++)assert.deepEqual(old.rows[i],modified.rows[i]);
  assert.equal(old.monthlyDetails[0].baseDate,'2044-08-27');assert.equal(modified.monthlyDetails[0].baseDate,'2044-08-01');
  assert.equal(old.monthlyDetails[0].monthsFromBase,modified.monthlyDetails[0].monthsFromBase);
});
test('inflation-adjusted expense vs nominal expense are distinct',()=>{
  const c=fixture(); c.plan.priceBaseMonth='2044-07';
  c.events=[{date:'2045-08-01',type:'expense',amount:10,inflationAdjusted:true,fundingTreatment:'separate'},
            {date:'2045-09-01',type:'expense',amount:10,inflationAdjusted:false,fundingTreatment:'separate'}];
  const r=runRetirementPlan(c,{includeMonthlyDetails:true});
  const aug=r.monthlyDetails.find(x=>x.month==='2045-08'),sep=r.monthlyDetails.find(x=>x.month==='2045-09');
  near(aug.scheduledExtraExpense,10*Math.pow(1.12,13/12));near(sep.scheduledExtraExpense,10);
});
for(const raw of ['',null,'2045-13','not-a-month',0])test(`explicit invalid price month blocked: ${raw}`,()=>{
  const c=fixture();c.plan.priceBaseMonth=raw;
  assert.throws(()=>runRetirementPlan(c),/物価基準月/);
});
test('restart maintains original price base with inflation',()=>{
  const c=fixture();c.plan.priceBaseMonth='2044-07';
  const full=runRetirementPlan(c,{includeMonthlyDetails:true}),j=full.monthlyDetails.findIndex(m=>m.month==='2046-08');
  const part=runRetirementPlan(c,{includeMonthlyDetails:true,startDate:full.monthlyDetails[j].date,initialAsset:full.monthlyDetails[j].startAsset});
  assert.equal(part.monthlyDetails[0].baseDate,'2044-07-01');near(part.finalAsset,full.finalAsset);
  assert.deepEqual(part.rows,full.rows.slice(2));
});
test('money balances untouched when price base changes at 0% inflation',()=>{
  const c=fixture();c.plan.inflation=0;const old=runRetirementPlan(c);c.plan.priceBaseMonth='2044-02';
  assert.deepEqual(runRetirementPlan(c).rows,old.rows);
});
// Additional synthetic boundaries from Rev.86 Step 5 requirements.
for(const inf of [0,1,3])test(`forecast price base remains stable at ${inf}% inflation`,()=>{
  const c=fixture();c.plan.inflation=inf;c.plan.priceBaseMonth='2044-07';
  const full=runRetirementPlan(c,{includeMonthlyDetails:true});
  const later=full.monthlyDetails.find(x=>x.month==='2046-08');
  const part=runRetirementPlan(c,{startDate:later.date,initialAsset:later.startAsset,includeMonthlyDetails:true});
  near(part.finalAsset,full.finalAsset);
  assert.equal(part.monthlyDetails[0].monthsFromBase,25);
  assert.deepEqual(part.rows,full.rows.filter(x=>x.age>=66));
});
test('a separate price baseline does not remove the salary-life age anchor restriction',()=>{
  const c=fixture();c.plan.startDate='2044-09-27';c.plan.priceBaseMonth='2044-08';
  assert.throws(()=>runRetirementPlan(c),e=>e?.issues?.some(x=>x.code==='salary-life-start-anchor'));
});
test('non-month zeros, bad separator and range are rejected',()=>{
  for(const input of ['2045-00','2045-1','2045/01',false]){
    const c=fixture();c.plan.priceBaseMonth=input;
    assert.throws(()=>runRetirementPlan(c),/物価基準月/);
  }
});
test('month price basis remains stable for 384 months and 32 age rows',()=>{
 const c=fixture();c.plan.endAge=95;c.plan.priceBaseMonth='2044-07';c.plan.inflation=1;
 const r=runRetirementPlan(c,{includeMonthlyDetails:true});
 assert.equal(r.monthlyDetails.length,384);
 assert.equal(r.rows.length,32);
 assert.ok(r.monthlyDetails.every(m=>m.baseDate==='2044-07-01'));
 assert.equal(r.monthlyDetails.at(-1).monthsFromBase,384);
});
