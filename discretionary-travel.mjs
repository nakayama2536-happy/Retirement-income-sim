/** Pure reference calculation; never saves or changes adopted budget. Amounts in 万円. */
const valid=(n,label)=>{if(typeof n!=='number'||!Number.isFinite(n)||n<0)throw Error(label+'は確定した0以上の数値を指定してください（未入力は0としません）');return n;};
export function ageExpenseReference(age,{baseMonthly=44,medicalIncreaseMonthly=3,carMonthly=4.9,transportMonthly=2}={}){
 if(!Number.isInteger(age)||age<0||age>120)throw Error('年齢期が不正です');
 for(const [label,n] of Object.entries({baseMonthly,medicalIncreaseMonthly,carMonthly,transportMonthly}))valid(n,label);
 const medical=age>=80?medicalIncreaseMonthly:0,car=age>=85?-carMonthly:0,transport=age>=85?transportMonthly:0;
 const monthly=baseMonthly+medical+car+transport;
 if(monthly<0)throw Error('車両費が基本支出を超えています');
 return {age,monthly,annual:monthly*12,medicalAdjustment:medical,carAdjustment:car,transportAdjustment:transport,vehicleActive:age<85};
}
export function discretionaryTravelEnvelope({annualBudget,nonTravelExpense,sourceComplete=true,priceBasis='plan-start-base'}={}){
 if(!sourceComplete)return {status:'unresolved',travelBudget:null,shortfall:null};
 const budget=valid(annualBudget,'年間管理予算'),expense=valid(nonTravelExpense,'旅行以外の年間支出');
 if(typeof priceBasis!=='string'||!priceBasis.trim())throw Error('価格基準を指定してください');
 return {status:budget>=expense?'within-budget':'over-budget',travelBudget:Math.max(0,budget-expense),shortfall:Math.max(0,expense-budget),annualBudget:budget,nonTravelExpense:expense,priceBasis};
}
export function compareCareScenario({months=60,extraMonthly=5,oneTime=50}={}){
 if(!Number.isInteger(months)||months<0)throw Error('介護期間が不正です');
 valid(extraMonthly,'追加介護費');valid(oneTime,'一時費用');
 return {months,extraMonthly,oneTime,additionalTotal:months*extraMonthly+oneTime,adopted:false};
}
