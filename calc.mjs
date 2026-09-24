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
  const overlap=idecoOverlapReference(config);
  const companyDeduction=retirementIncomeDeduction(Number(r.serviceYears||0));
  const companyTax=retirementTaxEstimate(Number(r.amount||0),companyDeduction);
  const idecoDeduction=overlap?.adjustedDeduction ?? overlap?.fullDeduction ?? 0;
  const idecoLumpTax=plan ? retirementTaxEstimate(plan.lumpGross,idecoDeduction) : null;
  const pensionGross=plan?.annuityAnnual||0;
  const pensionDeduction=publicPensionDeduction(pensionGross,65);
  const pensionIncome=Math.max(0,pensionGross-pensionDeduction);
  return {companyDeduction,companyTax,plan,overlap,idecoDeduction,idecoLumpTax,pensionGross,pensionDeduction,pensionIncome};
}

export function unemploymentDailyBenefit2026(wageDailyYen, mode='pre65'){
  const raw=Math.max(0,Number(wageDailyYen)||0);
  const minDaily=2562;
  if(mode==='highAge'){
    // 高年齢求職者給付金は30歳未満の受給資格者と同じ基本手当日額の計算式を使う現行制度参考。
    const w=Math.min(14900,Math.max(3203,raw));
    let y;
    if(w<5480) y=0.8*w;
    else if(w<=13490) y=0.8*w-0.3*((w-5480)/(13490-5480))*w;
    else y=0.5*w;
    return Math.min(7450,Math.max(minDaily,y));
  }
  const w=Math.min(17400,Math.max(3203,raw));
  let y;
  if(w<5480) y=0.8*w;
  else if(w<=12120) y=Math.min(0.8*w-0.35*((w-5480)/(12120-5480))*w,0.05*w+4848);
  else y=0.45*w;
  return Math.min(7830,Math.max(minDaily,y));
}

export function unemploymentComparison(config){
  const u=config?.unemployment||{};
  const annualSalary=Number(u.preRetirementAnnualSalary||0);
  const wageDaily=annualSalary*10000/12*6/180;
  const dailyPre65=unemploymentDailyBenefit2026(wageDaily,'pre65');
  const dailyAt65=unemploymentDailyBenefit2026(wageDaily,'highAge');
  const yenToMan=x=>x/10000;
  const highDays=Number(u.highAgeDays||50), generalDays=Number(u.pre65GeneralDays||150), specialDays=Number(u.pre65SpecialDays||240);
  return {
    wageDailyYen:wageDaily,
    estimatedDailyYen:dailyPre65,
    dailyPre65Yen:dailyPre65,
    dailyAt65Yen:dailyAt65,
    at65:{days:highDays,dailyYen:dailyAt65,amount:yenToMan(dailyAt65*highDays),label:'65歳以後離職（高年齢求職者給付金）'},
    pre65General:{days:generalDays,dailyYen:dailyPre65,amount:yenToMan(dailyPre65*generalDays),label:'65歳未満離職（一般・20年以上）'},
    pre65Special:{days:specialDays,dailyYen:dailyPre65,amount:yenToMan(dailyPre65*specialDays),label:'65歳未満離職（特定受給資格等に該当する参考）'},
    rulesAsOf:'2026-08-01',
    note:'退職時点の離職理由・賃金・制度で再確認する参考値'
  };
}


function primaryBirth(config){ return parseDate(config?.people?.primary?.birthDate) || new Date(1965,0,1); }
function spouseBirth(config){ return parseDate(config?.people?.spouse?.birthDate) || new Date(1965,0,1); }
function startDateFor(config){ return parseDate(config?.plan?.startDate) || addYears(primaryBirth(config),Number(config?.plan?.startAge||64)); }
function endDateFor(config){ return addYears(primaryBirth(config),Number(config?.plan?.endAge||95)+1); } // endAge=95 は95歳の1年間終了時（96歳誕生日）
function retirementDateFor(config){ return parseDate(config?.employment?.primary?.mainRetirement?.baseDate) || addYears(primaryBirth(config),65); }
function defaultPrimarySideWorkStart(config){
  const explicit=parseDate(config?.employment?.primary?.sideWork?.startDate);
  if(explicit) return explicit;
  const ret=retirementDateFor(config);
  const mode=config?.employment?.primary?.sideWork?.startMode || 'after_high_age_benefit';
  return mode==='at_retirement' ? ret : addMonths(ret,Number(config?.unemployment?.baselineSideWorkDelayMonths??2));
}
function defaultPrimarySideWorkEnd(config){
  return parseDate(config?.employment?.primary?.sideWork?.endDate) || addYears(primaryBirth(config),76);
}

function pensionMonthlyForPerson(person,date){
  if(!person) return 0;
  const start=parseDate(person.startDate);
  if(!start || monthKey(date)<monthKey(start)) return 0;
  return Number(person.annualAtStart||0)/12;
}

