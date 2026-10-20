// Exact Web SDK, real Auth + Firestore emulator protocols. No live Firebase access.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initializeApp,deleteApp,SDK_VERSION} from 'firebase/app';
import {initializeAuth,inMemoryPersistence,connectAuthEmulator,createUserWithEmailAndPassword,
 signInWithEmailAndPassword,getIdTokenResult,signOut,deleteUser} from 'firebase/auth';
import * as sdk from 'firebase/firestore';
import {initializeTestEnvironment} from '@firebase/rules-unit-testing';
import {createSandboxStore,runEncryptedSandboxCheck,DEMO_PROJECT} from './encrypted-sandbox-check.mjs';

assert.equal(SDK_VERSION,'12.19.0','Test the exact SDK pinned by the diagnostic page');
assert.equal(DEMO_PROJECT,'demo-lifeplan-encrypted-sync');
assert.equal(process.env.FIRESTORE_EMULATOR_HOST,'127.0.0.1:8089','Explicit local Firestore emulator required');
assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST,'127.0.0.1:9098','Explicit local Auth emulator required');
const template=readFileSync(new URL('../../docs/firebase-sync-sandbox.rules.example',import.meta.url),'utf8');
const completed=[];
for(const variant of ['with-app-id','without-app-id']){
 const clients=[],createdUsers=[];let env=null;
 const config={projectId:DEMO_PROJECT,authDomain:DEMO_PROJECT+'.firebaseapp.com',apiKey:'fictional-emulator-api-key'};
 if(variant==='with-app-id')config.appId='1:000000000000:web:synthetic-emulator-app';
 const makeClient=()=>{
  const app=initializeApp(config,'sdk-config-'+crypto.randomUUID());
  const auth=initializeAuth(app,{persistence:inMemoryPersistence});
  connectAuthEmulator(auth,'http://127.0.0.1:9098',{disableWarnings:true});
  const database=sdk.getFirestore(app);sdk.connectFirestoreEmulator(database,'127.0.0.1',8089);
  const client={app,auth,database};clients.push(client);return client;
 };
 try{
  const first=makeClient(),second=makeClient(),guest=makeClient(),foreign=makeClient();
  for(const c of clients){assert.equal(Object.hasOwn(c.app.options,'appId'),variant==='with-app-id');assert.equal(c.app.options.projectId,DEMO_PROJECT);}
  const email='synthetic-'+crypto.randomUUID()+'@example.invalid',password='test-only-'+crypto.randomUUID();
  const created=await createUserWithEmailAndPassword(first.auth,email,password);createdUsers.push(created.user);
  const signedIn=await signInWithEmailAndPassword(second.auth,email,password);
  assert.equal(created.user.uid,signedIn.user.uid);
  for(const user of [created.user,signedIn.user]){
   const {claims}=await getIdTokenResult(user);
   assert.equal(claims.aud,DEMO_PROJECT);assert.equal(claims.iss,'https://securetoken.google.com/'+DEMO_PROJECT);assert.equal(claims.sub,user.uid);
  }
  await assert.rejects(signInWithEmailAndPassword(guest.auth,email,password+'-wrong'),e=>['auth/invalid-credential','auth/wrong-password','auth/invalid-login-credentials'].includes(e.code));
  assert.equal(guest.auth.currentUser,null);
  const owner=created.user.uid;
  env=await initializeTestEnvironment({projectId:DEMO_PROJECT,firestore:{host:'127.0.0.1',port:8089,rules:template.replaceAll('__SET_SANDBOX_TEST_UID_PRIVATELY__',owner)}});
  await env.clearFirestore(); // Only the fixed demo project in this local emulator.
  const store=client=>createSandboxStore({sdk,database:client.database,projectId:DEMO_PROJECT,uid:owner,environment:'emulator',host:'127.0.0.1'});
  const target=client=>sdk.doc(client.database,'sandbox',owner,'snapshots','trial');
  const result=await runEncryptedSandboxCheck({writer:store(first),reader:store(second),
   unauthenticatedRead:()=>sdk.getDocFromServer(target(guest)),
   onProgress:n=>console.log('SDK_CONFIG_STAGE '+variant+' '+n+'/12')});
  assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.cleanup,'confirmed');assert.equal(result.steps.length,12);
  const other=await createUserWithEmailAndPassword(foreign.auth,'foreign-'+crypto.randomUUID()+'@example.invalid','test-only-'+crypto.randomUUID());createdUsers.push(other.user);
  await assert.rejects(sdk.getDocFromServer(target(foreign)),e=>e.code==='permission-denied');
  assert.equal((await sdk.getDocFromServer(target(first))).exists(),false);
  assert.equal((await sdk.getDocFromServer(target(second))).exists(),false);
  completed.push({variant,stages:12,authentication:'real-local-emulator',wrongPasswordRejected:true,foreignReadRejected:true,cleanup:'confirmed'});
  console.log('SDK_CONFIG_VARIANT_OK '+variant+' auth + 12 stages + foreign denial + cleanup');
 }finally{
  for(const user of createdUsers)await deleteUser(user);
  for(const c of clients){await signOut(c.auth);await sdk.terminate(c.database);await deleteApp(c.app);}
  if(env)await env.cleanup();
 }
}
assert.equal(completed.length,2);
console.log('SDK_CONFIG_COMPAT_OK '+JSON.stringify({sdk:SDK_VERSION,variants:completed,realCloud:false,realIPhone:false,personalData:false}));
