// Read-only view of the same reconciliation used by expense previews.
import {reconcileCashflow} from './cashflow-reconciliation.mjs';
import {inspectCashflowSources} from './cashflow-sources.mjs';
const profiles=['public-v0.9','work-v0.9.7'];
export function expenseDisplayProfile(config,requested=''){
 if(profiles.includes(requested))return requested;
 if(requested)return null;
 const applied=config.expenseWorkflow?.lastApply?.sourceProfile;
 if(profiles.includes(applied))return applied;
 const present=[];
 if(config.cashflow?.expenseCategories?.length)present.push('public-v0.9');
 if(config.expenseDetail?.monthlyCategories?.length)present.push('work-v0.9.7');
 return present.length===1?present[0]:null;
}
export function expenseDisplayModel(config,age,{sourceProfile=''}={}){
 const profile=expenseDisplayProfile(config,sourceProfile);
 if(!profile)return {status:'choose-source',sourceProfile:null,rows:[],message:'表示する内訳の出典を選択してください。異なる形式は合算しません。'};
 const rec=reconcileCashflow(config,{sourceProfile:profile}),period=rec.periods.find(p=>p.age===Number(age));
 if(!period)return {status:'no-period',sourceProfile:profile,rows:[],message:'この年齢期の計算結果はありません。'};
 const months=rec.months.filter(m=>m.annualRowIndex===period.annualRowIndex),view=inspectCashflowSources(config,{sourceProfile:profile});
 function aggregate(id,entries){
  const item=view.items.find(i=>i.itemId===id),variant=item?.variants.find(v=>v.profile===profile);
  const valid=entries.length===months.length&&entries.every(e=>e.priced.status==='resolved'&&Number.isFinite(e.priced.amount));
  const childIds=[...new Set(entries.flatMap(e=>(e.children||[]).map(c=>c.itemId)))];
  return {itemId:id,label:variant?.label||item?.label||id,amount:valid?entries.reduce((s,e)=>s+e.priced.amount,0):null,
   children:childIds.map(child=>aggregate(child,entries.flatMap(e=>(e.children||[]).filter(c=>c.itemId===child)))),
   sourceRefs:[...new Set(entries.flatMap(e=>(e.base.sourceRefs||[]).map(x=>x.path)))],
   unresolvedReasons:[...new Set(entries.filter(e=>e.priced.status!=='resolved').map(e=>e.priced.reason||'未確定'))]};
 }
 const ids=[...new Set(months.flatMap(m=>m.details.map(d=>d.itemId)))];
 return {status:'ready',sourceProfile:profile,age:Number(age),period,rows:ids.map(id=>aggregate(id,months.flatMap(m=>m.details.filter(d=>d.itemId===id)))),
  months:months.map(m=>({month:m.month,date:m.date,scope:m.scope,detailTotal:m.detailTotal,gap:m.gap,actualExpense:m.actual.expense,assessment:m.assessment})),
  diagnostics:rec.comparisonDiagnostics,limitations:rec.limitations};
}
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>n===null||n===undefined||!Number.isFinite(n)?'未確定':`${n.toLocaleString('ja-JP',{maximumFractionDigits:2})}万円`;
export function expenseDisplayHtml(model){
 if(model.status!=='ready')return {detail:`<p>${escape(model.message)}</p>`,summary:'<p>未選択・未計算の値を0円として扱いません。</p>'};
 const label=model.sourceProfile==='public-v0.9'?'公開元 v0.9形式':'Work v0.9.7形式';
 function row(r){return `<details><summary>${escape(r.label)}：${money(r.amount)}（この年齢期の合計）</summary><p>内部ID：${escape(r.itemId)}</p>${r.children.map(row).join('')}<p>参照元：${escape(r.sourceRefs.join('、'))}</p>${r.unresolvedReasons.length?'<p>一部の月・価格基準等が未確定です。子項目と親項目は二重加算しません。</p>':''}</details>`;}
 const p=model.period;
 return {detail:`<p>表示出典：${label}／${model.age}歳期・${p.monthCount}か月。月額ではなく、計算対象月を合計しています。</p>${model.rows.map(row).join('')}`,
  summary:`<dl><dt>資産計算の管理予算支出</dt><dd>${money(p.actualExpense)}</dd><dt>内訳合計（資産から支払う月のみ）</dt><dd>${money(p.detailTotal)}</dd><dt>予算との差（同じ対象月）</dt><dd>${money(p.gap)}</dd><dt>予算超過月</dt><dd>${escape(p.overBudgetMonths.join('、')||'検出なし')}</dd><dt>未確定の照合月</dt><dd>${p.unresolvedMonthCount}か月</dd><dt>給与生活等の家計参考月</dt><dd>${p.familyReferenceMonthCount}か月</dd></dl><p>内訳・税社保参考額・資産振替は資産推移へ再加算しません。家計参考月は上の内訳合計・余裕判定に含みません。未確定がある場合、超過の検出なしは予算十分の保証ではありません。</p><p>${model.limitations.map(escape).join(' ')}</p>${model.diagnostics.length?`<p>出典・項目等の確認事項：${model.diagnostics.length}件。全内訳の確定とは扱いません。</p>`:''}`};
}
