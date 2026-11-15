/**
 * UI-only projection of annualCashflowSummary() (annual-cashflow.mjs).
 * No calculated adoption, persistence, network, or financial source reclassification.
 * Inputs use 万円. Outputs are unrounded to preserve existing rounding policy.
 */
const finite = n => typeof n === 'number' && Number.isFinite(n);
const isPeriod = n => Number.isInteger(n) && n >= 1 && n <= 12;

export function makeFamilyCashflowView(summary) {
  if (!summary || summary.status !== 'ready') {
    return {status:'unavailable', reason:'この年齢期の計算結果はまだ確認できません。'};
  }
  if (!Number.isInteger(summary.age) || !isPeriod(summary.monthCount)) {
    return {status:'unavailable',reason:'対象期間・計算月数を確認できません。'};
  }
  const monetary=['incomeTotal','managementExpense','extraExpense','totalExpense','cashBalance','investmentGain','startAsset','endAsset'];
  if (monetary.some(k=>!finite(summary[k]))) {
    return {status:'unavailable',reason:'未入力・未確認の計算額があります。0円として補完しません。'};
  }
  if (summary.identityMatches !== true) {
    return {status:'unavailable',reason:'資産増減と収支の整合を確認できません。'};
  }
  const close=(x,y)=>Math.abs(x-y)<=1e-8*Math.max(1,Math.abs(x),Math.abs(y));
  if (!close(summary.managementExpense+summary.extraExpense,summary.totalExpense)
     || !close(summary.incomeTotal-summary.totalExpense,summary.cashBalance)
     || !close(summary.startAsset+summary.investmentGain+summary.cashBalance,summary.endAsset)) {
    return {status:'unavailable',reason:'収入・支出の集計値が一致しません。'};
  }
  const c=summary.components||{};
  const keys=['labor','primaryPension','spousePension','idecoAnnuity'];
  const known=keys.every(k=>finite(c[k]));
  // Source grouping is not a guarantee of equal monthly payments or entitlement.
  const periodic=known?keys.reduce((sum,k)=>sum+c[k],0):null;
  const other=known?summary.incomeTotal-periodic:null;
  return {
    status:'ready',age:summary.age,monthCount:summary.monthCount,
    periodStart:typeof summary.startDate==='string'?summary.startDate.slice(0,7):null,
    periodEnd:typeof summary.endDate==='string'?summary.endDate.slice(0,7):null,
    incomeTotal:summary.incomeTotal,expenseTotal:summary.totalExpense,
    periodCashBalance:summary.cashBalance,endAsset:summary.endAsset,
    periodGain:summary.investmentGain,
    incomeMonthlyAverage:summary.incomeTotal/summary.monthCount,
    expenseMonthlyAverage:summary.totalExpense/summary.monthCount,
    balanceMonthlyAverage:summary.cashBalance/summary.monthCount,
    sourceColumnsIncome:periodic,otherIncludedIncome:other,
    periodicIncomeKnown:known,
    incomeBreakdown:known?Object.freeze({
      labor:c.labor,primaryPension:c.primaryPension,spousePension:c.spousePension,idecoAnnuity:c.idecoAnnuity
    }):null,
    negativeAgeEnd:summary.endAsset<0,
    limitations:Object.freeze([
      '月平均はこの年齢期の合計を計算対象月数で割った値であり、毎月同じ額が入ることを保証しません。',
      '収入合計には一時金などが含まれる場合があります。NISA等の資産内移動は新規収入として加算しません。',
      '年金は計画上の収入で、実際の振込月・税引後手取・受給資格を保証しません。'
    ])
  };
}
