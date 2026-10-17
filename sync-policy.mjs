// Pure single-user snapshot sync decisions. No application settings or I/O.
const fail=(reason)=>({action:'STOP',reason});
const validDigest=s=>typeof s==='string'&&/^[0-9a-f]{64}$/.test(s);
export function validSyncMarker(x){
 return !!x&&x.version===1&&typeof x.projectId==='string'&&!!x.projectId&&
 typeof x.uid==='string'&&!!x.uid&&Number.isSafeInteger(x.baseRevision)&&x.baseRevision>=1&&
 validDigest(x.baseRemoteDigest)&&validDigest(x.baseLocalDigest)&&x.enabled===true&&x.backupConfirmed===true;
}
export function validRemoteRecord(x){
 return !!x&&x.formatVersion===1&&Number.isSafeInteger(x.revision)&&x.revision>=1&&
 validDigest(x.digest)&&typeof x.ciphertext==='object'&&x.ciphertext!==null&&
 x.ciphertext.version===1&&typeof x.ciphertext.data==='string'&&
 typeof x.ciphertext.iv==='string'&&typeof x.ciphertext.salt==='string';
}
export function decideSync({marker,localDigest,remote,online=true,unlocked=true}){
 if(!marker)return fail('初回登録前です。同期先と採用元を明示選択してください。');
 if(!validSyncMarker(marker))return fail('保存済み同期基準が不正です。');
 if(!unlocked)return {action:'LOCKED'};
 if(!online)return {action:'PENDING_OFFLINE'};
 if(!validDigest(localDigest))return fail('端末の保存内容の検証に失敗しました。');
 if(!remote||!validRemoteRecord(remote))return fail('同期先が削除・破損・未対応です。自動で再生成しません。');
 if(remote.revision<marker.baseRevision)return fail('同期先の世代が巻き戻っています。');
 const sameRemote=remote.revision===marker.baseRevision&&remote.digest===marker.baseRemoteDigest;
 const localChanged=marker.baseLocalDigest!==localDigest;
 if(remote.revision===marker.baseRevision&&!sameRemote)return {action:'CONFLICT'};
 if(sameRemote)return localChanged?{action:'UPLOAD_CAS',expectedRevision:marker.baseRevision,expectedDigest:marker.baseRemoteDigest}:{action:'UNCHANGED'};
 return localChanged?{action:'CONFLICT'}:{action:'DOWNLOAD_VALIDATED',remoteRevision:remote.revision};
}
export class FakeCipherCloud {
 constructor(){this.latest=null;this.writes=0;this.offline=false;}
 async read(){if(this.offline)throw Error('offline');return structuredClone(this.latest);}
 async compareAndSwap(expected,record){
  if(this.offline)throw Error('offline');
  const current=this.latest,revision=current?.revision??0;
  if(revision!==expected.revision||(current?.digest??null)!==(expected.digest??null))throw Error('sync-conflict');
  if(!validRemoteRecord(record)||record.revision!==revision+1)throw Error('invalid cloud candidate');
  this.latest=structuredClone(record);this.writes++;return structuredClone(record);
 }
}
