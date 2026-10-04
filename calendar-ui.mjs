import {calendarMode} from './calendar-mode.mjs';
import {previewCalendar,applyCalendarPreview,undoCalendarApply,calendarUndoAvailable} from './calendar-workflow.mjs';
import {configSignature} from './storage.mjs';
const el=id=>document.getElementById(id);
const label=mode=>mode==='anchored-months-v1'?'月末・閏日を元の計画日にそろえる方式':'従来方式';
const money=n=>Number.isFinite(n)?`${n.toLocaleString('ja-JP',{maximumFractionDigits:2})}万円`:'未計算';
const time=s=>s&&Number.isFinite(Date.parse(s))?new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',dateStyle:'short',timeStyle:'medium'}).format(new Date(s))+' 日本時間':'未反映';
export function mountCalendarSheet({getState,onCommit,showNotice}){
 let preview=null,busy=false,blocked=false,initialized=false;
 const error=msg=>{el('calendarError').textContent=msg;el('calendarError').hidden=!msg;};
 function invalidate(external=false){preview=null;el('calendarPreview').hidden=true;el('calendarApply').disabled=true;el('calendarReviewed').checked=false;if(external){blocked=true;error('別画面で更新されました。再読み込みしてください。');} }
 function buttons(){
  el('calendarTrial').disabled=busy||blocked;el('calendarUndo').disabled=busy||blocked||!calendarUndoAvailable(getState().config);
  el('calendarApply').disabled=busy||blocked||!preview?.changed||!preview.canApply||!el('calendarReviewed').checked;
 }
 function render(){
  const state=getState();if(!state.config)return;
  if(!initialized){el('calendarMode').value=calendarMode(state.config);initialized=true;}
  if(preview&&preview.baseSignature!==configSignature(state)){invalidate();error('前提が変わったため、再試算してください。');}
  el('calendarAdopted').textContent=`採用中：${label(calendarMode(state.config))}`;
  el('calendarState').textContent=el('calendarMode').value===calendarMode(state.config)?'採用値と同じ':'未反映の変更あり';
  const w=state.config.calendarWorkflow;
  el('calendarHistory').textContent=w?.lastApply?`反映日時：${time(w.lastApply.at)}`:w?.history?.length?`直前の操作：${time(w.history.at(-1).at)}`:'反映履歴なし';buttons();
 }
 el('calendarMode').addEventListener('change',()=>{invalidate();error('');render();});
 el('calendarReviewed').addEventListener('change',buttons);
 el('calendarTrial').addEventListener('click',()=>{
  if(busy||blocked)return;invalidate();error('');
  try{
   preview=previewCalendar(getState(),el('calendarMode').value);
   const changed=preview.differences.filter(d=>d.changed);
   const lines=[`採用中：${label(calendarMode(getState().config))} → 試す方式：${label(preview.mode)}`,
     `全期間の計算月数：${preview.before.monthlyDetails.length} → ${preview.after.monthlyDetails.length}`,
     `最終資産：${money(preview.before.finalAsset)} → ${money(preview.after.finalAsset)}（差 ${money(preview.after.finalAsset-preview.before.finalAsset)}）`,
     ...changed.map(d=>`${d.age}歳：${d.beforeMonths} → ${d.afterMonths}か月／開始 ${d.beforeStart} → ${d.afterStart}／最終計算日 ${d.beforeLast} → ${d.afterLast}`),
     changed.length?'上記の年齢期の対象日が変わります。':'年齢期の対象日は変わりません。',
     preview.forecastBefore?`実績反映後の最終資産：${money(preview.forecastBefore.projection.finalAsset)} → ${preview.canApply?money(preview.forecastAfter.projection.finalAsset):'実績期間の確認待ち'}`:'実績なし：再予測の比較なし',
     '年金・iDeCo受取日、給与生活方式、既存の比較案は変更しません。',
     '税社保・内訳参考額の日付統合は未完了です。この操作で全機能の整合を保証するものではありません。'];
   if(!preview.canApply)lines.push(`反映不可：${preview.actualConflicts.join('・')}歳の実績対象期間が変わります。実績の測定時点の確認が必要です。`);
   el('calendarPreviewBody').textContent=lines.join('\n');el('calendarPreview').hidden=false;buttons();
  }catch(e){error(e.message);}
 });
 function action(fn){
  if(busy||blocked)return;busy=true;buttons();error('');
  let updated;
  try{updated=fn();}catch(e){error(`保存できませんでした。${e.message}`);busy=false;buttons();return;}
  // Saved first. Rendering failure must not be reported as a save failure.
  preview=null;el('calendarPreview').hidden=true;el('calendarReviewed').checked=false;el('calendarMode').value=calendarMode(updated.config);
  try{onCommit(updated);showNotice(updated.changed===false?'採用値は変わっていません。':'期間方式を保存して再計算しました。');}catch{error('保存済みですが表示を更新できません。再読み込みしてください。');}
  busy=false;render();
 }
 el('calendarApply').addEventListener('click',()=>{if(preview&&el('calendarReviewed').checked)action(()=>applyCalendarPreview(getState(),preview));});
 el('calendarUndo').addEventListener('click',()=>action(()=>undoCalendarApply(getState())));
 return {render,invalidate:()=>{invalidate(true);buttons();},reset:()=>{blocked=false;initialized=false;invalidate();error('');render();}};
}
