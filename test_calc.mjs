import assert from 'node:assert/strict';
import {
  runRetirementPlan, runForecastFromLatestActual, retirementIncomeDeduction,
  pensionAdjustmentFactor, nisaCapacity, expenseDetailSummary, evaluateReviewTriggers,
  factorDecomposition, certaintyItems, integrityChecks, ANNUAL_REVIEW_ITEMS,
  projectIdeco, idecoOverlapReference, retirementIdecoTaxSummary, unemploymentComparison, unemploymentDailyBenefit2026, retirementTaxEstimate, fukuyamaNhiPremium2026Details, lateElderlyMedicalPremium2026Details, estimateSimpleIncomeTaxes
} from './calc.mjs';

const synthetic = {
  meta:{schemaVersion:'0.7',label:'synthetic'},
  people:{primary:{birthDate:'1980-01-01'},spouse:{birthDate:'1981-01-01'}},
  plan:{startAge:64,endAge:66,startDate:'2044-01-01',initialAsset:1000,afterTaxReturn:0,inflation:0},
  employment:{
    primary:{mainRetirement:{baseDate:'2045-01-01'},sideWork:{monthlyGross:20/12,startDate:'2045-01-01',endDate:'2046-01-01'}},
    spouse:{sideWork:{monthlyGross:0,startDate:'2045-01-01',endDate:'2046-01-01'}}
  },
  income:{pensions:{primary:{startDate:'2046-01-01',annualAtStart:30,certainty:'assumption'},spouse:{annualAtStart:0,certainty:'unknown'}}},
  budgets:[{fromAge:65,toAge:66,annualBudget:100}],
  events:[
    {date:'2046-01-01',type:'income',amount:50,inflationAdjusted:false,label:'income'},
    {date:'2046-01-01',type:'expense',amount:10,inflationAdjusted:false,label:'expense'}
  ],
  reserve:{total:50,minimumSafeAsset:30,warningStrongBelow:25},
  management:{thresholds:{66:800},reserveUsedFinalThreshold:500},
  actuals:{}, retirement:{amount:200,serviceYears:5},
  expenseDetail:{monthlyCategories:[{label:'A',amount:5},{label:'B',amount:3}],travelAnnualBase:4,annualBudgetReference:100},
  certainty:{initialAsset:'plan',returnRate:'scenario',inflation:'scenario',laborIncome:'plan',pension:'assumption',dc:'assumption',budgets:'plan',retirement:'company_estimate'},
  unemployment:{baselineMode:'none',preRetirementAnnualSalary:720,highAgeDays:50,pre65GeneralDays:150,pre65SpecialDays:240,dailyBenefitCap60to64Yen:7830}
};

const r=runRetirementPlan(synthetic);
assert.equal(r.rows.find(x=>x.age===64).endAsset,1000);
assert.ok(Math.abs(r.rows.find(x=>x.age===65).endAsset-920)<1e-9);
assert.ok(Math.abs(r.finalAsset-890)<1e-9);
assert.equal(r.status,'正常');
assert.equal(retirementIncomeDeduction(25),1150);
assert.equal(pensionAdjustmentFactor(70,1980),1.42);
assert.equal(nisaCapacity({tsumitateUsed:20,growthUsed:40,lifetimeBookUsed:500}).annualRemaining,300);
assert.equal(retirementTaxEstimate(200,retirementIncomeDeduction(5)).totalTax,0);

const withActual=structuredClone(synthetic); withActual.actuals={65:{endAsset:900}};
const f=runForecastFromLatestActual(withActual);
assert.equal(f.actual.age,65);
assert.ok(Math.abs(f.projection.finalAsset-870)<1e-9);

const e=expenseDetailSummary(synthetic); assert.equal(e.monthlyTotal,8); assert.equal(e.combined,100); assert.equal(e.difference,0);
const triggerCfg=structuredClone(synthetic); triggerCfg.plan.inflation=2; triggerCfg.actuals={65:{endAsset:900,expense:120,returnRate:1.5,reserveBalance:40},66:{endAsset:700,expense:120,returnRate:1.8,reserveBalance:20,safeAssetBalance:20}};
const t=evaluateReviewTriggers(triggerCfg,runRetirementPlan(triggerCfg));
assert.ok(t.some(x=>x.code==='inflation'));
assert.ok(t.some(x=>x.code==='asset-66'));
assert.ok(t.some(x=>x.code==='return-65-66'));
assert.ok(t.some(x=>x.code==='reserve-strong-66'));
assert.ok(t.some(x=>x.code==='safe-asset-66'));

