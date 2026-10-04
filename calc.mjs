import {calendarMode} from './calendar-mode.mjs';
const TERMINAL_FORECAST=Symbol('terminal-forecast');
import {salaryLifeIssues, SalaryLifeValidationError, salaryLifeIsBefore, salaryLifeContribution, parseMonth, monthIndex} from './salary-life.mjs';
export const RULES_VERSION = '2026-09-24 / app v0.9.7';

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
  const m=String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(!m) return fallback;
  const y=Number(m[1]), mo=Number(m[2])-1, day=Number(m[3]);
  const d=new Date(Date.UTC(y,mo,day));
  return d.getUTCFullYear()===y && d.getUTCMonth()===mo && d.getUTCDate()===day ? d : fallback;
}
function isoDate(d){ return d.toISOString().slice(0,10); }
function addMonths(date, months){
  const d=new Date(date), day=d.getUTCDate();
  const targetFirst=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+months,1));
  const lastDay=new Date(Date.UTC(targetFirst.getUTCFullYear(),targetFirst.getUTCMonth()+1,0)).getUTCDate();
  return new Date(Date.UTC(targetFirst.getUTCFullYear(),targetFirst.getUTCMonth(),Math.min(day,lastDay)));
}
function addYears(date, years){
  const d=new Date(date), y=d.getUTCFullYear()+years, mo=d.getUTCMonth(), day=d.getUTCDate();
  const lastDay=new Date(Date.UTC(y,mo+1,0)).getUTCDate();
  return new Date(Date.UTC(y,mo,Math.min(day,lastDay)));
}
function monthKey(d){ return d.getUTCFullYear()*12+d.getUTCMonth(); }
function monthInRange(d, start, endExclusive){
  const m=monthKey(d); return (!start || m>=monthKey(start)) && (!endExclusive || m<monthKey(endExclusive));
}
function monthsBetween(a,b){ return (b.getUTCFullYear()-a.getUTCFullYear())*12+(b.getUTCMonth()-a.getUTCMonth()); }
function fullAgeOn(date,birth){
  let age=date.getUTCFullYear()-birth.getUTCFullYear();
  const before=(date.getUTCMonth()<birth.getUTCMonth())||(date.getUTCMonth()===birth.getUTCMonth()&&date.getUTCDate()<birth.getUTCDate());
  return age-(before?1:0);
}
function salaryLifeAgeOn(date,birth){
  const years=date.getUTCFullYear()-birth.getUTCFullYear();
  return years-(date<addYears(birth,years)?1:0);
}
function sameMonth(a,b){ return a&&b&&a.getUTCFullYear()===b.getUTCFullYear()&&a.getUTCMonth()===b.getUTCMonth(); }
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

// 予定原価の税・社保参考額。資産推移の管理予算には反映しない。
export function estimateAnnualTaxSocial(config, age){
  const primary=primaryBirth(config), spouse=spouseBirth(config);
  const date=addYears(primary,Number(age));
  const spouseAge=fullAgeOn(date,spouse), pAge=Number(age);
  const annualSalary=person=>{
    const side=person==='primary'?config?.employment?.primary?.sideWork:config?.employment?.spouse?.sideWork;
    if(!side)return 0;
    const start=person==='primary'?defaultPrimarySideWorkStart(config):parseDate(side.startDate);
    const end=person==='primary'?defaultPrimarySideWorkEnd(config):parseDate(side.endDate);
    return Array.from({length:12},(_,m)=>addMonths(date,m)).reduce((sum,d)=>sum+(monthInRange(d,start,end)?Number(side.monthlyGross||0):0),0);
  };
  const pSalary=annualSalary('primary'), sSalary=annualSalary('spouse');
  // 年金開始日はage指定より優先。金額は設定済みの nominal fixed-base scenario を用いる。
  const pp=config?.income?.pensions?.primary, sp=config?.income?.pensions?.spouse;
  const annualPension=person=>Array.from({length:12},(_,m)=>addMonths(date,m)).reduce((sum,d)=>sum+pensionMonthlyForPerson(person,d),0);
  const pGross=annualPension(pp), sGross=annualPension(sp);
  const pTax=estimateSimpleIncomeTaxes({salaryGross:pSalary,pensionGross:pGross,age:pAge});
  const sTax=estimateSimpleIncomeTaxes({salaryGross:sSalary,pensionGross:sGross,age:spouseAge});
  const people=[{age:pAge,tax:pTax,pension:pGross},{age:spouseAge,tax:sTax,pension:sGross}];
  let health=0, care=0;
  const under75=people.filter(x=>x.age<75);
  if(under75.length){
    const vals=under75.map(x=>x.tax.residentTotalIncome);
    health+=fukuyamaNhiPremium2026({memberIncomesMan:vals,members:under75.length,adultMembers:under75.length,careMembers40to64:under75.filter(x=>x.age>=40&&x.age<65).length});
  }
  for(const person of people){
    if(person.age>=75) health+=lateElderlyMedicalPremium2026(person.tax.residentTotalIncome);
    if(person.age>=65) care+=fukuyamaCarePremium2026({totalIncome:person.tax.residentTotalIncome,pensionGross:person.pension,ownResidentTaxed:person.tax.residentTax>0,householdResidentTaxed:people.some(x=>x.tax.residentTax>0)});
  }
  const total=pTax.totalTax+sTax.totalTax+health+care;
  return {total, incomeTax:pTax.incomeTax+sTax.incomeTax, residentTax:pTax.residentTax+sTax.residentTax, health, care, estimated:true,
    incomeBasis:{startDate:isoDate(date),primaryAge:pAge,spouseAge,primarySalary:pSalary,spouseSalary:sSalary,primaryPension:pGross,spousePension:sGross},
    source:pGross+sGross+pSalary+sSalary>0?'income_based':'fallback', note:'福山市・2026年度制度参考。本人の年齢期12か月の給与・公的年金による概算。暦年課税・前年所得・年度途中の保険切替・個別控除・iDeCo年金との合算は未反映'};
}

