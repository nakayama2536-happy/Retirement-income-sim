import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateConfig} from './storage.mjs';
import {step8ExistingView,step8DraftFromConfig,step8DraftIssues,step8SetField,step8Trial,step8ProjectionCompatibility} from './step8-trial-workflow.mjs';
const fixture=()=>migrateConfig({
 people:{primary:{birthDate:'1980-08-27'},spouse:{birthDate:'1981-05-01'}},
 plan:{startAge:64,endAge:69,startDate:'2044-09-27',initialAsset:100,initialAssetIncludesIdeco:false,afterTaxReturn:0,inflation:0},
 ideco:{asOfDate:'2044-08-27',currentBalance:120,monthlyContribution:0,contributionEndDate:'2044-08-27',lumpDate:'2044-08-27',lumpPercent:50,annuityPercent:50,annuityYears:5,accumulationReturn:0,annuityReturn:0},
 employment:{primary:{mainRetirement:{baseDate:'2045-08-27'},sideWork:{monthlyGross:0}},spouse:{sideWork:{monthlyGross:0}}},
 income:{pensions:{primary:{annualAtStart:0},spouse:{annualAtStart:0}}},budgets:[{fromAge:65,toAge:95,annualBudget:0}],unemployment:{baselineMode:'none'},
 cashflow:{salaryLife:{mode:'net-transfer-v1',lastSalaryMonth:'2044-08',monthlyAddition:0,monthlyWithdrawal:0,pre65MonthlyBudget:0,postSalaryLabor:{mode:'none'}}},events:[],
 management:{thresholds:{65:5000,70:3000}}
});
const d=()=>({startMonth:'2044-09',salaryLastMonth:'2044-08',priceBaseMonth:'2044-08',openingAsOfMonth:'2044-08',openingAmount:100,openingConfirmed:true,idecoAssetScope:'received-lump-only-v1',replaceLegacyScope:true,annuityStartMonth:'2044-09'});
const has=(issues,code)=>issues.some(x=>x.code===code);
test('saved view separates opening amount, reference month and age-end target',()=>{const v=step8ExistingView(fixture());assert.equal(v.startAsset,100);assert.equal(v.thresholds[65],5000);assert.equal(v.priceBaseMonth,null);assert.equal(v.legacyScope,false);assert.match(v.notice,/年齢期末目標ではありません/);});
test('preexisting confirmed balance does not re-confirm a new trial',()=>{const c=fixture();c.plan.openingBalance={asOfMonth:'2044-08',amount:100,confirmed:true}; const x=step8DraftFromConfig(c);assert.equal(x.openingConfirmed,false);assert.equal(x.openingAmount,100);assert.equal(x.priceBaseMonth,'');assert.equal(x.idecoAssetScope,'');});
test('trial is read-only with explicit choice, only includes future annuities',()=>{const c=fixture(),before=structuredClone(c),r=step8Trial(c,d());assert.equal(r.ok,true,JSON.stringify(r.issues));assert.deepEqual(c,before);assert.equal(r.config.plan.openingBalance.amount,100);assert.equal(r.config.plan.priceBaseMonth,'2044-08');assert.equal(r.config.plan.initialAssetIncludesIdeco,undefined);assert.equal(r.config.plan.idecoAssetScope,'received-lump-only-v1');assert.equal(r.config.management.thresholds[65],5000);assert.equal(r.projection.firstMonth,'2044-09');assert.equal(r.projection.finalAsset,160);assert.equal(r.projection.monthlyCount,71);assert.match(r.notice,/手取/);});
test('unconfirmed opening blocks trial even if rest complete',()=>{const a=d();a.openingConfirmed=false;assert.equal(has(step8DraftIssues(fixture(),a),'opening-confirmation'),true);assert.equal(step8Trial(fixture(),a).config,null);});
test('any draft change invalidates checked confirmation without touching earlier draft',()=>{for(const field of ['startMonth','salaryLastMonth','priceBaseMonth','openingAsOfMonth','openingAmount','idecoAssetScope','replaceLegacyScope','annuityStartMonth']){const a=d(),r=step8SetField(a,field,a[field]);assert.equal(r.openingConfirmed,false,field);assert.equal(a.openingConfirmed,true);}});
test('confirmation action alone may restore confirmation',()=>{const a=step8SetField(d(),'openingConfirmed',true);assert.equal(a.openingConfirmed,true);});
test('unknown draft field is rejected',()=>{assert.throws(()=>step8SetField(d(),'annualBudget',3));});
for(const [field,value,code] of [
 ['startMonth','2044-13','start-month'], ['salaryLastMonth','','last-salary-month'],['salaryLastMonth','2044-07','last-salary-boundary'], ['startMonth','', 'start-month'], ['priceBaseMonth','', 'price-base-month'],['priceBaseMonth','2044-10','price-after-start'],
 ['openingAsOfMonth','2044-09','opening-month'],['openingAsOfMonth',null,'opening-month'],['openingAmount',null,'opening-amount'],['openingAmount','100','opening-amount'],['openingAmount',-1,'opening-amount'],['openingAmount',Number.NaN,'opening-amount'],
 ['idecoAssetScope','', 'asset-scope'],['annuityStartMonth','', 'annuity-first'],['annuityStartMonth','2044-07','annuity-before-lump'],['replaceLegacyScope',false,'legacy-scope']
]) test(`wrong input ${field}=${String(value)} -> ${code}`,()=>{const a={...d(),[field]:value};assert.ok(has(step8DraftIssues(fixture(),a),code));assert.equal(step8Trial(fixture(),a).ok,false);});
test('bad user birth or missing ideco is not silently treated as valid',()=>{const a=fixture();a.people.primary.birthDate=null;assert.ok(has(step8DraftIssues(a,d()),'birth'));const b=fixture();delete b.ideco;assert.ok(has(step8DraftIssues(b,d()),'ideco-settings'));});
test('unknown salary method is not converted automatically',()=>{const c=fixture();delete c.cashflow.salaryLife;assert.ok(has(step8DraftIssues(c,d()),'salary-mode'));});
test('single edit of first month changes cash flow timing, not the saved config',()=>{const c=fixture(),x=d(),before=structuredClone(c);x.annuityStartMonth='2045-09';const r=step8Trial(c,x);assert.equal(r.ok,true,JSON.stringify(r.issues));assert.ok(r.projection.finalAsset<160);assert.deepEqual(c,before);});
test('age is derived from real birth date; zero balance is explicitly accepted',()=>{const c=fixture(),x=d();c.cashflow.salaryLife.lastSalaryMonth='2045-08';x.openingAmount=0;x.startMonth='2045-09';x.salaryLastMonth='2045-08';x.openingAsOfMonth='2045-08';x.priceBaseMonth='2045-08';x.annuityStartMonth='2045-09';const r=step8Trial(c,x);assert.equal(r.ok,true,JSON.stringify(r.issues));assert.equal(r.config.plan.startAge,65);assert.equal(r.config.plan.initialAsset,0);});
test('start before 64 is rejected',()=>{const x=d();x.startMonth='2043-09';x.openingAsOfMonth='2043-08';x.priceBaseMonth='2043-08';const r=step8Trial(fixture(),x);assert.ok(has(r.issues,'before-64'));});
test('invalid latest source agreement never silently edits scenario',()=>{const c=fixture();c.plan.endAge=64;assert.ok(has(step8Trial(c,d()).issues,'end-age'));});

