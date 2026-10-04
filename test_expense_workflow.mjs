import test from 'node:test';
import assert from 'node:assert/strict';
import {createExpenseDraft,previewExpenseChanges} from './expense-preview.mjs';
import {inspectCashflowSources} from './cashflow-sources.mjs';
import {applyExpensePreview,undoExpenseApply,loadExpenseState,expenseUndoStatus} from './expense-workflow.mjs';
import {migrateConfig,STATE_KEY} from './storage.mjs';
const WORK='work-v0.9.7',rent='expense/key:housing/key:rent';
class Memory{
 values=new Map();writes=0;fail=false;onGet=null;
 getItem(k){if(this.onGet)this.onGet(k);return this.values.get(k)??null;}
 setItem(k,v){if(this.fail)throw new Error('QuotaExceeded');this.writes++;this.values.set(k,String(v));}
 removeItem(){throw new Error('Source keys must not be deleted');}
}
function setup(){
 const c=migrateConfig({people:{primary:{birthDate:'1980-08-27'},spouse:{birthDate:'1981-05-01'}},plan:{startAge:64,endAge:67,startDate:'2044-08-27',initialAsset:1234,initialAssetIncludesIdeco:false,afterTaxReturn:0,inflation:3},employment:{primary:{mainRetirement:{baseDate:'2045-08-27'},sideWork:{monthlyGross:0}},spouse:{sideWork:{monthlyGross:0}}},income:{pensions:{primary:{annualAtStart:0},spouse:{annualAtStart:0}}},budgets:[{fromAge:65,toAge:66,annualBudget:120,travelReference:12,future:{keep:1}},{fromAge:67,toAge:90,annualBudget:100,travelReference:10}],unemployment:{baselineMode:'none'},events:[]});
 c.cashflow={periodOverrides:[]};c.expenseDetail={monthlyCategories:[{key:'housing',items:[{key:'rent',amount:5,note:'keep'},{key:'other',amount:1}]}],travelAnnualBase:12};c.future={x:[1,2]};
 const state={config:c,scenarios:[{id:'a',name:'A',role:'scenario',selected:true,config:structuredClone(c)},{id:'b',name:'B',role:'reference',selected:false,config:structuredClone(c)}],futureState:{keep:true}};
 const storage=new Memory();storage.setItem(STATE_KEY,JSON.stringify(state));storage.values.set('retirement-sim-config-v0.9','old-config');storage.values.set('retirement-sim-scenarios-v0.9','old-scenarios');return {state,storage};
}
function proposal(state,{kind='detail',itemId=rent,amount=6}={}){
 const d=createExpenseDraft(state,{sourceProfile:WORK,kind}),r=inspectCashflowSources(state.config,{sourceProfile:WORK}).rules.find(r=>r.profile===WORK&&r.itemId===itemId);
 d.edits=[{itemId,ruleRef:r.ruleRef,amount,unit:r.unit,priceBasis:r.priceBasis}];return previewExpenseChanges(state,d);
}
const value=s=>s.config.expenseDetail.monthlyCategories[0].items.find(i=>i.key==='rent').amount;
const saveRaw=(storage,state)=>storage.setItem(STATE_KEY,JSON.stringify(state));
test('load is read-only and does not normalize or adopt a mode',()=>{
 const {state,storage}=setup();delete state.config.certainty;saveRaw(storage,state);const bytes=storage.getItem(STATE_KEY),writes=storage.writes;assert.deepEqual(loadExpenseState(storage),state);assert.equal(storage.getItem(STATE_KEY),bytes);assert.equal(storage.writes,writes);assert.equal(loadExpenseState(storage).config.plan.calendarMode,undefined);
});
for(const kind of ['detail','budget'])test(`${kind}: atomic save, reload and field-only undo`,async()=>{
 const {state,storage}=setup(),p=proposal(state,kind==='detail'?{}:{kind,itemId:'management-budget',amount:144}),initial=structuredClone(state),writes=storage.writes;
 const n=await applyExpensePreview(state,p,{storage,now:'2026-09-28T14:55:00Z'});assert.equal(n.saved,true);assert.equal(n.changed,true);assert.equal(storage.writes,writes+1);assert.deepEqual(n.state.scenarios,state.scenarios);assert.equal(n.state.scenarios.length,2);assert.deepEqual(n.state.futureState,state.futureState);assert.deepEqual(state,initial);assert.equal(expenseUndoStatus(loadExpenseState(storage)).available,true);
 const u=await undoExpenseApply(loadExpenseState(storage),{storage});const clean=structuredClone(u.state);delete clean.config.expenseWorkflow;assert.deepEqual(clean,initial);assert.equal(expenseUndoStatus(u.state).available,false);assert.equal(storage.values.get('retirement-sim-config-v0.9'),'old-config');assert.equal(storage.values.get('retirement-sim-scenarios-v0.9'),'old-scenarios');
});
test('save failure keeps live state and reusable input/preview',async()=>{
 const {state,storage}=setup(),p=proposal(state),before=structuredClone(p),raw=storage.getItem(STATE_KEY);storage.fail=true;await assert.rejects(applyExpensePreview(state,p,{storage}),/QuotaExceeded/);assert.equal(storage.getItem(STATE_KEY),raw);assert.deepEqual(p,before);assert.equal(value(state),5);storage.fail=false;assert.equal((await applyExpensePreview(state,p,{storage})).saved,true);
});
test('undo failure keeps adoption and undo history intact',async()=>{
 const {state,storage}=setup();const n=await applyExpensePreview(state,proposal(state),{storage}),raw=storage.getItem(STATE_KEY);storage.fail=true;await assert.rejects(undoExpenseApply(n.state,{storage}),/QuotaExceeded/);assert.equal(storage.getItem(STATE_KEY),raw);assert.equal(expenseUndoStatus(n.state).available,true);
});
test('retry with old caller state is idempotent after reload',async()=>{
 const {state,storage}=setup(),p=proposal(state);await applyExpensePreview(state,p,{storage});const writes=storage.writes;const n=await applyExpensePreview(state,p,{storage});assert.equal(n.alreadyApplied,true);assert.equal(n.changed,false);assert.equal(storage.writes,writes);assert.equal(n.state.config.expenseWorkflow.history.length,1);
});
test('concurrent submissions produce only one commit',async()=>{
 const {state,storage}=setup(),p=proposal(state),writes=storage.writes;const all=await Promise.allSettled([applyExpensePreview(state,p,{storage}),applyExpensePreview(state,p,{storage})]);assert.ok(all.some(x=>x.status==='fulfilled'));assert.equal(storage.writes,writes+1);assert.equal(loadExpenseState(storage).config.expenseWorkflow.history.length,1);
});
test('same values do not add operation history or write',async()=>{
 const {state,storage}=setup(),writes=storage.writes,n=await applyExpensePreview(state,proposal(state,{amount:5}),{storage});assert.equal(n.changed,false);assert.equal(n.saved,false);assert.equal(storage.writes,writes);assert.equal(n.state.config.expenseWorkflow,undefined);
});
for(const field of ['config','scenario','actual','topUnknown'])test(`intervening ${field} change rejects stale apply`,async()=>{
 const {state,storage}=setup(),p=proposal(state),live=structuredClone(state);if(field==='config')live.config.plan.inflation=4;else if(field==='scenario')live.scenarios[0].name='changed';else if(field==='actual')live.config.actuals={65:{endAsset:1000}};else live.futureState.keep=false;saveRaw(storage,live);const raw=storage.getItem(STATE_KEY);await assert.rejects(applyExpensePreview(state,p,{storage}),/更新/);assert.equal(storage.getItem(STATE_KEY),raw);
});
test('intervening update after previous apply prevents stale retry',async()=>{
 const {state,storage}=setup(),p=proposal(state),n=await applyExpensePreview(state,p,{storage});n.state.config.future.new=1;saveRaw(storage,n.state);await assert.rejects(applyExpensePreview(state,p,{storage}),/更新/);
});
test('change at final storage check is detected',async()=>{
 const {state,storage}=setup(),p=proposal(state),other=structuredClone(state);other.config.future.x=[9];let reads=0;storage.onGet=()=>{if(++reads===2)storage.values.set(STATE_KEY,JSON.stringify(other));};await assert.rejects(applyExpensePreview(state,p,{storage}),/保存直前/);storage.onGet=null;assert.deepEqual(loadExpenseState(storage),other);
});
test('tampered candidate is rejected before saving',async()=>{
 const {state,storage}=setup(),p=proposal(state),raw=storage.getItem(STATE_KEY);p.candidate.config.plan.initialAsset=99999;await assert.rejects(applyExpensePreview(state,p,{storage}),/再試算/);assert.equal(storage.getItem(STATE_KEY),raw);
});
test('duplicate comparison IDs prevent whole-state save',async()=>{
 const {state,storage}=setup();state.scenarios[1].id='a';saveRaw(storage,state);const p=proposal(state),raw=storage.getItem(STATE_KEY);await assert.rejects(applyExpensePreview(state,p,{storage}),/IDが重複/);assert.equal(storage.getItem(STATE_KEY),raw);
});
test('invalid scenario plan prevents save without changing current config',async()=>{
 const {state,storage}=setup();state.scenarios[1].config.budgets=[];saveRaw(storage,state);const raw=storage.getItem(STATE_KEY);await assert.rejects(applyExpensePreview(state,proposal(state),{storage}),/管理予算/);assert.equal(storage.getItem(STATE_KEY),raw);
});
test('missing or corrupt integrated data never falls back to old keys',async()=>{
 const {state,storage}=setup(),p=proposal(state);storage.values.delete(STATE_KEY);await assert.rejects(applyExpensePreview(state,p,{storage}),/引継ぎ/);storage.values.set(STATE_KEY,'{bad');await assert.rejects(applyExpensePreview(state,p,{storage}));assert.equal(storage.values.get('retirement-sim-config-v0.9'),'old-config');
});
test('undo preserves later unrelated fields, actuals, review and scenarios',async()=>{
 const {state,storage}=setup(),n=await applyExpensePreview(state,proposal(state),{storage});const later=n.state;later.config.actuals={65:{endAsset:1000}};later.config.reviews={65:{note:'later'}};later.config.plan.inflation=4;later.config.expenseDetail.monthlyCategories[0].items[0].note='later memo';later.scenarios[0].selected=false;later.futureState.new=[1];saveRaw(storage,later);
 const u=await undoExpenseApply(later,{storage}),expected=structuredClone(later);expected.config.expenseDetail.monthlyCategories[0].items[0].amount=5;delete expected.config.expenseWorkflow;const actual=structuredClone(u.state);delete actual.config.expenseWorkflow;assert.deepEqual(actual,expected);
});
test('undo resolves item after array reorder, not old position',async()=>{
 const {state,storage}=setup(),n=await applyExpensePreview(state,proposal(state),{storage});n.state.config.expenseDetail.monthlyCategories[0].items.reverse();saveRaw(storage,n.state);const u=await undoExpenseApply(n.state,{storage});assert.equal(u.state.config.expenseDetail.monthlyCategories[0].items[0].key,'other');assert.equal(u.state.config.expenseDetail.monthlyCategories[0].items[0].amount,1);assert.equal(value(u.state),5);
});
test('budget undo resolves period after row reorder and retains metadata',async()=>{
 const {state,storage}=setup(),p=proposal(state,{kind:'budget',itemId:'management-budget',amount:144}),n=await applyExpensePreview(state,p,{storage});n.state.config.budgets.reverse();n.state.config.budgets[1].future.later=2;saveRaw(storage,n.state);const u=await undoExpenseApply(n.state,{storage});assert.equal(u.state.config.budgets[1].annualBudget,120);assert.equal(u.state.config.budgets[1].future.later,2);
});
test('later edit to same amount stops undo',async()=>{
 const {state,storage}=setup(),n=await applyExpensePreview(state,proposal(state),{storage});n.state.config.expenseDetail.monthlyCategories[0].items[0].amount=7;saveRaw(storage,n.state);assert.equal(expenseUndoStatus(n.state).available,false);await assert.rejects(undoExpenseApply(n.state,{storage}),/別の操作/);assert.equal(value(loadExpenseState(storage)),7);
});
test('changed period stops undo instead of restoring into another period',async()=>{
 const {state,storage}=setup(),n=await applyExpensePreview(state,proposal(state,{kind:'budget',itemId:'management-budget',amount:144}),{storage});n.state.config.budgets[0].toAge=65;n.state.config.budgets[1].fromAge=66;saveRaw(storage,n.state);await assert.rejects(undoExpenseApply(n.state,{storage}),/期間/);
});
test('deleted target or duplicate identity stops undo',async()=>{
 for(const action of ['delete','duplicate']){const {state,storage}=setup(),n=await applyExpensePreview(state,proposal(state),{storage});const items=n.state.config.expenseDetail.monthlyCategories[0].items;if(action==='delete')items.shift();else items.push(structuredClone(items[0]));saveRaw(storage,n.state);assert.equal(expenseUndoStatus(n.state).available,false);await assert.rejects(undoExpenseApply(n.state,{storage}));}
});
test('numeric string is restored exactly',async()=>{
 const {state,storage}=setup();state.config.expenseDetail.monthlyCategories[0].items[0].amount='5';saveRaw(storage,state);const n=await applyExpensePreview(state,proposal(state),{storage});const u=await undoExpenseApply(n.state,{storage});assert.equal(value(u.state),'5');
});
test('multiple amount changes roll back together with one write',async()=>{
 const {state,storage}=setup(),p=proposal(state),d=structuredClone(p.draft),v=inspectCashflowSources(state.config,{sourceProfile:WORK}),r=v.rules.find(r=>r.profile===WORK&&r.itemId==='travel-plan');d.edits.push({itemId:r.itemId,ruleRef:r.ruleRef,amount:24,unit:r.unit,priceBasis:r.priceBasis});const n=await applyExpensePreview(state,previewExpenseChanges(state,d),{storage}),writes=storage.writes,u=await undoExpenseApply(n.state,{storage});assert.equal(storage.writes,writes+1);assert.equal(value(u.state),5);assert.equal(u.state.config.expenseDetail.travelAnnualBase,12);
});
test('second undo and reuse of an undone preview cannot reapply',async()=>{
 const {state,storage}=setup(),p=proposal(state),n=await applyExpensePreview(state,p,{storage}),u=await undoExpenseApply(n.state,{storage}),writes=storage.writes;await assert.rejects(undoExpenseApply(u.state,{storage}),/反映記録/);await assert.rejects(applyExpensePreview(u.state,p,{storage}),/古い試算/);assert.equal(storage.writes,writes);
});
test('workflow extension fields survive apply and undo',async()=>{
 const {state,storage}=setup();state.config.expenseWorkflow={history:[],lastApply:null,future:{keep:[1]}};saveRaw(storage,state);const n=await applyExpensePreview(state,proposal(state),{storage}),u=await undoExpenseApply(n.state,{storage});assert.deepEqual(u.state.config.expenseWorkflow.future,{keep:[1]});
});
test('malformed workflow record is not silently overwritten',async()=>{
 const {state,storage}=setup();state.config.expenseWorkflow={history:'broken',lastApply:null};saveRaw(storage,state);await assert.rejects(applyExpensePreview(state,proposal(state),{storage}),/操作記録/);
});
test('operation time validation happens before write',async()=>{
 const {state,storage}=setup(),writes=storage.writes;await assert.rejects(applyExpensePreview(state,proposal(state),{storage,now:'bad-time'}),/操作日時/);assert.equal(storage.writes,writes);
});
test('zero scenarios stay zero and no baseline is invented',async()=>{
 const {state,storage}=setup();state.scenarios=[];saveRaw(storage,state);const n=await applyExpensePreview(state,proposal(state),{storage});assert.deepEqual(n.state.scenarios,[]);assert.deepEqual((await undoExpenseApply(n.state,{storage})).state.scenarios,[]);
});
test('history is bounded and repeating read never appends records',async()=>{
 const {state,storage}=setup();let current=state;
 for(let i=0;i<6;i++){const n=await applyExpensePreview(current,proposal(current),{storage});current=(await undoExpenseApply(n.state,{storage})).state;}
 assert.equal(current.config.expenseWorkflow.history.length,10);const writes=storage.writes;for(let i=0;i<3;i++)assert.deepEqual(loadExpenseState(storage),current);assert.equal(storage.writes,writes);
});
test('public period amount can save and undo without touching Work detail',async()=>{
 const {state,storage}=setup();state.config.cashflow.expenseCategories=[{key:'housing',items:[{key:'rent',periods:[{fromAge:64,toAge:90,amount:8,note:'keep'}]}]}];state.config.cashflow.travel=[{fromAge:64,toAge:90,annualAmount:12}];saveRaw(storage,state);
 const d=createExpenseDraft(state,{sourceProfile:'public-v0.9',kind:'detail'}),r=inspectCashflowSources(state.config,{sourceProfile:'public-v0.9'}).rules.find(r=>r.profile==='public-v0.9'&&r.itemId===rent);d.edits=[{itemId:rent,ruleRef:r.ruleRef,amount:9,unit:r.unit,priceBasis:r.priceBasis}];
 const n=await applyExpensePreview(state,previewExpenseChanges(state,d),{storage});assert.deepEqual(n.state.config.expenseDetail,state.config.expenseDetail);const u=await undoExpenseApply(n.state,{storage});assert.deepEqual(u.state.config.cashflow,state.config.cashflow);
});
test('undo with stale caller state rejects a different screen update',async()=>{
 const {state,storage}=setup(),n=await applyExpensePreview(state,proposal(state),{storage}),other=structuredClone(n.state);other.scenarios[0].name='later';saveRaw(storage,other);await assert.rejects(undoExpenseApply(n.state,{storage}),/更新/);assert.deepEqual(loadExpenseState(storage),other);
});
