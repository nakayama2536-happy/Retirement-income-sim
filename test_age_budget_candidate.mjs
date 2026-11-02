import test from 'node:test';import assert from 'node:assert/strict';
import {migrateConfig} from './storage.mjs';
import {previewAgeBudgetCandidate} from './age-budget-candidate.mjs';
import {runRetirementPlan} from './calc.mjs';
const fixture=()=>migrateConfig({people:{primary:{birthDate:'1980-08-27'},spouse:{birthDate:'1981-05-01'}},plan:{startAge:79,endAge:87,startDate:'2059-08-27',initialAsset:5000,initialAssetIncludesIdeco:false,afterTaxReturn:0,inflation:0,priceBaseMonth:'2059-08'},employment:{primary:{mainRetirement:{baseDate:'2045-08-27'}}},income:{pensions:{primary:{startDate:'2045-08-01',annualAtStart:0},spouse:{startDate:'2046-05-01',annualAtStart:0}}},budgets:[{fromAge:65,toAge:120,annualBudget:44*12}],unemployment:{baselineMode:'none'},cashflow:{periodOverrides:[]},events:[]});
test('月次エンジンで80歳以降の参考予算を比較し本人設定を保持',()=>{
 const c=fixture(),before=structuredClone(c);
 const p=previewAgeBudgetCandidate(c,{throughAge:86});
 assert.equal(p.stage,'preview-only');assert.equal(p.adopted,false);assert.equal(p.saved,false);assert.deepEqual(c,before);
 assert.ok(p.months.some(m=>m.age===80&&m.changed&&Math.abs(m.expenseAfter-47)<1e-8));
 assert.ok(p.months.some(m=>m.age===85&&m.changed&&Math.abs(m.expenseAfter-44.1)<1e-8));
 assert.ok(p.months.filter(m=>m.age===79).every(m=>!m.changed&&m.expenseBefore===m.expenseAfter));
 assert.ok(Math.abs(p.finalAssetAfter-runRetirementPlan(p.candidate).finalAsset)<1e-8);
});
test('物価基準と既存の別種類の期間設定を維持',()=>{
 const c=fixture();c.plan.inflation=2;c.cashflow.periodOverrides=[{kind:'travel',key:'travel',fromAge:80,toAge:84,amount:12,unit:'annual'}];
 const p=previewAgeBudgetCandidate(c,{throughAge:86});
 assert.equal(p.candidate.plan.priceBaseMonth,c.plan.priceBaseMonth);
 assert.deepEqual(p.candidate.cashflow.periodOverrides.find(x=>x.kind==='travel'),c.cashflow.periodOverrides[0]);
 assert.ok(p.months.every(m=>Number.isFinite(m.expenseAfter)));
});
test('未対応の年齢境界や対象月なしは停止',()=>{
 assert.throws(()=>previewAgeBudgetCandidate(fixture(),{fromAge:100,throughAge:100}),/対象/);
 assert.throws(()=>previewAgeBudgetCandidate(fixture(),{fromAge:60}),/範囲/);
});

test('支出未計上月の変更対象フラグはfalseとして画面・CSVへ渡す',()=>{
 const c=fixture();
 c.employment.primary.mainRetirement.baseDate='2060-08-27';
 const p=previewAgeBudgetCandidate(c,{throughAge:86});
 assert.ok(p.months.some(m=>m.changed===false));
 assert.ok(p.months.every(m=>typeof m.changed==='boolean'));
});
