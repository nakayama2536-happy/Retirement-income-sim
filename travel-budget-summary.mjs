/** Read-only travel envelope. Uses reconciled monthly amounts in 万円. */
const close=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-7*Math.max(1,Math.abs(a),Math.abs(b));
const unresolved=reason=>({status:'unresolved',reason,travelBudget:null,nonTravelExpense:null,annualBudget:null,registeredTravel:null});
export function summarizeTravelBudget(rec,items,age){
  if(!rec||!Array.isArray(rec.months)||!Array.isArray(rec.periods)||!Array.isArray(items))return unresolved('予算の元データを確認できません');
  const period=rec.periods.find(p=>p.age===Number(age));
  if(!period)return unresolved('対象年齢期が計算範囲にありません');
  const months=rec.months.filter(m=>m.annualRowIndex===period.annualRowIndex);
  if(!months.length||months.length!==period.monthCount)return unresolved('対象年齢期の月次データが一致しません');
  if(months.some(m=>m.scope!=='asset-funded'))return unresolved('給与生活中など資産計算対象外の月を含むため、年間予算の差額を確定できません');
  if(rec.blockers?.length||rec.comparisonDiagnostics?.some(d=>/identity|duplicate|ambiguous|source-conflict|invalid-container/.test(d.code||'')))
    return unresolved('支出内訳の識別・保存元に不整合があります');
  const byId=new Map(items.map(i=>[i.itemId,i]));
  let annualBudget=0,nonTravelExpense=0,registeredTravel=0,travelKnown=true,expenseFound=false,travelFound=false;
  for(const month of months){
    const budget=month.actual?.expense;
    if(typeof budget!=='number'||!Number.isFinite(budget)||budget<0||month.budget?.check?.status!=='resolved'||!close(month.budget.check.amount,budget))
      return unresolved('年間管理予算の月次値と設定が一致しません');
    annualBudget+=budget;
    if(!Array.isArray(month.details))return unresolved('支出内訳がありません');
    for(const root of month.details){
      const item=byId.get(root.itemId);
      if(!item)return unresolved('支出内訳の項目IDが一致しません');
      if(item.kind==='expense'){
        const variants=item.variants||[];
        if(variants.some(v=>v.key==='travel'||v.group==='travel')||/旅行費|旅行予算/.test(String(item.label||'')))
          return unresolved('旅行費が一般支出内訳にもあります。二重計上を避けるため保存元を確認してください');
        expenseFound=true;
        if(root.priced?.status!=='resolved'||!Number.isFinite(root.priced.amount)||root.priced.amount<0)
          return unresolved('旅行以外の支出に未入力・未計算の費目があります（税・社会保険等）');
        nonTravelExpense+=root.priced.amount;
      }else if(item.kind==='travel'){
        travelFound=true;
        if(root.priced?.status!=='resolved'||!Number.isFinite(root.priced.amount)||root.priced.amount<0)travelKnown=false;
        else registeredTravel+=root.priced.amount;
      }else return unresolved('予算内訳に用途を判定できない項目があります');
    }
  }
  if(!expenseFound)return unresolved('旅行以外の支出が登録・確認されていません');
  if(!Number.isFinite(annualBudget)||!Number.isFinite(nonTravelExpense))return unresolved('年間予算の計算が数値範囲を超えました');
  const shortfall=Math.max(0,nonTravelExpense-annualBudget);
  const travelBudget=Math.max(0,annualBudget-nonTravelExpense);
  return {status:shortfall>0?'over-budget':'within-budget',sourceProfile:rec.sourceProfile,age:Number(age),monthCount:months.length,
    annualBudget,nonTravelExpense,travelBudget,shortfall,
    registeredTravel:travelFound&&travelKnown?registeredTravel:null,
    travelDifference:travelFound&&travelKnown?travelBudget-registeredTravel:null,
    note:'同じ年齢期の月次金額（物価反映後）を合算。旅行以外の登録支出が網羅されていることを確認してください。'};
}
