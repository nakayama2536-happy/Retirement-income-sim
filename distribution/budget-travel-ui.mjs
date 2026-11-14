/** Read-only budget tab view: annual budget minus confirmed non-travel costs. */
import {reconcileCashflow} from './cashflow-reconciliation.mjs';
import {inspectCashflowSources} from './cashflow-sources.mjs';
import {expenseDisplayProfile} from './expense-display.mjs';
import {summarizeTravelBudget} from './travel-budget-summary.mjs';

const yen=v=>v===null||!Number.isFinite(v)?'未確定':v.toLocaleString('ja-JP',{minimumFractionDigits:2,maximumFractionDigits:2})+'万円';
export function mountBudgetTravelView(root,{getConfig}){
  const age=root.querySelector('#budgetTravelAge'),source=root.querySelector('#budgetTravelSource'),output=root.querySelector('#budgetTravelSummary');
  if(!age||!source||!output)return {render:()=>{}};
  function render(){
    output.replaceChildren();
    const config=getConfig();
    if(!config){output.textContent='保存済みの計画条件を読み込んでください。';return;}
    const start=Math.max(65,Number(config.plan?.startAge??65)),end=Number(config.plan?.endAge??95);
    const before=Number(age.value);
    age.replaceChildren();
    for(let a=start;a<=end;a++){const opt=root.createElement('option');opt.value=String(a);opt.textContent=a+'歳期';age.append(opt);}
    if(end<start){output.textContent='65歳以降の管理予算を確認できる計画期間がありません。';return;}
    age.value=String(Number.isInteger(before)&&before>=start&&before<=end?before:start);
    source.value=expenseDisplayProfile(config,source.value)||'';
    if(!source.value){output.textContent='旅行以外の支出の保存元を選択してください。異なる内訳形式は合算しません。';return;}
    let summary;
    try{
      const rec=reconcileCashflow(config,{sourceProfile:source.value});
      const catalog=inspectCashflowSources(config,{sourceProfile:source.value});
      summary=summarizeTravelBudget(rec,catalog.items,Number(age.value));
    }catch(e){output.textContent='旅行可能予算を確認できません：'+e.message;return;}
    if(summary.status==='unresolved'){
      output.textContent='旅行可能予算：未確定。'+summary.reason+'。年間管理予算は上の年齢別予算表から確認できます。';return;
    }
    const dl=root.createElement('dl');dl.className='budget-travel-values';
    for(const [name,value] of [
      ['年間管理予算（物価反映後）',summary.annualBudget],
      ['旅行以外の登録支出',summary.nonTravelExpense],
      ['旅行可能予算（差額）',summary.travelBudget],
      ['登録済み旅行費（参考）',summary.registeredTravel],
      ['旅行可能予算 − 登録旅行費',summary.travelDifference],
      ['旅行以外の支出の超過額',summary.shortfall],
    ]){
      const dt=root.createElement('dt'),dd=root.createElement('dd');
      dt.textContent=name;dd.textContent=yen(value);
      dl.append(dt,dd);
    }
    output.append(dl);
    const message=root.createElement('p');message.className='muted';
    message.textContent=summary.status==='over-budget'
      ?'旅行以外の支出だけで年間管理予算を超過しています。旅行可能予算は0万円ですが、超過額を上記に表示しています。予算を上げる場合は年齢別の年間管理予算を試算・確認して反映してください。'
      :summary.travelDifference!==null&&summary.travelDifference<0
        ?'登録旅行費が旅行可能予算を超過しています。必要に応じて、上の年齢別年間管理予算を増額して試算・確認してください。'
        :'旅行可能予算は年間管理予算から旅行以外の登録支出を引いた残額です。旅行費を二重加算しません。';
    output.append(message);
    const caveat=root.createElement('p');caveat.className='muted';caveat.textContent=summary.note+' 税・社会保険等に未確定額がある場合は残額を計算せず「未確定」と表示します。実際の旅行可能額を保証するものではありません。';output.append(caveat);
  }
  age.addEventListener('change',render);source.addEventListener('change',render);
  return {render};
}
