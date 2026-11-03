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
const val=(input,name)=>{
  if(!input||input.value.trim()===''||!/^(?:\d+\.?\d*|\.\d+)$/.test(input.value.trim()))throw Error(name+'の倍率を入力してください（空欄は0ではありません）');
  const n=Number(input.value);if(!Number.isFinite(n)||n<0||n>3)throw Error(name+'の倍率は0～3倍です');
  return n;
};
export function mountMortalityItemizedControls(root,{getConfig,runPlan,onChange}){
  const host=root.querySelector('#mortalityItemHost');
  if(!host)return null; // legacy synthetic DOM harness lacks HTML parser
  const select=root.querySelector('#mortalityExpenseSource'),remain=root.querySelector('#mortalityRemainderFactor');
  const status=root.querySelector('#mortalityItemState'),dateInput=root.querySelector('#mortalityForm').elements.deathMonth;
  let model=null,savedFactors={},lastDeceased=root.querySelector('#mortalityForm').elements.deceased.value;
  function read(){
    if(!model)throw Error('費目別の元データが確認できていません');
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
      const next=model.months.find(m=>dateInput.value&&m.month>dateInput.value)||
        model.months.find(m=>m.expense>0)||model.months[0];
      const revised=Object.entries(next.amounts).reduce((s,[id,n])=>s+n*f.factors[id],next.unallocated*f.unallocatedFactor);
      status.textContent='参考年月 '+next.month+'：夫婦健在時 '+format(next.expense)+'万円／月 − 減額 '+format(next.expense-revised)+'万円 ＝ 比較後 '+format(revised)+'万円。未照合残額 '+format(next.unallocated)+'万円にも倍率を適用します。';
    }catch(e){status.textContent='倍率の確認：'+e.message;}
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
      const month=model.months.find(m=>dateInput.value&&m.month>dateInput.value)||
        model.months.find(m=>m.expense>0)||model.months[0];
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
        const impact=el('span','mortality-item-impact',moneyText(amount*Number(field.value)));impact.dataset.mortalityColumn=labels[4];
        row.append(...cells,factorCell,impact);
        field.addEventListener('input',()=>{
          savedFactors[item.id]=field.value;
          row.lastElementChild.textContent=Number.isFinite(Number(field.value))?moneyText(amount*Number(field.value)):'未計算';
          factorText();onChange();
        });
        host.append(row);
      }
      root.querySelector('#mortalityRemainderAmount').textContent=format(month.unallocated)+'万円／月';
      root.querySelector('#mortalityItemSourceNote').textContent='登録月額は各年齢期の設定額、'+month.month+'は計画の物価基準を用いた月額です。死亡後の概算額は物価換算後の金額に倍率を乗じます。登録月額が未確認の場合は推定しません。'+(preset?'保存済みの万一の倍率を初期値に使用（試算専用）。':'既定倍率1.0を使用（試算専用）。')+(model.unidentifiedItemCount?'識別情報がない費目 '+model.unidentifiedItemCount+'件は個別倍率の対象にせず、未照合予算残額として扱います。':'')+'未確認費用は予算残額に含みます。';
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
