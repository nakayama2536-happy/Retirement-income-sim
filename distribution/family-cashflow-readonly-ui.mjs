import {makeFamilyCashflowView} from './family-cashflow-readonly.mjs';
const amount = (n,decimals=1) => typeof n==='number'&&Number.isFinite(n)
  ? n.toLocaleString('ja-JP',{maximumFractionDigits:decimals,minimumFractionDigits:decimals})+'万円'
  : '未確認';
function node(doc,tag,txt,{className}={}){
  const el=doc.createElement(tag);if(txt!==undefined)el.textContent=txt;
  if(className)el.className=className;
  return el;
}
function pair(doc,label,value){
  const box=node(doc,'div',undefined,{className:'family-readonly-metric'});
  box.append(node(doc,'dt',label),node(doc,'dd',value));return box;
}
export function renderFamilyCashflowReadonly(target,annual){
  if(!target)throw new TypeError('target is required');
  const doc=target.ownerDocument;
  const view=makeFamilyCashflowView(annual);
  target.replaceChildren();
  if(view.status!=='ready'){
    target.append(node(doc,'p',view.reason,{className:'family-readonly-unavailable'}));
    target.dataset.readonlyStatus='unavailable';
    return view;
  }
  target.dataset.readonlyStatus='ready';
  target.append(node(doc,'h4','この年齢期を月平均にすると'));
  const range=view.periodStart&&view.periodEnd?`${view.periodStart} ～ ${view.periodEnd}（${view.monthCount}か月）`:`${view.monthCount}か月の集計`;
  target.append(node(doc,'p',`${view.age}歳期／計算対象：${range}`,{className:'family-readonly-caption'}));
  const dl=node(doc,'dl',undefined,{className:'family-readonly-grid'});
  dl.append(pair(doc,'計上収入の月平均',amount(view.incomeMonthlyAverage)),
            pair(doc,'生活費・別枠支出の月平均',amount(view.expenseMonthlyAverage)),
            pair(doc,'差額の月平均',amount(view.balanceMonthlyAverage)));
  target.append(dl);
  if(view.periodicIncomeKnown){
    const regularAverage=view.sourceColumnsIncome/view.monthCount;
    const otherAverage=view.otherIncludedIncome/view.monthCount;
    target.append(node(doc,'p',
      `うち給与・公的年金・iDeCo年金の計上分：月平均${amount(regularAverage)}。その他の計上収入等：月平均${amount(otherAverage)}（一時金だけとは限りません）。`,
      {className:'family-readonly-caption'}));
  }else{
    target.append(node(doc,'p','収入の種類別内訳は未確認です。',{className:'family-readonly-caption'}));
  }
  const detail=node(doc,'details');
  detail.append(node(doc,'summary','一時金などを含む収入の内訳を確認'));
  const d=node(doc,'dl');
  d.append(pair(doc,'年齢期の収入合計',amount(view.incomeTotal)),
           pair(doc,'給与・公的年金・iDeCo年金の計上合計',amount(view.sourceColumnsIncome)),
           pair(doc,'その他の計上収入との差額',amount(view.otherIncludedIncome)));
  detail.append(d,node(doc,'p','※「その他との差額」は一時金のみとは限りません。継続する追加収入や資産への入金等を含む場合があります。'));
  target.append(detail);
  target.append(node(doc,'p','この月平均は年齢期の合計額を対象月数で割った目安です。毎月同じ額が振り込まれるという意味ではありません。',{className:'family-readonly-caption'}));
  if(view.negativeAgeEnd)target.append(node(doc,'p','年齢期末の計算残高はマイナスです。これは借入額や実際の資金不足総額ではありません。',{className:'family-readonly-warning'}));
  target.append(node(doc,'p','選択・閲覧では現在の採用済み計画を変更しません。端末・クラウドの保存状態は別途確認してください。',{className:'family-readonly-caption'}));
  return view;
}
