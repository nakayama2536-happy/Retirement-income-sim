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
  let incomeTax=0,residentTax=0;
  if(t<=900){incomeTax=spouseAge>=70?48:38;residentTax=spouseAge>=70?38:33;}
  else if(t<=950){incomeTax=spouseAge>=70?32:26;residentTax=spouseAge>=70?26:22;}
  else {incomeTax=spouseAge>=70?16:13;residentTax=spouseAge>=70?13:11;}
  // 住民税の配偶者控除所得要件は58万円以下。58超62以下は所得税のみ満額となり得るため0にする。
  if(s>58) residentTax=0;
  return {incomeTax,residentTax,eligible:true,note:'2026年現行制度参考'};
}
export function estimateSimpleIncomeTaxes({salaryGross=0,pensionGross=0,age=65,spouseIncomeMan=null,spouseAge=65,spouseDeduction=null,socialInsurance=0}={}){
  const salaryIncome=Math.max(0,Number(salaryGross)-salaryIncomeDeduction(salaryGross));
  const pensionIncome=Math.max(0,Number(pensionGross)-publicPensionDeduction(pensionGross,age));
  const totalIncome=salaryIncome+pensionIncome;
  const automaticSpouse=spouseIncomeMan==null?null:spouseDeductionReference2026({taxpayerIncomeMan:totalIncome,spouseIncomeMan,spouseAge});
  const spouseIncomeTaxDeduction=spouseDeduction==null?(automaticSpouse?.incomeTax||0):Number(spouseDeduction||0);
  const base=incomeTaxBasicDeduction(totalIncome);
  const taxableIncome=Math.max(0,totalIncome-base-spouseIncomeTaxDeduction-Number(socialInsurance||0));
  const incomeTax=incomeTaxFromTaxableIncome(taxableIncome);

  const residentSalaryIncome=Math.max(0,Number(salaryGross)-residentSalaryIncomeDeduction2026(salaryGross));
  const residentPensionIncome=Math.max(0,Number(pensionGross)-publicPensionDeduction(pensionGross,age));
  const residentTotalIncome=residentSalaryIncome+residentPensionIncome;
  const residentSpouseDeduction=spouseDeduction==null?(automaticSpouse?.residentTax||0):(Number(spouseDeduction||0)>0?33:0);
  const residentTaxable=Math.max(0,residentTotalIncome-43-residentSpouseDeduction-Number(socialInsurance||0));
  const residentTax=residentTaxable*0.10 + (residentTaxable>0?0.55:0); // 福山市：所得割10%＋均等割等0.55万円の参考
  return {
    salaryIncome,pensionIncome,totalIncome,baseDeduction:base,spouseIncomeTaxDeduction,taxableIncome,incomeTax,
    residentSalaryIncome,residentPensionIncome,residentTotalIncome,residentSpouseDeduction,residentTaxable,residentTax,
    totalTax:incomeTax+residentTax,spouseReference:automaticSpouse
  };
}

export function fukuyamaCarePremium2026({totalIncome=0,pensionGross=0,ownResidentTaxed=true,householdResidentTaxed=true}={}){
  const income=Number(totalIncome||0), pen=Number(pensionGross||0);
  if(ownResidentTaxed){
    if(income<120)return 9.02; if(income<210)return 10.27; if(income<320)return 11.83; if(income<420)return 13.23;
    if(income<520)return 14.78; if(income<620)return 16.34; if(income<720)return 17.89; if(income<820)return 19.45;
    if(income<920)return 20.23; if(income<1020)return 21.01; return 21.78;
  }
  const lowBase=pen+Math.max(0,income);
  if(!householdResidentTaxed){ if(lowBase<=82.65)return 2.11; if(lowBase<=120)return 3.77; return 5.33; }
  return lowBase<=82.65?6.61:7.78;
}

export function lateElderlyMedicalPremium2026Details(totalIncomeMan=0){
  const income=Math.max(0,Number(totalIncomeMan)||0), basis=Math.max(0,income-43);
  const medical=Math.min(85,5.509+basis*0.0993);
  const child=Math.min(2.1,0.1337+basis*0.0025);
  return {basis,medical,child,total:medical+child};
}
export function lateElderlyMedicalPremium2026(totalIncomeMan=0){ return lateElderlyMedicalPremium2026Details(totalIncomeMan).total; }

export function fukuyamaNhiPremium2026Details({householdIncomeMan=0,memberIncomesMan=null,members=1,adultMembers=null,careMembers40to64=0,months=12}={}){
  const n=Math.max(1,Number(members||1));
  const adults=Math.max(0,adultMembers==null?n:Number(adultMembers||0));
  const careMembers=Math.max(0,Number(careMembers40to64||0));
  const basis=Array.isArray(memberIncomesMan)
    ? memberIncomesMan.reduce((sum,x)=>sum+Math.max(0,Number(x||0)-43),0)
    : Math.max(0,Number(householdIncomeMan||0)-43);
  const ratio=Math.max(0,Math.min(12,Number(months||12)))/12;
  const medical=Math.min(67,basis*0.0899+n*2.952+1.968)*ratio;
  const support=Math.min(26,basis*0.0315+n*1.068+0.648)*ratio;
  const care=careMembers>0?Math.min(17,basis*0.0279+careMembers*0.996+0.480)*ratio:0;
  const child=Math.min(3,basis*0.0029+n*0.1262+adults*0.0079+0.0802)*ratio;
  return {basis,medical,support,care,child,total:medical+support+care+child};
}
export function fukuyamaNhiPremium2026(args={}){ return fukuyamaNhiPremium2026Details(args).total; }
// 後方互換。v0.8以降は2026年度率を使用する。
export function fukuyamaNhiReference2025(args={}){ return fukuyamaNhiPremium2026(args); }


