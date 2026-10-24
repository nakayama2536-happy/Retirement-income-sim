// Cloud UI: persisted owner authentication, explicit in-memory encryption unlock.
// No credentials, passphrase, financial values or decrypted keys are persisted here.
import {createFirebaseStore,validateFirebaseConfig} from './sync-firebase.mjs';
import {createSyncCoordinator} from './sync-controller.mjs';
import {validSyncMarker} from './sync-policy.mjs';
export const SYNC_PUBLIC_CONFIG_KEY='lifeplan-private-sync-config-v1';
export const SYNC_MARKER_KEY='lifeplan-private-sync-marker-v1';
export const SYNC_ROLLBACK_KEY='lifeplan-private-sync-previous-v1';
export const SYNC_REVIEW_KEY='lifeplan-private-sync-pending-review-v1';
export const SYNC_AUTO_RESUME_KEY='lifeplan-private-sync-auto-resume-v1';
export const CLOUD_ACTIONS=Object.freeze({
 1:'ログイン・ロック解除して開始',2:'今すぐクラウドに書き込む',
 3:'クラウドの最新版を読み込む',4:'保存状況と差分を確認',
 5:'自動保存を停止してログアウト',6:'この端末のデータでクラウドを初期登録',
 7:'クラウドのデータでこの端末を利用開始'
});
const numbers=['','①','②','③','④','⑤','⑥','⑦'];
const parse=s=>{try{return s?JSON.parse(s):null;}catch{return null;}};
const sameIdentity=(a,b)=>!!a&&!!b&&a.uid===b.uid&&a.projectId===b.projectId;
export function hasExternalEditorFocus(doc){
 const active=doc?.activeElement;
 return Boolean(active?.closest?.('#dashboard input, #dashboard select, #dashboard textarea')&&
  !active?.closest?.('#privateSyncContainer'));
}
export function cloudResultText(s){
 if(s?.status==='PREVIEW'){
  const hints={UPLOAD_CAS:'この端末にクラウド未保存の変更があります。',DOWNLOAD_VALIDATED:'クラウドの新しい版を読み込めます。',
   CONFLICT:'端末とクラウドの両方に変更があります。自動更新を保留します。',STOP:'保存状態の確認が必要です。',
   ENROLLMENT_REQUIRED:'初回登録前です。⑦を使う場合は内容を確認してください。'};
  return hints[s.syncAction]||(s.differs?'端末とクラウドに差分があります。':'端末とクラウドの保存内容は一致しています。');
 }
 const map={
  SYNCED:'クラウドと一致しています。',UPLOADED:'クラウドへの書込みが完了しました。',
  DOWNLOADED:'クラウドの最新版をこの端末へ反映しました。',INITIAL_UPLOADED:'クラウドの初期登録が完了しました。',
  PENDING_LOCAL_UPDATE:'端末に新しい変更があります。クラウドへの保存完了は未確認です。',
  PENDING_OFFLINE:'通信待ちです。端末の保存データを保持しています。クラウド保存は未確認です。',
  ENROLLMENT_REQUIRED:'初回設定が必要です。下の「初回設定」を確認してください。',
  LOCKED:'暗号化ロックの解除待ちです。',REMOTE_EMPTY:'クラウドにデータがありません。自動で再登録しません。',
  LOCAL_PENDING_REVIEW:'復元後の変更です。④で比較し、確認するまで自動書込みを保留します。',
  REMOTE_PENDING_REVIEW:'未保存入力がある可能性があるため、自動読込みを保留します。',
  STOP:'処理を保留しました。保存完了は確認できていません。④で状態を再確認してください。',
  CONFLICT:'端末とクラウドの両方に変更があります。自動更新を保留します。',
  SIGNED_OUT:'自動保存を停止しログアウトしました。端末データは保持しています。',
  AUTH_READY:'ログイン済みです。メール・パスワードの再入力は不要です。暗号化解除が必要です。',
  AUTH_REQUIRED:'ログインと暗号化解除が必要です。',AUTH_CHECKING:'保存されたログイン状態を確認しています。',
  IDENTITY_MISMATCH:'登録済み端末と異なる本人認証です。⑤でログアウトし、正しいアカウントでログインしてください。',
  UNCONNECTED:'未接続です。端末内で利用できます。',UNCHANGED:'変更はありません。'
 };
 return map[s?.status]||'状態を確認できません。';
}
// Keep SDK error strings (which may contain account/config details) out of UI/logs.
function safeError(e){
 if(e?.code){
  if(/network|unavailable|deadline/.test(e.code))return '通信に失敗しました。端末の保存を保持し、接続回復後に再確認してください。';
  if(/auth\//.test(e.code))return '本人認証を確認できません。ログイン情報または接続状態を確認してください。';
  return 'クラウド処理を完了できません。保存完了は未確認です。④で再確認してください。';
 }
 const s=String(e?.message||'');
 return /^[^\n]*(?:してください|必要です|できません|不足しています|不正です|保持しています|解除待ちです)[^\n]*。$/.test(s)&&s.length<240?s:
  '処理を完了できません。保存完了は未確認です。④で再確認してください。';
}
const panelStyle=`
.cloud-panel{color:inherit;line-height:1.6}.cloud-panel [hidden]{display:none!important}
.cloud-panel h3,.cloud-panel h4{margin:0 0 .5rem}.cloud-panel p{margin:.4rem 0}
.cloud-panel .cloud-lead{font-size:.92rem}.cloud-panel .cloud-card{border:1px solid #ccd7e2;border-radius:12px;padding:1rem;margin:1rem 0;background:#f6f9fc}
.cloud-panel .cloud-current{border-left:4px solid #31638a}.cloud-panel .cloud-status{font-weight:700;font-size:1.05rem}
.cloud-panel .cloud-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,230px),1fr));gap:.75rem}
.cloud-panel .cloud-action button{width:100%;min-height:48px;white-space:normal;line-height:1.4;padding:.7rem .8rem}
.cloud-panel .cloud-action small{display:block;line-height:1.5;margin:.35rem .1rem;font-size:.82rem}
.cloud-panel .cloud-action button:disabled{cursor:default;opacity:.65}
.cloud-panel details{margin:1rem 0;border:1px solid #d6dfe7;border-radius:10px;padding:.8rem 1rem}
.cloud-panel summary{cursor:pointer;font-weight:700;min-height:32px;line-height:1.6}
.cloud-panel form{margin:0}.cloud-panel label.cloud-field{display:block;margin:.65rem 0}
.cloud-panel label.cloud-field input{display:block;width:100%;box-sizing:border-box;min-height:44px;font-size:16px}
.cloud-panel .cloud-help{font-size:.88rem;color:#425466}.cloud-panel .cloud-times{font-size:.82rem}
.cloud-panel .cloud-result{white-space:pre-line;overflow-wrap:anywhere}.cloud-panel .cloud-safety{padding:.75rem;border:1px solid #b08943;border-radius:8px;margin:1rem 0}
.cloud-panel .cloud-safety input{width:auto;min-height:0;margin-right:.5rem}.cloud-panel button:focus-visible,.cloud-panel summary:focus-visible{outline:3px solid #3678af;outline-offset:3px}
.cloud-panel .cloud-diff{overflow-x:auto}.cloud-panel table{width:100%;border-collapse:collapse;font-size:.88rem}
.cloud-panel th,.cloud-panel td{border-bottom:1px solid #ccd7e2;text-align:left;padding:.4rem;overflow-wrap:anywhere}
@media(max-width:480px){.cloud-panel .cloud-card,.cloud-panel details{padding:.8rem}.cloud-panel .cloud-grid{grid-template-columns:1fr}}
`;
export function mountSyncPanel(root,{getState,replaceLocal,validateState,afterReplace=()=>{},writeAllowed=()=>true,
 createStore=createFirebaseStore,storage=globalThis.localStorage,windowRef=globalThis.window,documentRef=root?.ownerDocument??globalThis.document,
 clock=()=>new Date(),schedule=(fn,ms)=>setInterval(fn,ms),unschedule=id=>clearInterval(id)}={}){
 if(!root||typeof getState!=='function'||typeof replaceLocal!=='function'||typeof validateState!=='function')throw TypeError('同期設定の初期化が不正です。');
 const doc=documentRef,el=(tag,text=null,attrs={})=>{
  const n=doc.createElement(tag);if(text!==null)n.textContent=text;
  for(const [k,v]of Object.entries(attrs))n.setAttribute(k,String(v));return n;
 };
 const append=(p,...ns)=>{for(const n of ns)p.appendChild(n);return p;};
 const safeGet=key=>{try{return storage?.getItem(key)??null;}catch{return null;}};
 const marker=()=>parse(safeGet(SYNC_MARKER_KEY));
 const registered=()=>validSyncMarker(marker());
 const reviewBarrier=()=>safeGet(SYNC_REVIEW_KEY)!==null;
 const clearReviewBarrier=()=>storage?.removeItem?.(SYNC_REVIEW_KEY);
 const old=parse(safeGet(SYNC_PUBLIC_CONFIG_KEY))||{};
 let coordinator=null,providerSession=null,providerConfig=null,unwatch=null,timer=null,working=false,destroyed=false,epoch=0;
 let remoteExists=null,previewOK=false,previewAction=null,pendingEditorChange=false,authMode='unknown',localGeneration=0;
 let lastOutcome={status:'UNCONNECTED'},lastCheck=null,lastWrite=null,lastRead=null,manualMessage='',autoMessage='まだ実行していません。';
 let comparison=null,comparisonStale=false;
 const dateText=d=>d?d.toLocaleString('ja-JP',{hour12:false}):'この起動では未確認';
 const now=()=>clock();
 root.replaceChildren();root.classList.add('cloud-panel');
 append(root,el('style',panelStyle),el('h3','クラウド保存・読込み'),
  el('p','共通の正本はクラウドです。端末で確定・保存した変更を書き込み、他端末の変更を読み込みます。',{class:'cloud-lead'}));
 const current=el('section',null,{class:'cloud-card cloud-current','aria-label':'現在の保存状態'});
 const authText=el('p'),modeText=el('p'),status=el('p',null,{class:'cloud-status',role:'status','aria-live':'polite'});
 const times=el('p',null,{class:'cloud-times'});
 append(current,el('h4','現在の状態'),authText,modeText,status,times);root.appendChild(current);
 const connection=el('section',null,{class:'cloud-card','aria-label':'ログインと暗号化解除'});
 const login=el('form',null,{id:'lifeplanCloudLogin',method:'post',autocomplete:'on'});
 function field(parent,label,name,value,type='text',attrs={}){
  const row=el('label',label,{class:'cloud-field',for:name});
  const input=el('input',null,{id:name,name,type,...attrs});input.value=value||'';append(row,input);parent.appendChild(row);return input;
 }
 const email=field(login,'ログイン用メールアドレス','syncEmail','','email',{autocomplete:'section-lifeplan-login username',autocapitalize:'none',spellcheck:'false'});
 const password=field(login,'ログイン用パスワード','syncPassword','','password',{autocomplete:'section-lifeplan-login current-password'});
 const unlock=el('form',null,{id:'lifeplanCloudUnlock',method:'post',autocomplete:'on'});
 const unlockHelp=el('p',null,{class:'cloud-help'});
 const phrase=field(unlock,'暗号化用の合言葉（ログイン用パスワードとは別・16文字以上）','syncPhrase','','password',
  {autocomplete:'section-lifeplan-unlock current-password',minlength:'16','aria-describedby':'syncPhraseHelp'});
 append(unlock,el('p','対応する端末では、OSのパスワード管理による入力補助を利用できます。ログイン用パスワードとの取り違えに注意してください。アプリ内には保存しません。',
  {id:'syncPhraseHelp',class:'cloud-help'}));
 const actions={},reasons={};
 function action(parent,n,type='button'){
  const box=el('div',null,{class:'cloud-action'}),button=el('button',`${numbers[n]} ${CLOUD_ACTIONS[n]}`,{type,class:n===1||n===4?'':'secondary','data-sync-action':n,'aria-describedby':`cloudReason${n}`});
  const reason=el('small','',{id:`cloudReason${n}`});append(box,button,reason);parent.appendChild(box);actions[n]=button;reasons[n]=reason;return button;
 }
 action(unlock,1,'submit');append(connection,el('h4','利用を開始する'),unlockHelp,login,unlock);root.appendChild(connection);
 const daily=el('section',null,{'aria-label':'よく使う操作'});
 const everyday=el('div',null,{class:'cloud-grid'});
 append(daily,el('h4','よく使う操作'),el('p','通常は自動です。番号は操作の識別用で、順番にすべて押す必要はありません。',{class:'cloud-help'}));
 for(const n of [2,3,4])action(everyday,n);append(daily,everyday);root.appendChild(daily);
 const safety=el('div',null,{class:'cloud-safety'}),backupRow=el('label'),backupCheck=el('input',null,{type:'checkbox',name:'syncBackupConfirmed'});
 append(backupRow,backupCheck,el('span','手動更新・初回登録に備え、必要な一括バックアップを別の安全な場所に保管しました。'));
 append(safety,backupRow,el('p','クラウドからの読込みは、この端末の保存内容を置き換えます。未保存入力や双方の変更は勝手に消しません。',{class:'cloud-help'}));
 root.appendChild(safety);
 const manualCard=el('section',null,{class:'cloud-card','aria-label':'直前のボタン操作の結果'});
 const manual=el('p','まだボタン操作は実行していません。',{class:'cloud-result',role:'status','aria-live':'polite'});
 const staleNote=el('p','照合後に状態が変わりました。手動更新前に④で再確認してください。',{class:'cloud-help'});
 const diff=el('details'),diffBody=el('div',null,{class:'cloud-diff'});append(diff,el('summary','比較の詳細（④の確認時点）'),diffBody);
 append(manualCard,el('h4','直前のボタン操作の結果'),manual,staleNote,diff);root.appendChild(manualCard);
 const automatic=el('details'),auto=el('p',autoMessage,{class:'cloud-result'});
 append(automatic,el('summary','直近の自動処理・ログイン確認'),auto);root.appendChild(automatic);
 const session=el('details');append(session,el('summary','接続管理'),el('p','自分専用の端末では、使い終えるたびにログアウトする必要はありません。',{class:'cloud-help'}));
 action(session,5);root.appendChild(session);
 const initial=el('details');append(initial,el('summary','初回設定・新しい端末の登録'));
 const initialNote=el('p');initial.appendChild(initialNote);
 const configDetails=el('details');append(configDetails,el('summary','Firebase接続先の設定（通常は変更不要）'));
 const cfg={apiKey:field(configDetails,'Web API key（公開設定）','syncApiKey',old.apiKey),
  authDomain:field(configDetails,'Auth domain','syncAuthDomain',old.authDomain),
  projectId:field(configDetails,'Project ID','syncProjectId',old.projectId),
  appId:field(configDetails,'App ID','syncAppId',old.appId)};
 initial.appendChild(configDetails);
 const first=el('div',null,{class:'cloud-grid'});action(first,6);action(first,7);initial.appendChild(first);root.appendChild(initial);
 append(root,el('p','自動処理はアプリ利用中・オンライン・本人認証済み・暗号化解除中に限ります。閉じている間の常時動作は保証しません。',{class:'cloud-help'}));
 function hasPendingEdits(){return pendingEditorChange||doc?.querySelector?.('#pensionState')?.dataset?.dirty==='true'||
  doc?.querySelector?.('#salaryState')?.dataset?.dirty==='true'||hasExternalEditorFocus(doc);}
 function invalidatePreview(){previewOK=false;previewAction=null;if(comparison)comparisonStale=true;}
 function values(){return validateFirebaseConfig(Object.fromEntries(Object.entries(cfg).map(([k,v])=>[k,v.value.trim()])));}
 function assertMarkerAndConfig(config){
  const raw=safeGet(SYNC_MARKER_KEY),m=marker();
  if(raw!==null&&!validSyncMarker(m))throw Error('端末の登録情報を確認できません。自動で初期化しません。');
  if(m&&m.projectId!==config.projectId)throw Error('登録済みの接続先と異なります。接続先設定を確認してください。');
 }
 function assertIdentity(identity){
  const m=marker();if(m&&!sameIdentity(m,identity)){authMode='mismatch';throw Error('登録済み端末と異なる本人認証です。⑤でログアウトしてください。');}
 }
 function stopAuto(){if(timer!==null)unschedule(timer);timer=null;coordinator=null;invalidatePreview();}
 function identityAlive(provider,identity,token){
  if(destroyed||token!==epoch)return false;
  try{return sameIdentity(provider.getIdentity(),identity);}catch{return false;}
 }
 function bindProvider(provider,config){
  unwatch?.();providerSession=provider;providerConfig=config;
  if(provider.watchSession)unwatch=provider.watchSession(identity=>{
   if(destroyed)return;
   const expected=coordinator?.getIdentity();
   if(expected&&!sameIdentity(identity,expected)){
    epoch++;working=false;stopAuto();password.value='';phrase.value='';
    authMode=identity?'mismatch':'signed-out';lastOutcome={status:identity?'IDENTITY_MISMATCH':'AUTH_REQUIRED'};
    autoMessage='本人認証が変更・失効しました。自動更新を停止しました。端末データは保持しています。';auto.textContent=autoMessage;
   }else if(!coordinator){
    authMode=identity?(marker()&&!sameIdentity(marker(),identity)?'mismatch':'signed-in'):'signed-out';
   }
   render();
  });
 }
 async function ensureProvider(config){
  if(providerSession){
   if(JSON.stringify(providerConfig)!==JSON.stringify(config))throw Error('接続設定を変更する場合は⑤で停止し、画面を開き直してください。');
   if(!unwatch)bindProvider(providerSession,config);
   return providerSession;
  }
  const provider=await createStore(config);
  if(destroyed)throw Error('画面は閉じられています。');
  bindProvider(provider,config);return provider;
 }
 function render(){
  if(destroyed)return;
  const reg=registered(),active=!!coordinator;
  authText.textContent='本人認証：'+({checking:'確認中',unknown:'未確認','signed-in':'ログイン済み','signed-out':'ログインが必要',mismatch:'登録アカウントの確認が必要'}[authMode]||'未確認');
  const held=['STOP','CONFLICT','PENDING_OFFLINE','LOCAL_PENDING_REVIEW','REMOTE_PENDING_REVIEW','REMOTE_EMPTY'].includes(lastOutcome.status)||['CONFLICT','STOP'].includes(lastOutcome.syncAction);
  modeText.textContent='自動書込み・読込み：'+(active?(reg?(held?'保留中':'動作中'):'初回登録待ち'):(authMode==='signed-in'?'暗号化解除待ち':'停止中'));
  status.textContent=cloudResultText(lastOutcome)+(lastOutcome.status==='STOP'&&lastOutcome.message?' '+lastOutcome.message:'');
  times.textContent=`最終一致確認：${dateText(lastCheck)} ／ 最終書込み成功：${dateText(lastWrite)} ／ 最終読込み成功：${dateText(lastRead)}`;
  connection.hidden=active;login.hidden=authMode==='signed-in'||authMode==='checking';
  unlockHelp.textContent=authMode==='signed-in'?'ログイン情報の再入力は不要です。合言葉だけで解除してください。':
   'ログイン用パスワードと暗号化用合言葉は別です。初回または再認証が必要な場合だけログイン情報を入力します。';
  actions[1].textContent=`① ${authMode==='signed-in'?'ロック解除して自動保存を開始':CLOUD_ACTIONS[1]}`;
  for(const input of [...Object.values(cfg),email,password,phrase])input.disabled=working||active||(input!==email&&input!==password&&input!==phrase&&!!providerSession);
  function set(n,reason){actions[n].disabled=working||!!reason;reasons[n].textContent=working?'処理中です。完了をお待ちください。':reason||({1:'合言葉はこの起動中だけ使用します。',2:'この端末 → クラウド',3:'クラウド → この端末',4:'この確認操作では書込み・置換をしません。',5:'接続を止めます。端末データは削除しません。',6:'クラウドが空の場合だけ使用します。',7:'この端末の保存内容をクラウドの内容へ置き換えます。'}[n]);}
  set(1,active?'自動処理は開始済みです。':authMode==='checking'?'ログイン状態を確認中です。':authMode==='mismatch'?'⑤でログアウトし、登録済みアカウントを確認してください。':'');
  const checkFirst=!active?'①でロック解除してください。':!reg?'先に初回設定を完了してください。':remoteExists!==true?'クラウド状態を④で確認してください。':!writeAllowed()?'この画面は閲覧専用です。':!previewOK?'手動更新は④の差分確認後に行えます。':'';
  function direction(action){
   if(previewAction==='UNCHANGED')return '端末とクラウドは一致しています。操作不要です。';
   if(previewAction==='CONFLICT'||previewAction==='STOP')return '双方の変更・状態の確認が必要です。無条件では上書きしません。';
   if(previewAction!==action)return action==='UPLOAD_CAS'?'書き込む端末変更はありません。':'読み込むクラウド更新はありません。';
   return !backupCheck.checked?'下のバックアップ確認をチェックしてください。':'';
  }
  set(2,checkFirst||direction('UPLOAD_CAS'));
  set(3,checkFirst||(hasPendingEdits()?'未保存入力を保護しています。必要な入力を保存・控えた後に再確認してください。':direction('DOWNLOAD_VALIDATED')));
  set(4,!active?'①でロック解除してください。':'');
  set(5,!providerSession?'未接続です。':'');
  const start=!active?'①で接続してください。':reg?'初回設定は完了しています。':!writeAllowed()?'この画面は閲覧専用です。':'';
  set(6,start||(remoteExists!==false?'クラウドにデータがあるか、まだ未確認です。既存データは上書きしません。':!backupCheck.checked?'バックアップ確認をチェックしてください。':''));
  set(7,start||(remoteExists!==true?'読み込めるクラウドデータがありません。':!previewOK?'④でクラウドの内容を確認してください。':hasPendingEdits()?'未保存入力を保存・控えてから再確認してください。':!backupCheck.checked?'バックアップ確認をチェックしてください。':''));
  safety.hidden=!active||(!reg?remoteExists===null:!previewOK||!['UPLOAD_CAS','DOWNLOAD_VALIDATED'].includes(previewAction));
  backupCheck.disabled=working;
  initialNote.textContent=reg?'初回設定は完了しています。普段は上段の操作をご利用ください。':'⑥は最初の1台・クラウドが空のときだけ。別端末を追加する場合は④で確認して⑦を使用します。';
  staleNote.hidden=!comparisonStale;diff.hidden=!comparison;first.hidden=reg;
 }
 function showComparison(s){
  comparison=s;comparisonStale=false;diffBody.replaceChildren();
  const table=el('table');const head=el('tr');for(const x of ['項目','この端末','クラウド'])head.appendChild(el('th',x));table.appendChild(head);
  for(const [label,key,suffix]of [['計画開始日','startDate',''],['開始資産','openingAsset',' 万円'],['比較案','scenarioCount',' 件']]){
   const row=el('tr');append(row,el('th',label),el('td',String(s.device[key]??'未設定')+suffix),el('td',String(s.cloud[key]??'未設定')+suffix));table.appendChild(row);
  }
  append(diffBody,table,el('p','差分判定は統合保存データ全体で行います。表は主要項目の抜粋です。',{class:'cloud-help'}));
 }
 function recordOutcome(r){
  lastOutcome=r;
  if(['UPLOADED','INITIAL_UPLOADED'].includes(r.status)){lastWrite=now();lastCheck=now();invalidatePreview();}
  if(r.status==='DOWNLOADED'){lastRead=now();lastCheck=now();invalidatePreview();}
  if(r.status==='SYNCED')lastCheck=now();
  if(r.status==='PREVIEW'&&!r.differs)lastCheck=now();
  if(['STOP','CONFLICT','REMOTE_PENDING_REVIEW','PENDING_LOCAL_UPDATE','PENDING_OFFLINE'].includes(r.status))invalidatePreview();
 }
 function report(n,r){
  const text=cloudResultText(r)+(r.message&&r.status==='STOP'?' '+r.message:'');
  if(n===0){
   const kind=['UPLOADED','INITIAL_UPLOADED'].includes(r.status)?'自動書込み':r.status==='DOWNLOADED'?'自動読込み':'自動確認';
   autoMessage=`${kind}の結果｜${dateText(now())}\n${text}`;auto.textContent=autoMessage;return;
  }
  const effect=n===4?'この確認操作によるクラウド書込み：なし／端末データ置換：なし':
   ['UPLOADED','INITIAL_UPLOADED'].includes(r.status)?'方向：この端末 → クラウド／書込み成功を確認':
   r.status==='DOWNLOADED'?'方向：クラウド → この端末／読込み成功を確認':
   r.status==='SYNCED'?'変更はありません。新たな書込み・置換は不要でした。':
   r.status==='SIGNED_OUT'?'端末データと一括バックアップは削除していません。':
   n===1&&r.status==='ENROLLMENT_REQUIRED'?'初回設定前のため、クラウド書込み・端末データ置換は行っていません。':
   '成功を確認できない操作は、保存完了とは扱いません。';
  manualMessage=`${numbers[n]}「${n===1&&authMode==='signed-in'?'自動保存を開始':CLOUD_ACTIONS[n]}」の結果｜${dateText(now())}\n${text}\n${effect}`;
  manual.textContent=manualMessage;
 }
 async function guarded(n,task){
  if(working||destroyed)return;working=true;const token=epoch,generation=localGeneration;render();
  try{
   let result=await task();if(destroyed||token!==epoch)return;
   if(localGeneration!==generation&&['PREVIEW','SYNCED','UPLOADED'].includes(result?.status)){
    invalidatePreview();result={status:'PENDING_LOCAL_UPDATE'};
   }
   if(result){recordOutcome(result);report(n,result);}
  }catch(e){
   if(!destroyed&&token===epoch){const r={status:'STOP',message:safeError(e)};recordOutcome(r);report(n,r);}
  }finally{if(!destroyed&&token===epoch){working=false;render();}}
 }
 function liveCoordinator(){if(!coordinator)throw Error('①でロック解除してください。');return coordinator;}
 async function autoCheck(){return liveCoordinator().runAuto();}
 function trigger(){if(coordinator&&!working&&!destroyed)void guarded(0,autoCheck);}
 function startTimer(){if(timer===null)timer=schedule(()=>{if(doc?.visibilityState!=='hidden')trigger();},30000);}
 async function begin(){
  const config=values();assertMarkerAndConfig(config);
  if(phrase.value.length<16)throw Error('暗号化用の合言葉は16文字以上が必要です。');
  const secret=phrase.value;phrase.value='';
  const pwd=password.value;password.value='';
  const provider=await ensureProvider(config);
  await provider.signIn(email.value.trim(),pwd);
  const identity=provider.getIdentity();assertIdentity(identity);authMode='signed-in';
  const token=epoch,assertLive=()=>{if(!identityAlive(provider,identity,token))throw Error('本人認証が変わりました。①から再確認してください。');};
  const c=createSyncCoordinator({projectId:identity.projectId,uid:identity.uid,passphrase:secret,
   loadLocal:getState,validateLocal:validateState,
   applyLocal:(next,prior)=>{assertLive();return replaceLocal(next,prior);},
   saveBeforeReplace:oldState=>{assertLive();storage.setItem(SYNC_ROLLBACK_KEY,JSON.stringify({version:1,savedAt:now().toISOString(),state:structuredClone(oldState)}));},
   readMarker:marker,writeMarker:value=>{assertLive();storage.setItem(SYNC_MARKER_KEY,JSON.stringify(value));},
   readRemote:()=>{assertLive();return provider.read();},casRemote:(expected,next)=>{assertLive();return provider.compareAndSwap(expected,next);},
   writeAllowed:()=>identityAlive(provider,identity,token)&&writeAllowed(),online:()=>windowRef?.navigator?.onLine!==false,
   canAutoImport:()=>!hasPendingEdits()&&!reviewBarrier(),canAutoUpload:()=>!reviewBarrier(),onApplied:afterReplace});
  const info=await c.inspect();if(info.status==='STOP')throw Error(info.message);
  remoteExists=!!info.remote;invalidatePreview();
  // A persisted auth session is NOT proof of the encryption phrase. Verify it
  // against existing ciphertext before any automatic upload, even if unchanged.
  if(remoteExists){const proof=await c.previewRemote();if(proof.status!=='PREVIEW')throw Error(proof.message||'暗号化を解除できません。合言葉と通信状態を確認してください。');}
  assertLive();
  storage.setItem(SYNC_PUBLIC_CONFIG_KEY,JSON.stringify(config));
  storage.setItem(SYNC_AUTO_RESUME_KEY,'enabled');
  coordinator=c;
  const result=registered()?await c.runAuto():{status:'ENROLLMENT_REQUIRED'};
  if(token===epoch&&!destroyed){startTimer();if(!registered())initial.open=true;}
  return result;
 }
 unlock.addEventListener('submit',e=>{e.preventDefault();void guarded(1,begin);});
 login.addEventListener('submit',e=>{e.preventDefault();void guarded(1,begin);});
 actions[4].addEventListener('click',()=>guarded(4,async()=>{
  invalidatePreview();const s=await liveCoordinator().previewRemote();
  if(s.status==='PREVIEW'){remoteExists=true;previewOK=true;previewAction=s.syncAction;showComparison(s);}
  else if(s.status==='REMOTE_EMPTY')remoteExists=false;
  return s;
 }));
 function requireManual(){if(!previewOK||!backupCheck.checked)throw Error('④の差分確認とバックアップ確認が必要です。');}
 function refuseUnsaved(){if(hasPendingEdits())throw Error('未保存入力を保護しています。必要な入力を保存・控えて画面を開き直し、④で再確認してください。');}
 actions[2].addEventListener('click',()=>guarded(2,async()=>{
  requireManual();const r=await liveCoordinator().acceptLocalUpdate();
  if(r.status==='UPLOADED'||r.status==='SYNCED'){clearReviewBarrier();invalidatePreview();}return r;
 }));
 actions[3].addEventListener('click',()=>guarded(3,async()=>{
  requireManual();refuseUnsaved();const r=await liveCoordinator().acceptRemoteUpdate();
  if(r.status==='DOWNLOADED'){clearReviewBarrier();invalidatePreview();}return r;
 }));
 actions[6].addEventListener('click',()=>guarded(6,async()=>{
  const r=await liveCoordinator().initialUpload({backupConfirmed:backupCheck.checked});
  if(r.status==='INITIAL_UPLOADED'){remoteExists=true;clearReviewBarrier();invalidatePreview();initial.open=false;}return r;
 }));
 actions[7].addEventListener('click',()=>guarded(7,async()=>{
  requireManual();refuseUnsaved();const r=await liveCoordinator().initialDownload({backupConfirmed:backupCheck.checked});
  if(r.status==='DOWNLOADED'){clearReviewBarrier();invalidatePreview();initial.open=false;}return r;
 }));
 actions[5].addEventListener('click',()=>guarded(5,async()=>{
  stopAuto();unwatch?.();unwatch=null;password.value='';phrase.value='';
  const provider=providerSession;let preferenceError=false;
  try{storage.setItem(SYNC_AUTO_RESUME_KEY,'stopped');}catch{preferenceError=true;}
  // Keep the provider available if sign-out fails so the user can retry ⑤.
  if(provider?.signOut)await provider.signOut();
  providerSession=null;providerConfig=null;remoteExists=null;authMode='signed-out';
  if(preferenceError)throw Error('ログアウトしましたが、自動再接続停止の設定を保存できません。');
  return {status:'SIGNED_OUT'};
 }));
 backupCheck.addEventListener('change',render);
 const noteEditorEdit=e=>{
  if(e?.target?.closest?.('#privateSyncContainer'))return;
  if(e?.target?.closest?.('#dashboard')){pendingEditorChange=true;invalidatePreview();render();}
 };
 const onVisible=()=>{if(doc?.visibilityState!=='hidden')trigger();};
 const onOffline=()=>{if(coordinator){recordOutcome({status:'PENDING_OFFLINE'});render();}};
 windowRef?.addEventListener?.('online',trigger);windowRef?.addEventListener?.('focus',trigger);windowRef?.addEventListener?.('offline',onOffline);
 doc?.addEventListener?.('visibilitychange',onVisible);doc?.addEventListener?.('input',noteEditorEdit,true);doc?.addEventListener?.('change',noteEditorEdit,true);
 // Only a previously enrolled, opted-in device may bootstrap Auth. This never
 // reads Firestore, writes a snapshot, starts a coordinator or stores a secret.
 async function restoreAuthentication(){
  if(!registered()||safeGet(SYNC_AUTO_RESUME_KEY)==='stopped')return;
  let config;try{config=values();assertMarkerAndConfig(config);}catch{return;}
  working=true;authMode='checking';lastOutcome={status:'AUTH_CHECKING'};render();
  try{
   const provider=await ensureProvider(config);if(destroyed)return;
   const identity=provider.getSessionIdentity?.()??null;
   if(identity){assertIdentity(identity);authMode='signed-in';lastOutcome={status:'AUTH_READY'};}
   else{authMode='signed-out';lastOutcome={status:'AUTH_REQUIRED'};}
   auto.textContent=`ログイン状態の自動確認｜${dateText(now())}\n${cloudResultText(lastOutcome)}\nクラウドデータの読込み・書込み：なし`;
  }catch(e){if(!destroyed){authMode=authMode==='mismatch'?'mismatch':'signed-out';lastOutcome={status:'STOP',message:safeError(e)};}}
  finally{if(!destroyed){working=false;render();}}
 }
 try{values();}catch{initial.open=true;configDetails.open=true;}
 render();const ready=restoreAuthentication();
 return {
  ready,
  noteExternalRestore:()=>{
   if(!reviewBarrier())storage.setItem(SYNC_REVIEW_KEY,JSON.stringify({version:1,reason:'manual-restore',at:now().toISOString()}));
   invalidatePreview();recordOutcome({status:'LOCAL_PENDING_REVIEW'});render();
  },
  onLocalChange:()=>{localGeneration++;invalidatePreview();recordOutcome({status:'PENDING_LOCAL_UPDATE'});render();trigger();},
  getState:()=>({connected:!!coordinator,remoteExists,previewOK,pendingEdits:hasPendingEdits(),reviewPending:reviewBarrier(),markerPresent:!!marker(),authMode,working,status:lastOutcome.status}),
  destroy:()=>{
   destroyed=true;epoch++;stopAuto();unwatch?.();unwatch=null;providerSession=null;password.value='';phrase.value='';
   windowRef?.removeEventListener?.('online',trigger);windowRef?.removeEventListener?.('focus',trigger);windowRef?.removeEventListener?.('offline',onOffline);
   doc?.removeEventListener?.('visibilitychange',onVisible);doc?.removeEventListener?.('input',noteEditorEdit,true);doc?.removeEventListener?.('change',noteEditorEdit,true);root.replaceChildren();
  }
 };
}
