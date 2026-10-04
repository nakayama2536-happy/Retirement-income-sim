import test from 'node:test';
import assert from 'node:assert/strict';
import {calendarMode} from './calendar-mode.mjs';
import {previewCalendar,applyCalendarPreview,undoCalendarApply,calendarUndoAvailable} from './calendar-workflow.mjs';
import {runRetirementPlan,runForecastFromLatestActual,scenarioMetrics} from './calc.mjs';
import {migrateConfig,saveState,loadState,STATE_KEY} from './storage.mjs';
const MODE='anchored-months-v1';
function fixture(day='01-31'){
 const c=migrateConfig({people:{primary:{birthDate:`1980-${day}`},spouse:{birthDate:'1981-05-01'}},plan:{startAge:64,endAge:67,startDate:`2044-${day}`,initialAsset:1234,initialAssetIncludesIdeco:false,afterTaxReturn:2,inflation:3},employment:{primary:{mainRetirement:{baseDate:`2045-${day==='02-29'?'02-28':day}`},sideWork:{monthlyGross:0}},spouse:{sideWork:{monthlyGross:0}}},income:{pensions:{primary:{annualAtStart:0},spouse:{annualAtStart:0}}},budgets:[{fromAge:65,toAge:90,annualBudget:36}],unemployment:{baselineMode:'none'},events:[]});
 c.future={nested:[1,2]};c.reviews={65:{note:'keep'}};
 return {config:c,scenarios:[{id:'a',name:'案A',role:'scenario',selected:true,extra:{x:1},config:structuredClone(c)},{id:'b',name:'案B',role:'reference',selected:false,config:structuredClone(c)}],futureState:{x:1}};
}
class Memory {values=new Map();fail=false;writes=0;getItem(k){return this.values.get(k)??null;}setItem(k,v){if(this.fail)throw new Error('QuotaExceeded');this.writes++;this.values.set(k,String(v));}removeItem(k){this.values.delete(k);}}
function setup(day){globalThis.localStorage=new Memory();const state=fixture(day);saveState(state);return loadState();}
const plain=x=>({config:x.config,scenarios:x.scenarios,futureState:x.futureState});
test('no calendar mode is introduced by migration, startup or preview',()=>{
 const s=setup(),bytes=localStorage.getItem(STATE_KEY),p=previewCalendar(s,MODE);assert.equal(p.before.monthlyDetails.length,49);assert.equal(p.after.monthlyDetails.length,48);assert.equal(p.changed,true);assert.equal(p.canApply,true);assert.equal(Object.hasOwn(s.config.plan,'calendarMode'),false);assert.equal(localStorage.getItem(STATE_KEY),bytes);assert.equal(calendarMode(loadState().config),'legacy');
});
test('adopt, reload and undo preserve all scenarios, roles and unknown fields',()=>{
 const s=setup(),before=structuredClone(s);const next=applyCalendarPreview(s,previewCalendar(s,MODE));assert.equal(calendarMode(next.config),MODE);assert.deepEqual(next.scenarios,s.scenarios);assert.deepEqual(next.futureState,s.futureState);assert.equal(next.scenarios.length,2);assert.equal(calendarMode(loadState().config),MODE);assert.equal(calendarUndoAvailable(loadState().config),true);
 const undo=undoCalendarApply(loadState());const clean=structuredClone(undo.config);delete clean.calendarWorkflow;assert.deepEqual(clean,before.config);assert.deepEqual(undo.scenarios,before.scenarios);assert.deepEqual(s,before);
});
test('repeat apply does not grow history or perform another save',()=>{
 const s=setup(),p=previewCalendar(s,MODE),n=applyCalendarPreview(s,p),writes=localStorage.writes;
 const again=applyCalendarPreview(plain(n),p);assert.equal(again.changed,false);assert.equal(again.config.calendarWorkflow.history.length,1);assert.equal(localStorage.writes,writes);
});
test('same-mode trial does not persist a field or add a history entry',()=>{
 const s=setup(),writes=localStorage.writes;assert.equal(applyCalendarPreview(s,previewCalendar(s,'legacy')).changed,false);assert.equal(localStorage.writes,writes);assert.equal(Object.hasOwn(s.config.plan,'calendarMode'),false);
});
test('save failure preserves adopted values and reusable preview',()=>{
 const s=setup(),p=previewCalendar(s,MODE),before=structuredClone(p),bytes=localStorage.getItem(STATE_KEY);localStorage.fail=true;
 assert.throws(()=>applyCalendarPreview(s,p),/QuotaExceeded/);assert.deepEqual(p,before);assert.equal(localStorage.getItem(STATE_KEY),bytes);assert.equal(calendarMode(s.config),'legacy');localStorage.fail=false;assert.equal(applyCalendarPreview(s,p).changed,true);
});
test('undo failure preserves adopted mode and history',()=>{
 const s=setup(),n=applyCalendarPreview(s,previewCalendar(s,MODE)),bytes=localStorage.getItem(STATE_KEY);localStorage.fail=true;assert.throws(()=>undoCalendarApply(plain(n)),/QuotaExceeded/);assert.equal(localStorage.getItem(STATE_KEY),bytes);assert.equal(calendarUndoAvailable(n.config),true);
});
for(const target of ['config','scenarios','actuals'])test(`stale preview after ${target} update is rejected`,()=>{
 const s=setup(),p=previewCalendar(s,MODE),n=structuredClone(s);if(target==='config')n.config.plan.inflation=4;else if(target==='scenarios')n.scenarios[0].name='changed';else n.config.actuals={64:{endAsset:1000}};assert.throws(()=>applyCalendarPreview(n,p),/再試算/);
});
test('storage changed in another screen rejects apply and keeps both data sets',()=>{
 const s=setup(),p=previewCalendar(s,MODE),n=structuredClone(s);n.config.future.x=2;saveState(n,s);const bytes=localStorage.getItem(STATE_KEY);assert.throws(()=>applyCalendarPreview(s,p),/別画面/);assert.equal(localStorage.getItem(STATE_KEY),bytes);assert.equal(p.mode,MODE);
});
test('modified candidate payload is ignored; recomputation uses reviewed mode',()=>{
 const s=setup(),p=previewCalendar(s,MODE);p.candidate.plan.initialAsset=999999;p.after.finalAsset=0;const n=applyCalendarPreview(s,p);assert.equal(n.config.plan.initialAsset,s.config.plan.initialAsset);
});
test('adoption is blocked if existing actual period would change',()=>{
 const s=setup();s.config.actuals={64:{endAsset:1000}};saveState(s);const p=previewCalendar(s,MODE);assert.equal(p.canApply,false);assert.deepEqual(p.actualConflicts,['64']);assert.throws(()=>applyCalendarPreview(s,p),/測定時点/);
});
test('ordinary-date actuals remain usable after explicit adoption',()=>{
 const s=setup('08-27');s.config.actuals={65:{endAsset:1000,note:'keep'}};saveState(s);const p=previewCalendar(s,MODE);assert.equal(p.canApply,true);const n=applyCalendarPreview(s,p);assert.deepEqual(n.config.actuals,s.config.actuals);assert.equal(n.forecast.projection.calendarMode,MODE);
});
test('undo blocks reinterpretation of actuals added after adoption',()=>{
 const s=setup(),n=plain(applyCalendarPreview(s,previewCalendar(s,MODE)));n.config.actuals={64:{endAsset:1000}};saveState(n);assert.throws(()=>undoCalendarApply(n),/対象期間/);
});
test('undo retains unrelated changes made after adoption',()=>{
 const s=setup('08-27'),n=plain(applyCalendarPreview(s,previewCalendar(s,MODE)));n.config.plan.inflation=4;n.config.future.x='new';saveState(n);const u=undoCalendarApply(n);assert.equal(u.config.plan.inflation,4);assert.equal(u.config.future.x,'new');assert.equal(calendarMode(u.config),'legacy');
});
test('explicit legacy value is restored exactly by undo',()=>{
 const s=setup();s.config.plan.calendarMode='legacy';saveState(s);const n=applyCalendarPreview(s,previewCalendar(s,MODE));assert.equal(undoCalendarApply(plain(n)).config.plan.calendarMode,'legacy');
});
test('unknown saved modes reject read and never fall back',()=>{
 for(const mode of [null,'',false,'future-v9']){const s=fixture();s.config.plan.calendarMode=mode;assert.throws(()=>migrateConfig(s.config),/未対応/);assert.throws(()=>runRetirementPlan(s.config),/未対応/);localStorage.values.set(STATE_KEY,JSON.stringify(s));assert.throws(()=>loadState(),/未対応/);}
});
for(const day of ['01-31','02-29','08-27'])for(const age of [64,65,66])test(`adopted calendar forecast matches remaining plan ${day}, age ${age}`,()=>{
 const c=fixture(day).config;c.plan.calendarMode=MODE;const base=runRetirementPlan(c,{includeMonthlyDetails:true});c.actuals={[age]:{endAsset:base.rows.find(r=>r.age===age).endAsset}};const p=runForecastFromLatestActual(c,{includeMonthlyDetails:true}).projection;
 assert.deepEqual(p.rows,base.rows.filter(r=>r.age>age));assert.equal(p.finalAsset,base.finalAsset);assert.equal(p.monthlyDetails[0].baseDate,c.plan.startDate);assert.equal(p.calendarMode,MODE);assert.equal(scenarioMetrics(c).finalAsset,base.finalAsset);
});
test('partial plan start restarts from next original monthly anchor',()=>{
 const c=fixture('08-27').config;c.plan.startDate='2044-11-15';c.plan.calendarMode=MODE;const base=runRetirementPlan(c,{includeMonthlyDetails:true});c.actuals={64:{endAsset:base.rows[0].endAsset}};const p=runForecastFromLatestActual(c,{includeMonthlyDetails:true}).projection;assert.deepEqual(p.rows,base.rows.slice(1));assert.equal(p.monthlyDetails[0].date,'2045-09-15');
});
test('last-period actual produces no further cashflows but retains actual balance',()=>{
 const c=fixture().config;c.plan.calendarMode=MODE;c.actuals={67:{endAsset:888}};const f=runForecastFromLatestActual(c,{includeMonthlyDetails:true});assert.equal(f.projection.finalAsset,888);assert.deepEqual(f.projection.rows,[]);assert.deepEqual(f.projection.monthlyDetails,[]);assert.equal(f.projection.calendarMode,MODE);
});
test('forecast options use actual balance, never caller asset/start overrides',()=>{
 const c=fixture('08-27').config;c.plan.calendarMode=MODE;c.actuals={64:{endAsset:1000}};const a=runForecastFromLatestActual(c);const b=runForecastFromLatestActual(c,{startDate:'2099-01-01',initialAsset:99999});assert.deepEqual(a,b);
});
test('preview options override saved mode without mutating it',()=>{
 const c=fixture().config;c.plan.calendarMode=MODE;assert.equal(runRetirementPlan(c,{calendarMode:'legacy',includeMonthlyDetails:true}).monthlyDetails.length,49);assert.equal(calendarMode(c),MODE);
});
