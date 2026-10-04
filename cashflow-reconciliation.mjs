// Read-only I-10B. Never imports storage or adopts settings.
import {runRetirementPlan} from './calc.mjs';
import {inspectCashflowSources, resolveBaseAmount} from './cashflow-sources.mjs';
const close=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-9*Math.max(1,Math.abs(a),Math.abs(b));
const pending=reason=>({status:'unresolved',amount:null,reason});

// Input is an I-02A base result, not an already escalated display amount.
export function priceBaseForMonth(base,priceFactor) {
  if(base.status!=='resolved')return pending(base.reason||base.status);
  if(!Number.isFinite(base.amount)||base.amount<0||!['monthly','annual'].includes(base.unit))return pending('invalid-amount-or-unit');
  let factor;
  if(base.priceBasis==='plan-start-base')factor=priceFactor;
  else if(['nominal-fixed','target-period-nominal'].includes(base.priceBasis))factor=1;
  else return pending('unresolved-price-basis');
  if(!Number.isFinite(factor)||factor<0)return pending('missing-engine-price-factor');
  const amount=base.amount*(base.unit==='annual'?1/12:1)*factor;
  return Number.isFinite(amount)?{status:'resolved',amount,priceFactor:factor}:pending('amount-overflow');
}

// Generate source and trace together from one immutable snapshot. Callers cannot
// accidentally pair a stale trace or candidate calendar with another setting.
export function reconcileCashflow(config,{sourceProfile='unknown',identityBindings=[],calculationOptions={}}={}) {
  const snapshot=structuredClone(config);
  const view=inspectCashflowSources(snapshot,{sourceProfile,identityBindings});
  const calculation=runRetirementPlan(snapshot,{...calculationOptions,includeMonthlyDetails:true});
  const calendarMode=calculation.calendarMode||'legacy';
  const activeVariants=item=>item.variants.filter(v=>sourceProfile==='unknown'||v.profile===sourceProfile);
  const roots=view.items.filter(i=>i.route==='budget-detail'&&activeVariants(i).some(v=>!v.parentId));
  const diagnostics=view.diagnostics.filter(d=>!d.profile||sourceProfile==='unknown'||d.profile===sourceProfile);
  const comparisonDiagnostics=diagnostics.filter(d=>!/^\/(events|ideco)(\/|$)|^\/cashflow\/manualIncomeItems(\/|$)/.test(d.path||''));
  const blockers=view.blockers.filter(d=>sourceProfile==='unknown'||d.profile===sourceProfile);
  const resolve=(id,age)=>resolveBaseAmount(view,{itemId:id,age});
  function detail(item,age,factor) {
    const base=resolve(item.itemId,age);
    // Price each child independently. A parent override replaces every child.
    // Incomplete aggregates remain unresolved; known children are not a total.
    if(['child-aggregate','incomplete-detail'].includes(base.reason)) {
      const ids=[...new Set(activeVariants(item).flatMap(v=>v.children))];
      const children=ids.map(id=>detail(view.items.find(i=>i.itemId===id),age,factor));
      const amount=children.reduce((s,c)=>s+(c.priced.amount??0),0);
      const priced=base.status==='resolved'&&children.length&&children.every(c=>c.priced.status==='resolved')&&Number.isFinite(amount)
        ?{status:'resolved',amount}:pending('incomplete-priced-children');
      return {itemId:item.itemId,base,priced,children,knownSubtotal:children.reduce((s,c)=>s+(c.knownSubtotal??c.priced.amount??0),0)};
    }
    return {itemId:item.itemId,base,priced:priceBaseForMonth(base,factor)};
  }
  const months=calculation.monthlyDetails.map(m=>{
    const factor=m.budget?.priceFactor??null;
    const details=roots.map(item=>detail(item,m.age,factor));
    const knownSubtotal=details.reduce((s,d)=>s+(d.knownSubtotal??d.priced.amount??0),0);
    const complete=roots.some(i=>i.kind==='expense')&&details.length>0&&details.every(d=>d.priced.status==='resolved')&&!blockers.length&&!comparisonDiagnostics.length&&Number.isFinite(knownSubtotal);
    const detailTotal=complete?knownSubtotal:null;
    let budgetBase, budgetCheck;
    if(!m.budget) {
      budgetBase=resolve('management-budget',m.age);
      budgetCheck={status:'not-asset-funded',amount:null,reason:'family-reference-only'};
    } else if(m.budget.source==='salaryLife.pre65MonthlyBudget') {
      // This is already the engine's explicit selected budget, not an old age-65 fallback.
      budgetBase={status:'resolved',amount:m.budget.baseAnnualAmount,unit:'annual',priceBasis:'plan-start-base',sourceRefs:[{path:'/cashflow/salaryLife/pre65MonthlyBudget'}]};
      budgetCheck=priceBaseForMonth(budgetBase,factor);
    } else {
      budgetBase=resolve('management-budget',m.budget.budgetAge);
      budgetCheck=priceBaseForMonth(budgetBase,factor);
    }
    if(m.budget&&budgetCheck.status==='resolved'&&!close(budgetCheck.amount,m.expense))budgetCheck={...budgetCheck,status:'mismatch',reason:'source-budget-differs-from-engine'};
    let assessment='unresolved',gap=null;
    if(!m.budget)assessment='family-reference-only';
    else if(budgetCheck.status==='resolved'&&!comparisonDiagnostics.some(d=>/identity|duplicate|ambiguous|source-conflict/.test(d.code))) {
      if(Number.isFinite(knownSubtotal)&&knownSubtotal>m.expense&&!close(knownSubtotal,m.expense))assessment='over-budget';
      else if(complete)assessment='within-budget';
      if(complete)gap=m.expense-detailTotal;
    }
    const references=view.items.filter(i=>['income-reference','income-posted','extra-expense','asset-transfer'].includes(i.route)&&activeVariants(i).length).map(i=>{
      const base=resolve(i.itemId,m.age);
      return {itemId:i.itemId,route:i.route,base,priced:priceBaseForMonth(base,factor),includedInBudgetComparison:false};
    });
    return {calendarMode,month:m.month,date:m.date,age:m.age,annualAge:m.annualAge,annualRowIndex:m.annualRowIndex,baseDate:m.baseDate,monthsFromBase:m.monthsFromBase,phase:m.phase,cashflowMode:m.cashflowMode,
      scope:m.budget?'asset-funded':'family-reference',budgetReferenceAge:m.budget?.budgetAge??null,priceFactor:factor,
      budget:{base:budgetBase,check:budgetCheck,actualExpense:m.expense},details,detailTotal,knownSubtotal:Number.isFinite(knownSubtotal)?knownSubtotal:null,assessment,gap,references,
      actual:{expense:m.expense,extraExpense:m.extraExpense,totalIncome:m.totalIncome,endAsset:m.endAsset},
      // These are inner components only, never summed into actual or detail totals.
      components:{scheduledExtraExpense:m.scheduledExtraExpense,householdAddition:m.householdAddition,householdWithdrawal:m.householdWithdrawal,idecoFunding:structuredClone(m.idecoFunding)}};
  });
  const periods=calculation.rows.map((row,index)=>{
    const selected=months.filter(m=>m.annualRowIndex===index),funded=selected.filter(m=>m.scope==='asset-funded');
    const complete=funded.length>0&&funded.every(m=>m.gap!==null);
    const actualExpense=selected.reduce((s,m)=>s+m.actual.expense,0);
    return {calendarMode,annualRowIndex:index,age:row.age,monthCount:selected.length,assetFundedMonthCount:funded.length,familyReferenceMonthCount:selected.length-funded.length,
      actualExpense,annualExpenseMatches:close(actualExpense,row.expense),
      detailTotal:complete?funded.reduce((s,m)=>s+m.detailTotal,0):null,
      gap:complete?funded.reduce((s,m)=>s+m.gap,0):null,
      overBudgetMonths:funded.filter(m=>m.assessment==='over-budget').map(m=>m.month),
      unresolvedMonthCount:funded.filter(m=>m.gap===null).length};
  });
  return {calendarMode,sourceProfile,months,periods,diagnostics:structuredClone(diagnostics),comparisonDiagnostics:structuredClone(comparisonDiagnostics),blockers:structuredClone(blockers),calculation,
    limitations:['読取り照合のみ。内訳・参考収入・資産振替は資産推移へ追加計上しません。','給与生活中は家計の基準額を保持しますが、実計上の価格係数がないため基準額の価格補正・予算余裕判定は行いません。','未計算の税額や不正・未入力項目があれば全内訳の合計・余裕額は未確定です。']};
}
