// Precise cleanup of the *synthetic* Cloud Firestore trial document.
import {createSandboxStore} from '../firebase-emulator/encrypted-sandbox-check.mjs';
import {decryptSnapshot} from '../../sync-crypto.mjs';
const PROJECT='lifeplan-sync-sandbox';
const SIGNATURE='LIFEPLAN-APP-SANDBOX-SYNTHETIC-ONLY';
const SOURCE_RUN='lifeplan-app-sandbox-source-run-v1';
const SECRETLESS_ERROR='検証専用の後片付けを停止しました。試験文書の状態を確認してください。繰り返し削除しないでください。';
const uuid=value=>typeof value==='string'&&/^[0-9a-f-]{36}$/i.test(value);
export async function cleanupSandboxTrial({email,password,phrase,confirmed,runId}){
 if(!confirmed||!uuid(runId)||typeof email!=='string'||!email.includes('@')||
   !password||typeof phrase!=='string'||phrase.length<16)throw Error('試験専用の入力と確認が必要です。');
 const url=new URL(location.href);
 if(url.protocol!=='https:'||url.pathname!=='/setup.html'||url.search||url.hash||
  !/^lifeplan-sync-sandbox--app-sync-check-[a-z0-9-]+\.web\.app$/.test(url.hostname))throw Error('検証専用URLではありません。');
 if(localStorage.getItem(SOURCE_RUN)!==runId)throw Error('PCに記録された試験IDと一致しません。');
 if(!navigator.locks?.request)throw Error('安全な同時操作制御を利用できません。');
 let successful=false;
 return navigator.locks.request('lifeplan-sandbox-app-cleanup',{ifAvailable:true},async lock=>{
  if(!lock)throw Error('別の検証操作が進行しています。');
  const response=await fetch('/__/firebase/init.json',{credentials:'omit',cache:'no-store',redirect:'error'});
  if(!response.ok||response.redirected)throw Error('Firebase公開設定が読み取れません。');
  const cfg=await response.json();
  if(cfg.projectId!==PROJECT||cfg.authDomain!==PROJECT+'.firebaseapp.com')throw Error('検証専用Firebase以外を拒否しました。');
  const root='https://www.gstatic.com/firebasejs/12.19.0/';
  const [appApi,authApi,dbApi]=await Promise.all([
   import(root+'firebase-app.js'),import(root+'firebase-auth.js'),import(root+'firebase-firestore.js')
  ]);
  const app=appApi.initializeApp(cfg,'app-cleanup-'+crypto.randomUUID());
  let auth=null,db=null,ended=true;
  try{
   auth=authApi.initializeAuth(app,{persistence:authApi.inMemoryPersistence});
   const login=await authApi.signInWithEmailAndPassword(auth,email,password);
   const claims=(await authApi.getIdTokenResult(login.user)).claims;
   if(!login.user?.uid||claims.aud!==PROJECT||claims.sub!==login.user.uid||
    claims.iss!=='https://securetoken.google.com/'+PROJECT)throw Error('検証専用認証が一致しません。');
   db=dbApi.getFirestore(app);
   const store=createSandboxStore({sdk:dbApi,database:db,projectId:PROJECT,uid:login.user.uid});
   const latest=await store.read();
   if(!latest)throw Error('試験文書が存在しません。削除は行いません。');
   const data=await decryptSnapshot(latest.ciphertext,phrase,latest.digest);
   if(!data||data.syntheticEvidence?.tag!==SIGNATURE||data.syntheticEvidence?.origin!=='pc'||
    data.syntheticEvidence?.runId!==runId||data.config?.meta?.label!=='架空検証専用'||
    !Array.isArray(data.scenarios)||!data.scenarios.length||
    data.scenarios.some(x=>!String(x?.id??'').startsWith('synthetic-')))throw Error('今回の架空データであることを確認できません。');
   const removed=await store.removeOwnedAttempt([latest]);
   if(removed!=='deleted'||await store.read()!==null)throw Error('削除・不存在を確認できません。');
   localStorage.removeItem(SOURCE_RUN);
   successful=true;
  }catch{
   throw Error(SECRETLESS_ERROR);
  }finally{
   try{if(auth)await authApi.signOut(auth);}catch{ended=false;}
   try{if(db)await dbApi.terminate(db);}catch{ended=false;}
   try{await appApi.deleteApp(app);}catch{ended=false;}
   if(!ended)successful=false;
  }
  return successful?'架空データのみ：試験文書の削除・不存在確認済み。認証終了済み。普段のデータは未使用です。':SECRETLESS_ERROR;
 });
}
