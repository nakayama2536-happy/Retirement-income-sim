import {readFileSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {runRetirementPlan, projectIdeco, runForecastFromLatestActual, integrityChecks} from './calc.mjs';
import {migrateConfig} from './storage.mjs';
import {SalaryLifeValidationError} from './salary-life.mjs';
function fixture(){return migrateConfig({
 people:{primary:{birthDate:'1980-08-27'},spouse:{birthDate:'1981-05-01'}},
 plan:{startAge:64,endAge:69,startDate:'2044-09-27',initialAsset:100,afterTaxReturn:0,inflation:0,priceBaseMonth:'2044-08',openingBalance:{mode:'prior-month-close-v1',asOfMonth:'2044-08',startMonth:'2044-09',amount:100,confirmed:true},idecoAssetScope:'received-lump-only-v1'},
 ideco:{asOfDate:'2044-08-27',currentBalance:120,monthlyContribution:0,contributionEndDate:'2044-08-27',lumpDate:'2044-08-27',lumpPercent:50,annuityPercent:50,annuityYears:5,accumulationReturn:0,annuityReturn:0,annuityStartMonth:'2044-09'},
 employment:{primary:{mainRetirement:{baseDate:'2045-08-27'},sideWork:{monthlyGross:0}},spouse:{sideWork:{monthlyGross:0}}},
 income:{pensions:{primary:{annualAtStart:0},spouse:{annualAtStart:0}}},budgets:[{fromAge:65,toAge:95,annualBudget:0}],unemployment:{baselineMode:'none'},
 cashflow:{salaryLife:{mode:'net-transfer-v1',lastSalaryMonth:'2044-08',monthlyAddition:0,monthlyWithdrawal:0,pre65MonthlyBudget:0,postSalaryLabor:{mode:'none'}}},events:[]
});}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function reject(c,code){assert.throws(()=>runRetirementPlan(c),e=>e instanceof SalaryLifeValidationError && e.issues.some(i=>i.code===`salary-life-${code}`),code);}
test('received lump is already in opening balance; next month annuity only',()=>{
 const c=fixture(),before=structuredClone(c),r=runRetirementPlan(c,{includeMonthlyDetails:true});
 assert.deepEqual(c,before);assert.equal(r.monthlyDetails[0].month,'2044-09');near(r.monthlyDetails[0].idecoAnnuity,1);
 near(r.rows.reduce((n,row)=>n+row.idecoAnnuity,0),60);near(r.rows.reduce((n,row)=>n+row.extraIncome,0),0);
 near(r.finalAsset,160);assert.equal(r.monthlyDetails.filter(m=>m.idecoAnnuity>0).length,60);
 assert.equal(integrityChecks(c).filter(x=>x.code==='ideco-asset-scope').length,0);
});
test('first and last annuity months are exactly 60 monthly receipts',()=>{
 const ms=runRetirementPlan(fixture(),{includeMonthlyDetails:true}).monthlyDetails.filter(x=>x.idecoAnnuity>0);
 assert.equal(ms[0].month,'2044-09');assert.equal(ms.at(-1).month,'2049-08');assert.equal(ms.length,60);
});
test('delayed annuity start shifts schedule but does not augment principal or annuity payment',()=>{
 const c=fixture(),first=projectIdeco(c).annuityMonthly;c.ideco.annuityStartMonth='2045-09';
 const after=projectIdeco(c);near(after.annuityMonthly,first);near(after.annuityPrincipal,60);
 const ms=runRetirementPlan(c,{includeMonthlyDetails:true}).monthlyDetails.filter(x=>x.idecoAnnuity>0);
 assert.equal(ms[0].month,'2045-09');assert.equal(ms.length,59); // projection ends in 2050-08; 60th lies beyond the forecast window
});
test('restart uses original annuity schedule; no reset to month one',()=>{
 const c=fixture();c.plan.afterTaxReturn=2;c.plan.inflation=1;
 const full=runRetirementPlan(c,{includeMonthlyDetails:true});const m=full.monthlyDetails.find(x=>x.month==='2046-08');
 const part=runRetirementPlan(c,{includeMonthlyDetails:true,startDate:m.date,initialAsset:m.startAsset});
 near(part.finalAsset,full.finalAsset);
 const count=full.monthlyDetails.filter(x=>x.month<m.month&&x.idecoAnnuity>0).length;
 assert.equal(part.monthlyDetails.filter(x=>x.idecoAnnuity>0).length,60-count);
});
test('legacy boolean false keeps old original schedule when new fields absent',()=>{
 const c=fixture();delete c.plan.idecoAssetScope;c.plan.initialAssetIncludesIdeco=false;delete c.ideco.annuityStartMonth;
 const r=runRetirementPlan(c,{includeMonthlyDetails:true});
 assert.equal(r.monthlyDetails.filter(x=>x.idecoAnnuity>0).length,59);
});
test('new start date is permitted without separate annuity start when old rule applies',()=>{
 const c=fixture();delete c.plan.idecoAssetScope;c.plan.initialAssetIncludesIdeco=false;delete c.ideco.annuityStartMonth;
 assert.equal(runRetirementPlan(c).startAge,64);
});
test('standalone explicit annuity option is allowed under old salary-life scope',()=>{
 const c=fixture();delete c.plan.idecoAssetScope;c.plan.initialAssetIncludesIdeco=false;
 assert.equal(runRetirementPlan(c,{includeMonthlyDetails:true}).monthlyDetails.filter(x=>x.idecoAnnuity>0).length,60);
});
for (const val of [null,'','2044-07','2044-13','2044/09',false,0])test(`invalid annuity start ${String(val)} is blocked`,()=>{
 const c=fixture();c.ideco.annuityStartMonth=val;reject(c,'ideco-annuity-month');
});
test('annuity before contribution end is blocked',()=>{
 const c=fixture();c.ideco.contributionEndDate='2045-02-27';reject(c,'ideco-annuity-month');
});
test('scope label must be known',()=>{const c=fixture();c.plan.idecoAssetScope='unknown';reject(c,'ideco-scope');});
test('old boolean and new scope may not coexist even if boolean false',()=>{const c=fixture();c.plan.initialAssetIncludesIdeco=false;reject(c,'ideco-scope-duplicate');});
test('new scope needs explicit prior-month closing balance',()=>{const c=fixture();delete c.plan.openingBalance;reject(c,'ideco-scope-opening');});
test('new scope refuses lump receipt inside forecast months',()=>{const c=fixture();c.ideco.lumpDate='2044-09-27';reject(c,'ideco-scope-receipt');});
test('new scope refuses lump before contribution end',()=>{const c=fixture();c.ideco.contributionEndDate='2044-09-27';reject(c,'ideco-scope-receipt');});
test('new scope refuses missing lump date',()=>{const c=fixture();delete c.ideco.lumpDate;reject(c,'ideco-scope-receipt');});
test('new scope refuses missing iDeCo settings',()=>{const c=fixture();delete c.ideco;reject(c,'ideco-scope-receipt');});
test('new scope requires salary-life calculation mode',()=>{const c=fixture();delete c.cashflow.salaryLife;reject(c,'ideco-scope-mode');});
test('monthly cashflow has no extra lump or principal deposit',()=>{
 const c=fixture();const ms=runRetirementPlan(c,{includeMonthlyDetails:true}).monthlyDetails;
 assert.ok(ms.every(x=>x.idecoAnnuity===0||x.idecoAnnuity===1));assert.ok(ms.every(x=>x.extraIncome===0));
 assert.ok(ms.every(x=>(x.idecoLumpReceipt??0)===0));
});
test('postponed start does not inflate positive-rate annuity amounts',()=>{
 const c=fixture();c.ideco.annuityReturn=6;
 const before=projectIdeco(c);const a=runRetirementPlan(c,{includeMonthlyDetails:true}).monthlyDetails.find(x=>x.month==='2044-09');
 c.ideco.annuityStartMonth='2045-09';const delayed=projectIdeco(c),b=runRetirementPlan(c,{includeMonthlyDetails:true}).monthlyDetails.find(x=>x.month==='2045-09');
 near(before.annuityMonthly,delayed.annuityMonthly);near(a.idecoAnnuity,b.idecoAnnuity);near(before.annuityPrincipal,delayed.annuityPrincipal);
});
test('separate annuity month works with unchanged legacy accounting when salary-life mode is absent',()=>{
 const c=fixture();delete c.plan.idecoAssetScope;delete c.plan.openingBalance;delete c.cashflow.salaryLife;c.plan.initialAssetIncludesIdeco=false;
 const m=runRetirementPlan(c,{includeMonthlyDetails:true}).monthlyDetails;
 assert.equal(m.filter(x=>x.idecoAnnuity>0).length,60);
 assert.equal(m.filter(x=>x.month==='2044-09')[0].idecoAnnuity,1);
});

test('iDeCo参考試算の初期値は採用条件ではなく保存に反映しないと明記する',()=>{
 const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
 assert.match(html,/参考：iDeCoの税額・年金年額（採用条件とは別）/);
 assert.match(html,/初期表示の残高0万円・年金10年は例示用の入力値/);
 assert.match(html,/保存済みの計画、資産推移、CSVに反映されません/);
 assert.match(html,/id="idecoBalance" type="number" value="0"/);
 assert.match(html,/id="idecoYears" type="number" value="10"/);
});