// Regression: previously saved salary month must not silently determine a new 65-year start.
test('start month shift exposes stale salary boundary without writing back',()=>{
  const c=fixture(),original=structuredClone(c),x=d();
  Object.assign(x,{startMonth:'2045-09',openingAsOfMonth:'2045-08',priceBaseMonth:'2045-08',annuityStartMonth:'2045-09'});
  assert.ok(has(step8DraftIssues(c,x),'last-salary-boundary'));
  assert.equal(step8Trial(c,x).ok,false);
  assert.deepEqual(c,original);
  x.salaryLastMonth='2045-08';
  const trial=step8Trial(c,x);
  assert.equal(trial.ok,true,JSON.stringify(trial.issues));
  assert.equal(trial.config.cashflow.salaryLife.lastSalaryMonth,'2045-08');
  assert.equal(trial.changes.salaryLastMonth,'2045-08');
  assert.deepEqual(c,original);
});
test('salary last-month change invalidates prior approval',()=>{
 const original=d(),edited=step8SetField(original,'salaryLastMonth','2045-08');
 assert.equal(edited.openingConfirmed,false);assert.equal(original.openingConfirmed,true);
});

// New current-main port contract: no false positive if the old engine ignores optional keys.
test('guard rejects a main engine that ignored the separate price base',()=>{
 const x=d(),r={monthlyDetails:[{month:'2044-09',baseDate:'2044-09-27',startAsset:100,monthsFromBase:0,idecoLumpReceipt:0,idecoAnnuity:0}],idecoProjection:{annuityPrincipal:0}};
 assert.ok(has(step8ProjectionCompatibility(x,r),'engine-price-basis'));
 assert.ok(has(step8ProjectionCompatibility(x,r),'engine-price-months'));
});
test('guard rejects unintegrated annuity start month',()=>{
 const x=d(),r={monthlyDetails:[
 {month:'2044-09',baseDate:'2044-08-01',startAsset:100,monthsFromBase:1,idecoLumpReceipt:0,idecoAnnuity:0},
 {month:'2044-10',baseDate:'2044-08-01',startAsset:100,monthsFromBase:2,idecoLumpReceipt:0,idecoAnnuity:1}
 ],idecoProjection:{annuityPrincipal:60}};
 assert.ok(has(step8ProjectionCompatibility(x,r),'engine-annuity-month'));
});
test('guard rejects a repeated prior-month iDeCo lump receipt and missing monthly details',()=>{
 const x=d(),r={monthlyDetails:[{month:'2044-09',baseDate:'2044-08-01',startAsset:100,monthsFromBase:1,idecoLumpReceipt:5,idecoAnnuity:1}],idecoProjection:{annuityPrincipal:60}};
 assert.ok(has(step8ProjectionCompatibility(x,r),'engine-lump-double'));
 assert.ok(has(step8ProjectionCompatibility(x,{}),'engine-monthly-details'));
});
test('guard accepts verified stage5-7 fixture observations and does not modify input',()=>{
 const c=fixture(),x=d(),before=structuredClone(c),trial=step8Trial(c,x);
 assert.equal(trial.ok,true,JSON.stringify(trial.issues));
 assert.deepEqual(c,before);
});
