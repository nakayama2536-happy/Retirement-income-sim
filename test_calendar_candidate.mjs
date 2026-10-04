import test from 'node:test';
import assert from 'node:assert/strict';
import {runRetirementPlan} from './calc.mjs';
import {migrateConfig} from './storage.mjs';
const mode={calendarMode:'anchored-months-v1',includeMonthlyDetails:true};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function fixture(day='01-31',year=2044){
 const birth=`${year-64}-${day}`,start=`${year}-${day}`;
 return migrateConfig({people:{primary:{birthDate:birth},spouse:{birthDate:`${year-63}-05-01`}},plan:{startAge:64,endAge:67,startDate:start,initialAsset:100,initialAssetIncludesIdeco:false,afterTaxReturn:0,inflation:0},employment:{primary:{mainRetirement:{baseDate:`${year+1}-${day==='02-29'?'02-28':day}`},sideWork:{monthlyGross:0}},spouse:{sideWork:{monthlyGross:0}}},income:{pensions:{primary:{annualAtStart:0},spouse:{annualAtStart:0}}},budgets:[{fromAge:65,toAge:90,annualBudget:36}],unemployment:{baselineMode:'none'},events:[]});
}
function check(c){
 const before=structuredClone(c),r=runRetirementPlan(c,mode),months=r.monthlyDetails;
 assert.deepEqual(c,before);assert.equal(months.length,48);assert.equal(new Set(months.map(m=>m.month)).size,48);
 assert.deepEqual(r.rows.map(r=>r.age),[64,65,66,67]);
 for(const [i,row] of r.rows.entries()){
  const ms=months.filter(m=>m.annualRowIndex===i);assert.equal(ms.length,12);
  for(const key of ['expense','extraExpense','extraIncome','totalIncome','investmentGain'])near(ms.reduce((a,m)=>a+m[key],0),row[key]);
  near(ms.at(-1).endAsset,row.endAsset);
 }
 return r;
}
for(const day of ['01-29','01-30','01-31','02-29','03-31','04-30','08-27','12-31'])test(`candidate has 12 months per age period: ${day}`,()=>check(fixture(day)));
test('January anchor returns to 31 after February without changing input dates',()=>{
 const c=fixture(),r=check(c);assert.deepEqual(r.monthlyDetails.slice(0,4).map(m=>m.date),['2044-01-31','2044-02-29','2044-03-31','2044-04-30']);assert.equal(c.plan.startDate,'2044-01-31');
});
for(const day of ['01-31','02-29'])test(`old result retained by default; corrected case removes extra month: ${day}`,()=>{
 const c=fixture(day),old=runRetirementPlan(c,{includeMonthlyDetails:true}),r=check(c);
 assert.equal(old.monthlyDetails.length,49);assert.equal(old.monthlyDetails.filter(m=>m.annualRowIndex===0).length,13);
 assert.equal(r.finalAsset-old.finalAsset,3);assert.equal(c.cashflow.salaryLife,undefined);
});
test('ordinary date stays identical except explicit calendar metadata',()=>{
 const c=fixture('08-27');c.plan.inflation=3;c.plan.afterTaxReturn=2;
 const {calendarMode,...r}=runRetirementPlan(c,mode);assert.equal(calendarMode,'anchored-months-v1');assert.deepEqual(r,runRetirementPlan(c,{includeMonthlyDetails:true}));
});
for(const day of ['01-31','02-29'])test(`F-01 recurrence and partial restart are consistent: ${day}`,()=>{
 const c=fixture(day);c.plan.inflation=3;c.plan.afterTaxReturn=2;const full=check(c),start=full.monthlyDetails[24];
 const r=runRetirementPlan(c,{...mode,startDate:start.date,initialAsset:start.startAsset});
 assert.deepEqual(r.rows,full.rows.slice(2));assert.equal(r.finalAsset,full.finalAsset);assert.equal(r.monthlyDetails[0].baseDate,c.plan.startDate);
 const partial=full.monthlyDetails[17],p=runRetirementPlan(c,{...mode,startDate:partial.date,initialAsset:partial.startAsset});
 assert.equal(p.monthlyDetails.filter(m=>m.annualRowIndex===0).length,7);assert.equal(p.finalAsset,full.finalAsset);
});
test('off-anchor restart is rejected rather than moved silently',()=>{
 const c=fixture();assert.throws(()=>runRetirementPlan(c,{...mode,startDate:'2045-03-28'}),/再開日/);
 for(const startDate of ['2043-12-31','2048-01-31','bad'])assert.throws(()=>runRetirementPlan(c,{...mode,startDate}));
});
test('invalid calendar mode does not silently use another calculation',()=>{
 for(const calendarMode of ['auto','',null,true])assert.throws(()=>runRetirementPlan(fixture(),{calendarMode}),/未対応/);
});
test('leap age boundary also controls age-based income overrides',()=>{
 const c=fixture('02-29');c.cashflow.periodOverrides=[{kind:'income',key:'synthetic',fromAge:65,toAge:65,unit:'monthly',amount:1}];
 const r=check(c),m=r.monthlyDetails.find(m=>m.date==='2045-02-28');assert.equal(m.age,65);assert.equal(m.extraIncome,1);assert.equal(r.rows[1].extraIncome,12);
});
test('new salary funding mode is not replaced by the calendar option',()=>{
 const c=fixture();c.cashflow.salaryLife={mode:'net-transfer-v1',lastSalaryMonth:'2044-12',monthlyAddition:0,monthlyWithdrawal:0,postSalaryLabor:{mode:'none'}};
 const {calendarMode,...r}=runRetirementPlan(c,mode);assert.deepEqual(r,runRetirementPlan(c,{includeMonthlyDetails:true}));assert.equal(c.cashflow.salaryLife.mode,'net-transfer-v1');
});
test('century non-leap boundary and all valid monthly anchors keep complete age periods',()=>{
 let checked=0;
 for(const year of [2044,2096])for(let month=1;month<=12;month++)for(const day of [1,27,28,29,30,31]){
  if(day>new Date(Date.UTC(year,month,0)).getUTCDate())continue;
  const mmdd=`${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;check(fixture(mmdd,year));checked++;
 }
 assert.equal(checked,132);
});
