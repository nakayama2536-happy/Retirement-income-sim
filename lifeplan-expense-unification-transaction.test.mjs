import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareUnificationState,commitPreparedUnification,undoPreparedUnification} from './lifeplan-expense-unification-transaction.mjs';
const fixture=()=>({config:{plan:{startAge:70,endAge:99},cashflow:{detailSourceProfile:'public-v0.9',expenseCategories:[{key:'living',items:[{key:'food',periods:[{fromAge:70,toAge:95,amount:12}]}]}],periodOverrides:[]},budgets:[{fromAge:70,toAge:99,annualBudget:660}]},scenarios:[{id:'synthetic',config:{example:'unrelated'}}]});
const validate=x=>{if(!x.config||!Array.isArray(x.scenarios))throw Error('invalid');if(x.config.expenseUnificationArchive&&!x.config.recoveryCompatibility?.requiredFeatures?.includes('legacy-expense-unification-v1'))throw Error('missing-feature')};
const storage=raw=>{let value=raw,writes=0;return {getItem:()=>value,setItem:(_,v)=>{value=v;writes++},inject:v=>{value=v},get writes(){return writes}}};
const backup=async()=>({secured:true,receipt:'synthetic-only'});
const setup=()=>{const s=fixture(),raw=JSON.stringify(s),store=storage(raw),prepared=prepareUnificationState(s,{validate});assert.equal(prepared.status,'prepared');return {s,raw,store,prepared}};
test('prepare preserves original and all scenarios',()=>{const {s,prepared}=setup();assert.equal(s.config.cashflow.expenseCategories[0].items[0].periods[0].amount,12);assert.equal(prepared.candidate.config.cashflow.expenseCategories,undefined);assert.deepEqual(prepared.candidate.scenarios,s.scenarios)});
test('write disabled until explicitly enabled and backup secured',async()=>{const {raw,store,prepared}=setup();assert.equal((await commitPreparedUnification({store,key:'x',expectedRaw:raw,prepared,validate,writeBackup:backup})).reason,'WRITE_NOT_AUTHORIZED');assert.equal((await commitPreparedUnification({store,key:'x',expectedRaw:raw,prepared,validate,writeBackup:async()=>({secured:false}),allowWrite:true})).reason,'BACKUP_NOT_SECURED');assert.equal(store.writes,0)});
test('single write, readback, persisted undo',async()=>{const {s,raw,store,prepared}=setup();let savedBackup;const r=await commitPreparedUnification({store,key:'x',expectedRaw:raw,prepared,validate,writeBackup:async x=>{savedBackup=x;return backup()},allowWrite:true});assert.equal(r.status,'saved');assert.deepEqual(savedBackup,s);assert.equal(store.writes,1);const migrated=store.getItem('x');assert.equal(JSON.parse(migrated).config.cashflow.detailSourceProfile,'work-v0.9.7');assert.equal(undoPreparedUnification({store,key:'x',expectedRaw:migrated,validate,allowWrite:true}).status,'undone');assert.deepEqual(JSON.parse(store.getItem('x')),s)});
test('retry does not duplicate writes',async()=>{const {raw,store,prepared}=setup();await commitPreparedUnification({store,key:'x',expectedRaw:raw,prepared,validate,writeBackup:backup,allowWrite:true});assert.equal((await commitPreparedUnification({store,key:'x',expectedRaw:raw,prepared,validate,writeBackup:backup,allowWrite:true})).reason,'STALE_SOURCE');assert.equal(store.writes,1)});
test('stale preview prevents backup and write',async()=>{const {raw,store,prepared}=setup();store.inject(raw+' ');let n=0;assert.equal((await commitPreparedUnification({store,key:'x',expectedRaw:raw,prepared,validate,writeBackup:async()=>{n++;return backup()},allowWrite:true})).reason,'STALE_SOURCE');assert.equal(n,0);assert.equal(store.writes,0)});
test('altered candidate cannot be committed',async()=>{const {raw,store,prepared}=setup();prepared.candidate.config.plan.startAge=60;assert.equal((await commitPreparedUnification({store,key:'x',expectedRaw:raw,prepared,validate,writeBackup:backup,allowWrite:true})).reason,'CANDIDATE_CHANGED');assert.equal(store.writes,0)});
test('concurrent write during backup blocks commit',async()=>{const {raw,store,prepared}=setup();assert.equal((await commitPreparedUnification({store,key:'x',expectedRaw:raw,prepared,validate,writeBackup:async()=>{store.inject(raw+' ');return backup()},allowWrite:true})).reason,'STALE_AFTER_BACKUP');assert.equal(store.writes,0)});
test('storage failure does not destroy original',async()=>{const {raw,store,prepared}=setup();store.setItem=()=>{throw Error('quota')};assert.equal((await commitPreparedUnification({store,key:'x',expectedRaw:raw,prepared,validate,writeBackup:backup,allowWrite:true})).reason,'WRITE_FAILED');assert.equal(store.getItem('x'),raw)});
test('missing target validator blocks adoption',()=>{assert.equal(prepareUnificationState(fixture()).reason,'TARGET_VALIDATOR_MISSING')});
test('edit to migrated expense disables undo',async()=>{const {raw,store,prepared}=setup();await commitPreparedUnification({store,key:'x',expectedRaw:raw,prepared,validate,writeBackup:backup,allowWrite:true});const c=JSON.parse(store.getItem('x'));c.config.cashflow.periodOverrides[0].amount=100;store.inject(JSON.stringify(c));assert.equal(undoPreparedUnification({store,key:'x',expectedRaw:store.getItem('x'),validate,allowWrite:true}).reason,'MIGRATED_FIELDS_CHANGED')});
test('unrelated edit remains after targeted undo',async()=>{const {raw,store,prepared}=setup();await commitPreparedUnification({store,key:'x',expectedRaw:raw,prepared,validate,writeBackup:backup,allowWrite:true});const c=JSON.parse(store.getItem('x'));c.config.plan.initialAsset=501;store.inject(JSON.stringify(c));assert.equal(undoPreparedUnification({store,key:'x',expectedRaw:store.getItem('x'),validate,allowWrite:true}).status,'undone');assert.equal(JSON.parse(store.getItem('x')).config.plan.initialAsset,501)});
test('conflicting active standard profile prevents preparation',()=>{const s=fixture();s.config.expenseDetail={monthlyCategories:[{key:'x',items:[]}]};assert.equal(prepareUnificationState(s,{validate}).status,'blocked')});


