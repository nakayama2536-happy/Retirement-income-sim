import {annualCashflowSummaries} from './annual-cashflow.mjs';

export const ANNUAL_CSV_COLUMNS=[
 ['age','年齢期'],['startDate','開始日'],['endDate','終了日'],['monthCount','対象月数'],['assetFundedMonthCount','資産負担月数'],['familyReferenceMonthCount','家計参考月数'],
 ['startAsset','期首資産_万円'],['incomeTotal','現金収入合計_万円'],['labor','労働収入_万円'],['primaryPension','本人公的年金_万円'],['spousePension','配偶者公的年金_万円'],['idecoAnnuity','iDeCo年金_万円'],['unemployment','雇用保険_万円'],['extraIncome','臨時追加収入_万円'],
 ['managementExpense','管理予算支出_万円'],['extraExpense','臨時別枠支出_万円'],['totalExpense','支出合計_万円'],['cashBalance','現金収支_万円'],['investmentGain','資産運用益_万円'],['assetChange','資産増減_万円'],['endAsset','期末資産_万円'],['identityStatus','資産恒等式'],
 ['householdAddition','家計からの追加_内数_万円'],['householdWithdrawal','家計への取崩し_内数_万円'],['idecoContributionFromAsset','計画資産原資iDeCo掛金_内数_万円'],
 ['referenceSource','参考内訳出典'],['referenceDetail','参考内訳合計_万円'],['referenceKnownSubtotal','参考内訳確認済み小計_万円'],['referenceGap','管理予算との差_万円'],['unresolvedMonthCount','参考内訳未確定月数'],['overBudgetMonths','予算超過月'],['eventCount','臨時イベント件数'],['eventSummary','臨時イベント明細']
];
const finiteOrNull=v=>Number.isFinite(v)?v:null;
const sourceLabel=v=>v==='public-v0.9'?'公開元 v0.9形式':v==='work-v0.9.7'?'Work v0.9.7形式':'未選択';
export function annualCsvRows(config,{sourceProfile=''}={}){
 return annualCashflowSummaries(config,{sourceProfile}).filter(s=>s.status==='ready').map(s=>({
  age:s.age,startDate:s.startDate,endDate:s.endDate,monthCount:s.monthCount,assetFundedMonthCount:s.assetFundedMonthCount,familyReferenceMonthCount:s.familyReferenceMonthCount,
  startAsset:finiteOrNull(s.startAsset),incomeTotal:finiteOrNull(s.incomeTotal),labor:finiteOrNull(s.components.labor),primaryPension:finiteOrNull(s.components.primaryPension),spousePension:finiteOrNull(s.components.spousePension),idecoAnnuity:finiteOrNull(s.components.idecoAnnuity),unemployment:finiteOrNull(s.components.unemployment),extraIncome:finiteOrNull(s.components.extraIncome),
  managementExpense:finiteOrNull(s.managementExpense),extraExpense:finiteOrNull(s.extraExpense),totalExpense:finiteOrNull(s.totalExpense),cashBalance:finiteOrNull(s.cashBalance),investmentGain:finiteOrNull(s.investmentGain),assetChange:finiteOrNull(s.assetChange),endAsset:finiteOrNull(s.endAsset),identityStatus:s.identityMatches?'一致':'不一致',
  householdAddition:finiteOrNull(s.householdAddition),householdWithdrawal:finiteOrNull(s.householdWithdrawal),idecoContributionFromAsset:finiteOrNull(s.idecoContributionFromAsset),
  referenceSource:sourceLabel(s.sourceProfile),referenceDetail:finiteOrNull(s.referenceDetail),referenceKnownSubtotal:finiteOrNull(s.referenceKnownSubtotal),referenceGap:finiteOrNull(s.referenceGap),unresolvedMonthCount:s.unresolvedMonthCount,overBudgetMonths:s.overBudgetMonths.join(' | '),eventCount:s.events.length,eventSummary:s.events.map(e=>`${e.date||'日付未設定'} ${e.label||e.type||'イベント'} ${Number(e.amount||0)}万円`).join(' | ')
 }));
}
function safeText(value){
 if(value===null||value===undefined)return '';
 if(typeof value==='number')return Number.isFinite(value)?String(value):'';
 const s=String(value);return /^[=+\-@]/.test(s)?`'${s}`:s;
}
function cell(value){const s=safeText(value).replace(/"/g,'""');return /[",\r\n]/.test(s)?`"${s}"`:s;}
export function annualCsvText(config,options={}){
 const rows=annualCsvRows(config,options),header=ANNUAL_CSV_COLUMNS.map(([,label])=>cell(label)).join(',');
 return '\uFEFF'+[header,...rows.map(row=>ANNUAL_CSV_COLUMNS.map(([key])=>cell(row[key])).join(','))].join('\r\n')+'\r\n';
}
export function japanDate(now=new Date()){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);}
export function downloadAnnualCsv(config,{sourceProfile='',now=new Date(),documentRef=document,urlRef=URL}={}){
 const blob=new Blob([annualCsvText(config,{sourceProfile})],{type:'text/csv;charset=utf-8'}),url=urlRef.createObjectURL(blob),a=documentRef.createElement('a');
 a.href=url;a.download=`lifeplan-annual-cashflow-${japanDate(now)}.csv`;a.click();setTimeout(()=>urlRef.revokeObjectURL(url),1000);return {filename:a.download,rowCount:annualCsvRows(config,{sourceProfile}).length};
}
