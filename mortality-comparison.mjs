/**
 * Death timing sensitivity: explicit, non-adopted budget *allocation assumptions*.
 * Personal expenses are NEVER inferred from management budget; every weight is
 * a user-visible hypothetical share, and its sum must be exactly 100%.
 * No persistent state, tax law, survivor eligibility, or account reassignment.
 */
import {dateParts} from './date-display.mjs';
import {MortalityPreviewError,simulateMortalityPreview,PROPOSAL_FACTORS,monthlyIndex} from './mortality-preview.mjs';
import {inspectMortalityExpenseBudget,applyMortalityExpenseMultipliers} from './mortality-itemized.mjs';

export const MORTALITY_COSTS=Object.freeze([
 {key:'food',label:'食費',exampleAnnual:120,factor:.7},
 {key:'utilities',label:'水道・光熱',exampleAnnual:60,factor:.8},
 {key:'housing',label:'住居・維持',exampleAnnual:120,factor:1},
 {key:'transport',label:'交通・通信',exampleAnnual:60,factor:.75},
 {key:'insurance',label:'保険',exampleAnnual:60,factor:1},
 {key:'medical',label:'医療・介護',exampleAnnual:72,factor:1},
 {key:'travel',label:'旅行',exampleAnnual:84,factor:.6},
 {key:'misc',label:'その他の確認済み費目',exampleAnnual:84,factor:.8},
 {key:'unallocated',label:'未配分（税社保・不明費目を含む）',exampleAnnual:0,factor:1},
]);
const fail=(code,message)=>{throw new MortalityPreviewError(code,message);};
const finite=(x,key)=>typeof x==='number'&&Number.isFinite(x)?x:fail(key,`${key}: 数値が未入力か不正です`);
export const ORIGINAL_BASIS='管理予算の仮配分（本人の登録内訳ではありません）';

export function blankMortalityAllocation(){
 return MORTALITY_COSTS.map(c=>({key:c.key,share:c.key==='unallocated'?100:0,factor:c.factor}));
}
export function fictionalMortalityAllocation(){
 return MORTALITY_COSTS.map(c=>({key:c.key,share:Number((c.exampleAnnual/660*100).toFixed(2)),factor:c.factor}));
}
export function validateMortalityAllocation(allocation){
 if(!Array.isArray(allocation)||allocation.length!==MORTALITY_COSTS.length)fail('allocation-incomplete','費目の配分・倍率をすべて明示してください');
 const keys=new Set();let total=0;
 for(const row of allocation){
  if(!MORTALITY_COSTS.some(c=>c.key===row?.key)||keys.has(row.key))fail('allocation-key','費目の重複・不明IDを検出しました');
  keys.add(row.key);const share=finite(row.share,'share-'+row.key),factor=finite(row.factor,'factor-'+row.key);
  if(share<0||share>100)fail('allocation-share','費目の配分は0～100％で指定してください');
  if(factor<0||factor>3)fail('allocation-factor','倍率は0～3倍で指定してください');
  if(row.key==='unallocated'&&factor!==1)fail('unknown-factor','未配分には倍率1.0だけを適用します。未知の支出を勝手に減額できません');
  total+=share;
 }
 if(Math.abs(total-100)>1e-6)fail('allocation-total',`費目の配分合計は100％にしてください（現在 ${total.toFixed(4)}％）`);
 return {weights:Object.fromEntries(allocation.map(x=>[x.key,x.share/100])),factors:Object.fromEntries(allocation.map(x=>[x.key,x.factor])),total};
}
export function allocateMortalityBudgetRows(monthlyRows,allocation){
 const {weights}=validateMortalityAllocation(allocation);
 if(!Array.isArray(monthlyRows)||!monthlyRows.length)fail('no-rows','月次台帳がありません');
 return monthlyRows.map(row=>{
  const budget=finite(row.expense,'base-budget');if(budget<0)fail('negative-budget','負の管理予算は対象外です');
  let sum=0;const parts={};
  for(const c of MORTALITY_COSTS){
   if(c.key==='unallocated')continue;
   const amount=budget*weights[c.key];parts[c.key]=amount;sum+=amount;
  }
  // Last item gets the floating-point residue. Do not invent/move budget money.
  parts.unallocated=budget-sum;
  if(parts.unallocated< -1e-7)fail('allocation-precision','配分計算の丸め誤差が大きいため停止します');
  if(parts.unallocated<0)parts.unallocated=0;
  return {...row,expenseComponents:parts};
 });
}

