// Fictional fixtures only. No private backups belong in this suite/bundle.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {STATE_KEY,loadState,saveState,migrateConfig} from './storage.mjs';
import {SOURCES,inspectMigration,migrateSelected,validateSavedState} from './migration.mjs';
import {mountMigration} from './migration-ui.mjs';

class Storage {
  data=new Map();writes=0;fail=false;
  getItem(key){return this.data.get(key)??null;}
  setItem(key,value){if(this.fail)throw new Error('QuotaExceededError');this.writes++;this.data.set(key,String(value));}
  removeItem(){throw new Error('Deleting source keys is forbidden');}
}
function fixture(){
  const config=migrateConfig({meta:{label:'Fictional migration fixture'},people:{primary:{birthDate:'1980-01-01'},spouse:{birthDate:'1981-01-01'}},plan:{startAge:64,endAge:72,startDate:'2044-01-01',initialAsset:1234,afterTaxReturn:0,inflation:0,initialAssetIncludesIdeco:false},income:{pensions:{primary:{startDate:'2050-01-01',annualAtStart:100},spouse:{startDate:'2051-01-01',annualAtStart:50}}},budgets:[{fromAge:64,toAge:72,annualBudget:36}],unemployment:{baselineMode:'none'},actuals:{65:{endAsset:1230,note:'actual',futureField:{a:1}}},reviews:{65:{note:'review',checks:['a']}},pendingDecisions:['keep'],futureConfig:{history:[{id:'h1'}]},cashflow:{futureField:true}});
  const scenarios=[{id:'case-a',name:'Fictional A',role:'baseline',selected:false,config:structuredClone(config),extra:{history:[1]}},{id:'case-b',name:'Fictional B',role:'scenario',selected:true,config:structuredClone(config),futureScenario:2}];
  scenarios[1].config.plan.initialAsset=2345;
  return {config,scenarios};
}
function seed(id='public-v0.9',state=fixture(),{config=true,scenarios=true}={}){
  const storage=new Storage(),source=SOURCES.find(s=>s.id===id);
  if(config)storage.setItem(source.configKey,JSON.stringify(state.config));
  if(scenarios)storage.setItem(source.scenarioKey,JSON.stringify(state.scenarios));
  globalThis.localStorage=storage;return {storage,state,source};
}
test('public v0.9 startup reads only; exact state is saved in one write after selection',()=>{
  const {storage,state}=seed(),original=new Map(storage.data),writes=storage.writes;
  const scan=inspectMigration();assert.equal(scan.candidates.length,1);assert.equal(loadState().config,null);assert.equal(storage.writes,writes);
  const result=migrateSelected(scan,'public-v0.9');assert.deepEqual(result.state,state);assert.equal(storage.writes,writes+1);
  assert.deepEqual(JSON.parse(storage.getItem(STATE_KEY)),state);assert.deepEqual(loadState(),state);
  for(const [key,value] of original)assert.equal(storage.getItem(key),value);
});
test('coexisting families and versions remain distinct and require explicit selection',()=>{
  const {storage,state}=seed();
  for(const id of ['work-v0.9','public-v0.8']){const source=SOURCES.find(s=>s.id===id),other=fixture();other.config.plan.initialAsset=777;storage.setItem(source.configKey,JSON.stringify(other.config));storage.setItem(source.scenarioKey,JSON.stringify([]));}
  const scan=inspectMigration();assert.equal(scan.candidates.length,3);assert.throws(()=>migrateSelected(scan,''));assert.equal(storage.getItem(STATE_KEY),null);
  migrateSelected(scan,'public-v0.9');assert.deepEqual(loadState(),state);
});
test('configuration and scenarios from different families are never paired',()=>{
  const {storage,state}=seed('public-v0.9',fixture(),{scenarios:false});
  storage.setItem('lifeplan-sim-scenarios-v0.9',JSON.stringify(state.scenarios));
  storage.setItem('retirement-sim-scenarios-v0.8',JSON.stringify(state.scenarios));
  const scan=inspectMigration();assert.equal(scan.candidates.filter(c=>c.valid).length,1);
  assert.equal(scan.candidates.find(c=>c.id==='public-v0.9').state.scenarios.length,0);
  assert.throws(()=>migrateSelected(scan,'public-v0.9'),/確認/);
  migrateSelected(scan,'public-v0.9',{acceptConfigOnly:true});assert.deepEqual(loadState().scenarios,[]);
});
test('scenarios-only is visible but cannot become the current configuration',()=>{
  const {storage}=seed('public-v0.9',fixture(),{config:false}),scan=inspectMigration(),writes=storage.writes;
  assert.equal(scan.candidates[0].valid,false);assert.throws(()=>migrateSelected(scan,'public-v0.9'),/現在設定/);assert.equal(storage.writes,writes);
});
for(const key of ['configKey','scenarioKey'])test(`broken ${key} blocks the entire source without fallback`,()=>{
  const {storage,source}=seed();storage.setItem(source[key],'{broken');
  const older=SOURCES.find(s=>s.id==='public-v0.8');storage.setItem(older.configKey,JSON.stringify(fixture().config));
  const scan=inspectMigration(),writes=storage.writes;assert.equal(scan.candidates.find(c=>c.id==='public-v0.9').valid,false);
  assert.throws(()=>migrateSelected(scan,'public-v0.9'));assert.equal(storage.writes,writes);assert.equal(loadState().config,null);
});
for(const bad of ['null','{}','[]','"text"'])test(`invalid current configuration ${bad} is rejected`,()=>{
  const {storage,source}=seed();storage.setItem(source.configKey,bad);assert.equal(inspectMigration().candidates[0].valid,false);
});
test('one invalid scenario rejects the entire source',()=>{
  const {storage,source,state}=seed();state.scenarios[1].config={};storage.setItem(source.scenarioKey,JSON.stringify(state.scenarios));
  assert.throws(()=>migrateSelected(inspectMigration(),'public-v0.9'));assert.equal(storage.getItem(STATE_KEY),null);
});
test('invalid actuals, duplicate IDs, duplicate baselines are rejected without edits',()=>{
  for(const mutate of [s=>s.config.actuals={999:{endAsset:1}},s=>s.scenarios[1].id=s.scenarios[0].id,s=>s.scenarios[1].role='baseline']){
    const state=fixture();mutate(state);const original=structuredClone(state);assert.throws(()=>validateSavedState(state));assert.deepEqual(state,original);
  }
});
test('existing integrated state and its unknown envelope fields remain untouched',()=>{
  const {storage}=seed(),active={...fixture(),futureEnvelope:{sequence:7}};active.config.plan.initialAsset=4321;
  storage.setItem(STATE_KEY,JSON.stringify(active));const before=storage.getItem(STATE_KEY),writes=storage.writes;
  const scan=inspectMigration();assert.equal(scan.integrated.status,'valid');assert.throws(()=>migrateSelected(scan,'public-v0.9'),/保持/);
  assert.equal(storage.getItem(STATE_KEY),before);assert.equal(storage.writes,writes);assert.deepEqual(loadState(),active);
  const next=loadState();saveState({config:next.config,scenarios:next.scenarios},{config:next.config,scenarios:next.scenarios});assert.deepEqual(loadState().futureEnvelope,active.futureEnvelope);
});
for(const raw of ['broken','{}',JSON.stringify({config:null,scenarios:[{config:{}}]})])test(`corrupt integrated state cannot be replaced by legacy: ${raw}`,()=>{
  const {storage}=seed();storage.setItem(STATE_KEY,raw);const scan=inspectMigration(),writes=storage.writes;
  assert.equal(scan.integrated.status,'invalid');assert.throws(()=>migrateSelected(scan,'public-v0.9'),/破損/);assert.equal(storage.writes,writes);assert.equal(storage.getItem(STATE_KEY),raw);
});
test('explicitly empty integrated state does not reactivate legacy data',()=>{
  const {storage}=seed();storage.setItem(STATE_KEY,JSON.stringify({config:null,scenarios:[]}));
  assert.throws(()=>migrateSelected(inspectMigration(),'public-v0.9'),/保持/);assert.equal(loadState().config,null);
});
test('save failure retains source, candidate and current state; retry succeeds',()=>{
  const {storage,state}=seed(),scan=inspectMigration(),before=structuredClone(scan),original=new Map(storage.data);
  storage.fail=true;assert.throws(()=>migrateSelected(scan,'public-v0.9'),/Quota/);assert.deepEqual(scan,before);assert.deepEqual(storage.data,original);
  storage.fail=false;migrateSelected(scan,'public-v0.9');assert.deepEqual(loadState(),state);
});
test('reload and repeated migration never add scenarios, history, or writes',()=>{
  const {storage,state}=seed(),scan=inspectMigration();migrateSelected(scan,'public-v0.9');const writes=storage.writes;
  assert.throws(()=>migrateSelected(scan,'public-v0.9'),/更新/);
  const result=migrateSelected(inspectMigration(),'public-v0.9');assert.equal(result.alreadySaved,true);assert.equal(storage.writes,writes);assert.deepEqual(loadState(),state);
});
for(const changedKey of [STATE_KEY,'retirement-sim-config-v0.9','retirement-sim-scenarios-v0.9','lifeplan-sim-config-v0.9'])test(`other-screen update of ${changedKey} blocks stale save`,()=>{
  const {storage}=seed(),scan=inspectMigration();storage.setItem(changedKey,JSON.stringify(changedKey===STATE_KEY?fixture():{}));
  const before=new Map(storage.data);assert.throws(()=>migrateSelected(scan,'public-v0.9'),/更新/);assert.deepEqual(storage.data,before);
});
test('mutating a displayed candidate cannot inject changes into the saved source',()=>{
  const {state}=seed(),scan=inspectMigration();scan.candidates[0].state.config.plan.initialAsset=9999;
  migrateSelected(scan,'public-v0.9');assert.deepEqual(loadState(),state);
});
test('migration never invents baseline roles, IDs, history or salary-life mode',()=>{
  const state=fixture();delete state.scenarios[0].role;delete state.scenarios[1].role;delete state.scenarios[1].id;
  seed('public-v0.9',state);migrateSelected(inspectMigration(),'public-v0.9');assert.deepEqual(JSON.parse(localStorage.getItem(STATE_KEY)),state);assert.equal(loadState().config.cashflow.salaryLife,undefined);
});
test('older config remains byte-identical; normalization only adds runtime defaults',()=>{
  const state=fixture();delete state.config.cashflow;state.config.meta.schemaVersion='0.8';
  const {storage,source}=seed('public-v0.8',state),raw=storage.getItem(source.configKey);
  migrateSelected(inspectMigration(),'public-v0.8');assert.equal(storage.getItem(source.configKey),raw);
  assert.deepEqual(JSON.parse(storage.getItem(STATE_KEY)),state);assert.equal(loadState().config.meta.schemaVersion,'0.9');
});

