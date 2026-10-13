import test from 'node:test';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {migrateConfig,loadState,saveState,replaceState,STATE_KEY} from './storage.mjs';
import {createFullBackup,restoreFullBackup} from './full-backup.mjs';
import {createConfigBackup,inspectBackupCompatibility,CURRENT_FEATURES} from './backup-compatibility.mjs';

const FLAGS=['price-base-month-v1','opening-balance-prior-month-close-v1','ideco-received-lump-scope-v1','ideco-annuity-start-month-v1'];
function syntheticConfig(){return migrateConfig({
 people:{primary:{birthDate:'1980-08-27'},spouse:{birthDate:'1981-05-01'}},
 plan:{startAge:64,endAge:69,startDate:'2044-09-27',initialAsset:100,afterTaxReturn:0,inflation:0,
  priceBaseMonth:'2044-08',openingBalance:{mode:'prior-month-close-v1',asOfMonth:'2044-08',startMonth:'2044-09',amount:100,confirmed:true},idecoAssetScope:'received-lump-only-v1'},
 ideco:{asOfDate:'2044-08-27',currentBalance:120,monthlyContribution:0,contributionEndDate:'2044-08-27',lumpDate:'2044-08-27',lumpPercent:50,annuityPercent:50,annuityYears:5,accumulationReturn:0,annuityReturn:0,annuityStartMonth:'2044-09'},
 employment:{primary:{mainRetirement:{baseDate:'2045-08-27'},sideWork:{monthlyGross:0}},spouse:{sideWork:{monthlyGross:0}}},
 income:{pensions:{primary:{annualAtStart:0},spouse:{annualAtStart:0}}},budgets:[{fromAge:65,toAge:95,annualBudget:0}],
 cashflow:{salaryLife:{mode:'net-transfer-v1',lastSalaryMonth:'2044-08',monthlyAddition:0,monthlyWithdrawal:0,pre65MonthlyBudget:0,postSalaryLabor:{mode:'none'}}},
 unemployment:{baselineMode:'none'},events:[],futureUnknown:{keep:true}
});}
function state(){const c=syntheticConfig();return {config:c,scenarios:[{id:'synthetic-one',name:'比較案（架空）',role:'reference',selected:true,unknownScenario:{keep:1},config:structuredClone(c)}],unknownEnvelope:{preserve:1}};}
class Memory { data=new Map();writes=0;fail=false;getItem(k){return this.data.get(k)??null;}setItem(k,v){if(this.fail)throw Error('QuotaExceeded');this.writes++;this.data.set(k,String(v));}}
const compareFeatures=()=>CURRENT_FEATURES.filter(f=>!FLAGS.includes(f));

test('new fields are advertised in full/config backups, older engine refuses all',()=>{
 const s=state(),original=structuredClone(s),backup=createFullBackup(s);
 for(const f of FLAGS) assert.ok(backup.recoveryCompatibility.requiredFeatures.includes(f),f);
 assert.equal(inspectBackupCompatibility(backup,{appBuild:'old',features:compareFeatures()}).compatible,false);
 assert.deepEqual(createConfigBackup(s.config).recoveryCompatibility.requiredFeatures.filter(f=>FLAGS.includes(f)).sort(),[...FLAGS].sort());
 assert.deepEqual(s,original);
});
test('scenario-only new fields must not be dropped in required features',()=>{
 const s=state();for(const k of ['priceBaseMonth','openingBalance','idecoAssetScope'])delete s.config.plan[k];delete s.config.ideco.annuityStartMonth;s.config.plan.startDate='2044-08-27';s.config.plan.initialAssetIncludesIdeco=false;
 const check=inspectBackupCompatibility(s);
 assert.equal(check.compatible,true,check.message);
 for(const f of FLAGS)assert.ok(check.requiredFeatures.includes(f),f);
});
test('restore round-trip preserves new fields, scenarios and opaque unknown values',()=>{
 globalThis.localStorage=new Memory();const before={config:syntheticConfig(),scenarios:[]};before.config.plan.initialAsset=1;saveState(before);
 const backup=createFullBackup(state(),{now:new Date('2026-10-13T00:00:00Z')});
 restoreFullBackup(loadState(),JSON.parse(JSON.stringify(backup)));
 const read=loadState();assert.deepEqual(read,backup);assert.equal(read.scenarios[0].role,'reference');assert.deepEqual(read.unknownEnvelope,{preserve:1});
 assert.deepEqual(read.config.futureUnknown,{keep:true});assert.equal(read.config.ideco.annuityStartMonth,'2044-09');
});
test('direct new-feature local save carries compatibility marker for old builds',()=>{
 globalThis.localStorage=new Memory();saveState(state());
 const raw=JSON.parse(localStorage.getItem(STATE_KEY));
 for(const f of FLAGS)assert.ok(raw.recoveryCompatibility?.requiredFeatures.includes(f),f);
 assert.equal(inspectBackupCompatibility(raw,{features:compareFeatures()}).compatible,false);
});
test('failed write preserves original and candidate exactly',()=>{
 globalThis.localStorage=new Memory();const first=state();saveState(first);
 const before=localStorage.getItem(STATE_KEY),candidate=state();candidate.config.plan.initialAsset=200;candidate.config.plan.openingBalance.amount=200;
 const frozen=structuredClone(candidate);localStorage.fail=true;
 assert.throws(()=>replaceState(candidate,loadState()),/QuotaExceeded/);
 assert.equal(localStorage.getItem(STATE_KEY),before);assert.deepEqual(candidate,frozen);
});