export function applyCarDisposalTransfer(config){
  const c=structuredClone(config), car=c.car||{};
  const fromAge=Number(car.disposeAge), toAge=Number(c.plan?.endAge);
  if(car.disposeAge==null||!Number.isInteger(fromAge)||fromAge<0)throw new Error('車処分年齢を入力してください');
  if(fromAge>toAge)throw new Error('車費用振替の開始年齢が計画終了年齢を超えています');
  if(car.monthlyCost==null||car.medicalCareMonthlyIncrease==null)throw new Error('車費用と追加の医療・介護費を入力してください（追加なしは0）');
  const monthly=Number(car.monthlyCost), medical=Number(car.medicalCareMonthlyIncrease);
  if(!Number.isFinite(monthly)||monthly<0||!Number.isFinite(medical)||medical<0)throw new Error('車費用・医療介護費は0以上の数値で入力してください');
  const source='car-disposal';
  const labels={car:'車関係（処分後）',careTransit:'介護・通院・移動（車費振替）',medicalCareIncrease:'医療・介護費の追加'};
  c.cashflow ||= {};
  const oldRows=c.cashflow.periodOverrides||[];
  // v0.9.1が生成した、識別子のない既知の行も引き継ぐ。
  const legacyRow=x=>!x.source&&x.kind==='expense'&&x.unit==='monthly'&&labels[x.key]===x.label;
  const generated=x=>x.source===source||(legacyRow(x)&&Object.keys(labels).every(key=>oldRows.some(r=>legacyRow(r)&&r.key===key&&r.fromAge===x.fromAge&&r.toAge===x.toAge&&(key!=='car'||Number(r.amount)===0))));
  const prior=oldRows.filter(generated);
  let rows=oldRows.filter(x=>!generated(x));
  // 以前の自動振替で隠れた手入力を、まだ自動行が残っている範囲だけ復元する。
  for(const original of c.cashflow.carDisposalDisplaced||[]){
    for(const managed of prior.filter(x=>x.key===original.key)){
      const a=Math.max(Number(original.fromAge),Number(managed.fromAge));
      const b=Math.min(Number(original.toAge),Number(managed.toAge));
      if(a<=b)rows=replaceAgeRangeOverride(rows,{...original,fromAge:a,toAge:b});
    }
  }
  c.cashflow.carDisposalDisplaced=rows.filter(x=>x.kind==='expense'&&Object.hasOwn(labels,x.key)&&Number(x.toAge)>=fromAge&&Number(x.fromAge)<=toAge)
    .map(x=>({...x,fromAge:Math.max(fromAge,Number(x.fromAge)),toAge:Math.min(toAge,Number(x.toAge))}));
  for(const item of [
    {kind:'expense',key:'car',label:'車関係（処分後）',fromAge,toAge,amount:0,unit:'monthly'},
    {kind:'expense',key:'careTransit',label:'介護・通院・移動（車費振替）',fromAge,toAge,amount:monthly,unit:'monthly'},
    {kind:'expense',key:'medicalCareIncrease',label:'医療・介護費の追加',fromAge,toAge,amount:medical,unit:'monthly'}
  ]) rows=replaceAgeRangeOverride(rows,{...item,source});
  c.cashflow.periodOverrides=rows;
  return c;
}


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

