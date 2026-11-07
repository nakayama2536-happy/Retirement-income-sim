/** Independent survivor-pension reference. Units: 10,000 JPY per year. No storage. */
const money=(n,name)=>{if(typeof n!=='number'||!Number.isFinite(n)||n<0)throw new TypeError(name+' must be a finite nonnegative amount');return n;};
export function calculateSurvivor65Reference({deceasedEarningsBaseAnnual,ownEmployeeAnnual,ownBasicAnnual,eligibilityConfirmed=false}){
 const dec=money(deceasedEarningsBaseAnnual,'deceasedEarningsBaseAnnual'),own=money(ownEmployeeAnnual,'ownEmployeeAnnual'),basic=money(ownBasicAnnual,'ownBasicAnnual');
 const formulaA=dec*.75,formulaB=dec*.5+own*.5,survivorPensionNominal=Math.max(formulaA,formulaB),survivorPensionPayable=Math.max(0,survivorPensionNominal-own);
 return {unit:'万円/年',formulaA,formulaB,selected:formulaA>=formulaB?'A':'B',survivorPensionNominal,ownEmployee:own,ownBasic:basic,survivorPensionPayable,referenceTotal:basic+own+survivorPensionPayable,eligibleForAdoption:false,limitations:'受給権・2028年改正・繰下げ・加給・税社会保険・実際の支給開始月は未判定'};
}
export function calculateDeferredBasicReference({basicAt65Annual,monthsDeferred,rightsConflictConfirmedAbsent=false}){
 const basic=money(basicAt65Annual,'basicAt65Annual');
 if(!Number.isInteger(monthsDeferred)||monthsDeferred<0||monthsDeferred>120)throw new RangeError('繰下げ月数は0～120の整数');
 return {unit:'万円/年',amount:basic*(1+monthsDeferred*.007),monthsDeferred,eligibleForAdoption:false,limitations:'遺族年金の受給権と繰下げの制限・生年月日による上限は未判定'};
}

/** Borrow the approved private pension reference, never invent missing values or dates. */
export function registeredSurvivorInputs(config,deceased){
 if(!['primary','spouse'].includes(deceased))throw Error('死亡想定は本人または妻を選択してください');
 const survivor=deceased==='primary'?'spouse':'primary';
 const dead=config?.income?.pensions?.[deceased]?.reference65;
 const own=config?.income?.pensions?.[survivor]?.reference65;
 if(!dead?.source||!own?.source)throw Error('「収入を設定 → 年金」に本人・妻の65歳基準内訳と出典を登録してください');
 const amount=(raw,label)=>{
  if(raw===null||raw===undefined||raw==='')throw Error(label+'が未登録です');
  const n=Number(raw);
  if(!Number.isFinite(n)||n<0||n>1000)throw Error(label+'は万円／年で確認してください（円の直接入力に注意）');
  return n;
 };
 return {deceased,survivor,
  deceasedEarnings:amount(dead.employeeEarningsAnnual,'死亡する方の報酬比例部分'),
  ownEmployee:amount(own.employeeEarningsAnnual,'残された方の報酬比例部分'),
  ownBasic:amount(own.basicAnnual,'残された方の老齢基礎年金'),
  sources:{deceased:dead.source,survivor:own.source}};
}