const current=structuredClone(synthetic);
current.plan.initialAsset=1100;
current.plan.afterTaxReturn=2;
current.employment.primary.sideWork.monthlyGross=30/12;
current.income.pensions.primary.annualAtStart=35;
current.budgets=[{fromAge:65,toAge:66,annualBudget:105}];
current.events=[{date:'2046-01-01',type:'income',amount:70,inflationAdjusted:false},{date:'2046-01-01',type:'expense',amount:10,inflationAdjusted:false}];
const d=factorDecomposition(synthetic,current);
const direct=runRetirementPlan(current).finalAsset-runRetirementPlan(synthetic).finalAsset;
assert.ok(Math.abs(d.totalDifference-direct)<1e-7);
assert.ok(Math.abs(d.impacts.reduce((sum,x)=>sum+x.impact,0)-direct)<1e-7);
assert.equal(d.impacts.length,6);

const ci=certaintyItems(synthetic);
assert.equal(ci.find(x=>x.key==='pension').labelText,'仮定');
assert.equal(ci.find(x=>x.key==='retirement').labelText,'会社見込');
const cleanIssues=integrityChecks(synthetic);
assert.equal(cleanIssues.filter(x=>x.level==='error').length,0);
const broken=structuredClone(synthetic); broken.budgets=[{fromAge:65,toAge:65,annualBudget:100}]; broken.reserve={total:50,minimumSafeAsset:60,breakdown:{a:20,b:20}};
const brokenIssues=integrityChecks(broken);
assert.ok(brokenIssues.some(x=>x.code==='budget-missing-66'));
assert.ok(brokenIssues.some(x=>x.code==='reserve-sum'));
assert.ok(brokenIssues.some(x=>x.code==='safe-over-reserve'));
assert.equal(ANNUAL_REVIEW_ITEMS.length,16);

const idecoCfg={
  ideco:{asOfDate:'2026-01-01',currentBalance:100,monthlyContribution:1,contributionEndDate:'2027-01-01',accumulationReturn:0,optimisticReturn:0,lumpPercent:50,annuityPercent:50,annuityYears:5,annuityReturn:0}
};
const ip=projectIdeco(idecoCfg); assert.equal(ip.months,12); assert.equal(ip.balance,112); assert.equal(ip.lumpGross,56); assert.ok(Math.abs(ip.annuityMonthly-56/60)<1e-9);
const uc=unemploymentComparison(synthetic); assert.equal(uc.at65.days,50); assert.equal(uc.pre65General.days,150);
assert.ok(Math.abs(uc.dailyPre65Yen-7830)<1e-6); assert.ok(Math.abs(uc.dailyAt65Yen-7450)<1e-6);
assert.ok(Math.abs(uc.pre65General.amount-117.45)<1e-6); assert.ok(Math.abs(uc.at65.amount-37.25)<1e-6);
assert.equal(Math.round(unemploymentDailyBenefit2026(20000,'pre65')),7830);
const nhi=fukuyamaNhiPremium2026Details({memberIncomesMan:[100],members:1,adultMembers:1,careMembers40to64:0});
assert.ok(nhi.child>0); assert.ok(nhi.total>nhi.medical+nhi.support);
const late=lateElderlyMedicalPremium2026Details(100); assert.ok(late.child>0); assert.ok(late.total<=87.1);
const tax=estimateSimpleIncomeTaxes({salaryGross:72,pensionGross:260,age:70,spouseIncomeMan:0,spouseAge:70});
assert.equal(tax.salaryIncome,0); assert.equal(tax.spouseIncomeTaxDeduction,48); assert.equal(tax.residentSpouseDeduction,38);
console.log('OK: v0.8 monthly calculation, tax/social, unemployment, iDeCo, actual forecast, review triggers, factor decomposition, certainty and integrity tests passed');

const taxCfg={
  people:{primary:{birthDate:'1980-01-01'},spouse:{birthDate:'1981-01-01'}},
  retirement:{amount:1000,receiveDate:'2030-06-01',serviceYears:30,companyStartDate:'2000-04-01'},
  employment:{primary:{mainRetirement:{baseDate:'2035-06-01'}}},
  ideco:{joinDate:'2015-01-01',asOfDate:'2030-01-01',currentBalance:400,monthlyContribution:2,contributionEndDate:'2035-06-01',accumulationReturn:4,optimisticReturn:6,lumpDate:'2035-06-01',lumpPercent:50,annuityPercent:50,annuityYears:5,annuityReturn:2}
};
const ov=idecoOverlapReference(taxCfg);
assert.equal(ov.within19YearRule,true);
assert.equal(ov.yearGap,5);
assert.ok(ov.deemedYears>0);
assert.ok(ov.overlapYears>=0);
assert.ok(ov.adjustedDeduction<=ov.fullDeduction);
const rs=retirementIdecoTaxSummary(taxCfg);
assert.ok(rs.plan.balance>400);
assert.ok(rs.idecoLumpTax.net<=rs.plan.lumpGross);
assert.ok(rs.pensionIncome>=0);
const outside=structuredClone(taxCfg); outside.retirement.receiveDate='2000-06-01';
const ov2=idecoOverlapReference(outside);
assert.equal(ov2.within19YearRule,false);
assert.equal(ov2.adjustedDeduction,ov2.fullDeduction);
console.log('OK: step3 retirement/iDeCo tax overlap tests passed');
