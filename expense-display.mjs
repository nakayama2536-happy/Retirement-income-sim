import {dateWithAge} from './date-display.mjs';
// Read-only view of the same reconciliation used by expense previews.
import {reconcileCashflow} from './cashflow-reconciliation.mjs';
import {inspectCashflowSources} from './cashflow-sources.mjs';
import {expenseSourceReadiness} from './expense-source-readiness.mjs';
const profiles=['public-v0.9','work-v0.9.7'];
export function expenseDisplayProfile(config,requested=''){
 if(profiles.includes(requested))return requested;
 if(requested)return null;
 // Standard data is preferred for normal UI; a historic profile is never silently adopted.
 return config?.expenseDetail?.monthlyCategories?.length?'work-v0.9.7':null;
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
  const sourceRefs=[...new Set(entries.flatMap(e=>(e.base.sourceRefs||[]).map(x=>x.path)))];
  // Diagnostics can point to the exact stored row even when resolution failed.
  const storedPaths=(variant?.sourceRefs||[]).map(r=>r.path);
  const diagnostics=view.diagnostics.filter(d=>[...storedPaths,...sourceRefs].includes(d.path)).map(d=>d.code);
  const unresolvedReasons=[...new Set(entries.filter(e=>e.priced.status!=='resolved').flatMap(e=>[e.base.reason,e.priced.reason].filter(Boolean)))];
  return {itemId:id,label:variant?.label||item?.label||id,amount:valid?entries.reduce((s,e)=>s+e.priced.amount,0):null,
   children:childIds.map(child=>aggregate(child,entries.flatMap(e=>(e.children||[]).filter(c=>c.itemId===child)))),
   sourceRefs,diagnosticCodes:diagnostics,
   unresolvedReasons};
 }
 const ids=[...new Set(months.flatMap(m=>m.details.map(d=>d.itemId)))];
 return {status:'ready',sourceProfile:profile,age:Number(age),period,rows:ids.map(id=>aggregate(id,months.flatMap(m=>m.details.filter(d=>d.itemId===id)))),
  months:months.map(m=>({month:m.month,date:m.date,scope:m.scope,detailTotal:m.detailTotal,gap:m.gap,actualExpense:m.actual.expense,assessment:m.assessment})),
  diagnostics:rec.comparisonDiagnostics,limitations:rec.limitations,
  sourceReadiness:profile==='work-v0.9.7'?expenseSourceReadiness(config):null};
}
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Convert provenance/validation statuses into actionable labels without changing source data.
export function expenseUnresolvedGuidance(reasons=[], diagnostics=[]){
 const codes=new Set([...reasons,...diagnostics]);
 const messages=[];
 if(codes.has('identity-unresolved')||codes.has('missing-identity'))messages.push('項目を識別するID・キーが不足しています。保存済みデータの照合が必要です。');
 if(codes.has('invalid-or-missing-amount'))messages.push('金額が未入力または不正です。0円には置き換えません。');
 if(codes.has('deferred-tax-calculation')||codes.has('work-income-tax-estimate-or-fallback'))messages.push('税・社会保険の算定条件が未確定です。参考額を採用しません。');
 if(codes.has('unresolved-price-basis')||codes.has('missing-engine-price-factor'))messages.push('価格基準または物価換算条件が未確定です。');
 if(codes.has('overlapping-rules')||codes.has('invalid-period'))messages.push('期間設定が重複または不正です。');
 if(!messages.length&&codes.size)messages.push('内訳に未確定の条件があります。項目・金額・適用期間を確認してください。');
 return messages;
}
// A read-only view: never modifies saved expense rows or attempts to derive missing values.
export function expenseDiagnosticSummary(model){
 if(model?.status!=='ready')return {total:0,items:[],counts:{identity:0,amount:0,tax:0,period:0,price:0,other:0}};
 const items=[];
 function visit(row,parents=[]){
  const children=Array.isArray(row.children)?row.children:[];
  const unresolvedChildren=children.filter(c=>c.amount===null);
  for(const child of children)visit(child,[...parents,row.label]);
  // Count only the most specific affected row to avoid reporting a parent twice.
  if(row.amount!==null && row.amount!==undefined)return;
  if(unresolvedChildren.length)return;
  const codes=new Set([...(row.unresolvedReasons||[]),...(row.diagnosticCodes||[])]);
  const categories=[];
  if(codes.has('missing-identity')||codes.has('identity-unresolved')||codes.has('duplicate-identity')||codes.has('duplicate-key')||codes.has('incompatible-identity'))categories.push('identity');
  if(codes.has('invalid-or-missing-amount'))categories.push('amount');
  if(codes.has('deferred-tax-calculation')||codes.has('work-income-tax-estimate-or-fallback'))categories.push('tax');
  if(codes.has('overlapping-rules')||codes.has('invalid-period')||codes.has('no-period')||codes.has('missing-periods'))categories.push('period');
  if(codes.has('unresolved-price-basis')||codes.has('missing-engine-price-factor'))categories.push('price');
  if(!categories.length)categories.push('other');
  items.push({label:[...parents,row.label].join(' ＞ '),categories});
 }
 for(const row of model.rows||[])visit(row);
 const counts={identity:0,amount:0,tax:0,period:0,price:0,other:0};
 for(const item of items)for(const category of item.categories)counts[category]++;
 return {total:items.length,items,counts};
}
export function expenseDiagnosticSummaryHtml(model){
 const info=expenseDiagnosticSummary(model);
 if(!info.total)return '';
 const labels={identity:'識別情報不足',amount:'金額未入力・不正',tax:'税・社会保険の算定待ち',period:'適用期間の確認',price:'物価換算条件の確認',other:'その他・要確認'};
 const counts=Object.entries(info.counts).filter(([,n])=>n).map(([key,n])=>`${labels[key]}${n}件`).join('／');
 const entries=info.items.map(item=>`<li>${escape(item.label)}：${item.categories.map(c=>labels[c]).join('、')}</li>`).join('');
 return `<details class="expense-diagnostic-summary"><summary>未確定の原因一覧（${info.total}項目・読取り専用）</summary><p>${counts}。複数原因がある項目はそれぞれ計上しています。確定値への変更や自動補完は行いません。</p><ul>${entries}</ul><p>管理予算の資産計算には、この参考内訳を追加しません。</p></details>`;
}
// Structural diagnostics only: never print financial amounts or update source rows.
export function expenseSourceReadinessHtml(audit){
 if(audit?.status!=='ready'||!audit.counts?.needsReview)return '';
 const unresolved=audit.items.filter(x=>x.action!=='確認済みの基礎入力');
 const status=id=>id==='missing'?'不足':id==='invalid'?'不正':id==='not-applicable'?'対象外':'あり';
 return `<details class="expense-source-readiness"><summary>保存元の入力状態を確認（${unresolved.length}項目・読取り専用）</summary><p>基礎入力の構造だけを確認します。期間別の上書き・計算結果・税額の確定を意味しません。金額や保存値は変更しません。</p><ul>${unresolved.map(x=>`<li>${escape(x.label)}：識別情報 ${status(x.identity)}／基礎金額 ${status(x.amount)}。対応：${escape(x.action)}</li>`).join('')}</ul></details>`;
}
const money=n=>n===null||n===undefined||!Number.isFinite(n)?'未確定':`${n.toLocaleString('ja-JP',{maximumFractionDigits:2})}万円`;
export function expenseDisplayHtml(model,config){
 if(model.status!=='ready')return {detail:`<p>${escape(model.message)}</p>`,summary:'<p>未選択・未計算の値を0円として扱いません。</p>'};
 const label=model.sourceProfile==='public-v0.9'?'旧形式の生活費内訳':'標準の生活費内訳';
 function row(r){
  const guidance=r.amount===null?expenseUnresolvedGuidance(r.unresolvedReasons,r.diagnosticCodes):[];
  const explanation=guidance.length?`<ul>${guidance.map(g=>`<li>${escape(g)}</li>`).join('')}</ul>`:'';
  // Raw paths are retained for auditing but hidden from ordinary reading.
  const audit=`<details><summary>技術情報（確認用）</summary><p>内部ID：${escape(r.itemId)}</p><p>参照元：${escape(r.sourceRefs.join('、'))}</p></details>`;
  return `<details><summary>${escape(r.label)}：${money(r.amount)}（この年齢期の合計）</summary>${explanation}${r.children.map(row).join('')}${audit}${r.amount===null?'<p>未確定の費目は0円として合計せず、親子費目も二重加算しません。</p>':''}</details>`;
 }
 const p=model.period;
 return {detail:`<p>表示出典：${label}／${model.age}歳期・${p.monthCount}か月。月額ではなく、計算対象月を合計しています。</p>${expenseDiagnosticSummaryHtml(model)}${expenseSourceReadinessHtml(model.sourceReadiness)}${model.rows.map(row).join('')}`,
  summary:`<dl><dt>資産計算の管理予算支出</dt><dd>${money(p.actualExpense)}</dd><dt>内訳合計（資産から支払う月のみ）</dt><dd>${money(p.detailTotal)}</dd><dt>予算との差（同じ対象月）</dt><dd>${money(p.gap)}</dd><dt>予算超過月</dt><dd>${escape(p.overBudgetMonths.map(m=>dateWithAge(m,config)).join('、')||'検出なし')}</dd><dt>未確定の照合月</dt><dd>${p.unresolvedMonthCount}か月</dd><dt>給与生活等の家計参考月</dt><dd>${p.familyReferenceMonthCount}か月</dd></dl><p>内訳・税社保参考額・資産振替は資産推移へ再加算しません。家計参考月は上の内訳合計・余裕判定に含みません。未確定がある場合、超過の検出なしは予算十分の保証ではありません。</p><p>${model.limitations.map(escape).join(' ')}</p>${model.diagnostics.length?`<p>出典・項目等の確認事項：${model.diagnostics.length}件。全内訳の確定とは扱いません。</p>`:''}`};
}
