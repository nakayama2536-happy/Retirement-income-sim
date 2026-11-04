/** H-MORT-07 item-by-item expense UI. Read-only references, no adopted writes. */
import {inspectMortalityExpenseBudget} from './mortality-itemized.mjs';
import {readMortalityExpensePreset,mortalityFactorForItem} from './mortality-expense-preset.mjs';
const format=n=>Number(n).toLocaleString('ja-JP',{maximumFractionDigits:2});
const el=(tag,cls='',t='')=>{const x=document.createElement(tag);if(cls)x.className=cls;if(t)x.textContent=t;return x;};
/** Convert a price-adjusted amount back to its configured, age-specific base amount. */
export function registeredMonthlyAmount(item,month){
  const amount=month?.amounts?.[item?.id];
  if(typeof amount!=='number'||!Number.isFinite(amount)||amount<0)return null;
  if(item.priceBasis==='plan-start-base'){
    const factor=month?.priceFactor;
    return typeof factor==='number'&&Number.isFinite(factor)&&factor>0?amount/factor:null;
  }
  if(item.priceBasis==='nominal-fixed'||item.priceBasis==='target-period-nominal')return amount;
  return null; // Unsupported price bases are not guessed.
}
const moneyText=value=>value===null?'未確認':Number(value).toLocaleString('ja-JP',{minimumFractionDigits:2,maximumFractionDigits:2})+'万円';
/** Display totals use the exact unrounded monthly engine amounts, never the rounded labels. */
export function mortalityItemizedTotals(items,month,factors,unallocatedFactor){
  if(!Array.isArray(items)||!month||typeof month.expense!=='number'||typeof month.unallocated!=='number')throw Error('費目内訳を確認してください');
  const required=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=3;
  if(!required(unallocatedFactor))throw Error('未照合予算倍率を確認してください');
  let base=0,baseComplete=true,priced=0,after=0;
  for(const item of items){
    const amount=month.amounts[item.id]??0;
    if(typeof amount!=='number'||!Number.isFinite(amount)||amount<0)throw Error('費目金額を確認してください');
    const factor=factors[item.id];
    if(!required(factor))throw Error('費目別倍率を確認してください');
    priced+=amount;
    after+=amount*factor;
    if(amount!==0){
      const registered=registeredMonthlyAmount(item,month);
      if(registered===null)baseComplete=false;
      else base+=registered;
    }
  }
  const remainder=month.unallocated;
  if(Math.abs(priced+remainder-month.expense)>1e-6*Math.max(1,month.expense))throw Error('管理予算と費目合計が一致しません');
  return {base:baseComplete?base:null,priced,after,remainder,remainderAfter:remainder*unallocatedFactor,fullBefore:month.expense,fullAfter:after+remainder*unallocatedFactor};
}

