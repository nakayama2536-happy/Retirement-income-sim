/**
 * H-MORT-07 — read-only monthly cost attribution for the death sensitivity.
 * Never writes settings. Uses actual selected expense rows; all unverified
 * budget money goes to a separately adjustable remainder, not a fake category.
 */
import {inspectCashflowSources} from './cashflow-sources.mjs';
import {reconcileCashflow} from './cashflow-reconciliation.mjs';
import {MortalityPreviewError} from './mortality-preview.mjs';

const stop=(code,message)=>{throw new MortalityPreviewError(code,message);};
const EPS=1e-6;
const roundClose=(a,b)=>Math.abs(a-b)<=EPS*Math.max(1,Math.abs(a),Math.abs(b));
const money=(value,label)=>{
  if(typeof value!=='number'||!Number.isFinite(value)||value<0)stop('invalid-itemized-value',label+'の金額が不正です');
  return value;
};
const profiles=['public-v0.9','work-v0.9.7'];

export function selectMortalityExpenseProfile(config,selection=''){
  const selected=String(selection||config?.cashflow?.detailSourceProfile||'');
  if(selected){if(!profiles.includes(selected))stop('expense-source-invalid','費目内訳の出典を確認してください');return selected;}
  const available=inspectCashflowSources(config,{sourceProfile:'unknown'}).availableProfiles.filter(p=>profiles.includes(p));
  if(available.length>1)stop('expense-source-ambiguous','登録済みの支出内訳が複数あります。「万一のときの比較」に使う参照先を選択してください。');
  return available[0]||null;
}
function actualLeaves(node,output){
  if(node.children?.length){for(const child of node.children)actualLeaves(child,output);return;}
  if(node.priced?.status!=='resolved')return; // unknown goes into remainder
  const amount=money(node.priced.amount,'費目');
  if(amount>EPS)output.push({id:String(node.itemId),amount});
}
export function inspectMortalityExpenseBudget(config,monthlyRows,{sourceProfile=''}={}){
  if(!Array.isArray(monthlyRows)||!monthlyRows.length)stop('missing-expense-months','元の月次支出台帳がありません');
  const profile=selectMortalityExpenseProfile(config,sourceProfile);
  const trace=profile?reconcileCashflow(config,{sourceProfile:profile}):null;
  if(trace&&trace.months.length!==monthlyRows.length)stop('expense-month-count','費目内訳と月次資産計算の期間が一致しません');
  if(trace?.blockers?.length||trace?.comparisonDiagnostics?.some(d=>/identity|duplicate|ambiguous|source-conflict/.test(d.code||'')))
    stop('expense-source-conflict','費目のIDや出典に競合があります。元の支出内訳を確認してください');
  const labels=new Map();
  const monthRows=monthlyRows.map((r,i)=>{
    const total=money(r.expense,'管理予算');
    const matching=trace?.months[i];
    if(matching&&(matching.month!==r.month||!roundClose(matching.actual.expense,total)))stop('expense-month-mismatch','管理予算と登録内訳の年月・金額が一致しません');
    const leaves=[];
    if(matching?.scope==='asset-funded')for(const x of matching.details)actualLeaves(x,leaves);
    const amounts={};let known=0;
    for(const leaf of leaves){
      if(!leaf.id||leaf.id==='unallocated'||Object.hasOwn(amounts,leaf.id))
        stop('expense-item-duplicate',r.month+'に費目IDの重複を検出しました');
      amounts[leaf.id]=leaf.amount;known+=leaf.amount;
    }
    if(known-total>EPS*Math.max(1,total))stop('expense-over-budget',r.month+'の費目合計が管理予算を超えています');
    const residual=Math.max(0,total-known);
    for(const id of Object.keys(amounts)){
      const item=trace?.months[i]?.details?.length?null:null;
      if(!labels.has(id))labels.set(id,id);
    }
    return {month:r.month,expense:total,known,unallocated:residual,amounts};
  });
  if(trace){
    const view=inspectCashflowSources(config,{sourceProfile:profile});
    for(const item of view.items||[])if(labels.has(item.itemId))labels.set(item.itemId,String(item.label||item.itemId));
  }
  const items=[...labels].map(([id,label])=>({id,label})).sort((a,b)=>a.label.localeCompare(b.label,'ja'));
  return {sourceProfile:profile,items,months:monthRows};
}
export function applyMortalityExpenseMultipliers(monthlyRows,budget,{factors={},unallocatedFactor=1}={}){
  if(!Array.isArray(monthlyRows)||monthlyRows.length!==budget?.months?.length)stop('expense-month-count','元の月次台帳と費目内訳の件数が一致しません');
  const mul=(value,label)=>{
    if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>3)stop('invalid-expense-factor',label+'の倍率は0～3倍で入力してください');
    return value;
  };
  const rem=mul(unallocatedFactor,'未照合予算');
  const ids=budget.items.map(x=>x.id);
  for(const id of ids)mul(factors[id],id);
  for(const key of Object.keys(factors))if(!ids.includes(key))stop('unknown-expense-item',key+'の費目が現在の内訳にありません');
  const out=monthlyRows.map((r,i)=>{
    const src=budget.months[i];
    if(r.month!==src.month||!roundClose(r.expense,src.expense))stop('expense-month-mismatch','月次台帳が変更されました。再取得してください');
    const expenseComponents={unallocated:src.unallocated};
    for(const id of Object.keys(src.amounts))expenseComponents[id]=src.amounts[id];
    const reference=src.unallocated*rem+Object.entries(src.amounts).reduce((s,[id,value])=>s+value*factors[id],0);
    return {...r,expenseComponents,itemizedExpensePreview:reference,itemizedBudgetRemainder:src.unallocated};
  });
  return {monthlyRows:out,costFactors:{...factors,unallocated:rem}};
}