for(const [label,mutate] of [
 ['price base empty',s=>s.config.plan.priceBaseMonth=''],
 ['opening object missing',s=>s.config.plan.openingBalance=null],
 ['opening method unknown',s=>s.config.plan.openingBalance.mode='future-mode'],
 ['scope unknown',s=>s.config.plan.idecoAssetScope='other'],
 ['scope legacy flag collision',s=>s.config.plan.initialAssetIncludesIdeco=false],
 ['annuity initial month empty',s=>s.config.ideco.annuityStartMonth=''],
 ['balance mismatch',s=>s.config.plan.openingBalance.amount=101],
 ['start month mismatch',s=>s.config.plan.openingBalance.startMonth='2044-10'],
])test(`damaged new field ${label} is rejected without writing`,()=>{
 globalThis.localStorage=new Memory();const original=state();saveState(original);
 const byteBefore=localStorage.getItem(STATE_KEY),countBefore=localStorage.writes;
 const damaged=createFullBackup(state());mutate(damaged);const snapshot=structuredClone(damaged);
 assert.throws(()=>restoreFullBackup(loadState(),damaged));
 assert.equal(localStorage.writes,countBefore);assert.equal(localStorage.getItem(STATE_KEY),byteBefore);
 assert.deepEqual(damaged,snapshot);
});
test('unknown forward compatible metadata survives local save and config-only export',()=>{
 globalThis.localStorage=new Memory();const original=state();
 original.recoveryCompatibility={protocol:1,producerBuild:'synthetic-future',requiredFeatures:[],futureMeta:{opaque:7}};
 saveState(original);const saved=loadState();
 assert.deepEqual(saved.recoveryCompatibility.futureMeta,{opaque:7});
 const config=syntheticConfig();config.recoveryCompatibility={protocol:1,producerBuild:'synthetic-future',requiredFeatures:[],unknown:{keep:1}};
 assert.deepEqual(createConfigBackup(config).recoveryCompatibility.unknown,{keep:1});
});
test('legacy settings remain unmarked and do not inherit newly enabled modes',()=>{
 const old=state();for(const c of [old.config,old.scenarios[0].config]){
  for(const k of ['priceBaseMonth','openingBalance','idecoAssetScope'])delete c.plan[k];
  delete c.ideco.annuityStartMonth;
  // Existing calendar logic remains authoritative for the old plan.
 }
 globalThis.localStorage=new Memory();const before=structuredClone(old);saveState(old);
 assert.equal(loadState().recoveryCompatibility,undefined);
 assert.deepEqual(old,before);
});

test('every integrated-state write entry protects new feature markers',()=>{
 for(const filename of ['storage.mjs','migration.mjs','expense-workflow.mjs','income-workflow.mjs']){
  const file=fs.readFileSync(new URL('./'+filename,import.meta.url),'utf8');
  assert.ok(file.includes('protectNewFeatureState'),filename);
  assert.ok(file.includes('setItem(STATE_KEY,'),filename);
 }
});

test('returned save/replace state matches persisted compatibility envelope',()=>{
 globalThis.localStorage=new Memory();const direct=saveState(state());
 assert.deepEqual(direct,loadState());
 const current=loadState(),replaced=replaceState(state(),current);
 assert.deepEqual(replaced,loadState());
});
