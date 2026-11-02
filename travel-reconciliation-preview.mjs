/**
 * Read-only bridge from I-10B monthly reconciliation to discretionary-travel
 * references. Never changes managed budgets, actual expenses or stored state.
 * All inputs and outputs in 万円 at the engine's monthly nominal price basis.
 */
import {discretionaryTravelEnvelope} from './discretionary-travel.mjs';
const close=(a,b)=>Math.abs(a-b)<=1e-8*Math.max(1,Math.abs(a),Math.abs(b));
const amount=(n,label)=>{if(typeof n!=='number'||!Number.isFinite(n)||n<0)throw Error(label+'は確認済みの非負数で指定してください');return n;};
/**
 * nonTravelMonths: [{month, nonTravelExpense, confirmed, priceFactor, priceBasis}]
 * Must come from a complete non-travel itemization for the SAME reconciled month.
 * Do not derive nonTravelExpense by subtracting a potentially duplicated travel reference.
 */
export function previewTravelFromReconciliation(reconciliation,nonTravelMonths){
 if(!Array.isArray(reconciliation?.months)||!Array.isArray(reconciliation?.periods))throw Error('月次照合データがありません');
 if(!Array.isArray(nonTravelMonths))throw Error('旅行以外の確定明細がありません');
 const lookup=new Map();
 for(const row of nonTravelMonths){
  if(typeof row?.month!=='string'||lookup.has(row.month))throw Error('年月の未入力または重複があります');
  lookup.set(row.month,row);
 }
 const months=reconciliation.months.map(m=>{
  if(!m?.month||m.scope!=='asset-funded'||m.budget?.check?.status!=='resolved'||m.assessment==='over-budget'){
   return {month:m?.month??null,annualRowIndex:m?.annualRowIndex??null,status:'unresolved',travelBudget:null,shortfall:null,reason:'予算照合または資産負担範囲が未確定'};
  }
  const row=lookup.get(m.month);
  if(!row||row.confirmed!==true||row.priceBasis!=='engine-month-nominal'||!Number.isFinite(row.priceFactor)||!close(row.priceFactor,m.priceFactor??NaN)){
   return {month:m.month,annualRowIndex:m.annualRowIndex,status:'unresolved',travelBudget:null,shortfall:null,reason:'非旅行支出の出典・価格基準が未確認'};
  }
  const budget=amount(m.actual?.expense,'月次管理予算');
  if(!close(budget,m.budget.check.amount))throw Error('管理予算と月次実計上額が一致しません');
  const necessary=amount(row.nonTravelExpense,'旅行以外の月次支出');
  const result=discretionaryTravelEnvelope({annualBudget:budget,nonTravelExpense:necessary,priceBasis:'engine-month-nominal'});
  return {month:m.month,annualRowIndex:m.annualRowIndex,status:result.status,travelBudget:result.travelBudget,shortfall:result.shortfall,managementBudget:budget,necessaryExpense:necessary};
 });
 const periods=reconciliation.periods.map(p=>{
  const selected=months.filter(m=>m.annualRowIndex===p.annualRowIndex);
  if(selected.length!==p.monthCount||selected.length===0||selected.some(m=>m.status==='unresolved'))
   return {age:p.age,annualRowIndex:p.annualRowIndex,status:'unresolved',travelBudget:null,shortfall:null,monthCount:selected.length};
  return {age:p.age,annualRowIndex:p.annualRowIndex,status:selected.some(m=>m.status==='over-budget')?'over-budget':'within-budget',
   travelBudget:selected.reduce((s,m)=>s+m.travelBudget,0),shortfall:selected.reduce((s,m)=>s+m.shortfall,0),monthCount:selected.length};
 });
 return {status:'reference-only',months,periods,adopted:false,limitations:['月次支出・年末残高・CSV・保存値は変更しません','非旅行明細と税額が未確認なら旅行可能額を確定しません','予算不足額と旅行可能額を相殺せず別表示します']};
}