function incomeForMonth(config,date,idecoProjection){
  const income={labor:0,pension:0,idecoAnnuity:0,unemployment:0,extraIncome:0,detail:[]};
  const pSide=config?.employment?.primary?.sideWork||{};
  const pStart=defaultPrimarySideWorkStart(config), pEnd=defaultPrimarySideWorkEnd(config);
  if(monthInRange(date,pStart,pEnd)){ const v=Number(pSide.monthlyGross||0); income.labor+=v; if(v)income.detail.push(['本人アルバイト',v]); }
  const sSide=config?.employment?.spouse?.sideWork||{};
  const sStart=parseDate(sSide.startDate), sEnd=parseDate(sSide.endDate);
  if(monthInRange(date,sStart,sEnd)){ const v=Number(sSide.monthlyGross||0); income.labor+=v; if(v)income.detail.push(['配偶者アルバイト',v]); }
  const pPen=pensionMonthlyForPerson(config?.income?.pensions?.primary,date); income.pension+=pPen; if(pPen)income.detail.push(['本人公的年金',pPen]);
  const sPen=pensionMonthlyForPerson(config?.income?.pensions?.spouse,date); income.pension+=sPen; if(sPen)income.detail.push(['配偶者公的年金',sPen]);
  const i=config?.ideco;
  const lumpDate=parseDate(i?.lumpDate || i?.contributionEndDate || retirementDateFor(config));
  if(i && idecoProjection && sameMonth(date,lumpDate)){
    let receipt=idecoProjection.lumpGross;
    if(i.applyCurrentLawTaxReference){
      const overlap=idecoOverlapReference(config);
      if(overlap?.adjustedDeduction!=null){
        const tax=retirementTaxEstimate(idecoProjection.lumpGross,overlap.adjustedDeduction);
        receipt=tax.net;
        income.detail.push(['iDeCo/DC一時金（税引前）',idecoProjection.lumpGross]);
        income.detail.push(['iDeCo/DC一時金税額（現行制度参考）',-tax.totalTax]);
      }
    }
    income.extraIncome+=receipt;
    income.detail.push(['iDeCo/DC一時金（資産計上額）',receipt]);
  }
  if(i && idecoProjection && lumpDate){
    const m=monthsBetween(lumpDate,date);
    if(m>=0 && m<idecoProjection.annuityMonths){ income.idecoAnnuity+=idecoProjection.annuityMonthly; income.detail.push(['iDeCo/DC年金',idecoProjection.annuityMonthly]); }
  }
  const u=config?.unemployment;
  if(u?.baselineMode==='retire_at_65' && sameMonth(date,retirementDateFor(config))){
    const comp=unemploymentComparison(config); income.unemployment+=comp.at65.amount; income.detail.push(['高年齢求職者給付金（2026制度参考）',comp.at65.amount]);
  }
  for(const e of config?.events||[]){
    const ed=parseDate(e.date);
    if(ed && sameMonth(date,ed) && e.type==='income'){income.extraIncome+=Number(e.amount||0);income.detail.push([e.label||'臨時収入',Number(e.amount||0)]);}
  }
  return income;
}

export function runRetirementPlan(config, options = {}) {
  const c=structuredClone(config);
  const start=options.startDate?parseDate(options.startDate):startDateFor(c);
  const end=endDateFor(c);
  const ret=retirementDateFor(c);
  const birth=primaryBirth(c);
  let asset=Number(options.initialAsset ?? c.plan?.initialAsset ?? 0);
  const monthlyReturn=annualToMonthlyEffective(Number(c.plan?.afterTaxReturn||0));
  const inflation=Number(c.plan?.inflation||0)/100;
  const idecoProjection=projectIdeco(c);
  const rows=[]; let date=new Date(start); let agg=null;
  const baseStart=new Date(start);

  function newAgg(targetAge,startAsset){return {age:targetAge,startAsset,investmentGain:0,labor:0,pension:0,idecoAnnuity:0,unemployment:0,extraIncome:0,expense:0,extraExpense:0,events:[]};}
  agg=newAgg(fullAgeOn(date,birth),asset);

  while(date<end){
    const age=fullAgeOn(date,birth);
    const startAssetMonth=asset;
    const gain=startAssetMonth*monthlyReturn; asset+=gain; agg.investmentGain+=gain;
    const inc=incomeForMonth(c,date,idecoProjection);
    agg.labor+=inc.labor; agg.pension+=inc.pension; agg.idecoAnnuity+=inc.idecoAnnuity; agg.unemployment+=inc.unemployment; agg.extraIncome+=inc.extraIncome;
    if(inc.detail.length) agg.events.push(...inc.detail.map(([label,amount])=>({label,amount,date:isoDate(date)})));

    let expense=0, extraExpense=0;
    if(monthKey(date)>=monthKey(ret)){
      const annualBase=budgetForAge(Math.max(65,age),c.budgets);
      const yearsFromBase=monthsBetween(baseStart,date)/12;
      expense=annualBase*Math.pow(1+inflation,yearsFromBase)/12;
      for(const e of c.events||[]){
        const ed=parseDate(e.date);
        if(ed&&sameMonth(date,ed)&&e.type==='expense'){
          const amount=Number(e.amount||0)*(e.inflationAdjusted?Math.pow(1+inflation,yearsFromBase):1);
