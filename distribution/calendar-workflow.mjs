import {calendarMode,CALENDAR_MODES} from './calendar-mode.mjs';
import {runRetirementPlan,runForecastFromLatestActual} from './calc.mjs';
import {calculatePensionCandidate} from './pension.mjs';
import {configSignature,saveState,migrateConfig} from './storage.mjs';
const clone=structuredClone;
const pick=c=>Object.hasOwn(c.plan,'calendarMode')?{present:true,value:c.plan.calendarMode}:{present:false};
const put=(c,x)=>{if(x.present)c.plan.calendarMode=x.value;else delete c.plan.calendarMode;};
function validate(state){
 if(!state?.config||!Array.isArray(state.scenarios))throw new Error('現在設定と比較案を確認してください。');
 for(const c of [state.config,...state.scenarios.map(s=>s.config)]){
  if(!c)throw new Error('比較案の設定がありません。');
  for(const [age,a] of Object.entries(c.actuals||{}))if(!Number.isInteger(Number(age))||Number(age)<Number(c.plan.startAge)||Number(age)>Number(c.plan.endAge)||a?.endAsset==null||!Number.isFinite(Number(a.endAsset)))throw new Error('実績の年齢・終了資産を確認してください。');
  calculatePensionCandidate(migrateConfig(c));
 }
}
const periodDates=(r,age)=>r.monthlyDetails.filter(m=>m.annualAge===Number(age)).map(m=>m.date);
export function previewCalendar(state,mode){
 if(!CALENDAR_MODES.includes(mode))throw new Error('期間方式を選択してください。');
 validate(state);
 const candidate=clone(state.config);candidate.plan.calendarMode=mode;
 const before=runRetirementPlan(state.config,{includeMonthlyDetails:true});
 const after=runRetirementPlan(candidate,{includeMonthlyDetails:true});
 const actualConflicts=Object.keys(state.config.actuals||{}).filter(age=>configSignature(periodDates(before,age))!==configSignature(periodDates(after,age)));
 const differences=[...new Set([...before.rows,...after.rows].map(r=>r.age))].map(age=>{
  const a=periodDates(before,age),b=periodDates(after,age);
  return {age,beforeMonths:a.length,afterMonths:b.length,beforeStart:a[0]??null,afterStart:b[0]??null,beforeLast:a.at(-1)??null,afterLast:b.at(-1)??null,changed:configSignature(a)!==configSignature(b)};
 });
 return {id:crypto.randomUUID(),baseSignature:configSignature(state),mode,candidate,before,after,differences,actualConflicts,
   changed:calendarMode(state.config)!==mode,canApply:actualConflicts.length===0,
   forecastBefore:runForecastFromLatestActual(state.config),forecastAfter:actualConflicts.length?null:runForecastFromLatestActual(candidate)};
}
export function calendarUndoAvailable(c){
 const t=c?.calendarWorkflow?.lastApply;
 return !!t?.before&&!!t?.after&&configSignature(pick(c))===configSignature(t.after);
}
function commit(state,config,save){
 const next={...clone(state),config,scenarios:clone(state.scenarios)};
 validate(next);
 const result=runRetirementPlan(config),forecast=runForecastFromLatestActual(config);
 // A single guarded save. No role changes, baseline creation or scenario copying.
 const saved=save(next,state);
 return {...saved,result,forecast,changed:true};
}
export function applyCalendarPreview(state,preview,save=saveState,now=new Date().toISOString()){
 if(preview?.id===state.config.calendarWorkflow?.lastApply?.previewId&&calendarUndoAvailable(state.config))return {...state,result:runRetirementPlan(state.config),forecast:runForecastFromLatestActual(state.config),changed:false};
 if(!preview||preview.baseSignature!==configSignature(state))throw new Error('試算後に設定・実績・比較案が変わりました。再試算してください。');
 const checked=previewCalendar(state,preview.mode);
 if(!checked.canApply)throw new Error(`実績の対象期間が変わります（${checked.actualConflicts.join('・')}歳）。実績の測定時点を確認するまで反映できません。`);
 if(!checked.changed)return {...state,result:runRetirementPlan(state.config),forecast:runForecastFromLatestActual(state.config),changed:false};
 const config=checked.candidate,t={id:crypto.randomUUID(),previewId:preview.id,at:now,action:'apply',before:pick(state.config),after:pick(config)};
 config.calendarWorkflow={...clone(config.calendarWorkflow||{}),lastApply:t,history:[...(config.calendarWorkflow?.history||[]),t].slice(-10)};
 return commit(state,config,save);
}
export function undoCalendarApply(state,save=saveState,now=new Date().toISOString()){
 if(!calendarUndoAvailable(state.config))throw new Error('取消対象がないか、期間方式が別の操作で変更されています。');
 const config=clone(state.config),t=config.calendarWorkflow.lastApply;
 // New actuals may have been added since adoption. Never reinterpret them on undo.
 const restored=clone(config);put(restored,t.before);
 const currentRun=runRetirementPlan(config,{includeMonthlyDetails:true}),restoredRun=runRetirementPlan(restored,{includeMonthlyDetails:true});
 if(Object.keys(config.actuals||{}).some(age=>configSignature(periodDates(currentRun,age))!==configSignature(periodDates(restoredRun,age))))throw new Error('実績の対象期間が変わるため取消できません。実績の測定時点を確認してください。');
 put(config,t.before);
 config.calendarWorkflow={...clone(config.calendarWorkflow),lastApply:null,history:[...(config.calendarWorkflow.history||[]),{id:crypto.randomUUID(),at:now,action:'undo',undoes:t.id}].slice(-10)};
 return commit(state,config,save);
}
