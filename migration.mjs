import {STATE_KEY,migrateConfig,configSignature} from './storage.mjs';
import {calculatePensionCandidate} from './pension.mjs';
import {assertBackupCompatibility} from './backup-compatibility.mjs';
import {assertWriteAccess} from './write-access.mjs';

export const SOURCES=[
  {id:'work-v0.9',label:'Work旧キー v0.9',prefix:'lifeplan-sim',version:'0.9'},
  ...['0.9','0.8','0.7','0.6','0.5','0.4','0.3','0.2'].map(version=>({
    id:`public-v${version}`,label:`公開元 v${version}`,prefix:'retirement-sim',version
  }))
].map(s=>({...s,configKey:`${s.prefix}-config-v${s.version}`,scenarioKey:`${s.prefix}-scenarios-v${s.version}`}));
export const MIGRATION_KEYS=[STATE_KEY,...SOURCES.flatMap(s=>[s.configKey,s.scenarioKey])];
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const snapshot=storage=>MIGRATION_KEYS.map(key=>[key,storage.getItem(key)]);

// Validate a clone using the current engine, but never replace the source with
// calculated/normalized output. Migration must not adopt new planning modes.
export function validateSavedState(state,{allowEmpty=false}={}){
  assertBackupCompatibility(state);
  if(!object(state)||!Array.isArray(state.scenarios))throw new Error('設定と比較案の形式が不正です。');
  if(allowEmpty&&state.config===null&&state.scenarios.length===0)return;
  if(!object(state.config))throw new Error('現在設定がありません。別系統の設定とは結合しません。');
  const ids=new Set();
  for(const s of state.scenarios){
    if(!object(s)||!object(s.config))throw new Error('比較案の設定が不正です。');
    if(s.id!=null){if(typeof s.id!=='string'||!s.id.trim())throw new Error('比較案IDの形式が不正です。');if(ids.has(s.id))throw new Error('比較案IDが重複しています。');ids.add(s.id);}
  }
  if(state.scenarios.filter(s=>s.role==='baseline').length>1)throw new Error('基準ケースが重複しています。');
  for(const source of [state.config,...state.scenarios.map(s=>s.config)]){
    if(!object(source.plan)||!Array.isArray(source.budgets)||!source.budgets.length)throw new Error('計画または管理予算がありません。');
    if(source.plan.initialAsset==null||source.plan.initialAsset===''||!Number.isFinite(Number(source.plan.initialAsset)))throw new Error('開始資産が不足または不正です。');
    for(const field of ['actuals','reviews'])if(source[field]!=null&&!object(source[field]))throw new Error(`${field}の形式が不正です。`);
    const c=migrateConfig(source);
    for(const [age,a] of Object.entries(c.actuals)){
      if(!object(a)||!Number.isInteger(Number(age))||Number(age)<Number(c.plan.startAge)||Number(age)>Number(c.plan.endAge)||a.endAsset==null||a.endAsset===''||!Number.isFinite(Number(a.endAsset)))throw new Error('実績の年齢・年末資産を確認してください。');
    }
    calculatePensionCandidate(c);
  }
}

export function inspectMigration(storage=localStorage){
  const token=snapshot(storage), values=new Map(token);
  let integrated={status:'absent'};
  if(values.get(STATE_KEY)!==null){
    try{const state=JSON.parse(values.get(STATE_KEY));validateSavedState(state,{allowEmpty:true});integrated={status:'valid',state};}
    catch(e){integrated={status:'invalid',error:e.message};}
  }
  const candidates=[];
  for(const source of SOURCES){
    const configRaw=values.get(source.configKey),scenariosRaw=values.get(source.scenarioKey);
    if(configRaw===null&&scenariosRaw===null)continue;
    const candidate={...source,configOnly:scenariosRaw===null,valid:false};
    try{
      candidate.state={config:configRaw===null?null:JSON.parse(configRaw),scenarios:scenariosRaw===null?[]:JSON.parse(scenariosRaw)};
      validateSavedState(candidate.state);candidate.valid=true;
    }catch(e){candidate.error=e.message;}
    candidates.push(candidate);
  }
  return {token,integrated,candidates};
}

export function migrateSelected(inspection,id,{acceptConfigOnly=false,storage=localStorage}={}){
  assertWriteAccess();
  // Re-read everything: candidates are never trusted merely because they were
  // valid when shown. Source writes and integrated-state writes invalidate them.
  const live=inspectMigration(storage);
  if(configSignature(live.token)!==configSignature(inspection.token))throw new Error('別画面または保存元が更新されています。候補を再確認してください。');
  const candidate=live.candidates.find(c=>c.id===id);
  if(!candidate?.valid)throw new Error(candidate?.error||'有効な候補を選択してください。');
  if(live.integrated.status==='invalid')throw new Error('統合状態が破損しています。旧設定への置換は停止しました。');
  if(live.integrated.status==='valid'){
    const active=live.integrated.state;
    if(configSignature({config:active.config,scenarios:active.scenarios})===configSignature(candidate.state))return {state:structuredClone(active),alreadySaved:true};
    throw new Error('統合状態を保持しています。旧設定で上書きしません。');
  }
  if(candidate.configOnly&&!acceptConfigOnly)throw new Error('比較案がない候補です。比較案0件で引き継ぐ確認が必要です。');
  const next=structuredClone(candidate.state);
  validateSavedState(next);
  const encoded=JSON.stringify(next);
  if(configSignature(snapshot(storage))!==configSignature(inspection.token))throw new Error('保存直前にデータが変わりました。候補を再確認してください。');
  storage.setItem(STATE_KEY,encoded); // one atomic item; keep every source key
  return {state:next,alreadySaved:false};
}
