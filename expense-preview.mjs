// I-02B/I-07: proposals only. No storage, DOM, clock or generated IDs.
import {inspectCashflowSources,resolveBaseAmount,cashflowSourceSignature as signature} from './cashflow-sources.mjs';
import {reconcileCashflow} from './cashflow-reconciliation.mjs';
import {runForecastFromLatestActual} from './calc.mjs';

const profiles=['public-v0.9','work-v0.9.7'];
const own=(o,k)=>Object.hasOwn(o||{},k);
function validateState(state){
  if(!state?.config||!Array.isArray(state.scenarios)||state.scenarios.some(s=>!s?.config))throw new Error('現在設定・比較案を確認してください。');
}
export function createExpenseDraft(state,{sourceProfile,kind}={}){
  validateState(state);
  if(!profiles.includes(sourceProfile))throw new Error('出典の系統を明示してください。自動選択はしません。');
  if(!['detail','budget'].includes(kind))throw new Error('内訳更新と管理予算変更を分けて指定してください。');
  return {baseSignature:signature(state),sourceProfile,kind,edits:[]};
}
function amountPath(rule){
  const path=rule.sourceRefs[0]?.path;
  if(/^\/cashflow\/periodOverrides\/\d+$/.test(path))return `${path}/amount`;
  if(/^\/budgets\/\d+$/.test(path))return `${path}/${rule.itemId==='management-budget'?'annualBudget':rule.fallbackField}`;
  if(/^\/cashflow\/travel\/\d+$/.test(path))return `${path}/annualAmount`;
  if(path==='/expenseDetail/travelAnnualBase')return path;
  if(/^\/expenseDetail\/monthlyCategories\/\d+(\/items\/\d+)?$/.test(path))return `${path}/amount`;
  if(/^\/cashflow\/expenseCategories\/\d+\/items\/\d+\/periods\/\d+$/.test(path))return `${path}/amount`;
  if(/^\/cashflow\/expenseCategories\/\d+$/.test(path)&&rule.priceBasis==='target-period-nominal')return `${path}/fallbackMonthly`;
  throw new Error('この項目の書込み先は未対応です。元データを変更しません。');
}
function setAmount(config,path,amount){
  const parts=path.slice(1).split('/');let obj=config;
  for(const key of parts.slice(0,-1)){
    if(['__proto__','constructor','prototype'].includes(key)||!own(obj,key))throw new Error('変更対象がありません。');
    obj=obj[key];
  }
  const key=parts.at(-1);if(!own(obj,key))throw new Error('金額が未設定です。補完せず確認してください。');
  const before=structuredClone(obj[key]);obj[key]=amount;return before;
}
const covers=(rule,age)=>rule.period.type==='all'||rule.period.type==='age'&&age>=rule.period.fromAge&&age<=rule.period.toAge;

