/** Draft-only isolated-browser UI for legacy expense adoption.
 * Requires the staged v1 resolver and backup compatibility feature.
 * No automatic write: backup download, explicit acknowledgement and
 * local expected-state check are mandatory.
 */
import {prepareUnificationState,commitPreparedUnification,undoPreparedUnification} from './lifeplan-expense-unification-transaction.mjs';
import {validateSavedState} from './migration.mjs';
import {createFullBackup} from './full-backup.mjs';
import {STATE_KEY,downloadJson} from './storage.mjs';

const clone=x=>structuredClone(x);
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

export function mountExpenseUnificationAdoptionUi({doc=globalThis.document,storage=globalThis.localStorage,getState,writeAllowed=()=>false,onCommit}={}){
 if(!doc?.createElement||!storage||typeof getState!=='function'||typeof onCommit!=='function')throw Error('Missing adoption UI dependency');
 const host=doc.getElementById('expenseUnificationReview');
 if(!host||doc.getElementById('expenseUnificationAdoption'))throw Error('Migration review card unavailable or duplicated');
 const body=doc.createElement('div');body.id='expenseUnificationAdoption';
 const note=doc.createElement('p');note.textContent='開発検証専用：移行前のバックアップを保存し、確認してから標準形式に採用します。95歳以降の未登録は未確定のまま維持します。';
 const prepare=doc.createElement('button');prepare.type='button';prepare.textContent='4-1-6-2. 移行候補と保存条件を確認';
 const backup=doc.createElement('button');backup.type='button';backup.textContent='4-1-6-3. 移行前の一括バックアップJSONを保存';backup.disabled=true;
 const label=doc.createElement('label'),confirm=doc.createElement('input');confirm.type='checkbox';confirm.disabled=true;
 label.append(confirm,doc.createTextNode('移行前の一括バックアップをPC内に保存できたことを確認しました'));
 const apply=doc.createElement('button');apply.type='button';apply.textContent='4-1-6-4. 標準形式へ採用';apply.disabled=true;
 const undo=doc.createElement('button');undo.type='button';undo.textContent='4-1-6-5. 移行のみ取り消す';
 const status=doc.createElement('p');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
 body.append(note,prepare,backup,label,apply,undo,status);host.append(body);
 let pending=null,expectedRaw=null,backupRequested=false,sourceSnapshot=null;
 const clear=()=>{
   pending=null;expectedRaw=null;sourceSnapshot=null;backupRequested=false;
   backup.disabled=true;confirm.checked=false;confirm.disabled=true;apply.disabled=true;
   status.textContent='';
 };
 const report=(value)=>{status.textContent=value;};
 const eligible=()=>Boolean(writeAllowed());
 prepare.addEventListener('click',()=>{
   clear();
   try{
     if(!eligible())throw Error('書込み権限がありません。別画面での編集を終了してください。');
     const raw=storage.getItem(STATE_KEY);
     if(typeof raw!=='string')throw Error('統合保存データがありません。');
     const state=JSON.parse(raw);
     if(!getState()?.config)throw Error('表示中の設定と保存データが異なります。再読み込みしてください。');
     const proposal=prepareUnificationState(state,{validate:validateSavedState});
     if(proposal.status!=='prepared')throw Error('移行できません：'+proposal.reason);
     expectedRaw=raw;sourceSnapshot=clone(state);pending=proposal;
     backup.disabled=false;
     report('移行候補を作成しました。費目 '+proposal.proof.legacyItems+'件。95歳の登録 '+proposal.proof.age95+'件、96歳の登録 '+proposal.proof.age96+'件。未採用です。');
   }catch(error){report('採用停止：'+error.message);}
 });
 backup.addEventListener('click',()=>{
   if(!pending||storage.getItem(STATE_KEY)!==expectedRaw){clear();report('設定が変更されました。移行候補を作り直してください。');return;}
   try{
     downloadJson(createFullBackup(sourceSnapshot), 'lifeplan-before-legacy-expense-unification.json');
     backupRequested=true;confirm.disabled=false;
     report('一括バックアップJSONの保存先とファイルを確認してから、確認欄を選択してください。');
   }catch(error){clear();report('バックアップ生成に失敗しました：'+error.message);}
 });
 confirm.addEventListener('change',()=>{apply.disabled=!pending||!backupRequested||!confirm.checked||!eligible();});
 apply.addEventListener('click',async()=>{
   if(!pending||!backupRequested||!confirm.checked||!eligible())return;
   apply.disabled=true;prepare.disabled=true;
   const outcome=await commitPreparedUnification({
     store:storage,key:STATE_KEY,expectedRaw,prepared:pending,validate:validateSavedState,allowWrite:eligible(),
     writeBackup:async()=>({secured:confirm.checked&&backupRequested,receipt:'user-confirmed-downloaded-full-backup'})
   });
   prepare.disabled=false;
   if(outcome.status!=='saved'){clear();report('採用停止：'+(outcome.reason||outcome.status));return;}
   clear();report('標準形式の採用を保存しました。再読込み後の状態を確認してください。');
   onCommit();
 });
 undo.addEventListener('click',()=>{
   if(!eligible()){report('取消停止：書込み権限がありません。');return;}
   const raw=storage.getItem(STATE_KEY);
   if(!raw){report('取消対象の保存データがありません。');return;}
   if(!getState()?.config){report('取消停止：保存内容が変わりました。再読み込みしてください。');return;}
   const r=undoPreparedUnification({store:storage,key:STATE_KEY,expectedRaw:raw,validate:validateSavedState,allowWrite:true});
   if(r.status!=='undone'){report('取消停止：'+r.reason);return;}
   clear();report('移行処理だけを取り消しました。');
   onCommit();
 });
 return {clear,root:body};
}
