import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateConfig,saveState,loadState,STATE_KEY} from './storage.mjs';
import {compareFullPlan} from './full-plan-comparison.mjs';
import {prepareSavedComparison,comparisonDifferences,comparisonSourceFingerprint,savedComparisonView,savedComparisons} from './full-plan-saved.mjs';
import {commitPlanState} from './state.mjs';
import {createFullBackup,restoreFullBackup} from './full-backup.mjs';
import {inspectBackupCompatibility,CURRENT_FEATURES} from './backup-compatibility.mjs';
function fixture(){return migrateConfig({
 people:{primary:{birthDate:'1980-08-27'},spouse:{birthDate:'1981-05-01'}},
 plan:{startAge:64,endAge:69,startDate:'2044-08-27',initialAsset:100,initialAssetIncludesIdeco:false,afterTaxReturn:0,inflation:0},
 ideco:{asOfDate:'2044-08-27',currentBalance:120,monthlyContribution:0,contributionEndDate:'2044-08-27',lumpDate:'2044-08-27',lumpPercent:50,annuityPercent:50,annuityYears:5,accumulationReturn:0,annuityReturn:0},
 employment:{primary:{mainRetirement:{baseDate:'2045-08-27'},sideWork:{monthlyGross:0}},spouse:{sideWork:{monthlyGross:0}}},
 income:{pensions:{primary:{annualAtStart:0},spouse:{annualAtStart:0}}},
 budgets:[{fromAge:65,toAge:95,annualBudget:0}],unemployment:{baselineMode:'none'},
 cashflow:{salaryLife:{mode:'net-transfer-v1',lastSalaryMonth:'2044-08',monthlyAddition:0,monthlyWithdrawal:0,pre65MonthlyBudget:0,postSalaryLabor:{mode:'existing_confirmed'},receiptTreatment:{ideco:'separate',pension:'separate',unemployment:'separate'}}},events:[]
});}
function req(){return {opening:{startMonth:'2044-09',salaryLastMonth:'2044-08',priceBaseMonth:'2044-08',openingAsOfMonth:'2044-08',openingAmount:100,openingConfirmed:true,idecoAssetScope:'received-lump-only-v1',replaceLegacyScope:true,annuityStartMonth:'2044-09'},
 budgets:[{fromAge:65,toAge:95,annualBudget:12}],events:[{id:'synthetic-a',type:'expense',date:'2046-10-01',label:'架空支出',amount:10,fundingTreatment:'separate'}],
 primarySideStartMonth:'2045-10'};}
