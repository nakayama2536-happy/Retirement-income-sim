/** 2026 general retirement receipts: isolated income-tax reference, units 万円.
 * Requires explicit assurance that all receipts are ordinary retirement benefits,
 * periods qualify, no other benefits/prior receipts, and tax return declaration applies.
 */
import {assessRetirementReceiptPair} from './receipt-tax-extension.mjs';
import {standardRetirementDeduction} from './receipt-tax-reference.mjs';
const validDate=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const nextDay=d=>{const x=new Date(d+'T00:00:00Z');x.setUTCDate(x.getUTCDate()+1);return x.getTime();};
const inYears=(start,end)=>Math.ceil((nextDay(end)-Date.parse(start+'T00:00:00Z'))/(365.2425*86400000));
const bands=[[195,.05,0],[330,.10,9.75],[695,.20,42.75],[900,.23,63.6],[1800,.33,153.6],[4000,.40,279.6],[Infinity,.45,479.6]];
export function retirementIncomeTax2026(taxableMan){
 if(typeof taxableMan!=='number'||!Number.isFinite(taxableMan)||taxableMan<0)throw Error('課税退職所得が不正');
 const taxableRounded=Math.floor((taxableMan*10000+1e-8)/1000)*1000;
 const x=taxableRounded/10000;
 const [_,rate,offset]=bands.find(v=>x<=v[0]);
 // Income tax + special reconstruction tax, truncated to the yen.
 return {taxableRoundedMan:x,incomeTaxYen:Math.floor(Math.max(0,(x*rate-offset)*10000)*1.021+1e-7)};
}
function unionDays(a,b){
 const periods=[a,b].map(p=>[Date.parse(p.periodStart+'T00:00:00Z'),nextDay(p.periodEnd)]).sort((x,y)=>x[0]-y[0]);
 return (periods[0][1]-periods[0][0]+periods[1][1]-periods[1][0]-Math.max(0,Math.min(periods[0][1],periods[1][1])-Math.max(periods[0][0],periods[1][0])))/86400000;
}
export function referenceRetirementTax2026({company,ideco,allGeneral=true,noOtherReceipts=true,verifiedPeriods=true,verifiedEligible=true}={}){
 const base=assessRetirementReceiptPair({company,ideco,otherRetirementReceipts:noOtherReceipts?[]:[{unknown:true}]});
 const blockers=[];
 if(!allGeneral)blockers.push('短期退職手当・特定役員退職手当の別計算');
 if(!noOtherReceipts)blockers.push('その他の退職手当');
 if(!verifiedPeriods)blockers.push('税務上の勤続・加入対象期間');
 if(!verifiedEligible)blockers.push('受取分類・申告書・特例条件');
 if(!company||!ideco||[company,ideco].some(p=>!validDate(p.periodStart)||!validDate(p.periodEnd)||!validDate(p.receiptDate)||p.periodStart>p.periodEnd||typeof p.grossMan!=='number'||!Number.isFinite(p.grossMan)||p.grossMan<0))blockers.push('受取額または期間・日付');
 if(blockers.length)return {status:'incomplete',issues:blockers,taxYen:null,residentTaxReferenceYen:null};
 const sameYear=company.receiptDate.slice(0,4)===ideco.receiptDate.slice(0,4);
 if(sameYear){
  // NTA No.2735: union of qualifying service periods, total gross, one deduction.
  // NTA No.2735: count calendar years, not days / average-year length.
  // Disjoint periods need separate non-overlap treatment; do not guess.
  const periods=[company,ideco].map(p=>[new Date(p.periodStart+'T00:00:00Z'),new Date(nextDay(p.periodEnd))]).sort((a,b)=>a[0]-b[0]);
  if(periods[0][1]<periods[1][0])return {status:'incomplete',issues:['同年受取の非連続勤続・加入期間は別途期間統合の確認が必要'],taxYen:null,residentTaxReferenceYen:null};
  const start=periods[0][0],end=new Date(Math.max(periods[0][1],periods[1][1]));
  let years=end.getUTCFullYear()-start.getUTCFullYear();
  const anniversary=new Date(Date.UTC(start.getUTCFullYear()+years,start.getUTCMonth(),Math.min(start.getUTCDate(),new Date(Date.UTC(start.getUTCFullYear()+years,start.getUTCMonth()+1,0)).getUTCDate())));
  if(anniversary>end)years--;
  const exactAnniversary=new Date(Date.UTC(start.getUTCFullYear()+years,start.getUTCMonth(),Math.min(start.getUTCDate(),new Date(Date.UTC(start.getUTCFullYear()+years,start.getUTCMonth()+1,0)).getUTCDate())));
  years+=exactAnniversary<end?1:0;
  const deduction=standardRetirementDeduction(years);
  const gross=company.grossMan+ideco.grossMan;
  const tax=retirementIncomeTax2026(Math.max(0,(gross-deduction)/2));
  return {status:'reference',sameYear:true,years,deductionMan:deduction,grossMan:gross,taxYen:tax.incomeTaxYen,residentTaxReferenceYen:Math.floor(tax.taxableRoundedMan*10000*.10),taxableMan:tax.taxableRoundedMan,notes:['同一年・一般退職手当のみ・他の退職手当なし・対象期間の和集合','住民税は一律10%の参考、税額控除や自治体処理を考慮しない','受取年が2026年以外も2026年法を仮定']};
 }
 if(!['outside-window','reference-calculated'].includes(base.status)||base.firstTaxableRetirementIncomeMan===null||base.laterTaxableRetirementIncomeMan===null)return {status:'incomplete',issues:base.issues||['期間重複算定不可'],taxYen:null,residentTaxReferenceYen:null};
 const first=retirementIncomeTax2026(base.firstTaxableRetirementIncomeMan);
 const second=retirementIncomeTax2026(base.laterTaxableRetirementIncomeMan);
 return {status:'reference',sameYear:false,firstYearTaxYen:first.incomeTaxYen,laterYearTaxYen:second.incomeTaxYen,taxYen:first.incomeTaxYen+second.incomeTaxYen,residentTaxReferenceYen:Math.floor(first.taxableRoundedMan*1000)+Math.floor(second.taxableRoundedMan*1000),firstTaxableMan:first.taxableRoundedMan,laterTaxableMan:second.taxableRoundedMan,notes:['各年とも一般退職手当のみ・別の受取なし・申告条件を確認済みとの仮定','住民税は10%参考、控除・自治体処理を含まない','2026年法を将来の受取年にも固定適用']};
}
