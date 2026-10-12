// Reference NISA schedule. Transfers never enter household income or expenses.
import {runRetirementPlan,projectIdeco} from './calc.mjs';
export const NISA_MODES={none:'取り崩しなし',budget:'予算不足分を毎月自動計算',fixed:'毎月定額',rate:'毎月定率',all:'開始月に全額'};
export const IDECO_MODES={lump:'全額を一時金',annuity:'全額を年金',combined:'一時金と年金を併用'};
export function requiredNumber(value,label,min=0,max=1e9){
 if(value==null||String(value).trim()===''||!Number.isFinite(Number(value))||Number(value)<min||Number(value)>max)throw Error(`${label}を${min}～${max}の数値で入力してください。未入力は0にしません。`);
 return Number(value);
}
export function planMonth(value,label){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(value||''))throw Error(`${label}を年月で指定してください。`);return value;}
// Uses booked cash flow only: no investment gains or duplicate reference details.
export function nisaBudgetShortfall(month){
 const values=[month.expense,month.extraExpense,month.totalIncome];
 if(!values.every(v=>typeof v==='number'&&Number.isFinite(v)))throw Error('予算不足を計算する月次収支が未確定です。');
 return Math.max(0,month.expense+month.extraExpense-month.totalIncome);
}
export function projectNisaWithdrawal(config,monthlyDetails){
 const p=config.nisa?.withdrawal;
 if(!p)return {status:'unconfigured',rows:[],total:0,shortfall:0};
 if(p.version!==1||!Object.hasOwn(NISA_MODES,p.mode))throw Error('未対応のNISA取り崩しプランです。');
 if(p.mode==='none')return {status:'disabled',rows:[],total:0,shortfall:0};
 let balance=requiredNumber(config.nisa.marketValue,'開始時点のNISA評価額',0,Number(config.plan.initialAsset));
 const rate=Math.pow(1+requiredNumber(config.plan.afterTaxReturn,'資産全体の利回り',-99,100)/100,1/12)-1;
 const start=planMonth(p.startMonth,'取り崩し開始月'),end=planMonth(p.endMonth,'取り崩し終了月');
 if(start>end||(p.mode==='all'&&start!==end))throw Error('取り崩し期間を確認してください。一括の場合は開始月と終了月を同じにします。');
 const amount=p.mode==='fixed'?requiredNumber(p.monthlyAmount,'毎月の取り崩し額'):0;
 const pct=p.mode==='rate'?requiredNumber(p.monthlyRate,'毎月の取り崩し率',0,100)/100:0;
 const months=monthlyDetails||runRetirementPlan(config,{includeMonthlyDetails:true}).monthlyDetails;
 if(!months.some(m=>m.month===start)||!months.some(m=>m.month===end))throw Error('NISAの取り崩しは計画期間内で指定してください。開始前の資産を逆算しません。');
 let total=0,shortfall=0;const rows=[];
 for(const m of months){
  const startBalance=balance,gain=startBalance*rate,available=Math.max(0,startBalance+gain),active=m.month>=start&&m.month<=end;
  const requested=active?(p.mode==='fixed'?amount:p.mode==='rate'?available*pct:p.mode==='budget'?nisaBudgetShortfall(m):available):0;
  const withdrawal=Math.min(available,requested),unmet=Math.max(0,requested-withdrawal);
  balance=Math.max(0,available-withdrawal);total+=withdrawal;shortfall+=unmet;
  if(![balance,gain,total,shortfall].every(Number.isFinite))throw Error('NISAの試算結果が数値範囲を超えました。');
  rows.push({budgetShortfall:p.mode==='budget'?nisaBudgetShortfall(m):null,month:m.month,date:m.date,annualAge:m.annualAge,startBalance,gain,requested,withdrawal,unmet,endBalance:balance,overTotal:balance>Math.max(0,m.endAsset)+1e-7});
 }
 return {status:'configured',rows,total,shortfall,endBalance:balance,depletedMonth:rows.find(r=>r.withdrawal>0&&r.endBalance<=1e-8)?.month||null,conflictMonth:rows.find(r=>r.overTotal)?.month||null};
}
export function idecoMode(config){const n=config.ideco?.lumpPercent;return n==null?'':Number(n)===100?'lump':Number(n)===0?'annuity':'combined';}
export function idecoReceiptSummary(config){
 const p=projectIdeco(config),i=config.ideco;if(!p||!i)return null;
 return {...p,startDate:i.lumpDate||i.contributionEndDate,mode:idecoMode(config),lumpPercent:i.lumpPercent,annuityYears:i.annuityYears};
}