test('saved comparison carrying an old expense source blocks baseline-only migration',async()=>{
 const s=fixture();
 s.scenarios[0].config={cashflow:{detailSourceProfile:'public-v0.9',expenseCategories:[{key:'living',items:[{key:'food',periods:[{fromAge:70,toAge:95,amount:7}]}]}]}};
 const before=structuredClone(s),raw=JSON.stringify(s),store=storage(raw);
 const prepared=prepareUnificationState(s,{validate});
 assert.equal(prepared.reason,'SAVED_SCENARIO_REQUIRES_SEPARATE_MIGRATION');
 assert.equal(prepared.scenarioIndex,0);
 assert.deepEqual(s,before);
 const result=await commitPreparedUnification({store,key:'x',expectedRaw:raw,prepared,validate,writeBackup:backup,allowWrite:true});
 assert.equal(result.reason,'UNVERIFIED_CANDIDATE');
 assert.equal(store.writes,0);
});
test('saved comparison with an explicit old-profile selector blocks even without item list',()=>{
 const s=fixture();s.scenarios[0].config={cashflow:{detailSourceProfile:'public-v0.9'}};
 assert.equal(prepareUnificationState(s,{validate}).reason,'SAVED_SCENARIO_REQUIRES_SEPARATE_MIGRATION');
});
test('saved comparison with an old migration candidate cannot silently coexist',()=>{
 const s=fixture();s.scenarios[0].config={expenseUnificationCandidate:{adopted:false}};
 assert.equal(prepareUnificationState(s,{validate}).reason,'SAVED_SCENARIO_REQUIRES_SEPARATE_MIGRATION');
});
test('comparison scenario unrelated to legacy expenses remains byte-for-byte unchanged',async()=>{
 const {s,raw,store,prepared}=setup();
 assert.equal(prepared.status,'prepared');
 assert.deepEqual(prepared.candidate.scenarios,s.scenarios);
 assert.equal((await commitPreparedUnification({store,key:'x',expectedRaw:raw,prepared,validate,writeBackup:backup,allowWrite:true})).status,'saved');
 assert.deepEqual(JSON.parse(store.getItem('x')).scenarios,s.scenarios);
});
test('pre-existing work-formatted expense periods stop conversion and preserve the source',()=>{
 const s=fixture(),raw=JSON.stringify(s);
 s.config.cashflow.periodOverrides=[{kind:'expense',key:'food',fromAge:70,toAge:99,unit:'monthly',amount:1}];
 const r=prepareUnificationState(s,{validate});
 assert.equal(r.status,'blocked');
 assert.ok(r.codes.includes('EXISTING_EXPENSE_OVERRIDES'),JSON.stringify(r.codes));
 assert.notEqual(JSON.stringify(s),raw);
});
test('travel cost and tax/social expense identities stop without guessing mapping',()=>{
 for(const mode of ['travel','tax']){
  const s=fixture();
  if(mode==='travel')s.config.cashflow.travel=[{fromAge:70,toAge:99,annualAmount:10}];
  else s.config.cashflow.expenseCategories.push({key:'taxSocial',items:[{key:'tax',periods:[{fromAge:70,toAge:99,amount:3}]}]});
  const before=JSON.stringify(s),r=prepareUnificationState(s,{validate});
  assert.equal(r.status,'blocked');
  assert.equal(JSON.stringify(s),before);
 }
});