const startMonthOf=(value)=>{
 if(value==null||value==='')return null;
 if(typeof value!=='string'||!dateParts(value))fail('pension-date','年金の受給開始年月が不正です');
 return value.slice(0,7);
};

/** Shared UI/engine boundary. An intermediate month exists only BEFORE the
 * first regular pension month, starting the month AFTER death. */
export function survivorPensionTiming(config,deathPerson,deathMonth){
 if(!['primary','spouse'].includes(deathPerson))fail('person','万一を想定する方を選択してください');
 const survivor=deathPerson==='primary'?'spouse':'primary';
 const start=startMonthOf(config?.income?.pensions?.[survivor]?.startDate ?? config?.income?.pensions?.[survivor]?.startMonth);
 if(!start)fail('survivor-pension-unset','残された方の年金開始月が確認できません');
 const firstIndex=monthlyIndex(deathMonth)+1;
 return {survivor,start,firstIndex,needsPreClaim:monthlyIndex(start)>firstIndex};
}

/** Recomputes on the existing adopted monthly ledger without storing changes. */
export function calculateMortalityComparison({config,baseline,deathPerson,deathMonth,survivorTotalAnnual,survivorPensionBeforeClaimAnnual=null,funeralExpenseMan,allocation=null,itemFactors=null,unallocatedFactor=1,expenseSourceProfile='',planCalculator,acknowledged}){
 if(acknowledged!==true)fail('not-reviewed','万一を想定する月・年金・その後の費目倍率が比較用の仮定であることを確認してください');
 if(!config||!baseline||typeof planCalculator!=='function')fail('missing-baseline','現在条件の計算結果がありません');
 if(!['primary','spouse'].includes(deathPerson))fail('person','万一を想定する方を選択してください');
 const timing=survivorPensionTiming(config,deathPerson,deathMonth);
 const survivor=timing.survivor,survivorStart=timing.start;
 let stagedPension=null;
 if(timing.needsPreClaim){
   const before=finite(survivorPensionBeforeClaimAnnual,'pension-before-claim');
   if(before<0)fail('invalid-pre-pension','老齢年金開始前の年金合計が不正です');
   const first=timing.firstIndex;
   const firstMonth=`${Math.floor(first/12).toString().padStart(4,'0')}-${String(first%12+1).padStart(2,'0')}`;
   stagedPension=[{fromMonth:firstMonth,annual:before},{fromMonth:survivorStart,annual:survivorTotalAnnual}];
 }
 const survivorAnnual=finite(survivorTotalAnnual,'survivor-annual');
 if(survivorAnnual<0)fail('negative-pension','年金合計の仮額は0以上で指定してください');
 const funeral=finite(funeralExpenseMan,'funeral-expense');if(funeral<0)fail('negative-funeral','一時費用は0以上で指定してください');
 const original=planCalculator(config,{includeMonthlyDetails:true});
 if(!Array.isArray(original.monthlyDetails)||!original.monthlyDetails.length)fail('monthly-details','計算の月次台帳が取得できません');
 if(Math.abs(original.finalAsset-baseline.finalAsset)>1e-5)fail('baseline-stale','画面の採用値が更新されました。現在条件を読み直してください');
 const itemized=itemFactors!==null?inspectMortalityExpenseBudget(config,original.monthlyDetails,{sourceProfile:expenseSourceProfile}):null;
 const computed=itemized?applyMortalityExpenseMultipliers(original.monthlyDetails,itemized,{factors:itemFactors,unallocatedFactor}):null;
 const monthlyRows=computed?computed.monthlyRows:allocateMortalityBudgetRows(original.monthlyDetails,allocation);
 const safe=computed?null:validateMortalityAllocation(allocation);
 const mortality=simulateMortalityPreview({monthlyRows,deceased:deathPerson,deathMonth,
  survivorPublicPensionAnnual:survivorAnnual,pensionEvidence:'assumption',costFactors:computed?computed.costFactors:safe.factors,
  survivorPublicPensionStages:stagedPension,
  funeralExpenseMan:funeral,annualAfterTaxReturnPct:config.plan?.afterTaxReturn==null||String(config.plan.afterTaxReturn).trim()===''?NaN:Number(config.plan.afterTaxReturn),
  continueUnattributedIncome:false,keepOneOffExpenses:true});
 return {mortality,original,allocation:allocation?structuredClone(allocation):null,itemized:itemized?structuredClone(itemized):null,itemFactors:computed?structuredClone(computed.costFactors):null,survivor,totalExpenseBasis:itemized?'登録済み内訳と管理予算残額の費目別倍率':ORIGINAL_BASIS};
}