const PERIOD_KINDS=new Set(['expense','travel','budget','income']);
export function replaceAgeRangeOverride(existing, incoming) {
  const kind=String(incoming?.kind||''), key=String(incoming?.key||'').trim();
  const fromAge=Number(incoming?.fromAge), toAge=Number(incoming?.toAge), amount=Number(incoming?.amount);
  const unit=incoming?.unit==='monthly'?'monthly':'annual';
  if(!PERIOD_KINDS.has(kind)||!key) throw new Error('期間設定の種類と項目名を入力してください。');
  if(!Number.isInteger(fromAge)||!Number.isInteger(toAge)||fromAge<0||toAge<fromAge) throw new Error('年齢範囲を確認してください。');
  if(!Number.isFinite(amount)||amount<0) throw new Error('金額は0以上の数値で入力してください。');
  if(kind==='budget'&&unit!=='annual') throw new Error('管理予算は年額で入力してください。');
  const next={...structuredClone(incoming),kind,key,fromAge,toAge,amount,unit};
  const out=[];
  for(const row of existing||[]){
    if(row.kind!==kind||String(row.key)!==key||Number(row.toAge)<fromAge||Number(row.fromAge)>toAge){out.push(structuredClone(row));continue;}
    const a=Number(row.fromAge), b=Number(row.toAge);
    if(a<fromAge)out.push({...structuredClone(row),toAge:fromAge-1});
    if(b>toAge)out.push({...structuredClone(row),fromAge:toAge+1});
  }
  out.push(next);
  return out.sort((a,b)=>Number(a.fromAge)-Number(b.fromAge)||Number(a.toAge)-Number(b.toAge)||a.kind.localeCompare(b.kind)||String(a.key).localeCompare(String(b.key)));
}
function periodOverride(config,kind,key,age){
  return (config?.cashflow?.periodOverrides||[]).find(x=>x.kind===kind&&String(x.key)===String(key)&&Number(age)>=Number(x.fromAge)&&Number(age)<=Number(x.toAge))||null;
}
function periodAnnualAmount(row){
  const amount=Number(row?.amount||0);
  return row?.unit==='monthly'?amount*12:amount;
}
function periodMonthlyAmount(row){
  const amount=Number(row?.amount||0);
  return row?.unit==='annual'?amount/12:amount;
}
function budgetForAge(age, budgets, config=null) {
  const override=periodOverride(config,'budget','budget',age);
  if(override)return periodAnnualAmount(override);
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

function incomeForMonth(config,date,idecoProjection, resolvedAge=null){
  const income={labor:0,pension:0,primaryPension:0,spousePension:0,idecoAnnuity:0,unemployment:0,extraIncome:0,detail:[]};
  const funding=config.cashflow?.salaryLife;
  const before=funding && salaryLifeIsBefore(funding,date);
  const existingLabor=!funding || (!before && funding.postSalaryLabor?.mode==='existing_confirmed');
  const receiptIncluded=key=>before && funding.receiptTreatment?.[key]==='net_transfer';
  const pSide=config?.employment?.primary?.sideWork||{};
  const pStart=defaultPrimarySideWorkStart(config), pEnd=defaultPrimarySideWorkEnd(config);
  if(existingLabor && monthInRange(date,pStart,pEnd)){ const v=Number(pSide.monthlyGross||0); income.labor+=v; if(v)income.detail.push(['本人アルバイト',v]); }
  const sSide=config?.employment?.spouse?.sideWork||{};
  const sStart=parseDate(sSide.startDate), sEnd=parseDate(sSide.endDate);
  if(existingLabor && monthInRange(date,sStart,sEnd)){ const v=Number(sSide.monthlyGross||0); income.labor+=v; if(v)income.detail.push(['配偶者アルバイト',v]); }
  if(funding && !before && funding.postSalaryLabor?.mode==='monthly' && monthIndex(date)<=parseMonth(funding.postSalaryLabor.lastMonth)){
    income.labor=funding.postSalaryLabor.monthlyAmount;
    if(income.labor)income.detail.push(['終了後の就労収入（夫婦合計）',income.labor]);
  }
  const pPen=receiptIncluded('pension')?0:pensionMonthlyForPerson(config?.income?.pensions?.primary,date); income.pension+=pPen; income.primaryPension=pPen; if(pPen)income.detail.push(['本人公的年金',pPen]);
  const sPen=receiptIncluded('pension')?0:pensionMonthlyForPerson(config?.income?.pensions?.spouse,date); income.pension+=sPen; income.spousePension=sPen; if(sPen)income.detail.push(['配偶者公的年金',sPen]);
  const age=resolvedAge??(funding?salaryLifeAgeOn(date,primaryBirth(config)):fullAgeOn(date,primaryBirth(config)));
  const periodIncome=(config?.cashflow?.periodOverrides||[]).filter(x=>x.kind==='income'&&age>=Number(x.fromAge)&&age<=Number(x.toAge));
  for(const item of periodIncome){
    if(before && item.fundingTreatment==='net_transfer')continue;
    const monthly=item.unit==='monthly'?Number(item.amount||0):Number(item.amount||0)/12;
    income.extraIncome+=monthly;
    if(monthly)income.detail.push([item.label||item.key,monthly]);
  }
  const i=config?.ideco;
  const lumpDate=parseDate(i?.lumpDate || i?.contributionEndDate || retirementDateFor(config));
  if(i && idecoProjection && sameMonth(date,lumpDate) && !receiptIncluded('ideco')){
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
  if(i && idecoProjection && lumpDate && !receiptIncluded('ideco')){
    const m=monthsBetween(lumpDate,date);
    if(m>=0 && m<idecoProjection.annuityMonths){ income.idecoAnnuity+=idecoProjection.annuityMonthly; income.detail.push(['iDeCo/DC年金',idecoProjection.annuityMonthly]); }
  }
  const u=config?.unemployment;
  if(u?.baselineMode==='retire_at_65' && sameMonth(date,retirementDateFor(config)) && !receiptIncluded('unemployment')){
    const comp=unemploymentComparison(config); income.unemployment+=comp.at65.amount; income.detail.push(['高年齢求職者給付金（2026制度参考）',comp.at65.amount]);
  }
  for(const e of config?.events||[]){
    const ed=parseDate(e.date);
    if(ed && sameMonth(date,ed) && e.type==='income' && !(before && e.fundingTreatment==='net_transfer')){income.extraIncome+=Number(e.amount||0);income.detail.push([e.label||'臨時収入',Number(e.amount||0)]);}
  }
  return income;
}

export function validateSalaryLife(config){
  return salaryLifeIssues(config,{start:startDateFor(config),end:endDateFor(config),birth:primaryBirth(config),retirementDate:retirementDateFor(config),idecoProjection:projectIdeco(config)});
}

export function runRetirementPlan(config, options = {}) {
  // Saved only after explicit adoption. Missing mode preserves legacy behavior.
  const anchoredCalendar=calendarMode(config,options)==='anchored-months-v1';
  // Opt-in observations of this loop, never a second calculation or stored plan.
  const includeMonthlyDetails=options.includeMonthlyDetails===true;
  const monthlyDetails=includeMonthlyDetails?[]:null;
  const c=structuredClone(config);
  const fundingIssues=validateSalaryLife(c);
  if(fundingIssues.length)throw new SalaryLifeValidationError(fundingIssues);
  const funding=c.cashflow?.salaryLife;
  const start=options.startDate?parseDate(options.startDate):startDateFor(c);
  const end=endDateFor(c);
  const ret=retirementDateFor(c);
  const birth=primaryBirth(c);
  let asset=Number(options.initialAsset ?? c.plan?.initialAsset ?? 0);
  const monthlyReturn=annualToMonthlyEffective(Number(c.plan?.afterTaxReturn||0));
  const inflation=Number(c.plan?.inflation||0)/100;
  const idecoProjection=projectIdeco(c);
  const rows=[]; let date=new Date(start); let agg=null;
  // 実績から再予測しても、支出の価格基準は元の計画開始日に固定する。
  const baseStart=startDateFor(c);
  if(anchoredCalendar){
    if(!start||start<baseStart||start>end||(start.getTime()===end.getTime()&&!options[TERMINAL_FORECAST])||!Number.isFinite(asset))throw new Error('再開日・残高が計画範囲外です');
    const expected=addMonths(baseStart,monthsBetween(baseStart,start));
    if(!options[TERMINAL_FORECAST]&&isoDate(start)!==isoDate(expected))throw new Error('再開日は元計画の対象月の計算日に合わせてください');
  }
  if(funding && (!start || start<baseStart || start>end || !Number.isFinite(asset)))throw new SalaryLifeValidationError([{level:'error',code:'salary-life-restart',detail:'再予測開始日と残高が計画範囲に合っていません。'}]);

  function newAgg(targetAge,startAsset){return {age:targetAge,startAsset,investmentGain:0,labor:0,pension:0,primaryPension:0,spousePension:0,idecoAnnuity:0,unemployment:0,extraIncome:0,expense:0,extraExpense:0,events:[],...(funding?{householdAddition:0,householdWithdrawal:0,idecoContributionFromAsset:0}: {})};}
  const ageAt=d=>(funding||anchoredCalendar)?salaryLifeAgeOn(d,birth):fullAgeOn(d,birth);
  agg=newAgg(ageAt(date),asset);

  while(date<end){
    const age=ageAt(date);
    const eventStart=includeMonthlyDetails?agg.events.length:0;
    let budgetObservation=null, contributionObservation=null;
    const startAssetMonth=asset;
    const gain=startAssetMonth*monthlyReturn; asset+=gain; agg.investmentGain+=gain;
    const inc=incomeForMonth(c,date,idecoProjection,anchoredCalendar?age:null);
    agg.labor+=inc.labor; agg.pension+=inc.pension; agg.primaryPension+=inc.primaryPension; agg.spousePension+=inc.spousePension; agg.idecoAnnuity+=inc.idecoAnnuity; agg.unemployment+=inc.unemployment; agg.extraIncome+=inc.extraIncome;
    if(inc.detail.length) agg.events.push(...inc.detail.map(([label,amount])=>({label,amount,date:isoDate(date)})));

    let expense=0, extraExpense=0;
    const before=funding && salaryLifeIsBefore(funding,date);
    if(funding ? !before : monthKey(date)>=monthKey(ret)){
      const annualBase=funding && age<65 ? funding.pre65MonthlyBudget*12 : budgetForAge(Math.max(65,age),c.budgets,c);
      const yearsFromBase=monthsBetween(baseStart,date)/12;
      const priceFactor=Math.pow(1+inflation,yearsFromBase);
      expense=annualBase*priceFactor/12;
      if(includeMonthlyDetails)budgetObservation={baseAnnualAmount:annualBase,priceFactor,budgetAge:funding&&age<65?age:Math.max(65,age),source:funding&&age<65?'salaryLife.pre65MonthlyBudget':'budgets-or-periodOverride'};
    }
    if(funding || monthKey(date)>=monthKey(ret)){
      const yearsFromBase=monthsBetween(baseStart,date)/12;
      for(const e of c.events||[]){
        const ed=parseDate(e.date);
        if(ed&&sameMonth(date,ed)&&e.type==='expense' && (!funding || e.fundingTreatment==='separate')){
          const amount=Number(e.amount||0)*(e.inflationAdjusted?Math.pow(1+inflation,yearsFromBase):1);
          extraExpense+=amount; agg.events.push({label:e.label||'臨時支出',amount:-amount,date:isoDate(date)});
        }
      }
    }
    const scheduledExtraExpense=includeMonthlyDetails?extraExpense:0;
    if(funding){
      if(before){
        inc.extraIncome+=funding.monthlyAddition; agg.extraIncome+=funding.monthlyAddition;
        extraExpense+=funding.monthlyWithdrawal;
        agg.householdAddition+=funding.monthlyAddition; agg.householdWithdrawal+=funding.monthlyWithdrawal;
        if(funding.monthlyAddition)agg.events.push({label:'家計からの追加',amount:funding.monthlyAddition,date:isoDate(date)});
        if(funding.monthlyWithdrawal)agg.events.push({label:'家計への取崩し',amount:-funding.monthlyWithdrawal,date:isoDate(date)});
      }
      const contribution=salaryLifeContribution(c,date,ret), source=funding.idecoFunding?.[before?'before':'after'];
      if(includeMonthlyDetails)contributionObservation={amount:contribution,source:source?.source??null,accounting:source?.accounting??null,fromAsset:contribution>0&&source?.source==='plan_asset'?contribution:0,separateExpense:contribution>0&&source?.source==='plan_asset'&&source.accounting==='separate'?contribution:0};
      if(contribution>0 && source?.source==='plan_asset'){
        agg.idecoContributionFromAsset+=contribution; // 内数を含む参考値。支出に再加算しない。
        if(source.accounting==='separate'){
          extraExpense+=contribution;
          agg.events.push({label:'iDeCo掛金（計画資産・別枠）',amount:-contribution,date:isoDate(date)});
        }
      }
    }
    agg.expense+=expense; agg.extraExpense+=extraExpense;
    const incomeTotal=inc.labor+inc.pension+inc.idecoAnnuity+inc.unemployment+inc.extraIncome;
    asset+=incomeTotal-expense-extraExpense;
    if(funding && !Number.isFinite(asset))throw new SalaryLifeValidationError([{level:'error',code:'salary-life-nonfinite',detail:'計算結果が数値範囲を超えました。金額・利回り・期間を確認してください。'}]);

    if(includeMonthlyDetails)monthlyDetails.push({
      sequence:monthlyDetails.length,date:isoDate(date),month:isoDate(date).slice(0,7),age,
      annualRowIndex:rows.length,annualAge:agg.age,baseDate:isoDate(baseStart),monthsFromBase:monthsBetween(baseStart,date),
      cashflowMode:funding?.mode??'legacy',phase:funding?(before?'salary':'asset-funded'):(monthKey(date)>=monthKey(ret)?'legacy-after-retirement':'legacy-before-retirement'),
      startAsset:startAssetMonth,investmentGain:gain,endAsset:asset,
      labor:inc.labor,pension:inc.pension,primaryPension:inc.primaryPension,spousePension:inc.spousePension,
      idecoAnnuity:inc.idecoAnnuity,unemployment:inc.unemployment,extraIncome:inc.extraIncome,totalIncome:incomeTotal,
      expense,extraExpense,scheduledExtraExpense,budget:budgetObservation,
      householdAddition:funding&&before?funding.monthlyAddition:0,householdWithdrawal:funding&&before?funding.monthlyWithdrawal:0,
      idecoContributionFromAsset:contributionObservation?.fromAsset??null,idecoFunding:contributionObservation,
      // Entries include informational subcomponents; do not add them to totals.
      events:structuredClone(agg.events.slice(eventStart))
    });

    // New mode keeps the original day anchor after short months. Legacy is unchanged.
    const next=(funding||anchoredCalendar)?addMonths(baseStart,monthsBetween(baseStart,date)+1):addMonths(date,1);
    const nextAge=ageAt(next);
    if(nextAge>age || next>=end){
      agg.endAsset=asset;
      agg.totalIncome=agg.labor+agg.pension+agg.idecoAnnuity+agg.unemployment+agg.extraIncome;
      rows.push(agg);
      if(next<end) agg=newAgg(nextAge,asset);
    }
    date=next;
  }

  const thresholds=c.management?.thresholds||{};
  const keyAges=Object.keys(thresholds).map(Number).sort((a,b)=>a-b).map(age=>{
    const row=rows.find(r=>r.age===age); const threshold=Number(thresholds[age]||0);
    return row?{age,asset:row.endAsset,threshold,margin:row.endAsset-threshold}:null;
  }).filter(Boolean);
  const finalAsset=rows.at(-1)?.endAsset??asset;
  const reserve=Number(c.reserve?.total||0);
  const finalAfterReserveUse=finalAsset-reserve;
  const finalThreshold=Number(thresholds[c.plan?.endAge||95]||0);
  const reserveUsedThreshold=Number(c.management?.reserveUsedFinalThreshold||1000);
  const status=finalAsset>=finalThreshold?'正常':finalAsset>=finalThreshold*0.9?'注意':'要見直し';
  return {rows,keyAges,finalAsset,reserve,finalAfterReserveUse,finalThreshold,reserveUsedThreshold,status,startAge:Number(c.plan?.startAge||64),endAge:Number(c.plan?.endAge||95),idecoProjection,retirementDate:isoDate(ret),...(anchoredCalendar?{calendarMode:'anchored-months-v1'}:{}),...(includeMonthlyDetails?{monthlyDetails}:{}),...(funding?{cashflowMode:funding.mode,limitations:['税・社会保険は既存の簡略概算。新方式の税額・加入資格の判定は未対応。','給与生活終了月は実退職日・年金・iDeCo受取日を変更しません。']}: {})};
}

export function latestActual(config) {
  const actuals=config?.actuals||{};
  const ages=Object.keys(actuals).map(Number).filter(age=>Number.isFinite(age)&&actuals[age]&&Number.isFinite(Number(actuals[age].endAsset))).sort((a,b)=>a-b);
  if(!ages.length)return null; const age=ages.at(-1); return {age,...actuals[age]};
}
export function runForecastFromLatestActual(config,options={}){
  const mode=calendarMode(config,options);
  const actual=latestActual(config); if(!actual)return null;
  let forecastStart,terminal=false;
  if(mode==='anchored-months-v1'){
    // Continue the chosen plan's exact monthly axis, including partial first years.
    const plan=runRetirementPlan(config,{calendarMode:mode,includeMonthlyDetails:true});
    if(!Number.isInteger(actual.age)||!plan.rows.some(r=>r.age===actual.age)||actual.endAsset==null||!Number.isFinite(Number(actual.endAsset)))throw new Error('実績の年齢期・終了資産を確認してください。');
    const next=plan.monthlyDetails.find(m=>m.annualAge>actual.age);
    forecastStart=next?parseDate(next.date):endDateFor(config);terminal=!next;
  }else forecastStart=addYears(primaryBirth(config),actual.age+1);
  // Caller start/asset overrides cannot replace the actual record.
  const projection=runRetirementPlan(config,{calendarMode:mode,includeMonthlyDetails:options.includeMonthlyDetails,startDate:isoDate(forecastStart),initialAsset:Number(actual.endAsset),[TERMINAL_FORECAST]:terminal});
  return {actual,projection};
}
export function planRowAtAge(result,age){ return result?.rows?.find(r=>r.age===Number(age))||null; }
export function scenarioMetrics(config){
  const result=runRetirementPlan(config); const a80=planRowAtAge(result,80)?.endAsset??null; const a90=planRowAtAge(result,90)?.endAsset??null;
  const minRow=result.rows.reduce((min,row)=>!min||row.endAsset<min.endAsset?row:min,null);
  return {finalAsset:result.finalAsset,afterReserve:result.finalAfterReserveUse,age80Asset:a80,age90Asset:a90,minimumAsset:minRow?.endAsset??result.finalAsset,minimumAssetAge:minRow?.age??config.plan.endAge,status:result.status};
}

export function expenseDetailRows(config,age=Number(config?.plan?.startAge||64)){
  const detail=config?.expenseDetail; if(!detail?.monthlyCategories?.length)return [];
  const ageDelta=Math.max(0,Number(age)-Number(config?.plan?.startAge||64));
  const priceFactor=Math.pow(1+Number(config?.plan?.inflation||0)/100,ageDelta);
  const periodExpenses=(config?.cashflow?.periodOverrides||[]).filter(x=>x.kind==='expense'&&Number(age)>=Number(x.fromAge)&&Number(age)<=Number(x.toAge));
  const consumed=new Set();
  const amountFor=row=>{
    if(String(row.key||row.label)==='taxSocial'){
      const estimate=estimateAnnualTaxSocial(config,age);
      return estimate.source==='fallback'?Number(row.amount||0):estimate.total/12;
    }
    return Number(row.amount||0);
  };
  const rows=detail.monthlyCategories.map(row=>{
    const categoryKey=String(row.key||row.label);
    const categoryOverride=periodExpenses.find(x=>String(x.key)===categoryKey);
    if(categoryOverride){
      consumed.add(categoryOverride);
      for(const item of row.items||[]){const child=periodExpenses.find(x=>String(x.key)===String(item.key||item.label));if(child)consumed.add(child);}
      return {key:categoryKey,label:row.label,amount:periodMonthlyAmount(categoryOverride)*priceFactor,overridden:true,items:[]};
    }
    if(Array.isArray(row.items)&&row.items.length){
      const items=row.items.map(item=>{
        const key=String(item.key||item.label), override=periodExpenses.find(x=>String(x.key)===key);
        if(override)consumed.add(override);
        return {key,label:item.label,amount:(override?periodMonthlyAmount(override):amountFor(item))*priceFactor};
      });
      return {key:categoryKey,label:row.label,amount:items.reduce((sum,x)=>sum+x.amount,0),items};
    }
    return {key:categoryKey,label:row.label,amount:amountFor(row)*priceFactor,items:[]};
  });
  rows.push(...periodExpenses.filter(x=>!consumed.has(x)).map(x=>({key:x.key,label:x.label||x.key,amount:periodMonthlyAmount(x)*priceFactor,added:true,items:[]})));
  return rows;
}

export function expenseDetailSummary(config,age=Number(config?.plan?.startAge||64)){
  const detail=config?.expenseDetail; if(!detail?.monthlyCategories?.length)return null;
  const ageDelta=Math.max(0,Number(age)-Number(config?.plan?.startAge||64));
  const priceFactor=Math.pow(1+Number(config?.plan?.inflation||0)/100,ageDelta);
  const monthlyTotal=expenseDetailRows(config,age).reduce((sum,x)=>sum+x.amount,0);
  const travelOverride=periodOverride(config,'travel','travel',age);
  const annualOperating=monthlyTotal*12, travelAnnual=(travelOverride?periodAnnualAmount(travelOverride):Number(detail.travelAnnualBase||0))*priceFactor, combined=annualOperating+travelAnnual, budgetOverride=periodOverride(config,'budget','budget',age);
  const baseBudget=(config?.budgets||[]).find(b=>age>=Number(b.fromAge)&&age<=Number(b.toAge));
  const reference=(budgetOverride?periodAnnualAmount(budgetOverride):Number(baseBudget?.annualBudget??detail.annualBudgetReference??0))*priceFactor;
  return {monthlyTotal,annualOperating,travelAnnual,combined,reference,difference:reference-combined};
}

export function plannedTaxSocialAnnual(config,age){
  const rows=expenseDetailRows(config,age).flatMap(r=>r.items.length?r.items:[r]).filter(r=>r.key==='taxSocial');
  return rows.length?rows.reduce((sum,r)=>sum+r.amount*12,0):null;
}

export function evaluateReviewTriggers(config, baselineResult=null){
  const result=baselineResult||runRetirementPlan(config),triggers=[];
  const inf=Number(config?.plan?.inflation||0); if(inf>=2)triggers.push({level:'review',code:'inflation',title:'インフレ率が2%以上',detail:`現在設定 ${inf.toFixed(1)}%`});
  const actualEntries=Object.entries(config?.actuals||{}).map(([age,value])=>({age:Number(age),...value})).filter(x=>Number.isFinite(x.age)).sort((a,b)=>a.age-b.age);
  for(const a of actualEntries){
    const plan=planRowAtAge(result,a.age);
    if(plan&&Number.isFinite(Number(a.expense))&&Number(a.expense)>(plan.expense+plan.extraExpense)*1.10){const pct=(Number(a.expense)/(plan.expense+plan.extraExpense)-1)*100;triggers.push({level:'review',code:`expense-${a.age}`,title:`${a.age}歳の年間支出が計画比10%以上増加`,detail:`計画比 +${pct.toFixed(1)}%`});}
    const threshold=Number(config?.management?.thresholds?.[a.age]);
    if(threshold>0&&Number.isFinite(Number(a.endAsset))&&Number(a.endAsset)<threshold*0.90){const pct=(1-Number(a.endAsset)/threshold)*100;triggers.push({level:'review',code:`asset-${a.age}`,title:`${a.age}歳資産が管理基準を10%以上下回る`,detail:`基準比 -${pct.toFixed(1)}%`});}
    if(Number.isFinite(Number(a.reserveBalance))&&Number(a.reserveBalance)<Number(config?.reserve?.warningStrongBelow||0))triggers.push({level:'review',code:`reserve-strong-${a.age}`,title:`${a.age}歳の予備枠が強警告水準未満`,detail:`残高 ${formatMan(a.reserveBalance)}万円`});
    else if(Number.isFinite(Number(a.reserveBalance))&&Number(a.reserveBalance)<Number(config?.reserve?.total||0))triggers.push({level:'watch',code:`reserve-${a.age}`,title:`${a.age}歳の予備枠残高が目標未満`,detail:`残高 ${formatMan(a.reserveBalance)}万円`});
    if(Number.isFinite(Number(a.safeAssetBalance))&&Number(a.safeAssetBalance)<Number(config?.reserve?.minimumSafeAsset||0))triggers.push({level:'review',code:`safe-asset-${a.age}`,title:`${a.age}歳の安全資産が最低基準未満`,detail:`安全資産 ${formatMan(a.safeAssetBalance)}万円 / 最低基準 ${formatMan(config?.reserve?.minimumSafeAsset||0)}万円`});
    if(a.taxSocial!=null&&a.taxSocial!==''&&Number.isFinite(Number(a.taxSocial))){
      const planTax=plannedTaxSocialAnnual(config,a.age);
      if(planTax!==null){
        const delta=Number(a.taxSocial)-planTax;
        if(delta>1e-8&&delta+1e-8>=Math.max(0,Number(config?.taxPolicy?.reviewDeltaAnnual||0)))triggers.push({level:'review',code:`tax-social-${a.age}`,title:`${a.age}歳の税・社会保険が予算内訳を大きく超過`,detail:`計画参考 ${formatMan(planTax,1)}万円 / 実績 ${formatMan(a.taxSocial,1)}万円 / 差 +${formatMan(delta,1)}万円`});
      }
    }
  }
  const returns=actualEntries.filter(a=>Number.isFinite(Number(a.returnRate)));
  for(let i=1;i<returns.length;i++){const prev=returns[i-1],cur=returns[i];if(cur.age===prev.age+1&&Number(prev.returnRate)<2&&Number(cur.returnRate)<2)triggers.push({level:'review',code:`return-${prev.age}-${cur.age}`,title:'税引後運用利回りが2年連続2%未満',detail:`${prev.age}歳 ${Number(prev.returnRate).toFixed(2)}% / ${cur.age}歳 ${Number(cur.returnRate).toFixed(2)}%`});}
  return triggers;
}

const FACTOR_GROUPS=[
  {id:'initialAsset',label:'開始資産',apply:(to,from)=>{to.plan.initialAsset=from.plan.initialAsset;}},
  {id:'investment',label:'運用利回り',apply:(to,from)=>{to.plan.afterTaxReturn=from.plan.afterTaxReturn;}},
  {id:'labor',label:'就労・失業給付',apply:(to,from)=>{to.employment=structuredClone(from.employment);to.unemployment=structuredClone(from.unemployment);to.cashflow ||= {};to.cashflow.periodOverrides=(to.cashflow.periodOverrides||[]).filter(x=>x.kind!=='income').concat(structuredClone((from.cashflow?.periodOverrides||[]).filter(x=>x.kind==='income')));}},
  {id:'pension',label:'公的年金',apply:(to,from)=>{to.income.pensions=structuredClone(from.income.pensions);}},
  {id:'spending',label:'支出条件',apply:(to,from)=>{to.plan.inflation=from.plan.inflation;to.budgets=structuredClone(from.budgets);to.cashflow ||= {};to.cashflow.periodOverrides=(to.cashflow.periodOverrides||[]).filter(x=>x.kind==='income').concat(structuredClone((from.cashflow?.periodOverrides||[]).filter(x=>x.kind!=='income')));}},
  {id:'events',label:'iDeCo・転居等',apply:(to,from)=>{to.ideco=structuredClone(from.ideco);to.events=structuredClone(from.events||[]);}}
];
function factorial(n){let v=1;for(let i=2;i<=n;i++)v*=i;return v;}
function configWithSubset(reference,current,mask){const c=structuredClone(reference);FACTOR_GROUPS.forEach((g,i)=>{if(mask&(1<<i))g.apply(c,current);});c.actuals={};return c;}
export function factorDecomposition(referenceConfig,currentConfig){
  if(referenceConfig?.cashflow?.salaryLife!==undefined || currentConfig?.cashflow?.salaryLife!==undefined)throw new Error('新方式の要因分解は未対応です。旧方式と混ぜず、計画全体の差分を比較してください。');
  if(!referenceConfig||!currentConfig)return null;const n=FACTOR_GROUPS.length,values=new Map();
  for(let mask=0;mask<(1<<n);mask++)values.set(mask,runRetirementPlan(configWithSubset(referenceConfig,currentConfig,mask)).finalAsset);
  const baseAsset=values.get(0),currentAsset=values.get((1<<n)-1),denom=factorial(n);
  const impacts=FACTOR_GROUPS.map((g,i)=>{let impact=0;for(let mask=0;mask<(1<<n);mask++){if(mask&(1<<i))continue;let s=0;for(let j=0;j<n;j++)if(mask&(1<<j))s++;const w=factorial(s)*factorial(n-s-1)/denom;impact+=w*(values.get(mask|(1<<i))-values.get(mask));}return{id:g.id,label:g.label,impact};});
  const totalDifference=currentAsset-baseAsset,allocated=impacts.reduce((s,x)=>s+x.impact,0);return{baseAsset,currentAsset,totalDifference,impacts,residual:totalDifference-allocated};
}

export function certaintyItems(config){
  const c=config||{},certainty=c.certainty||{};
  const pensionLevel=certainty.pension||'assumption',dcLevel=certainty.dc||'assumption';
  const ideco=projectIdeco(c);
  const items=[
    {key:'initialAsset',label:'64歳開始資産',value:c.plan?.initialAsset,unit:'万円',level:certainty.initialAsset||'plan'},
    {key:'returnRate',label:'税引後運用利回り',value:c.plan?.afterTaxReturn,unit:'%',level:certainty.returnRate||'scenario'},
    {key:'inflation',label:'インフレ率',value:c.plan?.inflation,unit:'%',level:certainty.inflation||'scenario'},
    {key:'laborIncome',label:'就労収入',value:c.employment?.primary?.sideWork?.monthlyGross,unit:'万円/月',level:certainty.laborIncome||'plan'},
    {key:'pension',label:'本人年金',value:c.income?.pensions?.primary?.annualAtStart,unit:'万円/年',level:c.income?.pensions?.primary?.certainty||pensionLevel},
    {key:'spousePension',label:'配偶者年金',value:c.income?.pensions?.spouse?.annualAtStart,unit:'万円/年',level:c.income?.pensions?.spouse?.certainty||'unknown'},
    {key:'dc',label:'65歳iDeCo/DC見込',value:ideco?.balance,unit:'万円',level:dcLevel},
    {key:'budgets',label:'年代別年間予算',value:null,unit:'',level:certainty.budgets||'plan'},
    {key:'retirement',label:'退職金',value:c.retirement?.amount,unit:'万円',level:certainty.retirement||'company_estimate'}
  ];
  return items.map(x=>({...x,labelText:CERTAINTY_LABELS[x.level]||CERTAINTY_LABELS.unknown}));
}

export function integrityChecks(config){
  const c=config||{},issues=[]; const error=(code,title,detail)=>issues.push({level:'error',code,title,detail}),warn=(code,title,detail)=>issues.push({level:'warn',code,title,detail});
  try{calendarMode(c);}catch(e){error('calendar-mode','計算期間方式が不正',e.message);}
  issues.push(...validateSalaryLife(c));
  const start=Number(c.plan?.startAge),end=Number(c.plan?.endAge);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)error('age-range','計画年齢範囲が不正','開始年齢と終了年齢を確認してください。');
  else for(let age=65;age<=end;age++){const matches=(c.budgets||[]).filter(b=>age>=Number(b.fromAge)&&age<=Number(b.toAge));if(matches.length===0)error(`budget-missing-${age}`,`${age}歳の年間予算が未設定`,'全年齢を年代別年間予算のいずれか1区分でカバーしてください。');if(matches.length>1)error(`budget-overlap-${age}`,`${age}歳の年間予算が重複`,`${matches.length}区分が同じ年齢をカバーしています。`);}
  for(const[label,value]of[['開始資産',c.plan?.initialAsset],['税引後運用利回り',c.plan?.afterTaxReturn],['インフレ率',c.plan?.inflation],['予備枠',c.reserve?.total],['最低安全資産',c.reserve?.minimumSafeAsset]])if(!Number.isFinite(Number(value)))error(`numeric-${label}`,`${label}が数値ではありません`,'設定値を確認してください。');
  if(Number(c.reserve?.minimumSafeAsset)>Number(c.reserve?.total))warn('safe-over-reserve','最低安全資産が予備枠総額を超えています','二重計上または設定誤りを確認してください。');
  const periods=c.cashflow?.periodOverrides||[];
  for(const [i,row] of periods.entries()){
    if(!PERIOD_KINDS.has(row.kind)||!String(row.key||'').trim()||!Number.isInteger(Number(row.fromAge))||!Number.isInteger(Number(row.toAge))||Number(row.toAge)<Number(row.fromAge)||!Number.isFinite(Number(row.amount))||Number(row.amount)<0)error(`period-invalid-${i}`,'期間別設定に不正な行があります','種類・項目名・年齢範囲・金額を確認してください。');
    for(let j=i+1;j<periods.length;j++){
      const other=periods[j];
      if(row.kind===other.kind&&String(row.key)===String(other.key)&&Number(row.fromAge)<=Number(other.toAge)&&Number(other.fromAge)<=Number(row.toAge))error(`period-overlap-${i}-${j}`,'同じ期間別設定が重複しています','一括更新で期間を分割し、同じ項目・年齢の重複を解消してください。');
    }
  }
  const reserveBreakdown=c.reserve?.breakdown;if(reserveBreakdown&&Object.keys(reserveBreakdown).length){const sum=Object.values(reserveBreakdown).reduce((a,v)=>a+Number(v||0),0);if(Math.abs(sum-Number(c.reserve.total||0))>0.01)warn('reserve-sum','予備枠の内訳合計が総額と不一致',`内訳 ${formatMan(sum,1)}万円 / 総額 ${formatMan(c.reserve.total,1)}万円`);}
  for(const cat of c.expenseDetail?.monthlyCategories||[]){if(!cat.items?.length)continue;const sum=cat.items.reduce((a,i)=>a+Number(i.amount||0),0);if(Math.abs(sum-Number(cat.amount||0))>0.01)warn(`expense-${cat.key||cat.label}`,`${cat.label}の詳細内訳がカテゴリ額と不一致`,`詳細 ${formatMan(sum,1)}万円 / カテゴリ ${formatMan(cat.amount,1)}万円`);}
  const ideco=projectIdeco(c);if(c.ideco&&!ideco)warn('ideco-projection','iDeCo/DC見込計算に必要な日付が不足','現在残高・基準日・拠出終了日を確認してください。');
  if(ideco&&c.plan?.initialAssetIncludesIdeco!==false){
    const message='現在の計算は開始資産とは別にiDeCo受取を加算します。開始資産に含む場合は口座間移動の計算が必要です。金額を自動補正しません。';
    if(c.plan?.initialAssetIncludesIdeco===true)error('ideco-asset-scope','開始資産に含むiDeCoの受取計算は未対応',message);
    else warn('ideco-asset-scope','開始資産にiDeCoを含むか未確認',message);
  }
  if(c.retirement?.receiveDate>=c.plan?.startDate&&Number(c.retirement?.amount)>0)warn('retirement-receipt-route','計画開始後の退職金の入金経路を確認','退職金の参考額だけでは資産へ自動加算されません。臨時収入の設定と重複・漏れを確認してください。');
  if(!parseDate(c.employment?.primary?.mainRetirement?.baseDate))warn('retirement-date','本業退職基準日が未設定','65歳誕生日月を基本に設定してください。');
  return issues;
}
