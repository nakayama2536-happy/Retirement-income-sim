import {STATE_KEY} from './storage.mjs';
import {assertWriteAccess} from './write-access.mjs';
import {validateSavedState} from './migration.mjs';
import {cashflowSourceSignature as signature} from './cashflow-sources.mjs';
import {previewIncomeAdoption,revalidateIncomePreview,incomeAdoptionMatches} from './income-preview.mjs';
import {runRetirementPlan,runForecastFromLatestActual} from './calc.mjs';
const clone=structuredClone;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const equal=(a,b)=>signature(a)===signature(b);
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(signature(value)))),b=>b.toString(16).padStart(2,'0')).join('');
function workflow(config){const w=config.incomeWorkflow;if(w===undefined)return {lastApply:null,history:[]};if(!object(w)||!Array.isArray(w.history)||!(w.lastApply===null||object(w.lastApply)))throw new Error('追加収入の操作記録が不正です。上書きせず確認してください。');return w;}
function read(storage){const raw=storage.getItem(STATE_KEY);if(raw===null)throw new Error('統合保存データがありません。先に引継ぎを確認してください。');const state=JSON.parse(raw);validateSavedState(state);workflow(state.config);return {raw,state};}
export function loadIncomeState(storage=localStorage){return clone(read(storage).state);}
const calculated=state=>({result:runRetirementPlan(state.config),forecast:runForecastFromLatestActual(state.config)});
const stamped=now=>{if(typeof now!=='string'||!Number.isFinite(Date.parse(now)))throw new Error('操作日時が不正です。');return new Date(now).toISOString();};
const withoutPostDigest=state=>{const s=clone(state);delete s.config.incomeWorkflow.lastApply.afterStateDigest;return s;};
function commit(next,raw,storage,calc){assertWriteAccess();validateSavedState(next);const encoded=JSON.stringify(next);if(!equal(JSON.parse(encoded),next))throw new Error('保存できない値が含まれています。');if(storage.getItem(STATE_KEY)!==raw)throw new Error('保存直前に別画面で更新されました。再読み込みしてください。');storage.setItem(STATE_KEY,encoded);return {state:next,...calc,saved:true,changed:true,alreadyApplied:false};}
export async function applyIncomePreview(expected,preview,{storage=localStorage,now=new Date().toISOString()}={}){
 const requestDigest=await digest(preview),live=read(storage),w=workflow(live.state.config);
 if(w.lastApply?.requestDigest===requestDigest&&w.lastApply?.afterStateDigest===await digest(withoutPostDigest(live.state))){if(storage.getItem(STATE_KEY)!==live.raw)throw new Error('別画面で更新されました。再読み込みしてください。');return {state:clone(live.state),...calculated(live.state),saved:true,changed:false,alreadyApplied:true};}
 if(!equal(expected,live.state))throw new Error('別画面または現在設定・比較案が更新されています。再読み込みして再試算してください。');
 const verified=revalidateIncomePreview(expected,preview);if(!verified.changed)return {state:clone(live.state),...calculated(live.state),saved:false,changed:false,alreadyApplied:false};
 const next=clone(verified.candidate),record={id:crypto.randomUUID(),at:stamped(now),action:'apply',requestDigest,locator:clone(verified.locator),beforeRow:clone(verified.beforeRow),afterRow:clone(verified.afterRow)};
 next.config.incomeWorkflow={...clone(w),lastApply:record,history:[...clone(w.history),{id:record.id,at:record.at,action:'apply',itemId:record.locator.sourceItemId}].slice(-10)};
 const calc=calculated(next);validateSavedState(next);record.afterStateDigest=await digest(withoutPostDigest(next));return commit(next,live.raw,storage,calc);
}
function undoCandidate(state){
 const w=workflow(state.config),t=w.lastApply;if(!t||typeof t.id!=='string'||!object(t.locator)||!object(t.afterRow))throw new Error('取消できる追加収入の反映記録がありません。');
 const rows=state.config.cashflow?.periodOverrides;if(!Array.isArray(rows))throw new Error('追加収入の保存先が不正です。');
 const matches=rows.map((row,index)=>({row,index})).filter(x=>incomeAdoptionMatches(x.row,t.locator));if(matches.length!==1)throw new Error('取消対象の内部ID・期間が変更または重複しています。');
 if(!equal(matches[0].row,t.afterRow))throw new Error('反映した追加収入が別の操作で変更されています。取消は停止しました。');
 const next=clone(state),target=next.config.cashflow.periodOverrides;
 if(t.beforeRow===null)target.splice(matches[0].index,1);else if(object(t.beforeRow))target[matches[0].index]=clone(t.beforeRow);else throw new Error('取消記録の変更前データが不正です。');
 validateSavedState(next);return {next,w,t};
}
export function incomeUndoStatus(state){try{undoCandidate(state);return {available:true,reason:null};}catch(e){return {available:false,reason:e.message};}}
export async function undoIncomeApply(expected,{storage=localStorage,now=new Date().toISOString()}={}){
 const live=read(storage);if(!equal(expected,live.state))throw new Error('別画面または現在設定・比較案が更新されています。再読み込みしてください。');
 const {next,w,t}=undoCandidate(live.state);next.config.incomeWorkflow={...clone(w),lastApply:null,history:[...clone(w.history),{id:crypto.randomUUID(),at:stamped(now),action:'undo',undoes:t.id,itemId:t.locator.sourceItemId}].slice(-10)};
 return commit(next,live.raw,storage,calculated(next));
}
