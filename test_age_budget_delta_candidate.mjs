import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateConfig} from './storage.mjs';
import {previewAgeBudgetDelta} from './age-budget-delta-candidate.mjs';
const fixture=(monthly=50,inflation=0)=>migrateConfig({
 people:{primary:{birthDate:'1980-08-27'},spouse:{birthDate:'1981-05-01'}},
 plan:{startAge:79,endAge:87,startDate:'2059-08-27',initialAsset:5000,initialAssetIncludesIdeco:false,afterTaxReturn:0,inflation,priceBaseMonth:'2059-08'},
 employment:{primary:{mainRetirement:{baseDate:'2045-08-27'}}},
 income:{pensions:{primary:{startDate:'2045-08-01',annualAtStart:0},spouse:{startDate:'2046-05-01',annualAtStart:0}}},
 budgets:[{fromAge:65,toAge:120,annualBudget:monthly*12}],
 unemployment:{baselineMode:'none'},cashflow:{periodOverrides:[]},events:[]
});
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
for(const budget of [44,50,55]){
 test('age threshold deltas respect original monthly budget '+budget,()=>{
  const c=fixture(budget),snapshot=structuredClone(c);
  const p=previewAgeBudgetDelta(c,{throughAge:86});
  for(const row of p.months){
   if(row.age===79){assert.equal(row.changed,false);close(row.expenseAfter,budget);}
   if(row.age===80||row.age===84){close(row.expenseAfter,budget+3);close(row.expenseDifference,3);}
   if(row.age===85||row.age===86){close(row.expenseAfter,budget+0.1);close(row.expenseDifference,0.1);}
  }
  assert.equal(p.adopted,false);assert.equal(p.saved,false);assert.deepEqual(c,snapshot);
 });
}
test('two-percent inflation applies original price factor once',()=>{
 const c=fixture(50,2),p=previewAgeBudgetDelta(c,{throughAge:86});
 const row=p.months.find(x=>x.age===85&&x.changed);
 assert.ok(row);assert.ok(row.expenseBefore>50);
 close(row.expenseAfter-row.expenseBefore,0.1*(row.expenseBefore/50));
 assert.equal(p.candidate.plan.priceBaseMonth,c.plan.priceBaseMonth);
});
test('existing non-budget period overrides are retained',()=>{
 const c=fixture(50);
 c.cashflow.periodOverrides=[{kind:'travel',key:'travel',fromAge:80,toAge:84,amount:12,unit:'annual'}];
 const p=previewAgeBudgetDelta(c,{throughAge:86});
 assert.deepEqual(p.candidate.cashflow.periodOverrides.find(x=>x.kind==='travel'),c.cashflow.periodOverrides[0]);
});
test('negative adjusted budget refuses rather than clipping',()=>{
 const c=fixture(2);
 assert.throws(()=>previewAgeBudgetDelta(c,{fromAge:85,throughAge:86,referenceOptions:{medicalIncreaseMonthly:0,transportMonthly:0,carMonthly:4.9}}),/負/);
});
test('explicit zero is distinct from missing budget',()=>{
 const c=fixture(0);
 const p=previewAgeBudgetDelta(c,{fromAge:80,throughAge:84});
 assert.ok(p.months.some(m=>m.changed&&m.expenseBefore===0&&m.expenseAfter===3));
});
test('preview stops if no months in selected age range',()=>assert.throws(()=>previewAgeBudgetDelta(fixture(),{fromAge:100,throughAge:100}),/対象/));
