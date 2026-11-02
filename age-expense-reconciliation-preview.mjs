/**
 * Read-only age-expense comparison against the actual reconciled monthly
 * management budget. Unit: 万円. No saving, budget replacement, or repricing
 * of the underlying engine.
 */
import {ageExpenseReference} from './discretionary-travel.mjs';
const finite=(n)=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
const near=(a,b)=>Math.abs(a-b)<=1e-8*Math.max(1,Math.abs(a),Math.abs(b));
export function previewAgeExpenseAgainstReconciliation(reconciliation,options={}){
 if(!Array.isArray(reconciliation?.months)||!Array.isArray(reconciliation?.periods))throw Error('月次照合結果が必要です');
 const months=reconciliation.months.map(m=>{
  const unresolved=(reason)=>({month:m?.month??null,age:m?.age??null,annualRowIndex:m?.annualRowIndex??null,status:'unresolved',reason,referenceMonthly:null,actualMonthly:null,variance:null});
  if(!m||m.scope!=='asset-funded'||!Number.isInteger(m.age)||m.age<0||m.age>120)return unresolved('資産負担の月次年齢が確認できません');
  if(m.budget?.check?.status!=='resolved'||!finite(m.priceFactor)||!finite(m.actual?.expense)||!near(m.budget.check.amount,m.actual.expense))return unresolved('管理予算または元の物価係数が確認できません');
  if(m.budget.base?.priceBasis!=='plan-start-base')return unresolved('管理予算の価格基準が異なります');
  const reference=ageExpenseReference(m.age,options);
  const ref=reference.monthly*m.priceFactor;
  if(!finite(ref))return unresolved('参照支出が数値範囲外です');
  return {month:m.month,age:m.age,annualRowIndex:m.annualRowIndex,status:'reference-only',referenceBaseMonthly:reference.monthly,referenceMonthly:ref,actualMonthly:m.actual.expense,variance:ref-m.actual.expense,medicalAdjustment:reference.medicalAdjustment*m.priceFactor,carAdjustment:reference.carAdjustment*m.priceFactor,transportAdjustment:reference.transportAdjustment*m.priceFactor,priceFactor:m.priceFactor,vehicleActive:reference.vehicleActive};
 });
 const periods=reconciliation.periods.map(p=>{
  const selected=months.filter(m=>m.annualRowIndex===p.annualRowIndex);
  if(!selected.length||selected.length!==p.monthCount||selected.some(m=>m.status==='unresolved'))
   return {age:p.age,annualRowIndex:p.annualRowIndex,status:'unresolved',referenceTotal:null,actualTotal:null,variance:null};
  return {age:p.age,annualRowIndex:p.annualRowIndex,status:'reference-only',referenceTotal:selected.reduce((n,m)=>n+m.referenceMonthly,0),actualTotal:selected.reduce((n,m)=>n+m.actualMonthly,0),variance:selected.reduce((n,m)=>n+m.variance,0),monthCount:selected.length};
 });
 return {status:'reference-only',adopted:false,months,periods,limitations:['年齢はエンジンの当月年齢を採用し年齢期を再計算しません','元の物価基準と月次係数を保持します','管理予算・資産推移・画面保存・CSVの採用値には反映しません']};
}
