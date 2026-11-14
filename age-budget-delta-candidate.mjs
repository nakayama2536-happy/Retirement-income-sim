/** Standalone, non-adopted alternative to the existing absolute age budget reference. */
import {runRetirementPlan,replaceAgeRangeOverride} from './calc.mjs';
import {ageExpenseReference} from './discretionary-travel.mjs';
const near=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-8*Math.max(1,Math.abs(a),Math.abs(b));
export function previewAgeBudgetDelta(config,{fromAge=80,throughAge=120,referenceOptions={}}={}){
 if(!Number.isInteger(fromAge)||fromAge<80||!Number.isInteger(throughAge)||throughAge<fromAge||throughAge>120)throw Error('比較対象の年齢範囲は80～120歳で指定してください');
 const original=structuredClone(config);
 const before=runRetirementPlan(config,{includeMonthlyDetails:true});
 if(!Array.isArray(before.monthlyDetails)||before.monthlyDetails.length===0)throw Error('基準月次台帳がありません');
 const selected=before.monthlyDetails.filter(m=>m.budget&&m.age>=fromAge&&m.age<=throughAge);
 if(selected.length===0)throw Error('対象の管理予算計上月がありません');
 const perAge=new Map();
 for(const m of selected){
  const pf=m.budget?.priceFactor;
  if(m.budget.source!=='budgets-or-periodOverride'||!Number.isFinite(pf)||pf<=0||!Number.isFinite(m.expense)||m.expense<0)throw Error('予算出典・金額・物価係数が未確認です');
  const base=m.expense/pf;
  if(perAge.has(m.age)&&!near(perAge.get(m.age),base))throw Error(m.age+'歳期内の管理予算が月ごとに異なり、安全に年額へ変換できません');
  perAge.set(m.age,base);
 }
 const candidate=structuredClone(config);
 candidate.cashflow??={};
 let overrides=structuredClone(candidate.cashflow.periodOverrides??[]);
 const applied=new Map();
 for(let age=fromAge;age<=throughAge;age++){
  if(!perAge.has(age))continue;
  const ref=ageExpenseReference(age,referenceOptions);
  const change=ref.medicalAdjustment+ref.carAdjustment+ref.transportAdjustment;
  const monthly=perAge.get(age)+change;
  if(!Number.isFinite(monthly)||monthly<0)throw Error(age+'歳期の減額後管理予算が負になるため停止します');
  applied.set(age,change);
  overrides=replaceAgeRangeOverride(overrides,{kind:'budget',key:'budget',label:'年齢閾値差額の比較（未採用）',fromAge:age,toAge:age,amount:monthly*12,unit:'annual'});
 }
 candidate.cashflow.periodOverrides=overrides;
 const after=runRetirementPlan(candidate,{includeMonthlyDetails:true});
 if(before.monthlyDetails.length!==after.monthlyDetails?.length)throw Error('計算月数が変わりました');
 const months=before.monthlyDetails.map((m,i)=>{
  const x=after.monthlyDetails[i],changed=Boolean(m.budget&&applied.has(m.age));
  if(m.month!==x.month||m.age!==x.age||m.annualRowIndex!==x.annualRowIndex)throw Error('月次・年齢期の対応が変わりました');
  if(m.budget?.priceFactor!==x.budget?.priceFactor)throw Error('元の物価係数が変わりました');
  const expected=m.expense+(changed?applied.get(m.age)*m.budget.priceFactor:0);
  if(!near(x.expense,expected))throw Error(m.month+'の予算増減額が月次計算に一致しません');
  return {month:m.month,age:m.age,changed,expenseBefore:m.expense,expenseAfter:x.expense,expenseDifference:x.expense-m.expense,endAssetBefore:m.endAsset,endAssetAfter:x.endAsset};
 });
 if(JSON.stringify(config)!==JSON.stringify(original))throw Error('元設定を変更しました');
 return {stage:'preview-only',mode:'delta-from-adopted-budget',adopted:false,saved:false,candidate,months,finalAssetBefore:before.finalAsset,finalAssetAfter:after.finalAsset,finalAssetDifference:after.finalAsset-before.finalAsset,limitations:['既存の絶対参考額へ置換する比較は変更しません','元の管理予算に年齢閾値の増減だけを一度適用します','対象費目に既に同じ増減が含まれる場合は重複の可能性があるため、採用前に内訳を確認してください']};
}