export function agePeriodComparisonRows(monthlyRows,comparison){
 const m=comparison.mortality.monthly;
 if(!Array.isArray(monthlyRows)||monthlyRows.length!==m.length)fail('inconsistent-count','月次数が一致しません');
 const aggs=[];let agg=null,lastIndex=-1;
 for(let i=0;i<m.length;i++){
  const b=monthlyRows[i],x=m[i],idx=b.annualRowIndex;
  if(!Number.isInteger(idx)||idx<lastIndex)fail('invalid-age-group','年齢期と月次行の対応が不正です');
  if(!agg||idx!==lastIndex){
   agg={age:b.annualAge,monthStart:x.month,monthEnd:x.month,months:0,baselineIncome:0,previewIncome:0,baselinePension:0,previewPension:0,baselineExpense:0,expenseReduction:0,previewExpense:0,baselineExtraExpense:0,previewExtraExpense:0,oneOffAfterDeath:0,baselineEndAsset:b.endAsset,previewEndAsset:x.endAsset,delta:x.deltaFromBaseline};
   aggs.push(agg);lastIndex=idx;
  }
  agg.monthEnd=x.month;agg.months++;
  agg.baselineIncome+=b.totalIncome;agg.previewIncome+=x.income;
  agg.baselinePension+=b.primaryPension+b.spousePension;agg.previewPension+=x.publicPension;
  agg.baselineExpense+=b.expense;agg.expenseReduction+=x.expenseReduction;agg.previewExpense+=x.expense;
  agg.baselineExtraExpense+=b.extraExpense;agg.previewExtraExpense+=x.extraExpense+x.funeralExpense;
  agg.oneOffAfterDeath+=x.funeralExpense;
  agg.baselineEndAsset=b.endAsset;agg.previewEndAsset=x.endAsset;agg.delta=x.deltaFromBaseline;
 }
 return aggs;
}

/** Read-only counterfactual: capital contributed immediately AFTER the final month
 * of the adopted 64-year period. Investment is applied to each following month's
 * opening balance before its income and spending. No actual transfer is performed.
 * Any unavailable boundary or incomplete 100-year period is explicitly unsupported.
 */
export function requiredAdditionalCapitalAt64(monthlyRows,comparison,annualAfterTaxReturnPct){
 const preview=comparison?.mortality?.monthly;
 if(!Array.isArray(monthlyRows)||!Array.isArray(preview)||monthlyRows.length!==preview.length||!preview.length)
   fail('capital-ledger','計算対象の月次台帳が一致しません');
 const rate=Number(annualAfterTaxReturnPct);
 if(!Number.isFinite(rate)||rate<=-100)fail('capital-rate','運用利回りを確認できません');
 const months=monthlyRows.map((r,i)=>({age:r.annualAge,month:r.month,amount:preview[i].endAsset}));
 const index64=months.findLastIndex(r=>r.age===64);
 const index100=months.findLastIndex(r=>r.age===100);
 if(index64<0)return {available:false,reason:'計画に本人64歳期末の実残高がありません。65歳開始前の資産へ逆算することはできません。'};
 if(index100<0)return {available:false,reason:'計画の計算範囲が本人100歳期までありません。期間を自動延長せず、設定を確認してください。'};
 if(index100!==months.length-1)return {available:false,reason:'100歳期より後にも計算行があります。評価対象の終期を確認してください。'};
 if(index64>=index100)return {available:false,reason:'64歳末から100歳期末までの計算期間がありません。'};
 const monthlyFactor=Math.pow(1+rate/100,1/12);
 let factor=1,terminalNeed=0,wholePeriodNeed=0,firstNegativeBefore64=null;
 for(let i=0;i<=index64;i++)if(months[i].amount<0){firstNegativeBefore64=months[i].month;break;}
 for(let i=index64+1;i<=index100;i++){
   factor*=monthlyFactor;
   const need=Math.max(0,-months[i].amount/factor);
   wholePeriodNeed=Math.max(wholePeriodNeed,need);
   if(i===index100)terminalNeed=need;
 }
 if(!Number.isFinite(wholePeriodNeed)||!Number.isFinite(terminalNeed))fail('capital-overflow','必要資金の逆算が数値範囲を超えました');
 return {available:true,boundaryMonth:months[index64].month,terminalMonth:months[index100].month,
  terminalAsset:months[index100].amount,terminalOnlyCapital:terminalNeed,wholePeriodCapital:wholePeriodNeed,
  monthlyFactor,monthsAfter64:index100-index64,firstNegativeBefore64};
}
