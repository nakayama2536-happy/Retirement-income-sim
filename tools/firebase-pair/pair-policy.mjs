// Diagnostic-only, no app personal state, no backup file import or production Firebase.
export const PAIR_PROJECT='lifeplan-sync-sandbox';
export const PAIR_CHANNEL='pair-check';
export const PAIR_MARKER='lifeplan-pair-check-pending-v1';
export const PAIR_LOCK='lifeplan-pair-check-operation-v1';
export const PAIR_KIND='fictional-cross-device-pair-v1';
const fail=code=>{throw Object.assign(new Error(code),{code});};
const uuid=v=>typeof v==='string'&&/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(v);
export function assertPairLocation(value){
 const url=new URL(value.href);
 if(url.protocol!=='https:'||url.port||url.username||url.password||url.search||url.hash||
   !/^lifeplan-sync-sandbox--pair-check-[a-z0-9-]+\.web\.app$/.test(url.hostname)||
   url.pathname!=='/')fail('wrong-origin');
 return true;
}
export function assertNoApplicationAccess(names){
 if(names.some(name=>typeof name!=='string'||/lifeplan-sim-state|lifeplan-private-sync|retirement-sim|user_config|personal/i.test(name)))
  fail('forbidden-app-state-access');
}
export function sourceFixture(runId){
 if(!uuid(runId))fail('invalid-run-id');
 return {kind:PAIR_KIND,phase:'from-PC',runId,
  plan:{initialAsset:1234,startDate:'2044-01-01',units:'fictional-man-yen'},
  scenarios:[{id:'fictional-base',asset:1234},{id:'fictional-change',asset:1250}],
  unknownFields:{keep:[0,null,'日本語']}};
}
export function validSource(value){
 if(!value||typeof value!=='object'||!uuid(value.runId))return false;
 return JSON.stringify(value)===JSON.stringify(sourceFixture(value.runId));
}
export function ackFixture(source){
 if(!validSource(source))fail('unknown-fictional-record');
 return {...structuredClone(source),phase:'from-iPhone',acknowledged:true};
}
export function validAck(value,runId){
 if(!uuid(runId)||!value||value.runId!==runId)return false;
 return JSON.stringify(value)===JSON.stringify(ackFixture(sourceFixture(runId)));
}
export function checkedMarker(value){
 if(!value||value.version!==1||!uuid(value.runId)||value.kind!==PAIR_KIND||Object.keys(value).sort().join(',')!=='kind,runId,version')
  fail('invalid-marker');
 return Object.freeze({version:1,kind:PAIR_KIND,runId:value.runId});
}
export function markPending(runId){
 if(!uuid(runId))fail('invalid-run-id');
 return {version:1,kind:PAIR_KIND,runId};
}
export function ciphertextRecord(uid,revision,encrypted){
 if(typeof uid!=='string'||!uid||uid.includes('/')||!Number.isInteger(revision)||revision<1||
   typeof encrypted?.digest!=='string'||!/^[0-9a-f]{64}$/.test(encrypted.digest)||
   !encrypted?.payload||encrypted.payload.algorithm!=='AES-256-GCM/PBKDF2-SHA256')fail('invalid-record');
 return {ownerUid:uid,formatVersion:1,revision,digest:encrypted.digest,ciphertext:encrypted.payload};
}
export function safePairMessage(error){
 const key=error?.code;
 const messages={
  'wrong-origin':'専用HTTPSプレビューURLを直接入力してください。接続・書込みはしていません。',
  'unsupported':'安全なブラウザ機能を確認できません。接続・書込みはしていません。',
  'config-invalid':'検証用Firebaseの公開設定が不正です。書込みしていません。',
  'wrong-project':'Firebase検証用のプロジェクトと一致しません。停止しました。',
  'permission-denied':'検証用Firestoreルールに拒否されました。再実行せず状態を確認してください。',
  'trial-exists':'試験文書がすでにあります。上書きや削除はしていません。原因を確認してください。',
  'run-incomplete':'作成済みの試験が未完了です。新規作成を停止しました。',
  'invalid-marker':'前回の試験記録を確認できません。新規作成や削除を停止しました。',
  'not-acknowledged':'iPhone側の受信確認が未完了です。PCから削除していません。',
  'not-original':'今回作成した文書と一致しません。削除していません。',
  'wrong-passphrase':'試験用合言葉または暗号文が一致しません。削除していません。',
  'locked':'別の検証操作が実行中です。書込みはしていません。',
  'confirmation-required':'架空データ専用であることを確認してください。',
  'auth/invalid-credential':'検証用ログイン情報が一致しません。書込みはしていません。',
  'auth/too-many-requests':'認証制限を確認しました。繰り返し試行しないでください。',
  'auth/network-request-failed':'認証通信が失敗しました。再実行前に状態を確認してください。',
  'stale-sandbox-record':'他の検証操作が試験文書を変更しました。上書き・削除はしていません。',
  'cleanup-record-changed':'試験文書が変更されたため削除を停止しました。',
  'unavailable':'接続状態が未確認です。再実行せず状態を確認してください。'
 };
 return messages[key]||'処理を停止しました。試験文書が残っている可能性があります。再実行せず状態を確認してください。';
}
