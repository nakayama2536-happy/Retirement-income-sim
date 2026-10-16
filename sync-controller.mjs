// Encrypted single-owner whole-state coordination. Does not import Firebase.
// All operations are opt-in; current adopted values are never adopted from a new
// cloud source without an explicit initial-pairing decision and safe backup.
import {decideSync,validRemoteRecord,validSyncMarker} from './sync-policy.mjs';
import {encryptSnapshot,decryptSnapshot,snapshotDigest} from './sync-crypto.mjs';
const error=(message)=>({status:'STOP',message});
export function createSyncCoordinator({
 projectId,uid,loadLocal,validateLocal,applyLocal,saveBeforeReplace,readMarker,writeMarker,
 readRemote,casRemote,passphrase,online=()=>true,writeAllowed=()=>true,canAutoImport=()=>false,canAutoUpload=()=>true,onApplied=()=>{}
}){
 if(typeof projectId!=='string'||!projectId||typeof uid!=='string'||!uid)throw Error('Firebase認証が必要です。');
 for(const fn of [loadLocal,validateLocal,applyLocal,saveBeforeReplace,readMarker,writeMarker,readRemote,casRemote])
  if(typeof fn!=='function')throw TypeError('同期用の安全な保存処理が不足しています。');
 if(typeof passphrase!=='string'||passphrase.length<16)throw Error('同期の合言葉が短すぎます。');
 let busy=false,reviewedRemote=null;
 const getMarker=()=>{const m=readMarker();if(m&&(m.uid!==uid||m.projectId!==projectId))throw Error('別の同期先に登録された端末です。自動で切り替えません。');return m;};
 const ensureCurrent=(digest)=>snapshotDigest(loadLocal()).then(x=>{if(x!==digest)throw Error('試算・同期中に端末の保存内容が変わりました。再確認してください。');});
 const marker=(baseRevision,baseRemoteDigest,baseLocalDigest)=>({version:1,projectId,uid,baseRevision,baseRemoteDigest,baseLocalDigest,enabled:true,backupConfirmed:true});
 const guarded=async fn=>{
  if(busy)return error('同期処理が進行中です。');
  busy=true;try{return await fn();}catch(e){return error(e?.message||'同期に失敗しました。元の保存状態を維持します。');}finally{busy=false;}
 };
 function writable(){if(!writeAllowed())throw Error('この画面に保存権限がありません。編集元を閉じて再読み込みしてください。');}
 async function download(remote,local,digest,{requireReview=false}={}){
  if(requireReview&&(!reviewedRemote||reviewedRemote.localDigest!==digest||
      reviewedRemote.revision!==remote?.revision||reviewedRemote.digest!==remote?.digest))
    throw Error('照合後に端末または同期先が変更されました。取込前に再確認してください。');
  if(!validRemoteRecord(remote))throw Error('同期先の形式が不正です。');
  const decoded=await decryptSnapshot(remote.ciphertext,passphrase,remote.digest);
  validateLocal(decoded); // Includes feature compatibility and full-plan calculation.
  await ensureCurrent(digest);
  // A previous full integrated snapshot is kept separately before any replace.
  await saveBeforeReplace(local);
  await ensureCurrent(digest);
  writable();
  const applied=await applyLocal(decoded,local); // Atomic optimistic compare, not a partial import.
  writeMarker(marker(remote.revision,remote.digest,await snapshotDigest(applied??decoded)));
  reviewedRemote=null;
  onApplied(decoded);
  return {status:'DOWNLOADED',revision:remote.revision};
 }
 async function upload(existing,local,digest,action){
  const enc=await encryptSnapshot(local,passphrase);await ensureCurrent(digest);writable();
  const next={formatVersion:1,revision:existing.baseRevision+1,digest:enc.digest,ciphertext:enc.payload};
  const saved=await casRemote({revision:action.expectedRevision,digest:action.expectedDigest},next);
  if(!validRemoteRecord(saved)||saved.revision!==next.revision||saved.digest!==next.digest)
    throw Error('同期先が想定と一致しません。');
  writeMarker(marker(saved.revision,saved.digest,digest));
  return {status:(await snapshotDigest(loadLocal()))===digest?'UPLOADED':'PENDING_LOCAL_UPDATE',revision:saved.revision};
 }
 return {
  async inspect(){return guarded(async()=>({status:'INSPECT',remote:await readRemote(),marker:getMarker()}));},
  async previewRemote(){
   return guarded(async()=>{
    reviewedRemote=null;
    if(!online())return {status:'PENDING_OFFLINE'};
    const remote=await readRemote();
    if(!remote)return {status:'REMOTE_EMPTY'};
    if(!validRemoteRecord(remote))throw Error('クラウドの保存形式が不正です。');
    const candidate=await decryptSnapshot(remote.ciphertext,passphrase,remote.digest);
    validateLocal(candidate);
    const local=loadLocal(),localDigest=await snapshotDigest(local);
    reviewedRemote={revision:remote.revision,digest:remote.digest,localDigest};
    const summary=s=>({hasConfig:!!s?.config,scenarioCount:Array.isArray(s?.scenarios)?s.scenarios.length:0,
     startDate:s?.config?.plan?.startDate??null,openingAsset:s?.config?.plan?.initialAsset??null});
    return {status:'PREVIEW',remoteRevision:remote.revision,
     differs:(await snapshotDigest(candidate))!==localDigest,
     device:summary(local),cloud:summary(candidate)};
   });
  },
  async initialUpload({backupConfirmed=false}={}){
   return guarded(async()=>{
    writable();if(!backupConfirmed)throw Error('初回同期前の一括バックアップ確認が必要です。');
    if(getMarker())throw Error('初回登録済みです。別の初期設定へ自動で切り替えません。');
    if(!online())return {status:'PENDING_OFFLINE'};
    const remote=await readRemote();if(remote)throw Error('クラウドには既存データがあります。端末の内容で上書きしません。');
    const state=loadLocal();validateLocal(state);const digest=await snapshotDigest(state);
    const enc=await encryptSnapshot(state,passphrase);
    await ensureCurrent(digest);
    writable();
    const saved=await casRemote({revision:0,digest:null},{formatVersion:1,revision:1,digest:enc.digest,ciphertext:enc.payload});
    if(!validRemoteRecord(saved)||saved.revision!==1||saved.digest!==enc.digest)throw Error('同期先の書込み結果が不正です。');
    writeMarker(marker(1,saved.digest,digest));
    return {status:'INITIAL_UPLOADED',revision:1};
   });
  },
  async initialDownload({backupConfirmed=false}={}){
   return guarded(async()=>{
    writable();if(!backupConfirmed)throw Error('初回同期前の端末ごとの一括バックアップ確認が必要です。');
    if(getMarker())throw Error('初回登録済みです。別の同期先へ自動で切り替えません。');
    if(!online())return {status:'PENDING_OFFLINE'};
    const remote=await readRemote();if(!remote)throw Error('クラウドには同期元データがありません。');
    const local=loadLocal(),digest=await snapshotDigest(local);
    return download(remote,local,digest,{requireReview:true});
   });
  },
  async acceptRemoteUpdate(){
   return guarded(async()=>{
    writable();if(!online())return {status:'PENDING_OFFLINE'};
    const m=getMarker();if(!validSyncMarker(m))throw Error('同期登録を確認してください。');
    const local=loadLocal();validateLocal(local);const digest=await snapshotDigest(local);
    const remote=await readRemote();
    const decision=decideSync({marker:m,localDigest:digest,remote,online:true});
    if(decision.action==='UNCHANGED')return {status:'SYNCED',revision:m.baseRevision};
    if(decision.action!=='DOWNLOAD_VALIDATED')return {status:decision.action==='CONFLICT'?'CONFLICT':'STOP',message:'クラウドと端末の状態が変わりました。差分を再確認してください。'};
    return download(remote,local,digest,{requireReview:true});
   });
  },
  async acceptLocalUpdate(){
   return guarded(async()=>{
    writable();if(!online())return {status:'PENDING_OFFLINE'};
    const m=getMarker();if(!validSyncMarker(m))throw Error('同期登録を確認してください。');
    const local=loadLocal();validateLocal(local);const digest=await snapshotDigest(local);
    const remote=await readRemote();
    const action=decideSync({marker:m,localDigest:digest,remote,online:true});
    if(action.action==='UNCHANGED')return {status:'SYNCED',revision:m.baseRevision};
    if(action.action!=='UPLOAD_CAS')return {status:action.action==='CONFLICT'?'CONFLICT':'STOP',
     message:'クラウドと端末の変更が一致しません。自動上書きは行いません。'};
    if(!reviewedRemote||reviewedRemote.revision!==remote?.revision||
       reviewedRemote.digest!==remote?.digest||reviewedRemote.localDigest!==digest)
      throw Error('端末とクラウドの照合後に変更がありました。送信前に再確認してください。');
    const out=await upload(m,local,digest,action);
    reviewedRemote=null;
    return out;
   });
  },
  async runAuto(){
   return guarded(async()=>{
    writable();const existing=getMarker();
    if(!existing)return {status:'ENROLLMENT_REQUIRED'};
    if(!validSyncMarker(existing))throw Error('同期登録が不正です。');
    if(!online())return {status:'PENDING_OFFLINE'};
    const local=loadLocal();validateLocal(local);const digest=await snapshotDigest(local);
    const remote=await readRemote();
    const action=decideSync({marker:existing,localDigest:digest,remote,online:true});
    if(action.action==='STOP'||action.action==='CONFLICT')return {status:action.action,message:action.reason||'両端末で別の変更がありました。確認まで同期を停止します。'};
    if(action.action==='UNCHANGED')return {status:'SYNCED',revision:existing.baseRevision};
    if(action.action==='DOWNLOAD_VALIDATED'){
    if(!canAutoImport())return {status:'REMOTE_PENDING_REVIEW',remoteRevision:remote.revision,
     message:'端末に未保存の入力がある可能性があります。クラウドの新しい内容を確認してから取り込んでください。'};
    return download(remote,local,digest);
   }
    if(action.action!=='UPLOAD_CAS')return {status:action.action};
    if(!canAutoUpload())return {status:'LOCAL_PENDING_REVIEW',message:'復元や別経路の保存を検出しました。クラウドへの送信を確認するまで停止します。'};
    return upload(existing,local,digest,action);
   });
  },
  getIdentity(){return {projectId,uid};}
 };
}
