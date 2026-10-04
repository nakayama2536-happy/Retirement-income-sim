import {calendarMode} from './calendar-mode.mjs';
import {assertBackupCompatibility} from './backup-compatibility.mjs';
import {assertWriteAccess} from './write-access.mjs';
function isoFromYear(year, month=1, day=1){ return year ? `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}` : null; }

export function migrateConfig(config) {
  if (!config) return null;
  calendarMode(config);
  const c = structuredClone(config);
  c.meta ||= {}; c.meta.schemaVersion = '0.9';
  c.actuals ||= {}; c.reviews ||= {}; c.pendingDecisions ||= [];
  c.cashflow ||= {}; c.cashflow.periodOverrides ||= [];
  c.people ||= {}; c.people.primary ||= {}; c.people.spouse ||= {};
  if(!c.people.primary.birthDate && c.people.primary.birthYear) c.people.primary.birthDate=isoFromYear(c.people.primary.birthYear,1,1);
  if(!c.people.spouse.birthDate && c.people.spouse.birthYear) c.people.spouse.birthDate=isoFromYear(c.people.spouse.birthYear,1,1);
  c.plan ||= {};
  c.plan.startAge ??= 64; c.plan.endAge ??= 95;
  if(!c.plan.startDate && c.people.primary.birthYear) c.plan.startDate=isoFromYear(Number(c.people.primary.birthYear)+Number(c.plan.startAge),1,1);
  c.employment ||= {primary:{},spouse:{}}; c.employment.primary ||= {}; c.employment.spouse ||= {};
  c.employment.primary.mainRetirement ||= {};
  if(!c.employment.primary.mainRetirement.baseDate && c.people.primary.birthYear) c.employment.primary.mainRetirement.baseDate=isoFromYear(Number(c.people.primary.birthYear)+65,1,1);
  c.employment.primary.sideWork ||= {};
  c.employment.primary.sideWork.monthlyGross ??= Number(c.income?.labor?.annual||0)/24 || 0;
  c.employment.primary.sideWork.startMode ||= 'after_high_age_benefit';
  c.employment.spouse.sideWork ||= {};
  c.employment.spouse.sideWork.monthlyGross ??= Number(c.income?.labor?.annual||0)/24 || 0;
  c.income ||= {}; c.income.pensions ||= {};
  if(!c.income.pensions.primary && c.income.pension) c.income.pensions.primary={annualAtStart:Number(c.income.pension.annualAtStart||0),certainty:c.income.pension.certainty||'assumption'};
  c.income.pensions.primary ||= {annualAtStart:0,certainty:'unknown'};
  c.income.pensions.spouse ||= {annualAtStart:0,certainty:'unknown'};
  c.reserve ||= {}; c.reserve.total ??= 0; c.reserve.minimumSafeAsset ??= 0; c.reserve.warningStrongBelow ??= c.reserve.minimumSafeAsset; c.reserve.refillTarget ??= c.reserve.total;
  c.management ||= {}; c.management.thresholds ||= {}; c.management.reserveUsedFinalThreshold ??= 0;
  c.certainty ||= {};
  c.certainty.initialAsset ||= 'plan'; c.certainty.returnRate ||= 'scenario'; c.certainty.inflation ||= 'scenario';
  c.certainty.laborIncome ||= 'plan'; c.certainty.pension ||= 'assumption'; c.certainty.dc ||= 'assumption'; c.certainty.budgets ||= 'plan'; c.certainty.retirement ||= 'company_estimate';
  c.taxPolicy ||= {budgetIncludesTaxSocial:true,reviewDeltaAnnual:0,municipality:'未設定',rulesAsOf:'2026-09-24'};
  c.unemployment ||= {baselineMode:'retire_at_65',preRetirementAnnualSalary:0,insuredYears:20,highAgeDays:50,pre65GeneralDays:150,pre65SpecialDays:240,dailyBenefitCap60to64Yen:7830,dailyBenefitCapHighAgeYen:7450,baselineSideWorkDelayMonths:2};
  return c;
}

export const STATE_KEY='lifeplan-sim-state-v1';
function normalizeState(state){
  assertBackupCompatibility(state);
  if(!state||!Array.isArray(state.scenarios))throw new Error('保存データの形式を確認してください。');
  return {...structuredClone(state),config:migrateConfig(state.config),scenarios:state.scenarios.map(s=>{
    if(!s||!s.config)throw new Error('シナリオに設定がありません。');
    return {...s,config:migrateConfig(s.config)};
  })};
}
export function loadState(){
  const raw=localStorage.getItem(STATE_KEY);
  if(raw!==null)return normalizeState(JSON.parse(raw));
  return {config:null,scenarios:[]};
}
export function saveState(state,expected){
  assertWriteAccess();
  const before=localStorage.getItem(STATE_KEY);
  const current=loadState();
  const next=normalizeState({...current,...state});
  if(expected&&configSignature({config:current.config,scenarios:current.scenarios})!==configSignature(normalizeState({config:expected.config,scenarios:expected.scenarios})))throw new Error('別画面で設定が更新されています。再読み込みしてください。');
  const encoded=JSON.stringify(next);
  if(localStorage.getItem(STATE_KEY)!==before)throw new Error('別画面で保存内容が変わりました。再読み込みしてください。');
  localStorage.setItem(STATE_KEY,encoded);
  return next;
}
export function replaceState(state,expected){
  assertWriteAccess();
  const before=localStorage.getItem(STATE_KEY);
  const current=loadState(),next=normalizeState(state);
  if(expected&&configSignature(current)!==configSignature(normalizeState(expected)))throw new Error('別画面で設定が更新されています。再読み込みしてください。');
  const encoded=JSON.stringify(next);
  if(localStorage.getItem(STATE_KEY)!==before)throw new Error('別画面で保存内容が変わりました。再読み込みしてください。');
  localStorage.setItem(STATE_KEY,encoded);
  return next;
}
export function saveConfig(config) {return saveState({...loadState(),config});}
// キー順に依存せず、試算時の前提と現在の前提を比較する。
export function configSignature(value){
  const sorted=x=>Array.isArray(x)?x.map(sorted):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,sorted(x[k])])):x;
  return JSON.stringify(sorted(value));
}
export function saveConfigIfUnchanged(next,expected){
  const current=loadState();
  if(configSignature(current.config)!==configSignature(migrateConfig(expected)))
    throw new Error('別画面で設定が更新されています。画面を再読み込みして試算し直してください。');
  // 反映値と取消情報を一つのsetItemで保存。失敗時は旧データが残る。
  saveState({...current,config:next},current);
}
const PENSION_DRAFT_KEY='lifeplan-sim-pension-draft-v0.9';
export function savePensionDraft(draft){assertWriteAccess();localStorage.setItem(PENSION_DRAFT_KEY,JSON.stringify(draft));}
export function loadPensionDraft(){try{return JSON.parse(localStorage.getItem(PENSION_DRAFT_KEY)||'null');}catch{return null;}}
export function clearPensionDraft(){assertWriteAccess();localStorage.removeItem(PENSION_DRAFT_KEY);}
export function loadConfig() {
  return loadState().config;
}
export function clearConfig(){saveConfig(null);}
export function loadScenarios(){
  return loadState().scenarios;
}
export function saveScenarios(items){return saveState({...loadState(),scenarios:items});}
export function downloadJson(data,filename){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
