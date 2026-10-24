// Real application modules and existing fictional fixture. No Firebase or private data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {detailProposal,verifyDetailProposal,changedPaths,undoDetail} from '../../detail-settings.mjs';
import {runRetirementPlan} from '../../calc.mjs';
import {commitPlanState} from '../../state.mjs';
import {STATE_KEY,loadState,saveState,migrateConfig} from '../../storage.mjs';
import {createFullBackup,restoreFullBackup} from '../../full-backup.mjs';
import {encryptSnapshot,decryptSnapshot} from '../../sync-crypto.mjs';
const raw=JSON.parse(fs.readFileSync(new URL('../browser-test/synthetic-full.json',import.meta.url),'utf8'));
class MemoryStorage{
 data=new Map();fail=false;writes=0;
 getItem(k){return this.data.get(k)??null;}
 setItem(k,v){if(this.fail)throw Error('synthetic quota failure');this.data.set(k,String(v));this.writes++;}
 removeItem(k){this.data.delete(k);}
}
function setup(){
 const storage=new MemoryStorage();globalThis.localStorage=storage;
 const seed=structuredClone(raw);
 seed.config=migrateConfig(seed.config);
 seed.scenarios=seed.scenarios.map(s=>({...s,config:migrateConfig(s.config)}));
 seed.futureTestEnvelope={keep:[0,null,'fictional']};
 seed.config.retirement ??= {amount:250,serviceYears:20,receiveDate:'2042-06-15',companyStartDate:'2022-06-15',retirementDeclarationFiled:true};
 seed.config.retirement.unknownTestField={keep:true};
 storage.setItem(STATE_KEY,JSON.stringify(seed));
 return {storage,state:loadState()};
}
const draft=(state,conceptComment)=>({amount:state.config.retirement.amount,serviceYears:state.config.retirement.serviceYears,
 receiveDate:state.config.retirement.receiveDate,companyStartDate:state.config.retirement.companyStartDate,
 postReceipt:false,eventTarget:'',receipt:'',conceptComment});
const propose=(s,c)=>detailProposal(s,'retirement',draft(s,c));
function commit(s,p){return commitPlanState(s,{...s,config:verifyDetailProposal(s,p)},saveState,{preserveScenarioRoles:true});}
const note='架空の構想メモ\n使途は検討中です。\n<text> & "sample"';

test('preview changes only the comment and preserves all numerical results',()=>{
 const {storage,state}=setup(),before=structuredClone(state),writes=storage.writes;
 const p=propose(state,note);
 assert.deepEqual(state,before);assert.equal(storage.writes,writes);
 assert.equal(p.candidate.retirement.conceptComment,note);
 assert.deepEqual(changedPaths(state.config,p.candidate).map(x=>x.path),[['retirement','conceptComment']]);
 assert.equal(p.before,p.after);
 assert.deepEqual(runRetirementPlan(p.candidate,{includeMonthlyDetails:true}),runRetirementPlan(state.config,{includeMonthlyDetails:true}));
});
test('commit saves, reload retains, existing scenarios and unknown fields survive',()=>{
 const {state}=setup();commit(state,propose(state,note));const reloaded=loadState();
 assert.equal(reloaded.config.retirement.conceptComment,note);
 assert.deepEqual(reloaded.scenarios,state.scenarios);
 assert.deepEqual(reloaded.futureTestEnvelope,state.futureTestEnvelope);
 assert.deepEqual(reloaded.config.retirement.unknownTestField,{keep:true});
});
test('undo removes only the added comment and preserves a later unrelated edit',()=>{
 const {state}=setup(),p=propose(state,note),patch=changedPaths(state.config,p.candidate);
 commit(state,p);const current=loadState();current.config.management.testLaterFlag=true;saveState(current,loadState());
 const loaded=loadState(),undone=undoDetail(loaded.config,patch);
 commitPlanState(loaded,{...loaded,config:undone},saveState,{preserveScenarioRoles:true});
 const result=loadState();assert(!Object.hasOwn(result.config.retirement,'conceptComment'));
 assert.equal(result.config.management.testLaterFlag,true);
 assert.deepEqual(result.config.retirement,state.config.retirement);
});
test('undo refuses to overwrite a later change to the same comment',()=>{
 const {state}=setup(),p=propose(state,note),patch=changedPaths(state.config,p.candidate);
 const later=structuredClone(p.candidate);later.retirement.conceptComment='later fictional memo';
 assert.throws(()=>undoDetail(later,patch),/取消できません/);
 assert.equal(later.retirement.conceptComment,'later fictional memo');
});
test('changed preview basis is rejected without saving',()=>{
 const {state,storage}=setup(),p=propose(state,note),later=structuredClone(state);
 later.config.retirement.amount+=1;const bytes=storage.getItem(STATE_KEY);
 assert.throws(()=>verifyDetailProposal(later,p),/再試算/);assert.equal(storage.getItem(STATE_KEY),bytes);
});
test('storage failure keeps the previously adopted state and candidate intact',()=>{
 const {state,storage}=setup(),p=propose(state,note),bytes=storage.getItem(STATE_KEY);
 storage.fail=true;assert.throws(()=>commit(state,p),/quota/);storage.fail=false;
 assert.equal(storage.getItem(STATE_KEY),bytes);assert.equal(p.candidate.retirement.conceptComment,note);
});
test('blank legacy field does not add metadata; explicit blank clears an existing comment',()=>{
 const {state}=setup(),p=propose(state,'');assert.equal(p.changed,false);
 commit(state,propose(state,note));const saved=loadState();commit(saved,propose(saved,''));
 assert.equal(loadState().config.retirement.conceptComment,'');
});
test('limit exceeded is rejected without truncation or saving',()=>{
 const {state,storage}=setup(),bytes=storage.getItem(STATE_KEY);
 assert.throws(()=>propose(state,'x'.repeat(2001)),/2,000/);
 assert.equal(storage.getItem(STATE_KEY),bytes);
 assert.equal(propose(state,'x'.repeat(2000)).candidate.retirement.conceptComment.length,2000);
});
test('full backup export and restore preserve comment, scenarios and unknown envelope',()=>{
 const {state}=setup();commit(state,propose(state,note));const saved=loadState();
 const backup=createFullBackup(saved,{now:new Date('2026-01-02T00:00:00Z')});
 assert.equal(backup.config.retirement.conceptComment,note);
 const changed=structuredClone(saved);changed.config.retirement.conceptComment='temporary';saveState(changed,saved);
 restoreFullBackup(loadState(),JSON.parse(JSON.stringify(backup)));
 const restored=loadState();assert.equal(restored.config.retirement.conceptComment,note);
 assert.deepEqual(restored.scenarios,saved.scenarios);assert.deepEqual(restored.futureTestEnvelope,saved.futureTestEnvelope);
});
test('existing encryption roundtrip retains comment without cloud access',async()=>{
 const {state}=setup();commit(state,propose(state,note));const saved=loadState();
 const pass='fictional-stage2-only-passphrase';const encrypted=await encryptSnapshot(saved,pass);
 assert.deepEqual(await decryptSnapshot(encrypted.payload,pass,encrypted.digest),saved);
 assert(!JSON.stringify(encrypted.payload).includes(note));
});
