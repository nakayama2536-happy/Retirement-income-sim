import {loadExpenseState,applyExpensePreview,undoExpenseApply,expenseUndoStatus} from './expense-workflow.mjs';
import {createExpenseDraft,previewExpenseChanges} from './expense-preview.mjs';
import {inspectCashflowSources,cashflowSourceSignature as signature} from './cashflow-sources.mjs';
import {migrateConfig} from './storage.mjs';
const normalized=s=>({config:migrateConfig(s.config),scenarios:s.scenarios.map(x=>({...x,config:migrateConfig(x.config)}))});
export function assertExpenseScreenMatches(raw,displayed){
 if(signature(normalized(raw))!==signature(normalized(displayed)))throw new Error('保存内容と表示中の設定が異なります。再読み込みしてください。');
}
const money=n=>n!==null&&n!==undefined&&n!==''&&Number.isFinite(Number(n))?`${Number(n).toLocaleString('ja-JP',{maximumFractionDigits:3})}万円`:'未計算';
const period=r=>r.period.type==='age'?`${r.period.fromAge}～${r.period.toAge}歳`:r.period.type==='all'?'全期間':'未対応期間';
const unit=r=>r.unit==='monthly'?'月額':r.unit==='annual'?'年額':r.unit;
const basis=r=>r.priceBasis==='plan-start-base'?'計画開始時の価格':r.priceBasis==='target-period-nominal'?'対象期間の名目額':'未対応の価格基準';
export function mountExpenseSheet({getState,onCommit,showNotice,storage=localStorage,doc=document}){
 const el=id=>doc.getElementById('expense'+id);
 let base=null,preview=null,rules=[],busy=false,blocked=false;
 const error=s=>{el('Error').textContent=s;el('Error').hidden=!s;};
 function invalidate(){preview=null;el('Preview').hidden=true;el('Reviewed').checked=false;}
 function buttons(){
  for(const id of ['Source','Kind','Rule','Amount'])el(id).disabled=busy||blocked;
  el('Trial').disabled=busy||blocked||!rules.length;
  el('Apply').disabled=busy||blocked||!preview?.changed||!el('Reviewed').checked;
  el('Undo').disabled=busy||blocked||!base||!expenseUndoStatus(base).available;
 }
 function selected(){return rules[Number(el('Rule').value)];}
 function selection(){invalidate();const r=selected();el('Amount').value=r?String(r.rawAmount):'';el('Adopted').textContent=r?`採用値：${money(r.rawAmount)}／${unit(r)}・${period(r)}・${basis(r)}\n内部ID：${r.itemId}\n出典：${r.sourceRefs.map(x=>x.path).join(', ')}`:'出典と項目を選択してください。';el('Status').textContent='未試算';buttons();}
 function rebuild(){
  rules=[];el('Rule').replaceChildren();
  if(base&&el('Source').value){
   const view=inspectCashflowSources(base.config,{sourceProfile:el('Source').value});
   rules=view.rules.filter(r=>r.profile===el('Source').value&&view.items.find(i=>i.itemId===r.itemId)?.route===(el('Kind').value==='budget'?'budget-total':'budget-detail'));
   rules.forEach((r,i)=>{const option=doc.createElement('option');option.value=String(i);const item=view.items.find(x=>x.itemId===r.itemId);option.textContent=`${item?.variants.find(v=>v.profile===r.profile)?.label||item?.label||r.itemId}｜${period(r)}｜${unit(r)}`;el('Rule').append(option);});
   el('Rule').value=rules.length?'0':'';
  }
  selection();
 }
 function render(){
  if(!getState().config)return;
  try{
   const current=loadExpenseState(storage);assertExpenseScreenMatches(current,getState());
   if(!base){base=current;rebuild();}
   else if(signature(base)!==signature(current)){blocked=true;invalidate();error('別の操作で設定が更新されました。入力は残しています。再読み込みして再試算してください。');}
   const w=current.config.expenseWorkflow;
   el('History').textContent=w?.lastApply?`反映日時：${new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',dateStyle:'short',timeStyle:'medium'}).format(new Date(w.lastApply.at))} 日本時間`:'取消できる直前反映はありません。';
  }catch(e){blocked=true;invalidate();error(e.message);}
  buttons();
 }
 for(const id of ['Source','Kind'])el(id).addEventListener('change',()=>{if(busy||blocked)return;error('');rebuild();});
 el('Rule').addEventListener('change',()=>{if(!busy&&!blocked){error('');selection();}});
 el('Amount').addEventListener('input',()=>{invalidate();el('Status').textContent='未反映の入力あり';buttons();});
 el('Reviewed').addEventListener('change',buttons);
 el('Trial').addEventListener('click',()=>{
  if(busy||blocked)return;invalidate();error('');
  try{
   const current=loadExpenseState(storage);assertExpenseScreenMatches(current,getState());
   if(signature(current)!==signature(base))throw new Error('保存内容が更新されています。再読み込みしてください。');
   const r=selected(),text=el('Amount').value.trim();if(!r||!text||!Number.isFinite(Number(text))||Number(text)<0)throw new Error('0以上の金額を入力してください。');
   const draft=createExpenseDraft(base,{sourceProfile:el('Source').value,kind:el('Kind').value});
   draft.edits=[{itemId:r.itemId,ruleRef:r.ruleRef,amount:Number(text),unit:r.unit,priceBasis:r.priceBasis}];
   preview=previewExpenseChanges(base,draft);const p=preview.patches[0];
   el('PreviewBody').textContent=[preview.notice,`${money(p.before)} → ${money(p.after)}／${unit(r)}・${period(r)}・${basis(r)}`,
    `適用月：${p.applicableMonths.join('、')}`,p.suppressedMonths.length?`上位規則に置換される月：${p.suppressedMonths.join('、')}`:'',
    `最終資産：${money(preview.finalAssetBefore)} → ${money(preview.finalAssetAfter)}`,
    preview.forecastBefore?`実績反映後の最終資産：${money(preview.forecastBefore.projection.finalAsset)} → ${money(preview.forecastAfter?.projection.finalAsset)}`:'実績なし：再予測比較なし',
    `予算超過月：${preview.overBudgetMonths.length?preview.overBudgetMonths.join('、'):'検出なし'}`,
    `未計算・未確定の照合月：${preview.unresolvedMonths.length?preview.unresolvedMonths.join('、'):'なし'}`,
    '未計算の税・社会保険などを0円とは扱いません。超過の検出なしは予算が十分である保証ではありません。',
    ...preview.months.filter(m=>m.detailBefore!==m.detailAfter||m.expenseBefore!==m.expenseAfter).map(m=>`${m.month}：内訳 ${m.detailBefore===null?'未確定':money(m.detailBefore)} → ${m.detailAfter===null?'未確定':money(m.detailAfter)}／資産計算支出 ${money(m.expenseBefore)} → ${money(m.expenseAfter)}`)
   ].filter(Boolean).join('\n');
   el('Preview').hidden=false;el('Status').textContent=preview.changed?'試算済み・未反映':'採用値と同じ（保存不要）';
  }catch(e){error(e.message);}
  buttons();
 });
 async function action(undo){
  if(busy||blocked||(!undo&&(!preview?.changed||!el('Reviewed').checked)))return;
  busy=true;buttons();error('');let saved;
  try{assertExpenseScreenMatches(loadExpenseState(storage),getState());saved=undo?await undoExpenseApply(base,{storage}):await applyExpensePreview(base,preview,{storage});}
  catch(e){error(`保存できませんでした。入力は保持しています。${e.message}`);busy=false;buttons();return;}
  base=saved.state;invalidate();rebuild();el('Status').textContent=undo?'取消を保存しました':'反映済み';
  try{onCommit(saved);showNotice(undo?'直前の金額変更を取り消しました。':'集計表に反映して保存しました。');}
  catch{blocked=true;error('保存済みですが表示を更新できません。再読み込みしてください。');busy=false;buttons();return;}
  busy=false;render();
 }
 el('Apply').addEventListener('click',()=>action(false));el('Undo').addEventListener('click',()=>action(true));
 return {render,invalidate(){blocked=true;invalidate();error('別画面で更新されました。入力を控えてから再読み込みしてください。');buttons();},reset(){base=null;blocked=false;invalidate();error('');render();}};
}
