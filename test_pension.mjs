import {inspectMigration,migrateSelected} from './migration.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {runRetirementPlan,estimateAnnualTaxSocial,expenseDetailSummary,expenseDetailRows,applyCarDisposalTransfer,integrityChecks} from './calc.mjs';
import {migrateConfig,saveConfig,loadConfig,saveConfigIfUnchanged,savePensionDraft,loadPensionDraft} from './storage.mjs';
import {pensionDraftFromConfig,pensionDraftMatches,pensionDraftContext,previewPension,applyPensionPreview,undoPensionApply,pensionUndoAvailable} from './pension.mjs';

// Public regression suite: fictional people, amounts and dates only.
function fixture(){return migrateConfig({
  meta:{label:'Synthetic test plan'},
  people:{primary:{birthDate:'1980-01-01'},spouse:{birthDate:'1981-01-01'}},
  plan:{startAge:64,endAge:72,startDate:'2044-01-01',initialAsset:1000,afterTaxReturn:0,inflation:0},
  employment:{primary:{mainRetirement:{baseDate:'2045-01-01'},sideWork:{monthlyGross:2,startDate:'2045-01-01',endDate:'2047-01-01'}},spouse:{sideWork:{monthlyGross:1,startDate:'2045-01-01',endDate:'2047-01-01'}}},
  income:{pensions:{primary:{startDate:'2050-01-31',annualAtStart:120,certainty:'official_estimate',alternatives:{65:80,70:120,75:160},note:'Synthetic reference'},spouse:{startDate:'2051-01-01',annualAtStart:60,certainty:'assumption'}}},
  budgets:[{fromAge:65,toAge:95,annualBudget:100}],
  expenseDetail:{monthlyCategories:[{key:'base',label:'生活費',amount:5},{key:'taxSocial',label:'税・社保',amount:2}],travelAnnualBase:4},
  reserve:{total:50,minimumSafeAsset:10},unemployment:{baselineMode:'none'},
  actuals:{65:{endAsset:900,note:'Keep this actual'}},reviews:{65:{note:'Keep this review'}},pendingDecisions:['Keep this pending item']
});}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
const edited=c=>{const d=pensionDraftFromConfig(c);d.primary.annualAtStart=132;d.primary.certainty='scenario';d.primary.adoptionSource='Synthetic scenario';return d;};
class MemoryStorage{
  values=new Map();fail=false;
  getItem(k){return this.values.get(k)??null;}
  setItem(k,v){if(this.fail)throw new Error('QuotaExceededError');this.values.set(k,String(v));}
  removeItem(k){this.values.delete(k);}
}
function store(c){globalThis.localStorage=new MemoryStorage();saveConfig(c);return globalThis.localStorage;}

