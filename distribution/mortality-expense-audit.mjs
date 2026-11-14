/** Read-only verification of monthly death-scenario budget and cash-flow amounts. Units: 万円. */
const money=(value,name)=>{if(typeof value!=='number'||!Number.isFinite(value))throw Error(name+'が未確認です');return value;};
const near=(a,b)=>Math.abs(a-b)<=1e-7*Math.max(1,Math.abs(a),Math.abs(b));
export function auditMortalityExpense(baseline,preview){
 if(!Array.isArray(baseline)||!Array.isArray(preview)||!baseline.length||baseline.length!==preview.length)throw Error('比較の月次行数が一致しません');
 let totalExpenseReduction=0,firstChangedMonth=null;
 const months=baseline.map((base,i)=>{
  const row=preview[i];
  if(base.month!==row?.month)throw Error('比較月の対応が一致しません');
  const before=money(base.expense,'基準管理予算'),reduction=money(row.expenseReduction,'管理予算減額'),after=money(row.expense,'比較後管理予算');
  if(before<0||after<0)throw Error(row.month+'の管理予算が負値です');
  if(!near(before-reduction,after))throw Error(row.month+'の減額と比較後支出が一致しません');
  const income=money(row.income,'比較後収入'),extra=money(row.extraExpense,'臨時支出'),funeral=money(row.funeralExpense,'死亡月一時支出');
  const start=money(row.startAsset,'月初資産'),gain=money(row.investmentGain,'運用益'),end=money(row.endAsset,'月末資産');
  if(!near(start+gain+income-after-extra-funeral,end))throw Error(row.month+'の月末資産が収支に一致しません');
  if(i>0&&!near(preview[i-1].endAsset,start))throw Error(row.month+'の月初残高が前月末と一致しません');
  if(!row.postDeath&&Math.abs(reduction)>1e-7)throw Error('死亡月以前に管理予算を減額しています');
  if(row.postDeath&&firstChangedMonth===null)firstChangedMonth=row.month;
  totalExpenseReduction+=reduction;
  return {month:row.month,postDeath:Boolean(row.postDeath),baselineExpense:before,expenseReduction:reduction,adjustedExpense:after,income,monthEndAsset:end};
 });
 return {verified:true,months,firstChangedMonth,totalExpenseReduction};
}
