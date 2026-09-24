export const RULES_VERSION = '2026-09-24 / app v0.8-final';

export const CERTAINTY_LABELS = {
  confirmed: '確定',
  official_estimate: '公式見込',
  company_estimate: '会社見込',
  plan: '計画',
  assumption: '仮定',
  scenario: 'シナリオ',
  unknown: '未確認'
};

export const ANNUAL_REVIEW_ITEMS = [
  {key:'totalAsset',label:'総資産残高'},
  {key:'reserveBalance',label:'想定外支出予備枠の残高'},
  {key:'assetBreakdown',label:'現金・NISA・課税口座・iDeCo/DCの内訳'},
  {key:'annualExpense',label:'年間支出'},
  {key:'travelExpense',label:'旅行費'},
  {key:'laborIncome',label:'年間労働収入'},
  {key:'pensionIncome',label:'年金・iDeCo年金収入'},
  {key:'returnRate',label:'税引後運用利回り'},
  {key:'inflation',label:'インフレ率'},
  {key:'taxSocial',label:'税金・社会保険料'},
  {key:'medical',label:'医療費'},
  {key:'care',label:'介護状況'},
  {key:'rent',label:'家賃・転居状況'},
  {key:'car',label:'車保有状況'},
  {key:'insurance',label:'保険契約'},
  {key:'systemChanges',label:'年金・税・社会保険等の制度改正'}
];

export function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }
export function formatMan(value, digits = 0) {
  const n = Number(value || 0);
  return new Intl.NumberFormat('ja-JP', { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(n);
}

function parseDate(v, fallback=null){
  if (!v) return fallback;
  const d = new Date(`${v}T00:00:00`);
  return Number.isNaN(d.getTime()) ? fallback : d;
}
function isoDate(d){ return d.toISOString().slice(0,10); }
function addMonths(date, months){ const d=new Date(date); d.setMonth(d.getMonth()+months); return d; }
function addYears(date, years){ const d=new Date(date); d.setFullYear(d.getFullYear()+years); return d; }
function monthKey(d){ return d.getFullYear()*12+d.getMonth(); }
function monthInRange(d, start, endExclusive){
  const m=monthKey(d); return (!start || m>=monthKey(start)) && (!endExclusive || m<monthKey(endExclusive));
}
function monthsBetween(a,b){ return (b.getFullYear()-a.getFullYear())*12+(b.getMonth()-a.getMonth()); }
function fullAgeOn(date,birth){
  let age=date.getFullYear()-birth.getFullYear();
  const before=(date.getMonth()<birth.getMonth())||(date.getMonth()===birth.getMonth()&&date.getDate()<birth.getDate());
  return age-(before?1:0);
}
function sameMonth(a,b){ return a&&b&&a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth(); }
function annualToMonthlyEffective(ratePct){ return Math.pow(1+Number(ratePct||0)/100,1/12)-1; }

export function pensionAdjustmentFactor(startAge, birthYear = 1965) {
  const months = Math.round((startAge - 65) * 12);
  if (months === 0) return 1;
  if (months < 0) {
    const ratePerMonth = birthYear >= 1962 ? 0.004 : 0.005;
    return clamp(1 + months * ratePerMonth, 0, 1);
  }
  return 1 + Math.min(months, 120) * 0.007;
}
export function pensionAnnualFromBase65(base65, startAge, birthYear = 1965) {
  return base65 * pensionAdjustmentFactor(startAge, birthYear);
}

export function retirementIncomeDeduction(years) {
  const y = Math.max(0, Math.ceil(Number(years) || 0));
  if (y <= 20) return Math.max(80, 40 * y);
  return 800 + 70 * (y - 20);
}
export function taxableRetirementIncome(retirementAmount, years, adjustedDeduction=null) {
  const amount = Math.max(0, Number(retirementAmount) || 0);
  const deduction = adjustedDeduction==null ? retirementIncomeDeduction(years) : Math.max(0,Number(adjustedDeduction)||0);
  return Math.max(0, (amount - deduction) / 2);
}

export function incomeTaxFromTaxableIncome(taxableMan){
  const x=Math.max(0,Number(taxableMan)||0);
  let tax=0;
  if(x<=195) tax=x*0.05;
  else if(x<=330) tax=x*0.10-9.75;
  else if(x<=695) tax=x*0.20-42.75;
  else if(x<=900) tax=x*0.23-63.6;
  else if(x<=1800) tax=x*0.33-153.6;
  else if(x<=4000) tax=x*0.40-279.6;
  else tax=x*0.45-479.6;
  return Math.max(0,tax)*1.021; // 復興特別所得税込み概算
}
export function retirementTaxEstimate(amountMan, deductionMan){
  const taxable=Math.max(0,(Number(amountMan||0)-Number(deductionMan||0))/2);
  const incomeTax=incomeTaxFromTaxableIncome(taxable);
  const residentTax=taxable*0.10;
  return {taxable,incomeTax,residentTax,totalTax:incomeTax+residentTax,net:Number(amountMan||0)-incomeTax-residentTax};
}

export function salaryIncomeDeduction(grossMan){
  // 所得税用（2026年分の参考）。単位は万円。
  const g=Math.max(0,Number(grossMan)||0);
  if(g<=220) return Math.min(g,74);
  if(g<=360) return g*0.30+8;
  if(g<=660) return g*0.20+44;
  if(g<=850) return g*0.10+110;
  return 195;
}
export function residentSalaryIncomeDeduction2026(grossMan){
  // 2026年度住民税の参考。給与所得控除の最低保障額は65万円として扱う。
  const g=Math.max(0,Number(grossMan)||0);
  if(g<=190) return Math.min(g,65);
  if(g<=360) return g*0.30+8;
  if(g<=660) return g*0.20+44;
  if(g<=850) return g*0.10+110;
  return 195;
}
export function publicPensionDeduction(grossMan, age=65){
  const g=Math.max(0,Number(grossMan)||0);
  if(age<65){
    if(g<=130) return Math.min(g,60);
    if(g<=410) return g*0.25+27.5;
    if(g<=770) return g*0.15+68.5;
    if(g<=1000) return g*0.05+145.5;
    return 195.5;
  }
  if(g<=330) return Math.min(g,110);
  if(g<=410) return g*0.25+27.5;
  if(g<=770) return g*0.15+68.5;
  if(g<=1000) return g*0.05+145.5;
  return 195.5;
}
export function incomeTaxBasicDeduction(totalIncomeMan){
  const x=Math.max(0,Number(totalIncomeMan)||0);
  if(x<=132) return 104;
  if(x<=336) return 88;
  if(x<=489) return 68;
  if(x<=655) return 63;
  if(x<=2350) return 62;
  if(x<=2400) return 48;
  if(x<=2450) return 32;
  if(x<=2500) return 16;
  return 0;
}
export function spouseDeductionReference2026({taxpayerIncomeMan=0,spouseIncomeMan=0,spouseAge=65}={}){
  const t=Math.max(0,Number(taxpayerIncomeMan)||0), s=Math.max(0,Number(spouseIncomeMan)||0);
  // 配偶者特別控除は段階計算が必要なため、この関数では通常の配偶者控除のみを扱う。
  if(t>1000 || s>62) return {incomeTax:0,residentTax:0,eligible:false,note:s>62?'配偶者特別控除の可能性あり（別計算）':'納税者所得要件外'};