test('tax basis uses actual years, spouse age and partial-year earnings',()=>{
  const c=fixture();c.employment.primary.sideWork={monthlyGross:10,startDate:'2045-07-01',endDate:'2046-01-01'};
  c.employment.spouse.sideWork.monthlyGross=0;
  c.income.pensions.primary={startDate:'2045-10-01',annualAtStart:144};
  const e=estimateAnnualTaxSocial(c,65);
  assert.deepEqual(e.incomeBasis,{startDate:'2045-01-01',primaryAge:65,spouseAge:64,primarySalary:60,spouseSalary:0,primaryPension:36,spousePension:0});
  assert.equal(e.source,'income_based');
  const row=runRetirementPlan(c).rows.find(r=>r.age===65);
  close(row.labor,e.incomeBasis.primarySalary);close(row.primaryPension,36);
});
test('tax fallback is monthly and annual tax is divided by twelve exactly once',()=>{
  const c=fixture();c.expenseDetail.monthlyCategories=[{key:'taxSocial',amount:2}];
  const noIncome=expenseDetailSummary(c,64);
  close(noIncome.monthlyTotal,2);close(noIncome.annualOperating,24);
  close(expenseDetailSummary(c,70).annualOperating,estimateAnnualTaxSocial(c,70).total);
  c.plan.inflation=2;
  close(expenseDetailRows(c,70).reduce((s,r)=>s+r.amount,0),expenseDetailSummary(c,70).monthlyTotal);
  c.cashflow.periodOverrides=[{kind:'expense',key:'taxSocial',fromAge:70,toAge:72,amount:36,unit:'annual'}];
  close(expenseDetailSummary(c,70).annualOperating,36*1.02**6);
});
test('nested detail overrides share the same display and aggregation values',()=>{
  const c=fixture();c.expenseDetail.monthlyCategories=[{key:'group',amount:3,items:[{key:'taxSocial',amount:2},{key:'other',amount:1}]}];
  close(expenseDetailSummary(c,70).annualOperating,estimateAnnualTaxSocial(c,70).total+12);
  c.cashflow.periodOverrides=[{kind:'expense',key:'group',fromAge:70,toAge:72,amount:4,unit:'monthly'},{kind:'expense',key:'other',fromAge:70,toAge:72,amount:9,unit:'monthly'}];
  close(expenseDetailSummary(c,70).monthlyTotal,4);
  assert.equal(expenseDetailRows(c,70).length,1);
});
test('moving car disposal restores displaced manual costs and removes old automatic rows',()=>{
  const c=fixture();c.plan.endAge=95;c.car={disposeAge:90,monthlyCost:5,medicalCareMonthlyIncrease:3};
  c.expenseDetail.monthlyCategories=[{key:'car',amount:5}];
  c.cashflow.periodOverrides=[{kind:'expense',key:'car',label:'Manual car cost',fromAge:88,toAge:94,amount:7,unit:'monthly'}];
  const original=structuredClone(c), first=applyCarDisposalTransfer(c);
  assert.deepEqual(c,original);close(expenseDetailSummary(first,90).monthlyTotal,8);
  first.car.disposeAge=91;const second=applyCarDisposalTransfer(first);
  close(expenseDetailSummary(second,90).monthlyTotal,7);close(expenseDetailSummary(second,91).monthlyTotal,8);
  assert.equal(second.cashflow.periodOverrides.filter(r=>r.source==='car-disposal').length,3);
  assert.equal(integrityChecks(second).filter(x=>x.level==='error').length,0);
  assert.deepEqual(applyCarDisposalTransfer(second),second);
  second.car.disposeAge=89;const third=applyCarDisposalTransfer(second);
  close(expenseDetailSummary(third,88).monthlyTotal,7);close(expenseDetailSummary(third,89).monthlyTotal,8);
});
test('legacy car rows migrate and explicit zero costs stay zero',()=>{
  const c=fixture();c.plan.endAge=95;c.car={disposeAge:90,monthlyCost:0,medicalCareMonthlyIncrease:0};
  const old=applyCarDisposalTransfer(c);for(const r of old.cashflow.periodOverrides)delete r.source;
  old.car.disposeAge=91;const moved=applyCarDisposalTransfer(old);
  assert.ok(moved.cashflow.periodOverrides.every(r=>r.fromAge===91&&r.amount===0));
  delete c.car.medicalCareMonthlyIncrease;assert.throws(()=>applyCarDisposalTransfer(c),/入力/);
});
test('detail-only changes never double-count spending in the asset model',()=>{
  const c=fixture(), baseline=runRetirementPlan(c).finalAsset;
  c.expenseDetail.monthlyCategories[1].amount=999;
  close(runRetirementPlan(c).finalAsset,baseline);
});
test('preview is isolated; apply updates only adopted fields and recomputes results',()=>{
  const c=fixture(), old=structuredClone(c);store(c);
  const p=previewPension(c,edited(c));assert.deepEqual(c,old);
  close(p.result.finalAsset-runRetirementPlan(c).finalAsset,36);
  assert.equal(p.candidate.income.pensions.primary.startDate,'2050-01-31');
  const applied=applyPensionPreview(c,p,saveConfigIfUnchanged);
  assert.deepEqual(c,old);assert.equal(applied.config.income.pensions.primary.annualAtStart,132);
  assert.deepEqual(applied.config.income.pensions.primary.alternatives,old.income.pensions.primary.alternatives);
  for(const key of ['actuals','reviews','pendingDecisions'])assert.deepEqual(applied.config[key],old[key]);
  close(applied.forecast.projection.finalAsset,runRetirementPlan(applied.config,{startDate:'2046-01-01',initialAsset:900}).finalAsset);
});
test('spouse-only and December starts are reflected month by month',()=>{
  const c=fixture(), d=pensionDraftFromConfig(c);d.spouse.annualAtStart=144;d.spouse.startMonth='2045-12';
  const p=previewPension(c,d);assert.deepEqual(p.changedPeople,['spouse']);
  close(p.result.rows.find(r=>r.age===65).spousePension,12);
  close(p.result.rows.find(r=>r.age===66).spousePension,144);
  assert.deepEqual(p.candidate.income.pensions.primary,c.income.pensions.primary);
});
test('same values are a no-op and repeated apply cannot duplicate income',()=>{
  const c=fixture();store(c);
  const first=applyPensionPreview(c,previewPension(c,edited(c)),saveConfigIfUnchanged).config;
  const p=previewPension(first,pensionDraftFromConfig(first));
  const again=applyPensionPreview(first,p,()=>assert.fail('A no-op must not save'));
  assert.equal(again.changed,false);assert.equal(first.pensionWorkflow.history.length,1);
  assert.throws(()=>applyPensionPreview(first,previewPension(c,edited(c)),saveConfigIfUnchanged),/前提/);
});
test('invalid amounts, missing starts and nonfinite results are rejected before saving',()=>{
  const c=fixture();
  for(const value of [-1,'',null,Infinity,'oops']){const d=edited(c);d.primary.annualAtStart=value;assert.throws(()=>previewPension(c,d),/年額/);}
  const d=edited(c);d.primary.startMonth='';assert.throws(()=>previewPension(c,d),/開始月/);
  d.primary.startMonth='2050-13';assert.throws(()=>previewPension(c,d),/開始月/);
  d.primary.startMonth='1970-01';assert.throws(()=>previewPension(c,d),/生年月日/);
  d.primary.startMonth='2050-01';c.plan.afterTaxReturn=-200;assert.throws(()=>previewPension(c,d),/数値/);
});
test('changed assumptions invalidate a preview',()=>{
  const c=fixture(), p=previewPension(c,edited(c));c.plan.inflation=2;
  assert.throws(()=>applyPensionPreview(c,p,()=>assert.fail()),/前提/);
});
test('save failure leaves memory and stored configuration unchanged',()=>{
  const c=fixture(), s=store(c), old=structuredClone(c);s.fail=true;
  assert.throws(()=>applyPensionPreview(c,previewPension(c,edited(c)),saveConfigIfUnchanged),/Quota/);
  assert.deepEqual(c,old);assert.deepEqual(loadConfig(),old);
});
test('another tab changes the saved plan: stale apply is rejected',()=>{
  const c=fixture();store(c);const p=previewPension(c,edited(c));
  const external=structuredClone(c);external.plan.initialAsset=2000;saveConfig(external);
  assert.throws(()=>applyPensionPreview(c,p,saveConfigIfUnchanged),/別画面/);
  assert.deepEqual(loadConfig(),external);
});
test('reload retains adopted values and undo; unrelated edits and baseline survive undo',()=>{
  const c=fixture(), s=store(c);s.setItem('lifeplan-sim-scenarios-v0.9',JSON.stringify([{role:'baseline',config:c}]));
  applyPensionPreview(c,previewPension(c,edited(c)),saveConfigIfUnchanged);
  const loaded=loadConfig();assert.ok(pensionUndoAvailable(loaded));
  loaded.actuals[66]={endAsset:800,note:'New actual'};loaded.plan.initialAsset=1100;saveConfig(loaded);
  const undone=undoPensionApply(loaded,saveConfigIfUnchanged);
  assert.deepEqual(undone.config.income.pensions,c.income.pensions);
  assert.deepEqual(undone.config.actuals,loaded.actuals);assert.equal(undone.config.plan.initialAsset,1100);
  assert.equal(pensionUndoAvailable(loadConfig()),false);
  assert.deepEqual(JSON.parse(s.getItem('lifeplan-sim-scenarios-v0.9'))[0].config,c);
});
test('undo failure is atomic and a newer pension edit disables undo',()=>{
  const c=fixture(), s=store(c);
  const applied=applyPensionPreview(c,previewPension(c,edited(c)),saveConfigIfUnchanged).config;
  const old=structuredClone(applied);s.fail=true;
  assert.throws(()=>undoPensionApply(applied,saveConfigIfUnchanged),/Quota/);assert.deepEqual(loadConfig(),old);
  applied.income.pensions.primary.annualAtStart=180;assert.equal(pensionUndoAvailable(applied),false);
  assert.throws(()=>undoPensionApply(applied,saveConfigIfUnchanged),/別の操作/);
});
test('drafts persist separately without changing adopted settings; v0.8 still migrates',()=>{
  const c=fixture();store(c);const d=edited(c);
  savePensionDraft({context:pensionDraftContext(c),draft:d});
  assert.deepEqual(loadPensionDraft().draft,d);assert.deepEqual(loadConfig(),c);
  assert.equal(pensionDraftMatches(c,d),false);assert.equal(pensionDraftMatches(c,pensionDraftFromConfig(c)),true);
  globalThis.localStorage=new MemoryStorage();const legacy=structuredClone(c);delete legacy.cashflow;legacy.meta.schemaVersion='0.8';
  localStorage.setItem('retirement-sim-config-v0.8',JSON.stringify(legacy));
  assert.equal(loadConfig(),null);migrateSelected(inspectMigration(),'public-v0.8',{acceptConfigOnly:true});
  assert.equal(loadConfig().meta.schemaVersion,'0.9');assert.deepEqual(loadConfig().income.pensions,c.income.pensions);
});