export function nisaCapacity({ tsumitateUsed = 0, growthUsed = 0, lifetimeBookUsed = 0 } = {}) {
  const annualTsumitate = 120, annualGrowth = 240, lifetime = 1800, growthLifetime = 1200;
  return {
    annualTsumitate,annualGrowth,lifetime,growthLifetime,
    tsumitateRemaining: Math.max(0, annualTsumitate - tsumitateUsed),
    growthRemaining: Math.max(0, annualGrowth - growthUsed),
    annualRemaining: Math.max(0, annualTsumitate + annualGrowth - tsumitateUsed - growthUsed),
    lifetimeRemaining: Math.max(0, lifetime - lifetimeBookUsed)
  };
}

function budgetForAge(age, budgets) {
  const row = (budgets||[]).find(b => age >= Number(b.fromAge) && age <= Number(b.toAge));
  if (!row) throw new Error(`年間予算が未設定の年齢です: ${age}`);
  return Number(row.annualBudget||0);
}

export function projectIdeco(config){
  const i=config?.ideco;
  if(!i) return null;
  const asOf=parseDate(i.asOfDate); const end=parseDate(i.contributionEndDate || config?.employment?.primary?.mainRetirement?.baseDate);
  if(!asOf||!end) return null;
  let balance=Number(i.currentBalance||0);
  const months=Math.max(0,monthsBetween(asOf,end));
  const mr=annualToMonthlyEffective(Number(i.accumulationReturn||0));
  const contribution=Number(i.monthlyContribution||0);
  for(let n=0;n<months;n++){ balance=balance*(1+mr)+contribution; }
  const optimisticRate=Number(i.optimisticReturn??i.accumulationReturn??0);
  let optimistic=Number(i.currentBalance||0); const omr=annualToMonthlyEffective(optimisticRate);
  for(let n=0;n<months;n++){ optimistic=optimistic*(1+omr)+contribution; }
  const lumpPct=Number(i.lumpPercent??50)/100;
  const annuityPct=Number(i.annuityPercent??50)/100;
  const lumpGross=balance*lumpPct;
  const annuityPrincipal=balance*annuityPct;
  const annuityMonths=Math.max(1,Math.round(Number(i.annuityYears||5)*12));
  const amr=annualToMonthlyEffective(Number(i.annuityReturn||0));
  const annuityMonthly=amr===0?annuityPrincipal/annuityMonths:annuityPrincipal*amr/(1-Math.pow(1+amr,-annuityMonths));
  return {months,balance,optimistic,lumpGross,annuityPrincipal,annuityMonths,annuityMonthly,annuityAnnual:annuityMonthly*12};
}

export function idecoOverlapReference(config){
  const i=config?.ideco, r=config?.retirement;
  if(!i||!r) return null;
  const join=parseDate(i.joinDate);
  const lumpDate=parseDate(i.lumpDate || i.contributionEndDate || config?.employment?.primary?.mainRetirement?.baseDate);
  const priorDate=parseDate(r.receiveDate);
  if(!join||!lumpDate) return null;
  const serviceYears=Math.ceil(Math.max(0,monthsBetween(join,lumpDate))/12);
  const fullDeduction=retirementIncomeDeduction(serviceYears);
  const priorAmount=Number(r.amount||0), priorYears=Number(r.serviceYears||0);
  const priorFull=retirementIncomeDeduction(priorYears);
  const yearGap=priorDate ? lumpDate.getUTCFullYear()-priorDate.getUTCFullYear() : null;
  // 現行制度参考：DC老齢一時金を受ける年の前年以前19年内に退職手当等がある場合に重複調整を確認する。
  const within19YearRule=yearGap!=null && yearGap>=1 && yearGap<=19;
  let deemedYears=priorYears;
  if(priorAmount<priorFull){
    deemedYears=priorAmount<=800 ? Math.floor(priorAmount/40) : Math.floor((priorAmount-800)/70+20);
  }
  const companyStart=parseDate(r.companyStartDate);
  let overlapYears=0, adjustedDeduction=fullDeduction;
  if(within19YearRule && companyStart){
    const deemedEnd=addYears(companyStart,deemedYears);
    const overlapStart=join>companyStart?join:companyStart;
    const overlapEnd=lumpDate<deemedEnd?lumpDate:deemedEnd;
    overlapYears=Math.max(0,Math.floor(monthsBetween(overlapStart,overlapEnd)/12));
    adjustedDeduction=Math.max(0,fullDeduction-retirementIncomeDeduction(overlapYears));
  }
  return {
    serviceYears,fullDeduction,priorFull,deemedYears,overlapYears,adjustedDeduction,
    priorDate:r.receiveDate||null,lumpDate:i.lumpDate||i.contributionEndDate||null,
    yearGap,within19YearRule,
    note: within19YearRule
      ? '2026年現行制度では、DC一時金受取年の前年以前19年内の退職手当等として重複調整を確認します。'
      : '2026年現行制度の前年以前19年内ルールには該当しない参考判定です。'
  };
}

export function retirementIdecoTaxSummary(config){
  const r=config?.retirement||{};
  const plan=projectIdeco(config);
