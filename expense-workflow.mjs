// I-02B save/undo service. Not connected to UI or startup.
import {STATE_KEY} from './storage.mjs';
import {assertWriteAccess} from './write-access.mjs';
import {validateSavedState} from './migration.mjs';
import {inspectCashflowSources,cashflowSourceSignature as signature} from './cashflow-sources.mjs';
import {createExpenseDraft,previewExpenseChanges,revalidateExpensePreview} from './expense-preview.mjs';
import {runRetirementPlan,runForecastFromLatestActual} from './calc.mjs';
const clone=structuredClone;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const equal=(a,b)=>signature(a)===signature(b);
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(signature(value)))),b=>b.toString(16).padStart(2,'0')).join('');
const validAmount=x=>(typeof x==='number'||typeof x==='string'&&x.trim()!=='')&&Number.isFinite(Number(x))&&Number(x)>=0;
function workflow(config){
 const w=config.expenseWorkflow;
 if(w===undefined)return {lastApply:null,history:[]};
 if(!object(w)||!Array.isArray(w.history)||!(w.lastApply===null||object(w.lastApply)))throw new Error('内訳・予算の操作記録が不正です。上書きせず確認してください。');
 return w;
}
function read(storage){
 const raw=storage.getItem(STATE_KEY);
 if(raw===null)throw new Error('統合保存データがありません。先に引継ぎを確認してください。');
 const state=JSON.parse(raw);validateSavedState(state);workflow(state.config);
 return {raw,state};
}
// Full raw state: no normalization, implicit adoption, role or history changes.
export function loadExpenseState(storage=localStorage){return clone(read(storage).state);}
function assertExpected(expected,live){
 if(!equal(expected,live))throw new Error('別画面または現在設定・比較案が更新されています。再読み込みして再試算してください。');
}
const locator=r=>({itemId:r.itemId,profile:r.profile,unit:r.unit,priceBasis:r.priceBasis,period:r.period,priority:r.priority,
 origin:r.sourceRefs[0].path.replace(/\/\d+(?=\/|$)/g,'/*'),id:r.metadata?.id??null,key:r.metadata?.key??null});
