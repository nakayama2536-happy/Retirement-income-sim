import { formatMan, incomeSummaryForAge, householdTaxSocialReferenceForAge } from './calc.mjs';

export const DEFAULT_EXPENSE_REDUCTION = ['通信費見直し','家賃見直し','車関連費見直し'];
export const DEFAULT_INCOME_IMPROVEMENT = ['労働収入増','資産収入増','相続遺産'];

export function valueForPeriods(periods, age){
  const p=(periods||[]).find(x=>Number(age)>=Number(x.fromAge)&&Number(age)<=Number(x.toAge));
  return p?Number(p.amount||0):0;
}
export function setPeriodValue(periods, fromAge, toAge, amount){
  const from=Number(fromAge), to=Number(toAge), val=Number(amount||0);
  if(!Number.isFinite(from)||!Number.isFinite(to)||to<from) throw new Error('期間が不正です');
  const next=[];
  for(const p of periods||[]){
    const a=Number(p.fromAge), b=Number(p.toAge);
    if(b<from||a>to){ next.push({...p}); continue; }
    if(a<from) next.push({...p,toAge:from-1});
    if(b>to) next.push({...p,fromAge:to+1});
  }
  next.push({fromAge:from,toAge:to,amount:val});
  next.sort((a,b)=>a.fromAge-b.fromAge);
  const merged=[];
  for(const p of next){
    const last=merged.at(-1);
    if(last&&Number(last.toAge)+1===Number(p.fromAge)&&Number(last.amount)===Number(p.amount)) last.toAge=p.toAge;
    else merged.push({...p});
  }
  return merged;
}
export function managementBudgetForAge(config,age){
  const row=(config?.budgets||[]).find(b=>Number(age)>=Number(b.fromAge)&&Number(age)<=Number(b.toAge));
  return row?Number(row.annualBudget||0):0;
}
export function travelForAge(config,age){
  const schedules=config?.cashflow?.travel||[];
  const p=schedules.find(x=>Number(age)>=Number(x.fromAge)&&Number(age)<=Number(x.toAge));
  if(p) return Number(p.annualAmount||0);
  const row=(config?.budgets||[]).find(b=>Number(age)>=Number(b.fromAge)&&Number(age)<=Number(b.toAge));
  return Number(row?.travelReference ?? row?.travelMax ?? 0);
}
function inflationFactor(config,age){
  const start=Number(config?.plan?.startAge||64), r=Number(config?.plan?.inflation||0)/100;
  return Math.pow(1+r,Math.max(0,Number(age)-start));
}
export function expenseItemsForAge(config,age,{inflationAdjusted=true}={}){
  const factor=inflationAdjusted?inflationFactor(config,age):1;
  const cats=[], cf=config?.cashflow||{};
  const tax=cf.taxSocialMode==='auto_if_possible' ? householdTaxSocialReferenceForAge(config,age) : null;
  for(const cat of cf.expenseCategories||[]){
    if(cat.key==='taxSocial'){
      const fallback=Number(cat.fallbackMonthly||4)*12;
      const annual=tax&&Number.isFinite(tax.total)?tax.total:fallback;
      const items=tax?[{key:'incomeTax',label:'所得税',annual:tax.incomeTax},{key:'residentTax',label:'住民税',annual:tax.residentTax},{key:'nhi',label:'国保',annual:tax.nhi},{key:'lateElderly',label:'後期高齢者医療',annual:tax.lateElderly},{key:'care',label:'介護保険',annual:tax.care},{key:'other',label:'その他',annual:0}]:[{key:'fallback',label:'暫定基準',annual:fallback}];
      cats.push({key:cat.key,label:cat.label,monthly:annual/12,annual,items,auto:Boolean(tax),note:tax?.note||'自動計算不能時は月4万円を暫定使用'});
      continue;
    }
    const items=(cat.items||[]).map(item=>{
      const base=valueForPeriods(item.periods,age), monthly=base*factor;
      return {...item,baseMonthly:base,monthly,annual:monthly*12};
    });
    const monthly=items.reduce((s,x)=>s+x.monthly,0);
    cats.push({key:cat.key,label:cat.label,monthly,annual:monthly*12,items,auto:false});
  }
  return cats;
}
export function manualIncomeForAge(config,age){
  const rows=[];
  for(const item of config?.cashflow?.manualIncomeItems||[]){
    const amount=valueForPeriods(item.periods,age);
    const annual=item.unit==='monthly'?amount*12:amount;
    if(annual!==0) rows.push({...item,annual});
  }
  return rows;
}
export function cashflowSummaryForAge(config,age){
  const income=incomeSummaryForAge(config,age), manual=manualIncomeForAge(config,age);
  const expenseCategories=expenseItemsForAge(config,age,{inflationAdjusted:true});
  const operatingAnnual=expenseCategories.reduce((s,x)=>s+x.annual,0);
  const travelBase=travelForAge(config,age), factor=inflationFactor(config,age), travelAnnual=travelBase*factor;
  const plannedCost=operatingAnnual+travelAnnual, managementBudget=managementBudgetForAge(config,age)*factor;
  const buffer=managementBudget-plannedCost, manualIncome=manual.reduce((s,x)=>s+x.annual,0);
  const totalIncome=income.totalCashIncome+manualIncome;
  return {age:Number(age),income,manualIncomeRows:manual,totalIncome,expenseCategories,operatingAnnual,travelAnnual,travelBase,managementBudget,plannedCost,buffer,operatingBalance:totalIncome-plannedCost,managementBalance:totalIncome-managementBudget,inflationFactor:factor};
}
export function flattenEditableItems(config){
  const out=[];
  for(const cat of config?.cashflow?.expenseCategories||[]){
    if(cat.key==='taxSocial') continue;
    for(const item of cat.items||[]) out.push({kind:'expense',categoryKey:cat.key,categoryLabel:cat.label,key:item.key,label:item.label,unit:'monthly'});
  }
  out.push({kind:'budget',categoryKey:'budget',categoryLabel:'管理予算',key:'managementBudget',label:'老後年間予算',unit:'annual'});
  out.push({kind:'travel',categoryKey:'travel',categoryLabel:'特別支出',key:'travel',label:'旅行費',unit:'annual'});
  for(const item of config?.cashflow?.manualIncomeItems||[]) out.push({kind:'income',categoryKey:'manualIncome',categoryLabel:'追加収入',key:item.key,label:item.label,unit:item.unit||'annual'});
  return out;
}
export function applyPeriodEdit(config,{kind,key,fromAge,toAge,amount,unit}){
  if(kind==='expense'){
    for(const cat of config?.cashflow?.expenseCategories||[]){
      const item=(cat.items||[]).find(x=>x.key===key); if(!item) continue;
      item.periods=setPeriodValue(item.periods||[],fromAge,toAge,amount); return true;
    }
  }
  if(kind==='budget'){
    const periods=(config?.budgets||[]).map(x=>({fromAge:x.fromAge,toAge:x.toAge,amount:x.annualBudget}));
    config.budgets=setPeriodValue(periods,fromAge,toAge,amount).map(x=>({fromAge:x.fromAge,toAge:x.toAge,annualBudget:x.amount}));
    return true;
  }
  if(kind==='travel'){
    const periods=(config?.cashflow?.travel||[]).map(x=>({fromAge:x.fromAge,toAge:x.toAge,amount:x.annualAmount}));
    config.cashflow.travel=setPeriodValue(periods,fromAge,toAge,amount).map(x=>({fromAge:x.fromAge,toAge:x.toAge,annualAmount:x.amount}));
    return true;
  }
  if(kind==='income'){
    const item=(config?.cashflow?.manualIncomeItems||[]).find(x=>x.key===key);
    if(item){ item.unit=unit||item.unit||'annual'; item.periods=setPeriodValue(item.periods||[],fromAge,toAge,amount); return true; }
  }
  return false;
}
export function formatPeriodList(periods,unit='monthly'){
  return (periods||[]).map(p=>`${p.fromAge}〜${p.toAge}歳：${formatMan(p.amount,1)}万円/${unit==='monthly'?'月':'年'}`).join(' / ');
}