const val=(input,name)=>{
  if(!input||input.value.trim()===''||!/^(?:\d+\.?\d*|\.\d+)$/.test(input.value.trim()))throw Error(name+'の倍率を入力してください（空欄は0ではありません）');
  const n=Number(input.value);if(!Number.isFinite(n)||n<0||n>3)throw Error(name+'の倍率は0～3倍です');
  return n;
};
export function referenceExpenseMonth(months,deathMonth){
  if(!Array.isArray(months)||months.length===0)return null;
  if(deathMonth)return months.find(m=>m.month>deathMonth)??null;
  return months.find(m=>m.expense>0)??months[0];
}
export function mountMortalityItemizedControls(root,{getConfig,runPlan,onChange}){
  const host=root.querySelector('#mortalityItemHost');
  if(!host)return null; // legacy synthetic DOM harness lacks HTML parser
  const select=root.querySelector('#mortalityExpenseSource'),remain=root.querySelector('#mortalityRemainderFactor');
  const status=root.querySelector('#mortalityItemState'),dateInput=root.querySelector('#mortalityForm').elements.deathMonth;
  let model=null,savedFactors={},lastDeceased=root.querySelector('#mortalityForm').elements.deceased.value;
  function read(){
    if(!model)throw Error('費目別の元データが確認できていません');
    // No post-death month exists at or after the plan's final month.
    // Rates cannot affect the ledger, but funeral-only comparison remains valid.
    if(dateInput.value&&!referenceExpenseMonth(model.months,dateInput.value)){
      return {factors:Object.fromEntries(model.items.map(item=>[item.id,1])),
        unallocatedFactor:val(remain,'未照合の予算残額'),expenseSourceProfile:select.value};
    }
    const factors={};
    for(const item of model.items){
      const target=[...host.querySelectorAll('[data-mortality-itemfactor]')].find(x=>x.dataset.mortalityItemfactor===item.id);
      factors[item.id]=val(target,item.label);
    }
    return {factors,unallocatedFactor:val(remain,'未照合の予算残額'),expenseSourceProfile:select.value};
  }
  function factorText(){
    try{
      const f=read();
      const next=referenceExpenseMonth(model.months,dateInput.value);
      if(!next){status.textContent='死亡翌月は計画期間外です。期間内の死亡後支出は変わりません。死亡月の一時費用は比較できます。';return;}
      const totals=mortalityItemizedTotals(model.items,next,f.factors,f.unallocatedFactor);
      const revised=totals.fullAfter;
      const totalCells=host.querySelectorAll('[data-mortality-total]');
      for(const cell of totalCells){
        const kind=cell.dataset.mortalityTotal;
        cell.textContent=kind==='named-base'?moneyText(totals.base):
          kind==='named-priced'?moneyText(totals.priced):
          kind==='named-after'?moneyText(totals.after):
          kind==='remainder-priced'?moneyText(totals.remainder):
          kind==='remainder-after'?moneyText(totals.remainderAfter):
          kind==='budget-priced'?moneyText(totals.fullBefore):
          kind==='budget-after'?moneyText(totals.fullAfter):'—';
      }
      status.textContent='参考年月 '+next.month+'：夫婦健在時 '+format(next.expense)+'万円／月 − 減額 '+format(next.expense-revised)+'万円 ＝ 比較後 '+format(revised)+'万円。未照合残額 '+format(next.unallocated)+'万円にも倍率を適用します。';
    }catch(e){
      for(const cell of host.querySelectorAll('[data-mortality-total]'))cell.textContent='未計算';
      status.textContent='倍率の確認：'+e.message;
    }
  }
  function refresh({takeCurrent=true}={}){
    const deceased=root.querySelector('#mortalityForm').elements.deceased.value;
    if(deceased!==lastDeceased){savedFactors={};lastDeceased=deceased;takeCurrent=false;}
    if(takeCurrent)for(const input of host.querySelectorAll('[data-mortality-itemfactor]'))savedFactors[input.dataset.mortalityItemfactor]=input.value;
    host.replaceChildren();model=null;
    root.querySelector('#mortalityRemainderAmount').textContent='未計算';
    status.textContent='費目内訳を確認中';
    const cfg=getConfig();
    if(!cfg){status.textContent='現在の設定を読み込んでください。';return;}
    try{
      const plan=runPlan(cfg,{includeMonthlyDetails:true});
      const registered=readMortalityExpensePreset(cfg);
      const preset=registered?.deceased===deceased?registered:null;
      select.value=registered?.sourceProfile||'work-v0.9.7';
      model=inspectMortalityExpenseBudget(cfg,plan.monthlyDetails,{sourceProfile:select.value});
      const month=referenceExpenseMonth(model.months,dateInput.value);
      if(!month){
        status.textContent='死亡翌月は計画期間外です。期間内の死亡後支出は変わりません。死亡月の一時費用は比較できます。';
        root.querySelector('#mortalityItemSourceNote').textContent='死亡後の参考月額は対象外です。元の計画や保存値は変更していません。';
        return;
      }
      const header=el('div','mortality-item-row mortality-item-head');
      const labels=['登録済み費目','登録月額（基準額）',month.month+' の月額（物価反映後）','万一の後の倍率','万一の後の概算額'];
      for(const h of labels)header.append(el('strong','',h));
      host.append(header);
      for(const item of model.items){
        const amount=month.amounts[item.id]||0, row=el('div','mortality-item-row');
        row.dataset.mortalityItem=item.id;
        const field=el('input');field.type='number';field.min='0';field.max='3';field.step='0.05';
        field.dataset.mortalityItemfactor=item.id;field.value=savedFactors[item.id]??String(mortalityFactorForItem(preset,item.id));
        field.setAttribute('aria-label',item.label+'の倍率');
        const base=registeredMonthlyAmount(item,month);
        const cells=[el('span','',item.label),el('span','',moneyText(base)),el('span','',moneyText(amount))];
        for(let i=0;i<cells.length;i++)cells[i].dataset.mortalityColumn=labels[i];
        const factorCell=el('span','mortality-item-factor');factorCell.dataset.mortalityColumn=labels[3];factorCell.append(field);
        const impact=el('span','mortality-item-impact');impact.dataset.mortalityColumn=labels[4];
        try{impact.textContent=moneyText(amount*val(field,item.label));}catch{impact.textContent='未計算';}
        row.append(...cells,factorCell,impact);
        field.addEventListener('input',()=>{
          savedFactors[item.id]=field.value;
          try{row.lastElementChild.textContent=moneyText(amount*val(field,item.label));}
          catch{row.lastElementChild.textContent='未計算';}
          factorText();onChange();
        });
        host.append(row);
      }
      // Named items, unallocated management-budget remainder, and complete
      // management-budget total are separated so the remainder is never counted twice.
      const addTotal=(caption,baseKey,pricedKey,afterKey,kind)=>{
        const row=el('div','mortality-item-row mortality-total-row mortality-total-'+kind);
        const cells=[el('strong','',caption),el('span',''),el('span',''),el('span','','')];
        cells[1].dataset.mortalityTotal=baseKey;
        cells[2].dataset.mortalityTotal=pricedKey;
        const impact=el('strong','mortality-total-impact');impact.dataset.mortalityTotal=afterKey;
        const parts=[cells[0],cells[1],cells[2],cells[3],impact];
        for(let i=0;i<parts.length;i++)parts[i].dataset.mortalityColumn=labels[i];
        cells[3].textContent='—';
        row.append(...parts);host.append(row);
      };
      addTotal('個別費目の合計','named-base','named-priced','named-after','named');
      addTotal('未照合の管理予算残額',null,'remainder-priced','remainder-after','remainder');
      addTotal('管理予算全体の合計',null,'budget-priced','budget-after','budget');
      root.querySelector('#mortalityRemainderAmount').textContent=format(month.unallocated)+'万円／月';
      root.querySelector('#mortalityItemSourceNote').textContent='合計は丸める前の月次金額から算出します。「個別費目の合計」に「未照合の管理予算残額」を加えた値が「管理予算全体の合計」です。登録月額は各年齢期の設定額、'+month.month+'は計画の物価基準を用いた月額です。死亡後の概算額は物価換算後の金額に倍率を乗じます。登録月額が未確認の場合は推定しません。'+(preset?'保存済みの万一の倍率を初期値に使用（試算専用）。':'既定倍率1.0を使用（試算専用）。')+(model.unidentifiedItemCount?'識別情報がない費目 '+model.unidentifiedItemCount+'件は個別倍率の対象にせず、未照合予算残額として扱います。':'')+'未確認費用は予算残額に含みます。';
      factorText();
    }catch(e){status.textContent='費目の取込みを確認してください：'+e.message;root.querySelector('#mortalityItemSourceNote').textContent='内訳の出典・管理予算との整合を確認するまで比較を停止します。';}
  }
  function restore(draft){
    if(!draft)return;
    const v=draft.values||{};
    // A same-config local draft takes precedence over the saved suggestion.
    select.value=readMortalityExpensePreset(getConfig())?.sourceProfile||'work-v0.9.7';
    if(typeof v.residualFactor==='string')remain.value=v.residualFactor;
    savedFactors={...(draft.factors||{})};
    refresh({takeCurrent:false});
  }
  select.addEventListener('change',()=>{refresh();onChange();});
  remain.addEventListener('input',()=>{factorText();onChange();});
  function clear(){savedFactors={};const p=readMortalityExpensePreset(getConfig());select.value=p?.sourceProfile||'work-v0.9.7';remain.value=String(p?.unallocatedFactor??1);refresh({takeCurrent:false});}
  try{remain.value=String(readMortalityExpensePreset(getConfig())?.unallocatedFactor??1);}
  catch{remain.value='1';} // refresh() reports invalid saved values and blocks the comparison.
  refresh();
  return {read,refresh,restore,clear, factorDraft:()=>{for(const input of host.querySelectorAll('[data-mortality-itemfactor]'))savedFactors[input.dataset.mortalityItemfactor]=input.value;return {...savedFactors};}};
}
