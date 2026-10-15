// Draft-only: versioned, non-adopting comparison scenarios.
// No browser storage, network, account data, or calculations are written here.
import {configSignature} from './storage.mjs';

export const SAVED_COMPARISON_FEATURE='full-plan-comparison-saved-v1';
const snapshot=config=>{
 const copy=structuredClone(config);
 for(const key of ['actuals','reviews','pendingDecisions'])delete copy[key];
 return copy;
};
const eq=(a,b)=>configSignature(a)===configSignature(b);
// This fingerprint is for a *display-only* stale-basis warning.
// Actual optimistic concurrency always checks the full config and state.
export function comparisonSourceFingerprint(config){
 const s=configSignature(config);let h=0xcbf29ce484222325n;
 for(let i=0;i<s.length;i++){h^=BigInt(s.charCodeAt(i));h=(h*0x100000001b3n)&0xffffffffffffffffn;}
 return h.toString(16).padStart(16,'0');
}
const defs=[
 ['plan.startDate','計算開始日',c=>c?.plan?.startDate],
 ['plan.startAge','計算開始年齢',c=>c?.plan?.startAge],
 ['plan.calendarMode','年齢期の期間方式',c=>c?.plan?.calendarMode],
 ['plan.initialAsset','開始資産（万円）',c=>c?.plan?.initialAsset],
 ['plan.openingBalance','開始資産の評価月・範囲確認',c=>c?.plan?.openingBalance],
 ['plan.priceBaseMonth','物価基準月',c=>c?.plan?.priceBaseMonth],
 ['plan.idecoAssetScope','iDeCo資産範囲',c=>c?.plan?.idecoAssetScope],
 ['plan.initialAssetIncludesIdeco','旧iDeCo包含区分',c=>c?.plan?.initialAssetIncludesIdeco],
 ['cashflow.salaryLife.lastSalaryMonth','給与生活最終月',c=>c?.cashflow?.salaryLife?.lastSalaryMonth],
 ['ideco.annuityStartMonth','iDeCo年金初回月',c=>c?.ideco?.annuityStartMonth],
 ['employment.primary.sideWork.startDate','本人アルバイト開始日',c=>c?.employment?.primary?.sideWork?.startDate],
 ['employment.primary.sideWork.startMode','本人アルバイト開始方式',c=>c?.employment?.primary?.sideWork?.startMode],
 ['budgets','年齢帯別年間管理予算',c=>c?.budgets],
 ['events','臨時収支',c=>c?.events]
];
function shown(v,key){
 if(v===undefined||v===null||v==='')return '未設定';
 if(key==='budgets'&&Array.isArray(v))return v.map(b=>String(b.fromAge)+'～'+String(b.toAge)+'歳 '+String(b.annualBudget)+'万円/年').join(' ／ ')||'なし';
 if(key==='events'&&Array.isArray(v))return v.map(e=>[e.date||'',e.label||'',e.type==='expense'?'支出':'収入',String(e.amount)+'万円',e.fundingTreatment||''].join(' ')).join(' ／ ')||'なし';
 if(typeof v==='object')return JSON.stringify(v);
 return String(v);
}
export function comparisonDifferences(current,proposed){
 if(!current||!proposed)throw new Error('比較対象の設定がありません。');
 return defs.flatMap(([key,label,get])=>{
   const a=get(current),b=get(proposed);
   return eq(a,b)?[]:[{key,label,before:shown(a,key),after:shown(b,key)}];
 });
}
export function isSavedComparison(s){return s?.comparisonPlan?.version===1&&s.comparisonPlan.kind===SAVED_COMPARISON_FEATURE;}
export function savedComparisons(scenarios){return (scenarios||[]).filter(isSavedComparison);}
export function savedComparisonView(current,scenario){
 if(!isSavedComparison(scenario)||!scenario.config)throw new Error('保存済みの全条件比較案ではありません。');
 return {stale:comparisonSourceFingerprint(current)!==scenario.comparisonPlan.baseFingerprint,
   differences:comparisonDifferences(current,scenario.config)};
}
export function prepareSavedComparison({current,scenarios,proposal,request,name,id,now,expectedFingerprint}){
 if(!current||!proposal||!request||!Array.isArray(scenarios))throw new Error('比較案の保存条件が不足しています。');
 if(comparisonSourceFingerprint(current)!==expectedFingerprint)throw new Error('現在設定が変わりました。比較案を再試算してください。');
 if(typeof id!=='string'||!id.trim()||scenarios.some(s=>s.id===id))throw new Error('比較案IDが不正または重複しています。');
 if(!(typeof now==='string'&&!Number.isNaN(Date.parse(now))))throw new Error('保存日時が不正です。');
 const n=(name||'全条件比較案').trim();
 if(!n||n.length>80)throw new Error('比較案名は80文字以内にしてください。');
 const differences=comparisonDifferences(current,proposal);
 if(!differences.length)throw new Error('現在設定との差分がありません。保存する比較案の条件を確認してください。');
 const target=snapshot(proposal);
 const existing=savedComparisons(scenarios).find(s=>eq(snapshot(s.config),target));
 if(existing)return {duplicate:true,scenario:existing,scenarios:structuredClone(scenarios)};
 const draft=structuredClone(request);
 // A past confirmation is not authorization for a future new trial.
 if(!draft.opening||typeof draft.opening!=='object')throw new Error('開始残高条件がありません。');
 draft.opening.openingConfirmed=false;
 const record={id,name:n,role:'scenario',selected:false,savedAt:now,config:target,
   comparisonPlan:{version:1,kind:SAVED_COMPARISON_FEATURE,baseFingerprint:expectedFingerprint,inputs:draft}};
 return {duplicate:false,scenario:record,scenarios:[...structuredClone(scenarios),record],differences};
}
