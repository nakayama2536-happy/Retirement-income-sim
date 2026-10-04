import {inspectMigration,migrateSelected} from './migration.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateConfig,loadState,saveState,STATE_KEY} from './storage.mjs';
import {commitPlanState} from './state.mjs';
import {plannedTaxSocialAnnual,evaluateReviewTriggers,expenseDetailSummary,integrityChecks} from './calc.mjs';
function config(){return migrateConfig({people:{primary:{birthDate:'1980-01-01'},spouse:{birthDate:'1981-01-01'}},plan:{startAge:64,endAge:66,startDate:'2044-01-01',initialAsset:1000,afterTaxReturn:0,inflation:0},employment:{primary:{mainRetirement:{baseDate:'2045-01-01'},sideWork:{monthlyGross:0}},spouse:{sideWork:{monthlyGross:0}}},income:{pensions:{primary:{startDate:'2045-01-01',annualAtStart:240},spouse:{startDate:'2045-01-01',annualAtStart:120}}},budgets:[{fromAge:65,toAge:66,annualBudget:100}],expenseDetail:{monthlyCategories:[{key:'taxSocial',amount:2}]},reserve:{total:0,minimumSafeAsset:0},unemployment:{baselineMode:'none'},taxPolicy:{reviewDeltaAnnual:1}});}
class MemoryStorage{values=new Map();writes=0;fail=false;getItem(k){return this.values.get(k)??null;}setItem(k,v){if(this.fail)throw new Error('QuotaExceededError');this.writes++;this.values.set(k,String(v));}removeItem(k){this.values.delete(k);}}
function seed(){globalThis.localStorage=new MemoryStorage();saveState({config:config(),scenarios:[]});return loadState();}
test('actual tax equal to the adopted estimate does not trigger a warning',()=>{
 const c=config(), value=plannedTaxSocialAnnual(c,65);assert.equal(value,expenseDetailSummary(c,65).annualOperating);
 c.actuals={65:{endAsset:1000,taxSocial:value}};
 assert.ok(!evaluateReviewTriggers(c).some(x=>x.code==='tax-social-65'));
 c.actuals[65].taxSocial=value+1;assert.ok(evaluateReviewTriggers(c).some(x=>x.code==='tax-social-65'));
 c.taxPolicy.reviewDeltaAnnual=0;c.actuals[65].taxSocial=value;assert.ok(!evaluateReviewTriggers(c).some(x=>x.code==='tax-social-65'));
});
test('tax warnings follow period overrides, inflation, and omitted actual values',()=>{
 const c=config();c.plan.inflation=2;c.cashflow.periodOverrides=[{kind:'expense',key:'taxSocial',fromAge:65,toAge:66,amount:36,unit:'annual'}];
 assert.equal(plannedTaxSocialAnnual(c,65),36.72);
 c.actuals={65:{endAsset:1000,taxSocial:36.72}};assert.ok(!evaluateReviewTriggers(c).some(x=>x.code==='tax-social-65'));
 for(const v of [null,'',undefined]){c.actuals[65].taxSocial=v;assert.ok(!evaluateReviewTriggers(c).some(x=>x.code==='tax-social-65'));}
});
test('configuration and scenarios commit with one write and reload together',()=>{
 const before=seed(), candidate=structuredClone(before);candidate.config.plan.initialAsset=2000;
 candidate.scenarios=[{id:'new',name:'Synthetic',role:'baseline',config:config()}];
 const writes=localStorage.writes, committed=commitPlanState(before,candidate);
 assert.equal(localStorage.writes,writes+1);assert.equal(loadState().config.plan.initialAsset,2000);
 assert.equal(loadState().scenarios[0].id,'new');assert.equal(before.config.plan.initialAsset,1000);
 assert.deepEqual(loadState().config,committed.config);
});
test('failed combined restore preserves the entire old state and caller data',()=>{
 const before=seed(), candidate=structuredClone(before);candidate.config.plan.initialAsset=2000;
 candidate.scenarios=[{id:'new',role:'baseline',config:config()}];const original=structuredClone(candidate);
 localStorage.fail=true;assert.throws(()=>commitPlanState(before,candidate),/Quota/);
 assert.deepEqual(loadState(),before);assert.deepEqual(candidate,original);
});
test('invalid scenario or actual rejects the entire restore before saving',()=>{
 const before=seed();let candidate=structuredClone(before);candidate.scenarios=[{config:{}}];const writes=localStorage.writes;
 assert.throws(()=>commitPlanState(before,candidate));assert.equal(localStorage.writes,writes);
 candidate=structuredClone(before);candidate.config.actuals={200:{endAsset:1}};
 assert.throws(()=>commitPlanState(before,candidate),/実績/);assert.deepEqual(loadState(),before);
});
test('another tab changing scenarios prevents stale whole-state overwrite',()=>{
 const before=seed(), other=structuredClone(before);other.scenarios=[{id:'external',role:'baseline',config:config()}];saveState(other,before);
 assert.throws(()=>commitPlanState(before,before),/別画面/);assert.equal(loadState().scenarios[0].id,'external');
});
test('legacy data migrate without deleting the rollback copy; corrupt new state never falls back silently',()=>{
 globalThis.localStorage=new MemoryStorage();const old=config();localStorage.setItem('lifeplan-sim-config-v0.9',JSON.stringify(old));
 assert.equal(loadState().config,null);migrateSelected(inspectMigration(),'work-v0.9',{acceptConfigOnly:true});
 assert.equal(JSON.parse(localStorage.getItem('lifeplan-sim-config-v0.9')).plan.initialAsset,1000);
 localStorage.setItem(STATE_KEY,'broken');assert.throws(()=>loadState());
});
test('iDeCo inclusion is flagged rather than silently changing assets',()=>{
 const c=config();c.ideco={asOfDate:'2040-01-01',currentBalance:100,contributionEndDate:'2045-01-01',monthlyContribution:0,lumpPercent:50,annuityPercent:50,annuityYears:5};
 assert.ok(integrityChecks(c).some(x=>x.code==='ideco-asset-scope'&&x.level==='warn'));
 c.plan.initialAssetIncludesIdeco=true;assert.ok(integrityChecks(c).some(x=>x.code==='ideco-asset-scope'&&x.level==='error'));
 c.plan.initialAssetIncludesIdeco=false;assert.ok(!integrityChecks(c).some(x=>x.code==='ideco-asset-scope'));
 assert.equal(c.plan.initialAsset,1000);
});