function atPath(config,path){
 const parts=path.slice(1).split('/');let o=config;
 for(const key of parts.slice(0,-1)){
   if(['__proto__','prototype','constructor'].includes(key)||!Object.hasOwn(o||{},key))throw new Error('取消対象が見つかりません。');
   o=o[key];
 }
 const key=parts.at(-1);
 if(['__proto__','prototype','constructor'].includes(key)||!Object.hasOwn(o||{},key))throw new Error('取消対象が見つかりません。');
 return {o,key};
}
const calculated=state=>({result:runRetirementPlan(state.config),forecast:runForecastFromLatestActual(state.config)});
function stamped(now){if(typeof now!=='string'||!Number.isFinite(Date.parse(now)))throw new Error('操作日時が不正です。');return new Date(now).toISOString();}
const withoutPostDigest=state=>{const s=clone(state);delete s.config.expenseWorkflow.lastApply.afterStateDigest;return s;};
function commit(next,raw,storage,calc){
 assertWriteAccess();
 validateSavedState(next);
 const encoded=JSON.stringify(next);
 if(!equal(JSON.parse(encoded),next))throw new Error('保存できない値が含まれています。');
 if(storage.getItem(STATE_KEY)!==raw)throw new Error('保存直前に別画面で更新されました。再読み込みしてください。');
 storage.setItem(STATE_KEY,encoded); // One atomic browser item; never remove old keys.
 return {state:next,...calc,saved:true,changed:true,alreadyApplied:false};
}
export async function applyExpensePreview(expected,preview,{storage=localStorage,now=new Date().toISOString()}={}){
 const requestDigest=await digest(preview),live=read(storage),w=workflow(live.state.config);
 // Exact retry only, including after reload. Any intervening change invalidates it.
 if(w.lastApply?.requestDigest===requestDigest&&w.lastApply?.afterStateDigest===await digest(withoutPostDigest(live.state))){
   if(storage.getItem(STATE_KEY)!==live.raw)throw new Error('別画面で更新されました。再読み込みしてください。');
   return {state:clone(live.state),...calculated(live.state),saved:true,changed:false,alreadyApplied:true};
 }
 assertExpected(expected,live.state);
 const verified=revalidateExpensePreview(expected,preview);
 if(!verified.changed)return {state:clone(live.state),...calculated(live.state),saved:false,changed:false,alreadyApplied:false};
 const next=clone(verified.candidate),view=inspectCashflowSources(next.config,{sourceProfile:verified.sourceProfile});
 const patches=verified.patches.map(p=>{
   const rules=view.rules.filter(r=>r.ruleRef===p.ruleRef&&r.itemId===p.itemId&&r.profile===verified.sourceProfile);
   if(rules.length!==1)throw new Error('反映対象を一意に確認できません。');
   return {locator:clone(locator(rules[0])),before:clone(p.before),after:clone(p.after)};
 });
 const record={id:crypto.randomUUID(),at:stamped(now),action:'apply',requestDigest,sourceProfile:verified.sourceProfile,kind:verified.kind,patches};
 next.config.expenseWorkflow={...clone(w),lastApply:record,history:[...clone(w.history),{id:record.id,at:record.at,action:'apply',kind:record.kind,count:patches.length}].slice(-10)};
 const calc=calculated(next);validateSavedState(next);
 record.afterStateDigest=await digest(withoutPostDigest(next));
 return commit(next,live.raw,storage,calc);
}
function undoCandidate(state){
 const w=workflow(state.config),t=w.lastApply;
 if(!t||!['detail','budget'].includes(t.kind)||!['public-v0.9','work-v0.9.7'].includes(t.sourceProfile)||!Array.isArray(t.patches)||!t.patches.length||typeof t.id!=='string')throw new Error('取消できる反映記録がありません。');
 const view=inspectCashflowSources(state.config,{sourceProfile:t.sourceProfile}),draft=createExpenseDraft(state,{sourceProfile:t.sourceProfile,kind:t.kind});
 for(const patch of t.patches){
   if(!validAmount(patch.before)||!validAmount(patch.after)||!object(patch.locator))throw new Error('取消記録の金額・対象が不正です。');
   const rules=view.rules.filter(r=>equal(locator(r),patch.locator));
   if(rules.length!==1)throw new Error('取消対象のID・期間・単位が変更または重複しています。');
   const r=rules[0];
   if(!equal(r.rawAmount,patch.after))throw new Error('反映した金額が別の操作で変更されています。取消は停止しました。');
   draft.edits.push({itemId:r.itemId,ruleRef:r.ruleRef,unit:r.unit,priceBasis:r.priceBasis,amount:Number(patch.before)});
 }
 const reversed=previewExpenseChanges(state,draft),next=clone(reversed.candidate);
 // Restore original numeric strings too, without replacing row metadata.
 reversed.patches.forEach((p,i)=>{const {o,key}=atPath(next.config,p.path);o[key]=clone(t.patches[i].before);});
 validateSavedState(next);
 return {next,w,t};
}
export function expenseUndoStatus(state){
 try{undoCandidate(state);return {available:true,reason:null};}
 catch(e){return {available:false,reason:e.message};}
}
export async function undoExpenseApply(expected,{storage=localStorage,now=new Date().toISOString()}={}){
 const live=read(storage);assertExpected(expected,live.state);
 const {next,w,t}=undoCandidate(live.state);
 next.config.expenseWorkflow={...clone(w),lastApply:null,history:[...clone(w.history),{id:crypto.randomUUID(),at:stamped(now),action:'undo',undoes:t.id,kind:t.kind}].slice(-10)};
 const calc=calculated(next);
 return commit(next,live.raw,storage,calc);
}
