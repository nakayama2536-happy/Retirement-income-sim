/** Non-adopting age-budget candidate. Compare full engine from the same config. */
import {runRetirementPlan,replaceAgeRangeOverride} from './calc.mjs';
import {ageExpenseReference} from './discretionary-travel.mjs';
const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-8*Math.max(1,Math.abs(a),Math.abs(b));
export function previewAgeBudgetCandidate(config,{fromAge=80,throughAge=120,referenceOptions={}}={}){
 if(!Number.isInteger(fromAge)||fromAge<65||!Number.isInteger(throughAge)||throughAge<fromAge||throughAge>120)throw Error('候補の年齢範囲を確認してください');
 const candidate=structuredClone(config);
 const before=runRetirementPlan(config,{includeMonthlyDetails:true});
 if(!Array.isArray(before.monthlyDetails)||!before.monthlyDetails.length)throw Error('元の月次台帳がありません');
 const targeted=before.monthlyDetails.filter(m=>m.budget&&m.age>=fromAge&&m.age<=throughAge);
 if(!targeted.length)throw Error('比較対象の支出計上月がありません');
 if(targeted.some(m=>m.budget.source!=='budgets-or-periodOverride'||!Number.isFinite(m.budget.priceFactor)||m.budget.priceFactor<0))throw Error('対象月の予算出典・物価係数が未確認です');
 candidate.cashflow??={};
 let overrides=structuredClone(candidate.cashflow.periodOverrides??[]);
 for(let age=fromAge;age<=throughAge;){
  const value=ageExpenseReference(age,referenceOptions).annual;
  let end=age;
  while(end<throughAge&&near(ageExpenseReference(end+1,referenceOptions).annual,value))end++;
  overrides=replaceAgeRangeOverride(overrides,{kind:'budget',key:'budget',label:'年齢別参考支出（比較案・未採用）',fromAge:age,toAge:end,amount:value,unit:'annual'});
  age=end+1;
 }
 candidate.cashflow.periodOverrides=overrides;
 const after=runRetirementPlan(candidate,{includeMonthlyDetails:true});
 if(before.monthlyDetails.length!==after.monthlyDetails.length)throw Error('比較案で計算月数が変わりました');
 const months=before.monthlyDetails.map((m,i)=>{
  const next=after.monthlyDetails[i];
  if(m.month!==next.month||m.age!==next.age||m.annualRowIndex!==next.annualRowIndex)throw Error('比較案で月次年齢期が変わりました');
  if(m.budget?.priceFactor!==next.budget?.priceFactor)throw Error('比較案で物価基準が変わりました');
  const revised=m.budget&&m.age>=fromAge&&m.age<=throughAge;
  if(!revised&&!near(m.expense,next.expense))throw Error('対象外の管理予算支出が変わりました');
  if(revised&&!near(next.expense,ageExpenseReference(m.age,referenceOptions).monthly*next.budget.priceFactor))throw Error('比較案の支出が参照値と一致しません');
  return {month:m.month,age:m.age,changed:revised,expenseBefore:m.expense,expenseAfter:next.expense,expenseDifference:next.expense-m.expense,endAssetBefore:m.endAsset,endAssetAfter:next.endAsset};
 });
 if(!Number.isFinite(before.finalAsset)||!Number.isFinite(after.finalAsset))throw Error('資産計算結果が不正です');
 return {stage:'preview-only',adopted:false,saved:false,candidate,months,finalAssetBefore:before.finalAsset,finalAssetAfter:after.finalAsset,finalAssetDifference:after.finalAsset-before.finalAsset,limitations:['基準案と本人の保存値は変更しません','参考予算を別枠支出に加算しません','税・旅行費の未確定額を補完しません']};
}
