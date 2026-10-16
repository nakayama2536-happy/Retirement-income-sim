// Lazy-loading Firebase browser SDK adapter. Invoked only after explicit UI setup.
// Firebase public project identifiers are entered locally; never embed user UIDs,
// credentials, cloud documents or personal JSON in the public repository.
import {validRemoteRecord} from './sync-policy.mjs';
const SDK_ROOT='https://www.gstatic.com/firebasejs/12.19.0/';
const KEY_FIELDS=['apiKey','authDomain','projectId','appId'];
export function validateFirebaseConfig(value){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Firebase設定が必要です。');
 const config=Object.fromEntries(KEY_FIELDS.map(k=>[k,value[k]]));
 if(KEY_FIELDS.some(k=>typeof config[k]!=='string'||!config[k].trim()||config[k].length>500))throw Error('Firebaseの公開設定に不足があります。');
 if(!/^[a-z0-9-]{5,90}$/i.test(config.projectId)||!/^[a-z0-9.-]+$/i.test(config.authDomain))throw Error('Firebaseプロジェクト設定の形式が不正です。');
 return config;
}
export async function createFirebaseStore(config,{moduleLoader=url=>import(url)}={}){
 const publicConfig=validateFirebaseConfig(config);
 const [core,authApi,dbApi]=await Promise.all([
  moduleLoader(SDK_ROOT+'firebase-app.js'),moduleLoader(SDK_ROOT+'firebase-auth.js'),
  moduleLoader(SDK_ROOT+'firebase-firestore.js')
 ]);
 const existing=core.getApps().find(a=>a.name==='lifeplan-single-user-sync');
 if(existing&&existing.options.projectId!==publicConfig.projectId)throw Error('異なるFirebase同期先が読み込まれています。再起動して確認してください。');
 const app=existing||core.initializeApp(publicConfig,'lifeplan-single-user-sync');
 const auth=authApi.getAuth(app);
 await authApi.setPersistence(auth,authApi.browserLocalPersistence);
 if(typeof auth.authStateReady==='function')await auth.authStateReady();
 const db=dbApi.getFirestore(app);
 const user=()=>{const person=auth.currentUser;if(!person?.uid)throw Error('Firebaseへの本人ログインが必要です。');return person;};
 const document=()=>dbApi.doc(db,'owners',user().uid,'snapshots','current');
 function verifyRemote(value){
  if(!value)return null;
  if(value.ownerUid!==user().uid||!validRemoteRecord(value))throw Error('同期先が本人の形式と一致しません。');
  return {formatVersion:value.formatVersion,revision:value.revision,digest:value.digest,ciphertext:value.ciphertext};
 }
 return {
  async signIn(email,password){
   // Firebase Auth already owns its persisted token. No need to keep a second
   // copy of passwords when a session survives an app restart.
   if(auth.currentUser?.uid&&(!password||password===''))return {uid:auth.currentUser.uid,projectId:publicConfig.projectId};
   if(typeof email!=='string'||!email.includes('@')||typeof password!=='string'||!password)throw Error('Firebaseログイン情報を確認してください。');
   const signed=await authApi.signInWithEmailAndPassword(auth,email,password);
   if(!signed.user?.uid)throw Error('本人アカウントを確認できません。');
   return {uid:signed.user.uid,projectId:publicConfig.projectId};
  },
  async signOut(){await authApi.signOut(auth);},
  getIdentity(){const u=user();return {uid:u.uid,projectId:publicConfig.projectId};},
  async read(){
   const snap=await dbApi.getDocFromServer(document()); // Never accept stale offline cache.
   return snap.exists()?verifyRemote(snap.data()):null;
  },
  async compareAndSwap(expected,next){
   if(!next||!validRemoteRecord(next)||!Number.isInteger(expected?.revision))throw Error('同期先更新データの形式が不正です。');
   const ref=document(),identity=user().uid;
   return dbApi.runTransaction(db,async tx=>{
    const snap=await tx.get(ref),current=snap.exists()?verifyRemote(snap.data()):null;
    const seenRevision=current?.revision??0,seenDigest=current?.digest??null;
    if(seenRevision!==expected.revision||seenDigest!==(expected.digest??null)||next.revision!==seenRevision+1)
     throw Error('sync-conflict: 別端末で更新されました。上書きしません。');
    const value={ownerUid:identity,formatVersion:next.formatVersion,revision:next.revision,
      digest:next.digest,ciphertext:structuredClone(next.ciphertext),updatedAt:dbApi.serverTimestamp()};
    tx.set(ref,value);
    return {formatVersion:next.formatVersion,revision:next.revision,digest:next.digest,ciphertext:next.ciphertext};
   });
  }
 };
}
