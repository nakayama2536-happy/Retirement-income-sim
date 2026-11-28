/** 2026 Japanese retirement deduction: read-only reference, monetary unit 万円.
 * No prediction of future legal status or tax liability. See README sources.
 */
const d=s=>{if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return null;const v=new Date(s+'T00:00:00Z');return !Number.isNaN(+v)&&v.toISOString().slice(0,10)===s?v:null;};
const yr=s=>{const v=d(s);return v?v.getUTCFullYear():null;};
const finite=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
const floorYears=(a,b)=>{let y=b.getUTCFullYear()-a.getUTCFullYear();if(b.getUTCMonth()<a.getUTCMonth()||(b.getUTCMonth()===a.getUTCMonth()&&b.getUTCDate()<a.getUTCDate()))y--;return Math.max(0,y);};
const ceilYears=(a,b)=>{const y=floorYears(a,b);const anniversary=new Date(Date.UTC(a.getUTCFullYear()+y,a.getUTCMonth(),Math.min(a.getUTCDate(),new Date(Date.UTC(a.getUTCFullYear()+y,a.getUTCMonth()+1,0)).getUTCDate())));return y+(anniversary<b?1:0);};
export function standardRetirementDeduction(years){if(!Number.isInteger(years)||years<0)return null;return years<=20?Math.max(80,40*years):800+70*(years-20);}
const dateMax=(a,b)=>a>b?a:b, dateMin=(a,b)=>a<b?a:b;
export function retirementOverlapDeduction({company,ideco,priorType='auto'}={}){
 const issues=[];const entries=[['会社退職金',company],['iDeCo',ideco]];
 for(const [label,x] of entries){if(!d(x?.periodStart)||!d(x?.periodEnd)||d(x.periodStart)>d(x.periodEnd))issues.push(label+'の勤続・加入期間（両端の日付）');if(!d(x?.receiptDate))issues.push(label+'の受取日');if(!finite(x?.grossMan))issues.push(label+'の受取額');}
 if(issues.length)return {status:'incomplete',issues,adjustedDeductionMan:null};
 const cYear=yr(company.receiptDate),iYear=yr(ideco.receiptDate);
 if(cYear===iYear)return {status:'requires-same-year-method',issues:['同年受取の合算退職所得計算は別途必要'],adjustedDeductionMan:null};
 const prior=iYear<cYear?ideco:company, later=iYear<cYear?company:ideco, priorIsIdeco=iYear<cYear;
 const gap=Math.abs(cYear-iYear), applicable=priorIsIdeco?(iYear>=2026?gap<=9:gap<=4):(gap<=19);
 // Pre-2026 DC lump sums may still fall under the preceding four-year rule.
 // The existing calculator lacks the transitional-period allocation; stop safely.
 if(priorIsIdeco && iYear<2026 && cYear>=2026 && gap<=4)
  return {status:'requires-transitional-rule-review',issues:['2026年より前のiDeCo一時金と後年の会社退職金：前年以前4年内の経過措置を要確認'],gap,adjustedDeductionMan:null};
 const laterYears=ceilYears(d(later.periodStart),d(later.periodEnd));
 const full=standardRetirementDeduction(laterYears);
 if(!applicable)return {status:'outside-window',issues:[],gap,laterFullDeductionMan:full,overlapWholeYears:0,adjustedDeductionMan:full,assumptions:['他の過去受取は存在しない前提','税制は2026年時点を仮適用']};
 const priorYears=ceilYears(d(prior.periodStart),d(prior.periodEnd)),priorDeduction=standardRetirementDeduction(priorYears);
 // If prior payment is lower than its deduction, deemed prior service years shortened.
 let effectivePriorEnd=d(prior.periodEnd),deemedPriorYears=priorYears;
 if(prior.grossMan<priorDeduction){deemedPriorYears=prior.grossMan<=800?Math.floor(prior.grossMan/40):Math.floor((prior.grossMan-800)/70+20);const start=d(prior.periodStart);effectivePriorEnd=new Date(Date.UTC(start.getUTCFullYear()+deemedPriorYears,start.getUTCMonth(),start.getUTCDate()-1));}
 const start=dateMax(d(later.periodStart),d(prior.periodStart)),end=dateMin(d(later.periodEnd),effectivePriorEnd);
 // Inclusive overlap period; less than one full year is disregarded for deduction subtraction.
 const overlapWholeYears=start<=end?floorYears(start,new Date(end.getTime()+86400000)):0;
 const overlapReduction=overlapWholeYears?standardRetirementDeduction(overlapWholeYears):0;
 return {status:'reference-calculated',issues:[],gap,priorType:priorIsIdeco?'ideco':'company',laterType:priorIsIdeco?'company':'ideco',priorDeductionMan:priorDeduction,deemedPriorYears,laterFullDeductionMan:full,overlapWholeYears,overlapReductionMan:overlapReduction,adjustedDeductionMan:Math.max(0,full-overlapReduction),assumptions:['他の退職手当・短期退職手当・役員退職手当等がない前提','2026年制度を将来受取年へ仮適用','所得税・住民税の税額計算は未実施']};
}
export function pensionMiscIncomeReference({annualPensionsMan,age,otherIncomeMan}={}){
 if(!finite(annualPensionsMan)||!Number.isInteger(age)||age<0||!finite(otherIncomeMan))return {status:'incomplete',taxablePensionIncomeMan:null,issues:['年金年額・受取年末年齢・年金以外の所得を要確認']};
 if(otherIncomeMan>1000)return {status:'unsupported-other-income',taxablePensionIncomeMan:null,issues:['年金以外の所得が1000万円超：別表適用が必要']};
 const x=annualPensionsMan,lo=age<65;
 let income=x<=(lo?60:110)?0:x<(lo?130:330)?x-(lo?60:110):x<410?x*0.75-27.5:x<770?x*0.85-68.5:x<1000?x*0.95-145.5:x-195.5;
 return {status:'reference-calculated',taxablePensionIncomeMan:Math.max(0,income),deductionMan:x-Math.max(0,income),estimatedTaxMan:null,issues:[]};
}
