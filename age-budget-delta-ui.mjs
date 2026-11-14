/** Read-only verified age-threshold expense comparison, no adopted writes. */
import {previewAgeBudgetDelta} from './age-budget-delta-candidate.mjs';
import {ageBudgetPreviewView,ageBudgetPreviewCsv} from './age-budget-preview-export.mjs';
const ITEMS=[['medical','80歳以降の医療費増加'],['car','85歳以降の車両費減少'],['transport','85歳以降の交通費増加']];
export function mountAgeBudgetDeltaComparison({container,getConfig,documentRef=document,notice,urlRef=URL}={}){
 if(!container||typeof getConfig!=='function')throw Error('表示先と設定の取得方法が必要です');
 const d=documentRef, panel=d.createElement('details');panel.id='ageBudgetDeltaReviewPanel';panel.className='card';
 const summary=d.createElement('summary');summary.textContent='元の予算への増減額を比較する（確認後・未反映）';panel.append(summary);
 const note=d.createElement('p');note.textContent='各費目が現在の管理予算に既に含まれるか確認してください。「未確認」のままでは試算しません。比較は未採用です。';panel.append(note);
 const selectors={};
 for(const [key,label] of ITEMS){
  const row=d.createElement('label');row.textContent=label+'：';
  const sel=d.createElement('select');sel.setAttribute('aria-label',label);sel.setAttribute('data-age-budget-component',key);
  for(const [value,text] of [['','未確認（試算不可）'],['already-in-budget','予算に反映済み（再計上しない）'],['not-in-budget','予算に未反映（差額を適用）']]){
   const option=d.createElement('option');option.value=value;option.textContent=text;sel.append(option);
  }
  sel.value='';row.append(sel);panel.append(row);selectors[key]=sel;
 }
 const run=d.createElement('button');run.type='button';run.textContent='確認した増減額で比較する';panel.append(run);
 const csv=d.createElement('button');csv.type='button';csv.textContent='未採用の比較CSV';csv.disabled=true;panel.append(csv);
 const status=d.createElement('p');status.setAttribute('role','status');status.textContent='費目の反映状況を確認してください';panel.append(status);
 const table=d.createElement('div');table.className='table-wrap';panel.append(table);container.append(panel);
 let preview=null,snapshot=null,reviewSnapshot=null;
 const fingerprint=()=>JSON.stringify(getConfig());
 const review=()=>Object.fromEntries(ITEMS.map(([key])=>[key,selectors[key].value]));
 const fingerprintReview=()=>JSON.stringify(review());
 const reset=()=>{preview=null;snapshot=null;reviewSnapshot=null;csv.disabled=true;table.replaceChildren();};
 for(const sel of Object.values(selectors))sel.addEventListener('change',()=>{reset();status.textContent='費目が変更されました。再試算してください';});
 run.addEventListener('click',()=>{
  reset();try{
   const cfg=getConfig();if(!cfg)throw Error('現在の設定がありません');
   const components=review(),source=fingerprint(),reviewSource=fingerprintReview();
   for(const [key,label] of ITEMS)if(!['already-in-budget','not-in-budget'].includes(components[key]))throw Error(label+'の反映状況が未確認です');
   const p=previewAgeBudgetDelta(cfg,{adjustmentReview:{confirmed:true,components}});
   if(source!==fingerprint()||reviewSource!==fingerprintReview())throw Error('試算中に条件が変わりました。再試算してください');
   preview=p;snapshot=source;reviewSnapshot=reviewSource;
   const view=ageBudgetPreviewView(p);
   const grid=d.createElement('table'),thead=d.createElement('thead'),h=d.createElement('tr');
   for(const label of ['年月','年齢','変更前支出（万円）','変更後支出（万円）','支出差額（万円）']){
    const th=d.createElement('th');th.textContent=label;h.append(th);
   }thead.append(h);grid.append(thead);
   const body=d.createElement('tbody');
   for(const r of view.rows){if(r.changed!=='対象')continue;const tr=d.createElement('tr');for(const n of [r.month,r.age,r.expenseBefore,r.expenseAfter,r.expenseDifference]){const cell=d.createElement('td');cell.textContent=typeof n==='number'?n.toFixed(2):String(n);tr.append(cell);}body.append(tr);}
   grid.append(body);table.append(grid);status.textContent='未採用の差額比較：対象 '+view.changedMonthCount+'か月。最終資産差額 '+view.finalAssetDifference.toFixed(2)+'万円';csv.disabled=false;
  }catch(e){reset();status.textContent='比較できません：'+e.message;notice?.(e.message,'error');}
 });
 csv.addEventListener('click',()=>{
  if(!preview)return;
  try{
   if(snapshot!==fingerprint()||reviewSnapshot!==fingerprintReview()){reset();throw Error('予算または反映状況が変わりました。再試算してください');}
   const blob=new Blob([ageBudgetPreviewCsv(preview)],{type:'text/csv;charset=utf-8'});
   const href=urlRef.createObjectURL(blob);
   try{const a=d.createElement('a');a.href=href;a.download='lifeplan-age-budget-delta-preview.csv';a.click();notice?.('未採用の差額比較CSVを作成しました');}finally{urlRef.revokeObjectURL(href);}
  }catch(e){notice?.(e.message,'error');}
 });
 return {reset,selectors,panel,run,csv,status};
}
