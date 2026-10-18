// Hosted diagnostic only. No registration of service workers; no user app state access.
import {createSandboxStore,runEncryptedSandboxCheck} from '../firebase-emulator/encrypted-sandbox-check.mjs';
import {PROJECT,MARKER,LOCK,SDK_ROOT,assertMobileLocation,loadHostingConfig,assertIdentity,safeMessage,summary,failure} from './mobile-policy.mjs';
const element=id=>document.getElementById(id);
const setup=element('setupStatus'),status=element('status'),fields=element('fields'),prepare=element('prepare');
let config=null,attempted=false,busy=false,result=null;
function environment(){
 assertMobileLocation(location);
 if(window.top!==window.self||!window.isSecureContext||!crypto?.subtle||!navigator.locks?.request||
    navigator.serviceWorker?.controller)failure('unsupported');
 // This key is an incomplete-test marker only; never read financial app keys.
 if(localStorage.getItem(MARKER))failure('unfinished');
}
function showReport(sessionClosed){element('report').value=summary(result,sessionClosed);element('copy').disabled=false;}
try{environment();prepare.disabled=false;setup.textContent='未接続。ボタンで検証用の接続先を確認してください。';}
catch(error){setup.textContent=safeMessage(error);}
prepare.addEventListener('click',async()=>{
 prepare.disabled=true;setup.textContent='検証用の接続先を確認しています。認証・書込みはまだ行いません。';
 const abort=new AbortController(),timeout=setTimeout(()=>abort.abort(),10000);
 try{environment();config=await loadHostingConfig(fetch,{signal:abort.signal});fields.disabled=false;
  setup.textContent='接続先の設定を確認しました：'+PROJECT+'。検証用アカウントを入力してください。';}
 catch(error){config=null;fields.disabled=true;setup.textContent=safeMessage(error);}
 finally{clearTimeout(timeout);}
});
element('form').addEventListener('submit',async event=>{
 event.preventDefault();if(attempted||busy)return;
 fields.disabled=true;let email=element('email').value,password=element('password').value;
 // Remove credentials from the visible document before any async work.
 element('email').value='';element('password').value='';
 try{
  environment();if(!config||!element('confirm').checked||!email||!password)failure('confirmation-required');
  await navigator.locks.request(LOCK,{ifAvailable:true},async lock=>{
   if(!lock)failure('locked');environment();attempted=true;busy=true;
   const apps=[],auths=[],databases=[];let core,authSdk,dbSdk,sessionClosed=true;
   const beforeUnload=event=>{event.preventDefault();event.returnValue='';};
   window.addEventListener('beforeunload',beforeUnload);
   status.textContent='検証を実行中です。完了するまで画面を開いたままにしてください。';
   try{
    [core,authSdk,dbSdk]=await Promise.all([import(SDK_ROOT+'firebase-app.js'),import(SDK_ROOT+'firebase-auth.js'),import(SDK_ROOT+'firebase-firestore.js')]);
    async function connect(authenticated){
     const app=core.initializeApp(config,'mobile-sandbox-'+crypto.randomUUID());apps.push(app);
     const auth=authSdk.initializeAuth(app,{persistence:authSdk.inMemoryPersistence});auths.push(auth);
     let uid=null;
     if(authenticated){
      const login=await authSdk.signInWithEmailAndPassword(auth,email,password);
      const token=await authSdk.getIdTokenResult(login.user);
      uid=assertIdentity(login.user,token.claims);
     }
     const database=dbSdk.getFirestore(app);databases.push(database);return {database,uid};
    }
    const first=await connect(true),second=await connect(true),guest=await connect(false);
    email=null;password=null;if(first.uid!==second.uid)failure('wrong-identity');
    const store=client=>createSandboxStore({sdk:dbSdk,database:client.database,projectId:PROJECT,uid:first.uid});
    localStorage.setItem(MARKER,'1'); // Must succeed BEFORE the runner can attempt a write.
    result=await runEncryptedSandboxCheck({writer:store(first),reader:store(second),
     unauthenticatedRead:()=>dbSdk.getDocFromServer(dbSdk.doc(guest.database,'sandbox',first.uid,'snapshots','trial')),
     onProgress:(n,label)=>{const li=document.createElement('li');li.textContent=label+'：成功';element('steps').appendChild(li);status.textContent=`${n}/12 確認済み。終了処理まで画面を閉じないでください。`;}
    });
    if(result.cleanup==='confirmed'||result.cleanup==='not-needed')localStorage.removeItem(MARKER);
   }catch(error){status.textContent=safeMessage(error);}
   finally{
    email=null;password=null;
    for(const auth of auths)try{await authSdk.signOut(auth);}catch{sessionClosed=false;}
    for(const database of databases)try{await dbSdk.terminate(database);}catch{sessionClosed=false;}
    for(const app of apps)try{await core.deleteApp(app);}catch{sessionClosed=false;}
    busy=false;window.removeEventListener('beforeunload',beforeUnload);
    if(result?.ok)status.textContent=sessionClosed?'12/12 成功。試験文書の削除・不存在と接続終了を確認しました。':'データの検証は12/12成功ですが、接続終了は未確認です。再実行しないでください。';
    else if(result)status.textContent='診断は停止しました。後片付け：'+(result.cleanup==='confirmed'?'削除・不存在確認済み':result.cleanup==='not-needed'?'この試験からの書込み試行なし':'未確認。再実行しないでください。');
    showReport(sessionClosed);
   }
  });
 }catch(error){status.textContent=safeMessage(error);showReport(true);}
 finally{email=null;password=null;fields.disabled=true;}
});
document.addEventListener('visibilitychange',()=>{
 if(busy)status.textContent='診断の終了待ちです。Safariを前面に戻し、完了表示を待ってください。再実行しないでください。';
});
element('copy').addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText(element('report').value);element('copyStatus').textContent='結果だけをコピーしました。';}
 catch{element('report').focus();element('report').select();element('copyStatus').textContent='結果欄を選択しました。端末のコピー操作を使ってください。';}
});
