import test from 'node:test';
import assert from 'node:assert/strict';
import {createFirebaseStore,validateFirebaseConfig} from './sync-firebase.mjs';
const config={apiKey:'synthetic-public-api-key',authDomain:'fictional.firebaseapp.com',projectId:'synthetic-proj',appId:'1:123:web:fake'};
function mock(){
 let data=null,writes=0,authenticated=null,txs=0;
 const auth={get currentUser(){return authenticated;},async authStateReady(){}};
 const modules={
  'firebase-app.js':{getApps:()=>[],initializeApp:(cfg,name)=>({options:cfg,name})},
  'firebase-auth.js':{getAuth:()=>auth,browserLocalPersistence:{name:'local'},
   setPersistence:async()=>{},signInWithEmailAndPassword:async(a,email,password)=>{if(password!=='test-only-password')throw Error('denied');authenticated={uid:'fictional-uid'};return {user:authenticated};},
   signOut:async()=>{authenticated=null;}},
  'firebase-firestore.js':{getFirestore:()=>({}),doc:(db,...parts)=>parts.join('/'),
   getDocFromServer:async()=>({exists:()=>!!data,data:()=>structuredClone(data)}),
   serverTimestamp:()=>({mockServerTime:true}),
   runTransaction:async(db,cb)=>{
    const transaction={get:async()=>({exists:()=>!!data,data:()=>structuredClone(data)}),
      set:(ref,value)=>{data=structuredClone(value);writes++;}};txs++;return cb(transaction);
   }}
 };
 return {loader:async url=>{const key=url.split('/').at(-1);if(!modules[key])throw Error('unknown SDK');return modules[key];},
  get data(){return structuredClone(data);},get writes(){return writes;},get txs(){return txs;}};
}
const record=(revision=1)=>({formatVersion:1,revision,digest:'b'.repeat(64),ciphertext:{version:1,data:'ZmFrZQ==',salt:'ZmFrZQ==',iv:'ZmFrZQ=='}});
test('Firebase public project input is validated without committing any credentials',()=>{
 assert.deepEqual(validateFirebaseConfig(config),config);
 assert.throws(()=>validateFirebaseConfig({projectId:'x'}),/不足/);
});
test('lazy import never happens at module load and requires auth to read',async()=>{
 const m=mock(),store=await createFirebaseStore(config,{moduleLoader:m.loader});
 await assert.rejects(store.read(),/ログイン/);
 await store.signIn('fictional@example.test','test-only-password');
 assert.deepEqual(store.getIdentity(),{uid:'fictional-uid',projectId:'synthetic-proj'});
 assert.equal(await store.read(),null);
 assert.deepEqual(await store.signIn('',''),{uid:'fictional-uid',projectId:'synthetic-proj'});
});
test('Firestore transaction CAS creates once and refuses stale overwrites',async()=>{
 const m=mock(),store=await createFirebaseStore(config,{moduleLoader:m.loader});
 await store.signIn('fictional@example.test','test-only-password');
 const one=await store.compareAndSwap({revision:0,digest:null},record(1));
 assert.equal(one.revision,1);assert.equal(m.data.ownerUid,'fictional-uid');
 assert.equal(m.writes,1);
 await assert.rejects(store.compareAndSwap({revision:0,digest:null},record(1)),/sync-conflict/);
 const two=await store.compareAndSwap({revision:1,digest:'b'.repeat(64)},{...record(2),digest:'c'.repeat(64)});
 assert.equal(two.revision,2);assert.equal(m.writes,2);
 await store.signOut();await assert.rejects(store.read(),/ログイン/);
});
