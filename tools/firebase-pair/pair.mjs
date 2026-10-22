// Two-device *fictional-data-only* live Firebase diagnostic. Never access app states.
import {PROJECT,SDK_ROOT,loadHostingConfig,assertIdentity} from '../firebase-mobile/mobile-policy.mjs';
import {createSandboxStore,sameTestRecord} from '../firebase-emulator/encrypted-sandbox-check.mjs';
import {encryptSnapshot,decryptSnapshot} from '../../sync-crypto.mjs';
import {PAIR_PROJECT,PAIR_MARKER,PAIR_LOCK,assertPairLocation,markPending,checkedMarker,sourceFixture,validSource,ackFixture,validAck,ciphertextRecord,safePairMessage} from './pair-policy.mjs';
const byId=id=>document.getElementById(id);
const status=byId('status'),report=byId('result'),buttons=['send','receive','finish','cancel'].map(byId);
const form=byId('credentials');
let busy=false;
const stop=code=>{throw Object.assign(new Error(code),{code});};
function environment(){
 assertPairLocation(location);
 if(window.top!==window.self||!window.isSecureContext||!crypto?.subtle||!navigator.locks?.request||
   navigator.serviceWorker?.controller)stop('unsupported');
}
function readMarker(){
 const raw=localStorage.getItem(PAIR_MARKER);
 if(raw===null)return null;
 try{return checkedMarker(JSON.parse(raw));}catch{stop('invalid-marker');}
}
function updateControls(){
 let marker=null,safe=true;
 try{environment();marker=readMarker();}catch(e){safe=false;status.textContent=safePairMessage(e);}
 buttons.forEach(b=>b.disabled=busy||!safe);
 byId('send').disabled=busy||!safe||marker!==null;
 byId('finish').disabled=busy||!safe||marker===null;
 byId('cancel').disabled=busy||!safe||marker===null;
 byId('receive').disabled=busy||!safe||marker!==null;
 if(safe&&!busy)status.textContent=marker?'PCの未完了試験記録があります。受信結果を確認し、対象を限定して削除してください。':'未実行。安全な検証用URLです。データの送信は開始していません。';
}
function renderResult(action,result,connectionClosed){
 const done=result?.outcome==='completed';
 const statusText=done?'成功':'停止';
 const lines=[
  'ライフプラン：架空データ2端末受渡し診断',
  '範囲：検証用Firebase lifeplan-sync-sandbox の指定試験文書のみ',
  '操作：'+({send:'PC送信',receive:'iPhone受信・応答',finish:'PC確認・削除',cancel:'未応答試験の限定取消'}[action]||'未確認'),
  '結果：'+statusText,
  '段階：'+(result?.stage??'未確認'),
  '試験文書の後片付け：'+(result?.cleanup??'未確認'),
  '認証・接続の終了：'+(connectionClosed?'確認済み':'未確認'),
  '入力：生成した架空データのみ',
  'PC・iPhoneのアプリ保存データ：未使用・未同期',
  '本人用Firebase：未使用'
 ];
 report.value=lines.join('\n');byId('copy').disabled=false;
}
async function connect(){
 const cfg=await loadHostingConfig(fetch);
 if(cfg.projectId!==PAIR_PROJECT||PROJECT!==PAIR_PROJECT)stop('wrong-project');
 const appApi=await import(SDK_ROOT+'firebase-app.js');
 const authApi=await import(SDK_ROOT+'firebase-auth.js');
 const dbApi=await import(SDK_ROOT+'firebase-firestore.js');
 const apps=[],auths=[],databases=[];
 return {
  async login(email,password){
   const app=appApi.initializeApp(cfg,'pair-'+crypto.randomUUID());apps.push(app);
   const auth=authApi.initializeAuth(app,{persistence:authApi.inMemoryPersistence});auths.push(auth);
   const res=await authApi.signInWithEmailAndPassword(auth,email,password);
   const token=await authApi.getIdTokenResult(res.user);
   const uid=assertIdentity(res.user,token.claims);
   const db=dbApi.getFirestore(app);databases.push(db);
   return {store:createSandboxStore({sdk:dbApi,database:db,projectId:PAIR_PROJECT,uid}),uid};
  },
  async close(){
   let ok=true;
   for(const a of auths)try{await authApi.signOut(a);}catch{ok=false;}
   for(const d of databases)try{await dbApi.terminate(d);}catch{ok=false;}
   for(const a of apps)try{await appApi.deleteApp(a);}catch{ok=false;}
   return ok;
  }
 };
}
async function execute(action,credentials){
 if(!credentials.confirm||credentials.phrase.length<16||!credentials.email||!credentials.password)stop('confirmation-required');
 const client=await connect();let closed=false,output={outcome:'stopped',stage:'実行前',cleanup:'書込み試行なし'};
 try{
  const {store,uid}=await client.login(credentials.email,credentials.password);
  if(action==='send'){
   if(readMarker())stop('run-incomplete');
   const existing=await store.read();
   if(existing!==null)stop('trial-exists');
   const runId=crypto.randomUUID(),payload=sourceFixture(runId);
   const encrypted=await encryptSnapshot(payload,credentials.phrase);
   const first=ciphertextRecord(uid,1,encrypted);
   // Persist non-secret recovery marker *before* any possible write attempt.
   localStorage.setItem(PAIR_MARKER,JSON.stringify(markPending(runId)));
   output.cleanup='未完了の可能性あり';
   await store.compareAndSwap(null,first);
   const observed=await store.read();
   if(!sameTestRecord(observed,first))stop('not-original');
   output={outcome:'completed',stage:'PCから架空暗号文の初回保存・読戻し確認済み',cleanup:'iPhone受信後にPCで削除'};
  }else if(action==='receive'){
   if(readMarker())stop('run-incomplete');
   const first=await store.read();
   if(first?.revision!==1||first.ownerUid!==uid)stop('not-original');
   let original;
   try{original=await decryptSnapshot(first.ciphertext,credentials.phrase,first.digest);}catch{stop('wrong-passphrase');}
   if(!validSource(original))stop('not-original');
   const ack=ackFixture(original);
   const encrypted=await encryptSnapshot(ack,credentials.phrase);
   await store.compareAndSwap(first,ciphertextRecord(uid,2,encrypted));
   const latest=await store.read();
   if(latest?.revision!==2||latest.ownerUid!==uid)stop('stale-sandbox-record');
   let decoded;
   try{decoded=await decryptSnapshot(latest.ciphertext,credentials.phrase,latest.digest);}catch{stop('wrong-passphrase');}
   if(!validAck(decoded,original.runId))stop('not-original');
   output={outcome:'completed',stage:'別端末で復号一致・確認応答をクラウドへ記録済み',cleanup:'PCでの削除待ち'};
  }else if(action==='finish'||action==='cancel'){
   const marker=readMarker();
   if(!marker)stop('invalid-marker');
   const current=await store.read();
   if(current?.ownerUid!==uid||current.revision!==(action==='finish'?2:1))stop(action==='finish'?'not-acknowledged':'not-original');
   let decoded;
   try{decoded=await decryptSnapshot(current.ciphertext,credentials.phrase,current.digest);}catch{stop('wrong-passphrase');}
   const matches=action==='finish'?validAck(decoded,marker.runId):validSource(decoded)&&decoded.runId===marker.runId;
   if(!matches)stop('not-original');
   output.cleanup='削除結果未確認';
   const erased=await store.removeOwnedAttempt([current]);
   const verified=erased==='deleted'&&await store.read()===null;
   if(!verified)stop('cleanup-record-changed');
   localStorage.removeItem(PAIR_MARKER);
   output={outcome:'completed',stage:action==='finish'?'PCでiPhone応答の復号一致確認済み':'PCの未応答試験だけを取消済み',cleanup:'試験文書の削除・不存在確認済み'};
  }else stop('confirmation-required');
 }catch(e){
  output.outcome='stopped';
  output.stage=safePairMessage(e);
  // The marker intentionally persists across ambiguous writes or cleanup.
  if(readMarker())output.cleanup='PCでの未完了試験記録あり。再送信禁止';
  status.textContent=output.stage;
 }finally{closed=await client.close();renderResult(action,output,closed);}
 status.textContent=output.outcome==='completed'?
  (closed?'完了：'+output.stage+'。'+output.cleanup:'データ処理の確認後、認証終了を確認できませんでした。再試行せず状態を確認してください。'):
  output.stage;
}
async function run(action){
 if(busy)return;
 busy=true;buttons.forEach(b=>b.disabled=true);report.value='';byId('copy').disabled=true;
 const credentials={
  email:byId('email').value.trim(),password:byId('password').value,phrase:byId('phrase').value,
  confirm:byId('consent').checked
 };
 // Remove credentials from DOM before any asynchronous operations.
 form.reset();
 try{
  environment();
  await navigator.locks.request(PAIR_LOCK,{ifAvailable:true},async lock=>{
   if(!lock)stop('locked');
   environment();
   await execute(action,credentials);
  });
 }catch(e){
  status.textContent=safePairMessage(e);
  if(!report.value)renderResult(action,{outcome:'stopped',stage:safePairMessage(e),cleanup:'状態未確認'},false);
 }finally{
  credentials.password=null;credentials.phrase=null;credentials.email=null;
  busy=false;updateControls();
  // Preserve the final result status rather than the initial availability note.
  const value=report.value;
  if(value){const parts=value.split('\n');status.textContent=parts.filter(x=>x.startsWith('結果：')||x.startsWith('段階：')||x.startsWith('試験文書の後片付け：')).join(' ／ ');}
 }
}
buttons.forEach(b=>b.addEventListener('click',()=>run(b.id)));
byId('copy').addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText(report.value);byId('copyNote').textContent='検証結果だけをコピーしました。';}
 catch{report.focus();report.select();byId('copyNote').textContent='結果欄を選択しました。端末のコピー操作を使ってください。';}
});
updateControls();