const setup=()=>{
 const current=fixture(),request=req(),calc=compareFullPlan(current,request);
 assert.equal(calc.ok,true,JSON.stringify(calc.issues));
 const scenarios=[{id:'base',name:'合成基準',role:'baseline',selected:true,config:structuredClone(current),other:{keep:1}}];
 return {current,scenarios,request,calc,params:{current,scenarios,proposal:calc.proposal,request,name:'架空案A',id:'synthetic-1',now:'2026-10-16T00:00:00Z',expectedFingerprint:comparisonSourceFingerprint(current)}};
};
class Memory{data=new Map();writes=0;fail=false;getItem(k){return this.data.get(k)??null;}setItem(k,v){if(this.fail)throw Error('QuotaExceeded');this.writes++;this.data.set(k,String(v));}}
test('comparison saved as unselected, versioned scenario without changes to original',()=>{
 const {params}=setup(),original=structuredClone(params),res=prepareSavedComparison(params);
 assert.equal(res.duplicate,false);assert.equal(res.scenarios.length,2);
 assert.deepEqual(res.scenarios[0],params.scenarios[0]);assert.equal(res.scenario.selected,false);assert.equal(res.scenario.role,'scenario');
 assert.equal(res.scenario.comparisonPlan.inputs.opening.openingConfirmed,false);
 assert.equal(res.scenario.config.actuals,undefined);assert.ok(res.differences.some(x=>x.key==='budgets'));assert.deepEqual(params,original);
});
test('duplicate save and stale basis are rejected without append',()=>{
 const {params}=setup(),saved=prepareSavedComparison(params);
 const duplicate=prepareSavedComparison({...params,scenarios:saved.scenarios,id:'synthetic-2'});
 assert.equal(duplicate.duplicate,true);assert.deepEqual(duplicate.scenarios,saved.scenarios);
 const changed=structuredClone(params.current);changed.plan.inflation=1;
 assert.throws(()=>prepareSavedComparison({...params,current:changed}),/変わりました/);
 assert.throws(()=>prepareSavedComparison({...params,id:'base'}),/重複/);
 assert.throws(()=>prepareSavedComparison({...params,name:'a'.repeat(81)}),/80文字/);
});
test('reopened comparison shows differences and warns on changed adopted basis',()=>{
 const {params}=setup(),saved=prepareSavedComparison(params).scenario;
 assert.equal(savedComparisons([saved]).length,1);
 const view=savedComparisonView(params.current,saved);assert.equal(view.stale,false);
 assert.deepEqual(view.differences,comparisonDifferences(params.current,saved.config));
 const edited=structuredClone(params.current);edited.plan.inflation=1;
 assert.equal(savedComparisonView(edited,saved).stale,true);
});
test('backup version marker requires a compatible build; unknown future metadata rejected',()=>{
 const {params}=setup(),saved=prepareSavedComparison(params).scenario,state={config:params.current,scenarios:[saved]};
 const check=inspectBackupCompatibility(state);assert.equal(check.compatible,true,check.message);
 assert(check.requiredFeatures.includes('full-plan-comparison-saved-v1'));
 assert.equal(inspectBackupCompatibility(state,{appBuild:'old',features:CURRENT_FEATURES.filter(f=>f!=='full-plan-comparison-saved-v1')}).compatible,false);
 const bad=structuredClone(state);bad.scenarios[0].comparisonPlan.version=2;
 assert.equal(inspectBackupCompatibility(bad).compatible,false);
});
test('atomic save and full-backup roundtrip preserve current adopted config',()=>{
 const {params}=setup();globalThis.localStorage=new Memory();
 saveState({config:params.current,scenarios:params.scenarios,opaque:{keep:true}});
 const old=loadState(),adopted=structuredClone(old.config);
 const prepared=prepareSavedComparison({...params,current:old.config,scenarios:old.scenarios,expectedFingerprint:comparisonSourceFingerprint(old.config)});
 commitPlanState(old,{config:old.config,scenarios:prepared.scenarios});
 const next=loadState();assert.deepEqual(next.config,adopted);assert.equal(next.scenarios.length,2);
 assert.equal(next.scenarios[1].selected,false);assert.deepEqual(next.opaque,{keep:true});assert.equal(localStorage.writes,2);
 const backup=createFullBackup(next,{now:new Date('2026-10-16T00:00:00Z')});
 assert(backup.recoveryCompatibility.requiredFeatures.includes('full-plan-comparison-saved-v1'));
 globalThis.localStorage=new Memory();saveState({config:adopted,scenarios:params.scenarios});
 restoreFullBackup(loadState(),backup);
 assert.deepEqual(loadState(),backup);assert.deepEqual(loadState().config,adopted);
});
test('failed write and concurrent stale write keep current data',()=>{
 const {params}=setup();globalThis.localStorage=new Memory();saveState({config:params.current,scenarios:params.scenarios});
 const old=loadState(),next=prepareSavedComparison({...params,current:old.config,scenarios:old.scenarios,expectedFingerprint:comparisonSourceFingerprint(old.config)});
 const raw=localStorage.getItem(STATE_KEY),count=localStorage.writes;localStorage.fail=true;
 assert.throws(()=>commitPlanState(old,{config:old.config,scenarios:next.scenarios}),/QuotaExceeded/);
 assert.equal(localStorage.getItem(STATE_KEY),raw);assert.equal(localStorage.writes,count);
 localStorage.fail=false;const other=loadState();other.config.plan.inflation=1;saveState(other,old);
 assert.throws(()=>commitPlanState(old,{config:old.config,scenarios:next.scenarios}),/別画面/);
 assert.deepEqual(loadState().scenarios,old.scenarios);
});