class Element {
  value='';textContent='';hidden=false;disabled=false;checked=false;listeners={};children=[];
  addEventListener(type,fn){this.listeners[type]=fn;}
  append(node){this.children.push(node);}
  replaceChildren(){this.children=[];}
  emit(type){if(type==='click'&&this.disabled)return;this.listeners[type]?.({target:this});}
}
function ui(options={}){
  const {storage,state}=seed('public-v0.9',fixture(),options);
  const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8'),nodes=new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(([,id])=>[id,new Element()]));
  const document={getElementById:id=>nodes.get(id),createElement:()=>new Element()},committed=[];
  const api=mountMigration({document,storage,onCommit:s=>committed.push(s)}),node=id=>nodes.get('migration'+id);
  const choose=()=>{node('Choice').value='public-v0.9';node('Choice').emit('change');};
  return {storage,state,api,node,committed,choose};
}
test('UI starts unselected and writes only when the enabled adoption button is clicked',()=>{
  const t=ui(),writes=t.storage.writes;assert.equal(t.node('Choice').value,'');assert.equal(t.node('Apply').disabled,true);assert.equal(t.storage.writes,writes);
  t.choose();assert.equal(t.node('Apply').disabled,false);t.node('Apply').emit('click');t.node('Apply').emit('click');
  assert.equal(t.storage.writes,writes+1);assert.deepEqual(t.committed,[t.state]);assert.match(t.node('Status').textContent,/保存しました/);
});
test('UI config-only requires an explicit acknowledgment',()=>{
  const t=ui({scenarios:false});t.choose();assert.equal(t.node('Apply').disabled,true);assert.equal(t.node('ConfigOnlyRow').hidden,false);
  t.node('ConfigOnly').checked=true;t.node('ConfigOnly').emit('change');t.node('Apply').emit('click');assert.deepEqual(t.committed[0].scenarios,[]);
});
test('UI failure retains choice, does not announce success, and supports retry',()=>{
  const t=ui();t.choose();t.storage.fail=true;t.node('Apply').emit('click');assert.equal(t.node('Choice').value,'public-v0.9');assert.equal(t.committed.length,0);assert.match(t.node('Status').textContent,/保存できません/);
  t.storage.fail=false;t.node('Apply').emit('click');assert.equal(t.committed.length,1);
});
test('UI storage event and clear event disable the stale selection',()=>{
  for(const key of ['retirement-sim-config-v0.9',null]){const t=ui();t.choose();t.api.invalidate({key});assert.equal(t.node('Apply').disabled,true);t.node('Apply').emit('click');assert.equal(t.committed.length,0);t.node('Rescan').emit('click');assert.equal(t.node('Choice').value,'');}
});
test('UI never allows adopting a legacy candidate after integrated state appears',()=>{
  const t=ui();t.storage.setItem(STATE_KEY,JSON.stringify(fixture()));t.node('Rescan').emit('click');t.choose();assert.equal(t.node('Apply').disabled,true);assert.match(t.node('Status').textContent,/保持/);
});
