/**
 * Read-only presentation of evidence already available in the sync panel.
 * Never infer a successful save from login status, a saved marker or a download click.
 * Do not include personal amounts, names or state in the return value.
 */
export function familyStorageStatus({localReadable=false,connected=false,registered=false,reviewPending=false,pendingEdits=false,working=false,outcome=null}={}){
  const s=outcome && typeof outcome==='object'?outcome:{};
  const local=localReadable
    ? '保存済みデータを読み込めます（編集中の値の保存完了を意味しません）'
    : '保存済みデータの読込みは未確認';
  let cloud='同期完了は未確認です。下の接続・確認状態を確認してください。';
  if(!connected)cloud='接続・暗号化解除が完了していません。同期完了は未確認です。';
  else if(!registered)cloud='初回の同期元・保存先を確認してください。同期完了は未確認です。';
  else if(working)cloud='同期の処理中です。完了は未確認です。';
  else if(reviewPending||pendingEdits)cloud='入力や復元の確認待ちです。クラウドとの一致は未確認です。';
  else if(s.status==='SYNCED'||(s.status==='PREVIEW'&&s.differs===false))cloud='この起動中に端末とクラウドの一致を確認しました（その後の変更は別途確認）。';
  else if(s.status==='UPLOADED'||s.status==='INITIAL_UPLOADED')cloud='クラウドへの書込み成功を確認しました（その後の変更・他端末の状態は未確認）。';
  else if(s.status==='DOWNLOADED'||s.status==='REMOTE_MASTER_APPLIED')cloud='クラウドからこの端末への読込み成功を確認しました（その後の変更は未確認）。';
  else if(s.status==='CONFLICT'||s.syncAction==='CONFLICT')cloud='端末とクラウドの双方に変更があります。自動反映を保留しています。';
  else if(s.status==='PENDING_OFFLINE')cloud='通信待ちです。クラウド保存完了は未確認です。';
  else if(s.status==='PREVIEW'&&s.differs===true)cloud='端末とクラウドに差分があります。反映は未完了です。';
  return Object.freeze({
    local,
    cloud,
    backup:'一括バックアップのファイルが端末の保存先に存在するかは、この画面から確認できません。'
  });
}
