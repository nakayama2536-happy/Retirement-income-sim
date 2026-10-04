import {runRetirementPlan,runForecastFromLatestActual,validateSalaryLife,integrityChecks} from './calc.mjs';
import {configSignature,saveState} from './storage.mjs';
import {commitPlanState} from './state.mjs';

const clone=structuredClone;
const field=(o,k)=>Object.hasOwn(o||{},k)?{present:true,value:clone(o[k])}:{present:false};
const setField=(o,k,x)=>{if(x.present)o[k]=clone(x.value);else delete o[k];};
const rowIdentity=row=>{const x=clone(row);delete x.fundingTreatment;return configSignature(x);};
const rows=(c,kind)=>kind==='event'?(c.events||[]):(c.cashflow?.periodOverrides||[]);
const safeNumber=x=>x===''||x==null?null:typeof x==='number'?x:typeof x==='string'&&x.trim()!==''?Number(x):NaN;

export function proposedBaselineMonth(config){
  const birth=config.people?.primary?.birthDate;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(birth||''))return '';
  const d=new Date(Date.UTC(Number(birth.slice(0,4))+65,Number(birth.slice(5,7))-2,1));
  return d.toISOString().slice(0,7);
}
export function salaryDraftFromConfig(config){
  return {settings:clone(config.cashflow?.salaryLife||{mode:'net-transfer-v1',lastSalaryMonth:proposedBaselineMonth(config),monthlyAddition:null,monthlyWithdrawal:null,pre65MonthlyBudget:null,postSalaryLabor:{mode:''},idecoFunding:{},receiptTreatment:{}}),
    baselineMonth:proposedBaselineMonth(config),monthsConfirmed:'',
    eventTreatments:(config.events||[]).map(x=>x.fundingTreatment||''),
    periodTreatments:(config.cashflow?.periodOverrides||[]).map(x=>x.fundingTreatment||'')};
}
export const salaryDraftContext=config=>configSignature({people:config.people,startDate:config.plan?.startDate,label:config.meta?.label,events:(config.events||[]).map(rowIdentity),periods:(config.cashflow?.periodOverrides||[]).map(rowIdentity)});
function candidateFromDraft(config,draft){
  if(!draft?.settings||draft.monthsConfirmed!=='yes')throw new Error('給与生活最終月と生活費負担開始月を確認してください。');
  const c=clone(config),s=clone(draft.settings);
  for(const k of ['monthlyAddition','monthlyWithdrawal','pre65MonthlyBudget'])s[k]=safeNumber(s[k]);
  if(s.postSalaryLabor?.mode==='monthly')s.postSalaryLabor.monthlyAmount=safeNumber(s.postSalaryLabor.monthlyAmount);
  c.cashflow||={}; c.cashflow.salaryLife=s;
  for(const [kind,values] of [['event',draft.eventTreatments],['period',draft.periodTreatments]]){
    const list=rows(c,kind);
    if(!Array.isArray(values)||values.length!==list.length)throw new Error('臨時収支・期間別設定が変わりました。入力を採用値に戻して確認してください。');
    list.forEach((row,i)=>{if(kind==='period'&&row.kind!=='income')return;
      if(values[i])row.fundingTreatment=values[i];else delete row.fundingTreatment;
    });
  }
  return c;
}
function calculate(config){
  const salaryErrors=validateSalaryLife(config);
  if(salaryErrors.length)throw new Error(salaryErrors.map(x=>x.detail).join('\n'));
  const errors=integrityChecks(config).filter(x=>x.level==='error');
  if(errors.length)throw new Error(errors.map(x=>x.detail||x.title).join('\n'));
  return {result:runRetirementPlan(config),forecast:runForecastFromLatestActual(config)};
}
function changes(before,after){
  const patches=[];
  for(const kind of ['event','period'])rows(before,kind).forEach((row,index)=>{
    const old=field(row,'fundingTreatment'),next=field(rows(after,kind)[index],'fundingTreatment');
    if(configSignature(old)!==configSignature(next))patches.push({kind,index,identity:rowIdentity(row),before:old,after:next});
  });
  return {before:field(before.cashflow,'salaryLife'),after:field(after.cashflow,'salaryLife'),patches};
}
export function previewSalary(state,draft){
  const candidate=candidateFromDraft(state.config,draft),calculated=calculate(candidate);
  if(draft.baselineMonth!==proposedBaselineMonth(state.config))throw new Error('基準案は65歳到達月の前月を給与生活最終月とします。試す条件の月を変更してください。');
  const baseline=clone(candidate);baseline.cashflow.salaryLife.lastSalaryMonth=draft.baselineMonth;
  // Classification can change across the two periods: never silently reclassify events.
  let baselineCalculated;
  try{baselineCalculated=calculate(baseline);}catch(e){throw new Error(`65歳基準案も計算できる条件にしてください。${e.message}`);}
  const owned=changes(state.config,candidate);
  return {id:crypto.randomUUID(),baseSignature:configSignature(state),draft:clone(draft),candidate,baseline,
    before:calculate(state.config).result,baselineResult:baselineCalculated.result,...calculated,owned,
    changed:configSignature(owned.before)!==configSignature(owned.after)||owned.patches.length>0};
}
export function salaryDraftMatches(config,draft){
  try{const c=candidateFromDraft(config,{...draft,monthsConfirmed:'yes'});const diff=changes(config,c);return configSignature(diff.before)===configSignature(diff.after)&&!diff.patches.length;}catch{return false;}
}
function checkPreview(state,preview){
  if(!preview||preview.baseSignature!==configSignature(state))throw new Error('試算後に設定・比較案が変わりました。もう一度試算してください。');
  return previewSalary(state,preview.draft);
}
export function salaryUndoAvailable(config){
  const t=config.salaryWorkflow?.lastApply;
  return !!t&&configSignature(field(config.cashflow,'salaryLife'))===configSignature(t.after)&&Array.isArray(t.patches)&&t.patches.every(p=>{
    const row=rows(config,p.kind)[p.index];
    return row&&rowIdentity(row)===p.identity&&configSignature(field(row,'fundingTreatment'))===configSignature(p.after);
  });
}
export function applySalaryPreview(state,preview,save=saveState,now=new Date().toISOString()){
  if(preview && state.config.salaryWorkflow?.lastApply?.previewId===preview.id && salaryUndoAvailable(state.config))return {...state,...calculate(state.config),changed:false};
  const checked=checkPreview(state,preview);
  if(!checked.changed)return {...state,...calculate(state.config),changed:false};
  const config=checked.candidate,t={id:crypto.randomUUID(),previewId:preview.id,at:now,action:'apply',...checked.owned};
  config.salaryWorkflow={lastApply:t,history:[...(state.config.salaryWorkflow?.history||[]),t].slice(-10)};
  const committed=commitPlanState(state,{config,scenarios:state.scenarios},save);
  return {...committed,changed:true};
}
export function undoSalaryApply(state,save=saveState,now=new Date().toISOString()){
  if(!salaryUndoAvailable(state.config))throw new Error('取消できる反映がないか、対象設定が別の操作で変更されています。');
  const config=clone(state.config),t=config.salaryWorkflow.lastApply;
  setField(config.cashflow,'salaryLife',t.before);
  for(const p of t.patches)setField(rows(config,p.kind)[p.index],'fundingTreatment',p.before);
  calculate(config);
  config.salaryWorkflow={lastApply:null,history:[...(config.salaryWorkflow.history||[]),{id:crypto.randomUUID(),at:now,action:'undo',undoes:t.id}].slice(-10)};
  return commitPlanState(state,{config,scenarios:state.scenarios},save);
}
export function saveSalaryScenario(state,preview,name,save=saveState){
  if(preview&&state.scenarios.some(x=>x.salaryPreviewId===preview.id))return {...state,...calculate(state.config),changed:false};
  const checked=checkPreview(state,preview),title=String(name||'').trim();
  if(!title||title.length>80)throw new Error('比較案名を1～80文字で入力してください。');
  const config=clone(checked.candidate);
  for(const key of ['actuals','reviews','pendingDecisions','salaryWorkflow','pensionWorkflow'])delete config[key];
  const scenario={id:crypto.randomUUID(),name:title,role:'scenario',savedAt:new Date().toISOString(),salaryPreviewId:preview.id,selected:state.scenarios.filter(x=>x.selected).length<3,config};
  return {...commitPlanState(state,{config:state.config,scenarios:[...state.scenarios,scenario]},save),changed:true};
}

export const SALARY_DRAFT_KEY='lifeplan-sim-salary-draft-v1';
export function saveSalaryDraft(config,draft){assertWriteAccess();localStorage.setItem(SALARY_DRAFT_KEY,JSON.stringify({context:salaryDraftContext(config),draft}));}
export function loadSalaryDraft(config){try{
  const stored=JSON.parse(localStorage.getItem(SALARY_DRAFT_KEY)||'null'),d=stored?.draft;
  return stored?.context===salaryDraftContext(config)&&d?.settings?.mode==='net-transfer-v1'&&Array.isArray(d.eventTreatments)&&Array.isArray(d.periodTreatments)&&d.eventTreatments.length===(config.events||[]).length&&d.periodTreatments.length===(config.cashflow?.periodOverrides||[]).length?d:null;
}catch{return null;}}
export function clearSalaryDraft(){assertWriteAccess();localStorage.removeItem(SALARY_DRAFT_KEY);}
import {assertWriteAccess} from './write-access.mjs';
