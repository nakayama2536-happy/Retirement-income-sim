import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateConfig} from './storage.mjs';
import {runRetirementPlan} from './calc.mjs';
import {buildAnnualCsvDataset} from './csv-export.mjs';
import {annualCsvRows} from './annual-csv.mjs';

// Synthetic conditions only. Old all-items detail CSV is not the same export
// schema as monthly-reconciled annual CSV. Match only authoritative engine data.
const fixture=()=>migrateConfig({
 people:{primary:{birthDate:'1980-08-27'},spouse:{birthDate:'1981-05-01'}},
 plan:{startAge:64,endAge:66,startDate:'2044-08-27',initialAsset:100,afterTaxReturn:0,inflation:0,initialAssetIncludesIdeco:false},
 employment:{primary:{mainRetirement:{baseDate:'2045-08-27'},sideWork:{monthlyGross:0,startDate:'2044-08-27'}},spouse:{sideWork:{monthlyGross:0}}},
 income:{pensions:{primary:{annualAtStart:0},spouse:{annualAtStart:0}}},
 unemployment:{baselineMode:'none'},
 budgets:[{fromAge:65,toAge:66,annualBudget:36}],
 cashflow:{salaryLife:{mode:'net-transfer-v1',lastSalaryMonth:'2045-07',monthlyAddition:0,monthlyWithdrawal:0,postSalaryLabor:{mode:'none'}}},
 events:[{date:'2045-10-01',type:'expense',amount:7,label:'架空の別枠費',fundingTreatment:'separate'}]
});
const close=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-5*Math.max(1,Math.abs(a),Math.abs(b));

test('旧詳細CSVと現行年齢期CSVの共通エンジン値は整合する',()=>{
 const c=fixture(),original=structuredClone(c),engine=runRetirementPlan(c,{includeMonthlyDetails:true});
 const old=buildAnnualCsvDataset(c,engine,{exportedAt:'2026-10-15T00:00:00Z'}).rows,now=annualCsvRows(c);
 assert.equal(old.length,now.length);
 const columns=[['startAsset','startAsset'],['investmentGain','investmentGain'],['engineLabor','labor'],
  ['engineTotalIncome','incomeTotal'],['engineExpense','managementExpense'],['extraExpense','extraExpense'],
  ['engineTotalOutflow','totalExpense'],['endAsset','endAsset']];
 old.forEach((row,index)=>{
  const cur=now[index];assert.equal(row.age,cur.age);
  for(const [oldKey,newKey] of columns)assert.ok(close(row[oldKey],cur[newKey]),`${row.age}歳 ${oldKey} vs ${newKey}: ${row[oldKey]} / ${cur[newKey]}`);
  assert.ok(close(row.startAsset+row.investmentGain+row.engineTotalIncome-row.engineTotalOutflow,row.endAsset));
  assert.equal(cur.identityStatus,'一致');
 });
 assert.deepEqual(c,original);
});

test('旧CSVの手動追加収入は詳細参考とエンジン収入を分けて保持する',()=>{
 const c=fixture();c.cashflow.manualIncomeItems=[{key:'fictional',label:'架空参考',unit:'annual',periods:[{fromAge:65,toAge:65,amount:12}]}];
 const old=buildAnnualCsvDataset(c,runRetirementPlan(c)).rows.find(r=>r.age===65);
 const cur=annualCsvRows(c).find(r=>r.age===65);
 assert.ok(close(old.engineTotalIncome,cur.incomeTotal));
 assert.ok(close(old.detailTotalIncome-old.engineTotalIncome,12));
 assert.ok(close(old.endAsset,cur.endAsset));
});

test('年齢期の収入内訳は構成要素であり再加算しない',()=>{
 const c=fixture(),old=buildAnnualCsvDataset(c,runRetirementPlan(c)).rows,now=annualCsvRows(c);
 old.forEach((r,index)=>{
  const cur=now[index];assert.ok(close(r.engineTotalIncome,cur.incomeTotal));
  assert.ok(close(cur.incomeTotal-cur.labor-cur.primaryPension-cur.spousePension-cur.idecoAnnuity-cur.unemployment,cur.otherExtraIncome+cur.idecoLumpReceipt+cur.retirementReceipt));
 });
});
