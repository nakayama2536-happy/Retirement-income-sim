import {previewAgeBudgetCandidate} from './age-budget-candidate.mjs';
import {mountAgeBudgetDeltaComparison} from './age-budget-delta-ui.mjs';
import {ageBudgetPreviewView,ageBudgetPreviewCsv} from './age-budget-preview-export.mjs';
export function mountAgeBudgetComparison({container,getConfig,notice,documentRef=document,urlRef=URL}={}){
 if(!container||typeof getConfig!=='function')throw Error('表示領域と現在設定が必要です');
 const shell=documentRef.createElement('details');
 shell.className='card';shell.id='ageBudgetReferencePanel';
 const summary=documentRef.createElement('summary');summary.textContent='80歳・85歳以降の支出切替を比較する（未反映）';shell.append(summary);
 const note=documentRef.createElement('p');note.className='muted';note.textContent='参考値による比較です。現在の管理予算・保存データは変更しません。変更後の費目と税額は別途確認してください。';shell.append(note);
 const run=documentRef.createElement('button');run.type='button';run.className='secondary';run.textContent='現在の計画と比較する';shell.append(run);
 const exportBtn=documentRef.createElement('button');exportBtn.type='button';exportBtn.className='secondary';exportBtn.textContent='比較案CSVを保存';exportBtn.disabled=true;shell.append(exportBtn);
 const status=documentRef.createElement('p');status.setAttribute('role','status');shell.append(status);
 const table=documentRef.createElement('div');table.className='table-wrap';shell.append(table);
 container.append(shell);let preview=null,previewSource=null;
 const sourceSnapshot=()=>JSON.stringify(getConfig());
 const reset=()=>{preview=null;previewSource=null;exportBtn.disabled=true;status.textContent='';table.replaceChildren();};
 run.addEventListener('click',()=>{reset();try{
  const c=getConfig();if(!c)throw Error('現在の設定がありません');
  const source=sourceSnapshot();
  preview=previewAgeBudgetCandidate(c);
  if(source!==sourceSnapshot())throw Error('試算中に設定が変わりました。再試算してください');
  previewSource=source;
  const view=ageBudgetPreviewView(preview);status.textContent='未反映の参考比較：対象 '+view.changedMonthCount+'か月。最終資産の差額 '+view.finalAssetDifference.toFixed(2)+'万円';
  const grid=documentRef.createElement('table'),head=documentRef.createElement('thead'),row=documentRef.createElement('tr');
  for(const label of ['年月','年齢','変更前支出','変更後支出','支出差額（変更後−変更前）','月末資産（変更前）','月末資産（変更後）','資産差額（変更後−変更前）']){const th=documentRef.createElement('th');th.textContent=label;row.append(th);}head.append(row);grid.append(head);
  const body=documentRef.createElement('tbody');
  for(const v of view.rows){if(v.changed!=='対象')continue;const tr=documentRef.createElement('tr');for(const value of [v.month,v.age,v.expenseBefore,v.expenseAfter,v.expenseDifference,v.endAssetBefore,v.endAssetAfter,v.endAssetAfter-v.endAssetBefore]){const td=documentRef.createElement('td');td.textContent=typeof value==='number'?value.toFixed(2):String(value);tr.append(td);}body.append(tr);}grid.append(body);table.append(grid);exportBtn.disabled=false;
 }catch(e){status.textContent='比較できません：'+e.message;notice?.(e.message,'error');}});
 exportBtn.addEventListener('click',()=>{if(!preview)return;try{
  if(previewSource!==sourceSnapshot()){reset();throw Error('設定が変更されました。比較案を再試算してください');}
  const csv=ageBudgetPreviewCsv(preview),url=urlRef.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
  try{const a=documentRef.createElement('a');a.href=url;a.download='lifeplan-age-budget-preview.csv';a.click();notice?.('未反映の比較案CSVを作成しました。');}
  finally{urlRef.revokeObjectURL(url);}
 }catch(e){notice?.(e.message,'error');}});
 const delta=mountAgeBudgetDeltaComparison({container,getConfig,notice,documentRef,urlRef});
 return {reset:()=>{reset();delta.reset();}};
}
