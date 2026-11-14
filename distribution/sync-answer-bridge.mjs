/** Only actual sync coordinator outcomes may produce a completion answer. */
export function syncAnswerFromResult(result,message){
 const status=String(result?.status||'');
 const kind=['UPLOADED','DOWNLOADED','REMOTE_MASTER_APPLIED','INITIAL_UPLOADED','SIGNED_OUT'].includes(status)?'success':
  ['PREVIEW','SYNCED','UNCHANGED','BACKUP_STARTED'].includes(status)?'info':status==='STOP'?'error':'warning';
 const next=status==='UPLOADED'||status==='INITIAL_UPLOADED'?'スマホでクラウドの内容を確認してください。':
  status==='DOWNLOADED'||status==='REMOTE_MASTER_APPLIED'?'読込後の計画内容を確認してください。':
  status==='PREVIEW'?'差分を確認し、必要な場合だけ保存または読込を選んでください。':'';
 return {kind,confirmed:kind==='success',body:String(message||'結果を確認できません。'),next};
}
