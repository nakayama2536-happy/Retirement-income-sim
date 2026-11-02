import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateConfig} from './storage.mjs';
import {previewAgeBudgetCandidate} from './age-budget-candidate.mjs';
import {ageBudgetPreviewRows,ageBudgetPreviewCsv} from './age-budget-preview-export.mjs';

const fixture=()=>migrateConfig({
  people:{primary:{birthDate:'1980-08-27'},spouse:{birthDate:'1981-05-01'}},
  plan:{startAge:84,endAge:87,startDate:'2064-08-27',initialAsset:5000,
    initialAssetIncludesIdeco:false,afterTaxReturn:0,inflation:0,priceBaseMonth:'2064-08'},
  employment:{primary:{mainRetirement:{baseDate:'2045-08-27'}}},
  income:{pensions:{primary:{startDate:'2045-08-01',annualAtStart:0},spouse:{startDate:'2046-05-01',annualAtStart:0}}},
  budgets:[{fromAge:65,toAge:120,annualBudget:600}],
  unemployment:{baselineMode:'none'},cashflow:{periodOverrides:[]},events:[]
});

test('85歳からの参考支出減額は予算から減算され、資産を増やす（未採用）',()=>{
 const c=fixture(),original=structuredClone(c);
 const p=previewAgeBudgetCandidate(c,{fromAge:85,throughAge:86});
 const changed=p.months.filter(m=>m.changed);
 assert.equal(changed.length,24);
 for(const m of changed){
   assert.ok(Math.abs(m.expenseBefore-50)<1e-8);
   assert.ok(Math.abs(m.expenseAfter-44.1)<1e-8);
   assert.ok(Math.abs(m.expenseDifference-(-5.9))<1e-8);
   assert.ok(m.endAssetAfter>m.endAssetBefore);
 }
 assert.ok(Math.abs(p.finalAssetDifference-141.6)<1e-6);
 assert.equal(p.adopted,false);
 assert.equal(p.saved,false);
 assert.deepEqual(c,original);
 assert.equal(c.budgets[0].annualBudget,600);
 const rows=ageBudgetPreviewRows(p).filter(row=>row.changed==='対象');
 assert.equal(rows.length,24);
 assert.ok(rows.every(r=>r.expenseDifference<0&&r.endAssetAfter>r.endAssetBefore));
 const csv=ageBudgetPreviewCsv(p);
 assert.ok(csv.startsWith('\uFEFF'));
 assert.ok(csv.includes('支出差額_万円'));
 assert.ok(csv.includes('-5.9'));
});

test('参考比較対象外の予算を変えず、月次評価条件を保持',()=>{
 const c=fixture();
 const p=previewAgeBudgetCandidate(c,{fromAge:85,throughAge:85});
 assert.ok(p.months.filter(m=>m.age!==85).every(m=>!m.changed&&m.expenseDifference===0));
 assert.equal(p.candidate.plan.priceBaseMonth,c.plan.priceBaseMonth);
 assert.equal(p.candidate.plan.afterTaxReturn,c.plan.afterTaxReturn);
 assert.equal(p.candidate.plan.inflation,c.plan.inflation);
});
