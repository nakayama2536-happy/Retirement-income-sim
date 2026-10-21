// Optional, opt-in private Firebase panel. No SDK is loaded until user connects.
// Passwords and the encryption passphrase are never placed in browser storage.
import {createFirebaseStore,validateFirebaseConfig} from './sync-firebase.mjs';
import {createSyncCoordinator} from './sync-controller.mjs';
export const SYNC_PUBLIC_CONFIG_KEY='lifeplan-private-sync-config-v1';
export const SYNC_MARKER_KEY='lifeplan-private-sync-marker-v1';
export const SYNC_ROLLBACK_KEY='lifeplan-private-sync-previous-v1';
export const SYNC_REVIEW_KEY='lifeplan-private-sync-pending-review-v1';
const parse=(s)=>{try{return s?JSON.parse(s):null;}catch{return null;}};
// Focus remaining on Firebase inputs is not a pending edit in the financial dashboard.
// Safari/WebKit may retain input focus when a button is clicked.
export function hasExternalEditorFocus(doc){
 const active=doc?.activeElement;
 return Boolean(active?.closest?.('#dashboard input, #dashboard select, #dashboard textarea')&&
   !active?.closest?.('#privateSyncContainer'));
}

export function mountSyncPanel(root,{getState,replaceLocal,validateState,afterReplace=()=>{},writeAllowed=()=>true,
 createStore=createFirebaseStore,storage=globalThis.localStorage,windowRef=globalThis.window,documentRef=root?.ownerDocument??globalThis.document}={}){
 if(!root||typeof getState!=='function'||typeof replaceLocal!=='function'||typeof validateState!=='function')throw TypeError('同期設定の初期化が不正です。');
 const doc=documentRef,element=(tag,message=null,attrs={})=>{
  const el=doc.createElement(tag);if(message!==null)el.textContent=message;
  for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));
  return el;
 };
 root.replaceChildren();
 root.appendChild(element('h3','本人専用・端末間同期（開発候補）'));
 root.appendChild(element('p','同期は初期状態で停止しています。iPhoneとPCの最新の一括バックアップを先に別保管し、初回の同期元を選択してください。未接続のままでも今までどおり端末内で使えます。'));
 root.appendChild(element('p','Firebase設定とログイン情報はGitHubに保存しません。暗号化用の合言葉はブラウザ保存せず、アプリを開いた後に再入力します。同期はロック解除中のみ自動実行します。'));
 const safeGet=key=>{try{return storage?.getItem(key)??null;}catch{return null;}};
 const old=parse(safeGet(SYNC_PUBLIC_CONFIG_KEY))||{};
 const reviewBarrier=()=>safeGet(SYNC_REVIEW_KEY)!==null;
 const clearReviewBarrier=()=>{if(storage?.removeItem)storage.removeItem(SYNC_REVIEW_KEY);};
 const rows=element('div',null,{class:'form-grid'});
 function field(label,name,value,type='text'){
  const row=element('label',label),input=element('input',null,{name,type});
  input.value=value||'';row.appendChild(input);rows.appendChild(row);return input;
 }
 const cfg={
  apiKey:field('Firebase Web API key（公開設定）','syncApiKey',old.apiKey),
  authDomain:field('Firebase Auth domain','syncAuthDomain',old.authDomain),
  projectId:field('Firebase project ID','syncProjectId',old.projectId),
  appId:field('Firebase app ID','syncAppId',old.appId)
 };
 const email=field('本人専用ログインのメールアドレス','syncEmail','','email');
 const password=field('ログイン用パスワード（Firebaseログイン済みなら空欄可・保存しません）','syncPassword','','password');
 const phrase=field('端末間共通の暗号化用合言葉（16文字以上・保存しません）','syncPhrase','','password');
 root.appendChild(rows);
 const backupRow=element('label'),backupCheck=element('input',null,{name:'syncBackupConfirmed',type:'checkbox'});
 backupCheck.checked=false;
 backupRow.appendChild(backupCheck);backupRow.appendChild(element('span','両端末の既存データを確認し、必要な一括バックアップを別の安全な場所に保管しました。'));
 root.appendChild(backupRow);
 const controls=element('div',null,{class:'form-grid'});
 const connect=element('button','Firebaseに本人ログインして確認',{type:'button',class:'secondary'});
 const preview=element('button','クラウド内容と端末内容を照合（書込みなし）',{type:'button',class:'secondary'});
 const firstUpload=element('button','この端末を初回の同期元にする',{type:'button',class:'secondary'});
 const firstDownload=element('button','確認したクラウドをこの端末へ初回取込',{type:'button',class:'secondary'});
 const syncNow=element('button','同期状態を確認',{type:'button',class:'secondary'});
 const acceptLocal=element('button','確認した端末の変更をクラウドへ同期',{type:'button',class:'secondary'});
 const applyPending=element('button','確認したクラウド最新版を端末へ反映',{type:'button',class:'secondary'});
 const disconnect=element('button','同期を停止してログアウト',{type:'button',class:'secondary'});
 for(const b of [connect,preview,firstUpload,firstDownload,applyPending,acceptLocal,syncNow,disconnect])controls.appendChild(b);
 root.appendChild(controls);
 const status=element('p','未接続・端末内のみ',{role:'status'}),details=element('p','',{role:'note'});
 root.appendChild(status);root.appendChild(details);
 let coordinator=null,providerSession=null,remoteExists=null,previewOK=false,timer=null,working=false;
 let pendingEditorChange=false;
 const hasPendingEdits=()=>{
  const pension=documentRef?.querySelector?.('#pensionState')?.dataset?.dirty==='true';
  const salary=documentRef?.querySelector?.('#salaryState')?.dataset?.dirty==='true';
  return pendingEditorChange||pension||salary||hasExternalEditorFocus(documentRef);
 };
 const refuseUnsavedEdits=()=>{
  if(hasPendingEdits())throw Error('別の入力欄に未保存の下書きがある可能性があります。必要な入力を保存・控えて画面を開き直し、クラウドと端末の差分を再確認してください。');
 };
 const noteEditorEdit=e=>{
  if(e?.target?.closest?.('#privateSyncContainer'))return;
  if(e?.target?.closest?.('#dashboard')){pendingEditorChange=true;previewOK=false;buttons();}
 };
 documentRef?.addEventListener?.('input',noteEditorEdit,true);
 documentRef?.addEventListener?.('change',noteEditorEdit,true);
 const setStatus=(s)=>{status.textContent=s;};
 const buttons=()=>{
  const enabled=!!coordinator;
  preview.disabled=!enabled||remoteExists!==true||working;
  firstUpload.disabled=!enabled||remoteExists!==false||!backupCheck.checked||working;
  firstDownload.disabled=!enabled||remoteExists!==true||!previewOK||!backupCheck.checked||working;
  syncNow.disabled=!enabled||working;
  acceptLocal.disabled=!enabled||remoteExists!==true||!previewOK||!backupCheck.checked||!parse(safeGet(SYNC_MARKER_KEY))||working;
  applyPending.disabled=!enabled||remoteExists!==true||!previewOK||!backupCheck.checked||!parse(safeGet(SYNC_MARKER_KEY))||working;
  disconnect.disabled=!enabled||working;
  connect.disabled=working;
 };
 backupCheck.addEventListener('change',buttons);
 function describe(s){
  if(s?.status==='STOP'||s?.status==='CONFLICT')return '同期停止：'+(s.message||'端末とクラウドの変更が衝突しています。');
  const map={SYNCED:'同期済み',UPLOADED:'この端末の変更を暗号化して同期しました',DOWNLOADED:'クラウド内容を検証して端末に反映しました',
   INITIAL_UPLOADED:'初回の暗号化クラウド保存が完了',PENDING_LOCAL_UPDATE:'送信中に端末で変更があり、次回再照合が必要です',
   PENDING_OFFLINE:'オフライン：端末内のデータを保持し同期待ち',ENROLLMENT_REQUIRED:'同期元未選択。初回設定が必要です',
   LOCKED:'同期ロック中',UNCHANGED:'変更なし',REMOTE_EMPTY:'クラウドは未登録',LOCAL_PENDING_REVIEW:'手動復元後の変更は自動送信せず、クラウドとの差を確認する必要があります。',REMOTE_PENDING_REVIEW:'未保存の入力がある可能性があるため、クラウドからの自動取込を保留しています。'};
  return map[s?.status]||s?.status||'同期状態を確認できませんでした。';
 }
 const guarded=async task=>{
  if(working)return;working=true;buttons();
  try{await task();}catch(e){setStatus('同期停止：'+(e?.message||'確認に失敗しました。')+' 端末内データは削除していません。');}
  finally{working=false;buttons();}
 };
 async function check(){
  if(!coordinator)return;
  const out=await coordinator.runAuto();
  setStatus(describe(out));
  if(out?.status==='REMOTE_PENDING_REVIEW')previewOK=false;
 }
 connect.addEventListener('click',()=>guarded(async()=>{
  const values=Object.fromEntries(Object.entries(cfg).map(([key,input])=>[key,input.value.trim()]));
  validateFirebaseConfig(values);
  if(phrase.value.length<16)throw Error('合言葉は16文字以上にしてください。');
  const secret=phrase.value;phrase.value='';
  const provider=await createStore(values);
  await provider.signIn(email.value.trim(),password.value);password.value='';
  const identity=provider.getIdentity();
   providerSession=provider;
  // Login session is managed by the Firebase SDK. No application financial data
  // are uploaded until the first explicit source-selection click.
  coordinator=createSyncCoordinator({
   projectId:identity.projectId,uid:identity.uid,passphrase:secret,
   loadLocal:getState,validateLocal:validateState,applyLocal:replaceLocal,
   saveBeforeReplace:oldState=>{
    const envelope={version:1,savedAt:new Date().toISOString(),state:structuredClone(oldState)};
    storage.setItem(SYNC_ROLLBACK_KEY,JSON.stringify(envelope));
   },
   readMarker:()=>parse(safeGet(SYNC_MARKER_KEY)),
   writeMarker:value=>storage.setItem(SYNC_MARKER_KEY,JSON.stringify(value)),
   readRemote:()=>provider.read(),casRemote:(expected,next)=>provider.compareAndSwap(expected,next),
   writeAllowed,online:()=>windowRef?.navigator?.onLine!==false,
   canAutoImport:()=>!hasPendingEdits()&&!reviewBarrier(),canAutoUpload:()=>!reviewBarrier(),
   onApplied:afterReplace
  });
  storage.setItem(SYNC_PUBLIC_CONFIG_KEY,JSON.stringify(values)); // Nonsecret Firebase Web config only.
  const result=await coordinator.inspect();
  if(result.status==='STOP')throw Error(result.message);
  remoteExists=!!result.remote;previewOK=false;
  if(result.marker){setStatus('接続済み。保存済みの同期基準があります。');await check();}
  else setStatus(remoteExists?'接続済み。クラウドにデータがあります。照合して初回の取込元を選択してください。':'接続済み。クラウドは空です。初回同期元を明示してください。');
  details.textContent='';
  if(!timer)timer=setInterval(()=>{if(coordinator&&!working)guarded(check);},30000);
 }));
 preview.addEventListener('click',()=>guarded(async()=>{
  previewOK=false;details.textContent='';
  const s=await coordinator.previewRemote();if(s.status!=='PREVIEW'){setStatus(describe(s));return;}
  details.textContent='端末：計画 '+(s.device.startDate||'未設定')+'／開始資産 '+(s.device.openingAsset??'未設定')+' 万円／比較案 '+s.device.scenarioCount+
   '件。クラウド：計画 '+(s.cloud.startDate||'未設定')+'／開始資産 '+(s.cloud.openingAsset??'未設定')+' 万円／比較案 '+s.cloud.scenarioCount+
   '件。差分 '+(s.differs?'あり':'なし')+'。この画面の確認だけでは保存・取込しません。';
  previewOK=true;setStatus('クラウド内容を読み取り検証しました。初回に採用する元を慎重に選んでください。');
 }));
 firstUpload.addEventListener('click',()=>guarded(async()=>{
  const r=await coordinator.initialUpload({backupConfirmed:backupCheck.checked});
  setStatus(describe(r));if(r.status==='INITIAL_UPLOADED'){remoteExists=true;clearReviewBarrier();previewOK=false;}
 }));
 firstDownload.addEventListener('click',()=>guarded(async()=>{
  if(!previewOK)throw Error('クラウドの差分表示を先に確認してください。');
  refuseUnsavedEdits();
  const r=await coordinator.initialDownload({backupConfirmed:backupCheck.checked});
  setStatus(describe(r));if(r.status==='DOWNLOADED'){previewOK=false;clearReviewBarrier();}
 }));
 applyPending.addEventListener('click',()=>guarded(async()=>{
  if(!previewOK||!backupCheck.checked)throw Error('事前バックアップとクラウド内容の差分確認が必要です。');
  refuseUnsavedEdits();
  const result=await coordinator.acceptRemoteUpdate();
  setStatus(describe(result));if(result?.status==='DOWNLOADED'){previewOK=false;clearReviewBarrier();}
 }));
 disconnect.addEventListener('click',()=>guarded(async()=>{
  const old=providerSession;coordinator=null;providerSession=null;remoteExists=null;previewOK=false;
  if(timer){clearInterval(timer);timer=null;}
  password.value='';phrase.value='';
  if(old?.signOut)await old.signOut();
  setStatus('同期を停止しログアウトしました。端末保存データは保持しています。');
 }));
 acceptLocal.addEventListener('click',()=>guarded(async()=>{
  if(!previewOK||!backupCheck.checked)throw Error('端末とクラウドの再確認とバックアップ確認が必要です。');
  const r=await coordinator.acceptLocalUpdate();
  setStatus(describe(r));
  if(r?.status==='UPLOADED'||r?.status==='SYNCED'){previewOK=false;clearReviewBarrier();}
 }));
 syncNow.addEventListener('click',()=>guarded(check));
 const trigger=()=>{if(coordinator&&!working)guarded(check);};
 const onVisible=()=>{if(documentRef?.visibilityState!=='hidden')trigger();};
 windowRef?.addEventListener?.('online',trigger);
 windowRef?.addEventListener?.('focus',trigger);
 documentRef?.addEventListener?.('visibilitychange',onVisible);
 buttons();
 return {
  // Call *before* an external JSON import. A failed import may leave sync
  // conservatively paused; that is safer than silently uploading a restore.
  noteExternalRestore:()=>{
   if(!reviewBarrier())storage.setItem(SYNC_REVIEW_KEY,JSON.stringify({version:1,reason:'manual-restore',at:new Date().toISOString()}));
   previewOK=false;buttons();
  },
  onLocalChange:()=>{previewOK=false;buttons();trigger();},
  getState:()=>({connected:!!coordinator,remoteExists,previewOK,pendingEdits:hasPendingEdits(),reviewPending:reviewBarrier(),markerPresent:!!parse(safeGet(SYNC_MARKER_KEY))}),
  destroy:()=>{if(timer)clearInterval(timer);windowRef?.removeEventListener?.('online',trigger);windowRef?.removeEventListener?.('focus',trigger);documentRef?.removeEventListener?.('visibilitychange',onVisible);documentRef?.removeEventListener?.('input',noteEditorEdit,true);documentRef?.removeEventListener?.('change',noteEditorEdit,true);root.replaceChildren();}};
}
