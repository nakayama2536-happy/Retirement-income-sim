import test from 'node:test';
import assert from 'node:assert/strict';
import {runRetirementPlan} from './calc.mjs';
import {migrateConfig} from './storage.mjs';
import {SalaryLifeValidationError} from './salary-life.mjs';

function fixture(){
 const c=migrateConfig({
  people:{primary:{birthDate:'1980-08-27'},spouse:{birthDate:'1981-05-01'}},
  plan:{startAge:64,endAge:65,startDate:'2044-09-27',initialAsset:100,initialAssetIncludesIdeco:false,afterTaxReturn:0,inflation:0,priceBaseMonth:'2044-08',
   openingBalance:{mode:'prior-month-close-v1',asOfMonth:'2044-08',startMonth:'2044-09',amount:100,confirmed:true}},
  employment:{primary:{mainRetirement:{baseDate:'2045-08-27'},sideWork:{monthlyGross:0}},spouse:{sideWork:{monthlyGross:0}}},
  income:{pensions:{primary:{annualAtStart:0},spouse:{annualAtStart:0}}},
  budgets:[{fromAge:65,toAge:95,annualBudget:36}],unemployment:{baselineMode:'none'},
  cashflow:{salaryLife:{mode:'net-transfer-v1',lastSalaryMonth:'2044-08',monthlyAddition:0,monthlyWithdrawal:0,pre65MonthlyBudget:3,postSalaryLabor:{mode:'none'}}},events:[]
 }); return c;
}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
function reject(c,code){assert.throws(()=>runRetirementPlan(c),e=>e instanceof SalaryLifeValidationError && e.issues.some(x=>x.code===`salary-life-${code}`),code);}
test('confirmed prior-month closing balance connects to next calculation month without duplication',()=>{
 const c=fixture(),copy=structuredClone(c),r=runRetirementPlan(c,{includeMonthlyDetails:true});
 assert.deepEqual(c,copy);assert.equal(r.monthlyDetails[0].month,'2044-09');assert.equal(r.monthlyDetails[0].startAsset,100);
 assert.equal(r.monthlyDetails.length,23);assert.equal(r.rows[0].age,64);assert.equal(r.rows[0].expense,33);assert.equal(r.rows[0].endAsset,67);
 near(r.finalAsset,31);assert.equal(r.monthlyDetails[0].baseDate,'2044-08-01');assert.equal(r.monthlyDetails[0].monthsFromBase,1);
});
test('start-month interest is computed from the confirmed opening balance',()=>{
 const c=fixture();c.plan.afterTaxReturn=12;
 const m=runRetirementPlan(c,{includeMonthlyDetails:true}).monthlyDetails[0];
 near(m.investmentGain,100*(Math.pow(1.12,1/12)-1));
 near(m.endAsset,100+m.investmentGain-3);
});
test('previous-month events and opening-period lump are not added again',()=>{
 const c=fixture();c.events=[{date:'2044-08-01',type:'income',amount:400,fundingTreatment:'separate'}];
 const r=runRetirementPlan(c);near(r.finalAsset,31);
});
test('price base and start month are separate with unchanged monthly price adjustment',()=>{
 const c=fixture();c.plan.inflation=12;
 const m=runRetirementPlan(c,{includeMonthlyDetails:true}).monthlyDetails[0];
 near(m.expense,3*Math.pow(1.12,1/12));assert.equal(m.month,'2044-09');
});
test('forecast restart retains original price base and initial opening balance metadata',()=>{
 const c=fixture();c.plan.inflation=3;c.plan.afterTaxReturn=2;
 const r=runRetirementPlan(c,{includeMonthlyDetails:true});const start=r.monthlyDetails[11];
 const p=runRetirementPlan(c,{startDate:start.date,initialAsset:start.startAsset,includeMonthlyDetails:true});
 near(p.finalAsset,r.finalAsset);assert.equal(p.monthlyDetails[0].baseDate,'2044-08-01');
});
test('explicit zero value is valid; missing zero is not supplied by default',()=>{
 const c=fixture();c.plan.initialAsset=0;c.plan.openingBalance.amount=0;
 near(runRetirementPlan(c).finalAsset,-69);
 c.plan.openingBalance.amount=null;reject(c,'opening-balance-amount');
});
for(const [label,field,value,code] of [
 ['unknown method','mode','other-v2','opening-balance-mode'],
 ['unknown as of','asOfMonth',null,'opening-balance-month'],
 ['bad previous month','asOfMonth','2044-07','opening-balance-month'],
 ['same month valuation','asOfMonth','2044-09','opening-balance-month'],
 ['bad start month','startMonth','2044-10','opening-balance-month'],
 ['invalid YYYY-MM','asOfMonth','2044-13','opening-balance-month'],
 ['wrong amount','amount',99,'opening-balance-amount'],
 ['numeric string','amount','100','opening-balance-amount'],
 ['missing confirmed','confirmed',undefined,'opening-balance-confirmation'],
 ['false confirmed','confirmed',false,'opening-balance-confirmation']
]) test(label,()=>{const c=fixture();c.plan.openingBalance[field]=value;reject(c,code);});
test('explicit null opening balance is not an absent optional field',()=>{const c=fixture();c.plan.openingBalance=null;reject(c,'opening-balance');});
test('changed start month invalidates earlier confirmation',()=>{const c=fixture();c.plan.startDate='2044-10-27';reject(c,'opening-balance-month');});
test('changed start age invalidates confirmed opening',()=>{const c=fixture();c.plan.startAge=65;reject(c,'opening-balance-start');});
test('shifted day outside monthly birthday anchor is stopped',()=>{const c=fixture();c.plan.startDate='2044-09-01';reject(c,'opening-balance-start');});
test('missing start date stops instead of manufacturing a date',()=>{const c=fixture();c.plan.startDate=null;reject(c,'plan-dates');});
test('old settings without confirmed opening retain birthday-only rule',()=>{
 const c=fixture();delete c.plan.openingBalance;reject(c,'start-anchor');
 c.plan.startDate='2044-08-27';c.cashflow.salaryLife.lastSalaryMonth='2044-07';
 assert.equal(runRetirementPlan(c).rows[0].age,64);
});
test('new opening balance is not accepted under unspecified salary-life calculation',()=>{
 const c=fixture();delete c.cashflow.salaryLife;reject(c,'opening-balance-mode');
});
test('opening data never changes the active calendar or income method automatically',()=>{
 const c=fixture(),r=runRetirementPlan(c);
 assert.equal(r.cashflowMode,'net-transfer-v1');assert.equal(c.plan.calendarMode,undefined);
});
test('start age below 64 remains rejected even with explicit balance',()=>{
 const c=fixture();c.people.primary.birthDate='1981-08-27';c.plan.startAge=63;
 reject(c,'before-64');
});
test('leap birthday uses calendar last-day anchor and retains 0 as explicit',()=>{
 const c=fixture();c.people.primary.birthDate='1980-02-29';c.plan.startAge=64;c.plan.startDate='2044-03-29';c.plan.openingBalance.asOfMonth='2044-02';c.plan.openingBalance.startMonth='2044-03';c.plan.priceBaseMonth='2044-02';c.cashflow.salaryLife.lastSalaryMonth='2044-02';
 assert.equal(runRetirementPlan(c,{includeMonthlyDetails:true}).monthlyDetails[0].month,'2044-03');
});