export function previewExpenseChanges(state,draft){
  validateState(state);
  const empty=createExpenseDraft(state,draft);
  if(draft.baseSignature!==empty.baseSignature)throw new Error('設定・実績・比較案が変わりました。入力元を再確認してください。');
  if(!Array.isArray(draft.edits)||!draft.edits.length)throw new Error('変更する金額を指定してください。');
  const view=inspectCashflowSources(state.config,{sourceProfile:draft.sourceProfile});
  const before=reconcileCashflow(state.config,{sourceProfile:draft.sourceProfile});
  const candidate=structuredClone(state),patches=[],used=new Set();
  for(const edit of draft.edits){
    const matching=view.rules.filter(r=>r.ruleRef===edit.ruleRef&&r.itemId===edit.itemId&&r.profile===draft.sourceProfile);
    if(matching.length!==1)throw new Error('内部ID・期間規則・出典を一意に確認できません。');
    const rule=matching[0],item=view.items.find(i=>i.itemId===edit.itemId);
    const variants=item.variants.filter(v=>v.profile===draft.sourceProfile);
    if(variants.length!==1||variants[0].identityStatus!=='resolved')throw new Error('内部IDが重複・未確定です。');
    const expectedRoute=draft.kind==='detail'?'budget-detail':'budget-total';
    if(item.route!==expectedRoute)throw new Error('内訳更新と管理予算変更を同じ操作へ混在させないでください。');
    if(rule.status!=='resolved'||!['all','age'].includes(rule.period.type))throw new Error('未計算・不正・未対応の元規則は変更できません。');
    if(edit.unit!==rule.unit||edit.priceBasis!==rule.priceBasis||!['plan-start-base','target-period-nominal'].includes(rule.priceBasis))throw new Error('単位・価格基準を変更または推測しないでください。');
    if(typeof edit.amount!=='number'||!Number.isFinite(edit.amount)||edit.amount<0)throw new Error('金額は0以上の有限数値で指定してください。空欄を0にはしません。');
    const path=amountPath(rule);
    if(used.has(path))throw new Error('同じ金額の変更が重複しています。');used.add(path);
    const applicable=[],suppressed=[];
    for(const m of before.months){
      const age=draft.kind==='budget'?(m.budgetReferenceAge??m.age):m.age;
      if(!covers(rule,age))continue;
      const resolved=resolveBaseAmount(view,{itemId:edit.itemId,age});
      if(resolved.reason==='suppressed-by-parent'){suppressed.push(m.month);continue;}
      if(resolved.status!=='resolved')throw new Error('対象期間に競合・未確定の規則があります。');
      if(!resolved.sourceRefs.some(ref=>ref.path===rule.sourceRefs[0].path)){suppressed.push(m.month);continue;}
      // For budget adoption, the chosen source must actually drive this engine.
      if(draft.kind==='budget'&&m.scope==='asset-funded'&&m.budget.check.status!=='resolved')throw new Error('選んだ管理予算と実際の計算元が一致しません。');
      applicable.push(m.month);
    }
    if(!applicable.length)throw new Error('この規則は計画内で適用されていないか、親・上位規則に置換されています。');
    const old=setAmount(candidate.config,path,edit.amount);
    patches.push({itemId:edit.itemId,ruleRef:edit.ruleRef,path,before:old,after:edit.amount,unit:rule.unit,priceBasis:rule.priceBasis,period:structuredClone(rule.period),applicableMonths:applicable,suppressedMonths:suppressed});
  }
  // Editing a parent and its replaced child together would conceal the child edit.
  for(const p of patches){
    const parent=view.items.find(i=>i.itemId===p.itemId)?.parentId;
    if(parent&&patches.some(q=>q.itemId===parent))throw new Error('親項目と子項目は分けて変更してください。');
  }
  const after=reconcileCashflow(candidate.config,{sourceProfile:draft.sourceProfile});
  const forecastBefore=runForecastFromLatestActual(state.config),forecastAfter=runForecastFromLatestActual(candidate.config);
  for(const result of [before.calculation,after.calculation,forecastBefore?.projection,forecastAfter?.projection].filter(Boolean)){
    if(!Number.isFinite(result.finalAsset)||result.rows.some(r=>['startAsset','endAsset','expense','extraExpense','totalIncome','investmentGain'].some(k=>!Number.isFinite(r[k]))))throw new Error('計算結果が数値範囲外です。反映案を停止します。');
  }
  const calculationUnchanged=signature(before.calculation)===signature(after.calculation)&&signature(forecastBefore)===signature(forecastAfter);
  if(draft.kind==='detail'&&!calculationUnchanged)throw new Error('内訳更新だけで資産計算が変わりました。反映案を停止します。');
  if(signature(before.months.map(m=>[m.date,m.age]))!==signature(after.months.map(m=>[m.date,m.age])))throw new Error('金額変更で計算期間が変わりました。反映案を停止します。');
  const months=after.months.map((m,i)=>({month:m.month,date:m.date,scope:m.scope,
    expenseBefore:before.months[i].actual.expense,expenseAfter:m.actual.expense,
    detailBefore:before.months[i].detailTotal,detailAfter:m.detailTotal,
    knownSubtotalBefore:before.months[i].knownSubtotal,knownSubtotalAfter:m.knownSubtotal,
    assessmentBefore:before.months[i].assessment,assessmentAfter:m.assessment,gapBefore:before.months[i].gap,gapAfter:m.gap,
    endAssetBefore:before.months[i].actual.endAsset,endAssetAfter:m.actual.endAsset}));
  const changed=patches.some(p=>signature(p.before)!==signature(p.after));
  return {kind:draft.kind,sourceProfile:draft.sourceProfile,calendarMode:after.calendarMode,baseSignature:empty.baseSignature,
    draft:structuredClone(draft),candidate,patches,changed,calculationUnchanged,
    assetExpenseChanged:before.months.some((m,i)=>m.actual.expense!==after.months[i].actual.expense),
    finalAssetBefore:before.calculation.finalAsset,finalAssetAfter:after.calculation.finalAsset,
    forecastBefore,forecastAfter,months,
    overBudgetMonths:months.filter(m=>m.assessmentAfter==='over-budget').map(m=>m.month),
    unresolvedMonths:months.filter(m=>m.scope==='asset-funded'&&m.gapAfter===null).map(m=>m.month),
    diagnosticsBefore:before.diagnostics,diagnosticsAfter:after.diagnostics,
    notice:draft.kind==='detail'?'内訳のみの変更案です。管理予算と資産推移は変更しません。':'管理予算の変更案です。内訳・旅行費を予算へ別加算しません。',
    stage:'preview-only',saved:false};
}

export function revalidateExpensePreview(state,preview){
  if(!preview||preview.baseSignature!==signature(state))throw new Error('古い試算です。再試算してください。');
  const verified=previewExpenseChanges(state,preview.draft);
  if(signature(verified)!==signature(preview))throw new Error('反映案または試算結果が変わっています。再試算してください。');
  return verified;
}
