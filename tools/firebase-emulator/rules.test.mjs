import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {collection,doc,getDoc,getDocs,setDoc,updateDoc,deleteDoc,serverTimestamp,runTransaction} from 'firebase/firestore';

const here=dirname(fileURLToPath(import.meta.url));
const template=readFileSync(resolve(here,'../../docs/firebase-sync-firestore.rules.example'),'utf8');
const owner='synthetic-firebase-owner-uid',other='synthetic-unrelated-user-uid';
const projectId='demo-lifeplan-sync-rulecheck';
const firestore={host:'127.0.0.1',port:8087};
const record=(revision=1)=>({
 ownerUid:owner,formatVersion:1,revision,digest:'a'.repeat(64),
 ciphertext:{version:1,algorithm:'AES-256-GCM/PBKDF2-SHA256',iterations:600000,
  salt:'AAAAAA==',iv:'AAAAAA==',data:'AQABAg=='},updatedAt:serverTimestamp()
});
let count=0;
async function testCase(name,check){
 try{await check();count++;console.log('PASS '+name);}
 catch(err){console.error('FAIL '+name,err);throw err;}
}
async function withRules(rules,check){
 const env=await initializeTestEnvironment({projectId,firestore:{...firestore,rules}});
 try{
   await env.clearFirestore();
   await check(env);
 }finally{await env.cleanup();}
}
const ref=(context,uid=owner,id='current')=>doc(context.firestore(),'owners',uid,'snapshots',id);
try{
 await withRules(template,async env=>{
   const self=env.authenticatedContext(owner);
   await testCase('Default private UID placeholder rejects signed-in user read',()=>assertFails(getDoc(ref(self))));
   await testCase('Default private UID placeholder rejects create',()=>assertFails(setDoc(ref(self),record())));
 });
 const configured=template.replaceAll('__SET_SINGLE_OWNER_UID_PRIVATELY__',owner);
 assert.notEqual(configured,template);
 await withRules(configured,async env=>{
   const self=env.authenticatedContext(owner);
   const stranger=env.authenticatedContext(other);
   const anonymous=env.unauthenticatedContext();
   await testCase('Unauthenticated user cannot read',()=>assertFails(getDoc(ref(anonymous))));
   await testCase('Unauthenticated user cannot create',()=>assertFails(setDoc(ref(anonymous),record())));
   await testCase('Other signed-in identity cannot read',()=>assertFails(getDoc(ref(stranger))));
   await testCase('Other signed-in identity cannot create',()=>assertFails(setDoc(ref(stranger),record())));
   await testCase('Only designated owner can create valid first generation',()=>assertSucceeds(setDoc(ref(self),record(1))));
   await testCase('Owner can read current snapshot',async()=>{const snap=await assertSucceeds(getDoc(ref(self)));assert.equal(snap.data().revision,1);});
   await testCase('Other signed-in identity cannot read existing snapshot',()=>assertFails(getDoc(ref(stranger))));
   await testCase('Collection listing denied even to owner',()=>assertFails(getDocs(collection(self.firestore(),'owners',owner,'snapshots'))));
   await testCase('Deletion denied even to owner',()=>assertFails(deleteDoc(ref(self))));
   await testCase('Write to arbitrary document id denied',()=>assertFails(setDoc(ref(self,owner,'other'),record())));
   await testCase('Write outside owner subtree denied',()=>assertFails(setDoc(doc(self.firestore(),'public','other'),record())));
   await testCase('Owner identity cannot change',()=>assertFails(updateDoc(ref(self),{ownerUid:other,revision:2})));
   await testCase('Skipping generation forbidden',()=>assertFails(updateDoc(ref(self),{revision:3})));
   await testCase('Repeating generation forbidden',()=>assertFails(updateDoc(ref(self),{revision:1})));
   await testCase('Invalid digest rejected',()=>assertFails(updateDoc(ref(self),{revision:2,digest:'not-a-sha256'})));
   await testCase('Unknown fields rejected',()=>assertFails(updateDoc(ref(self),{revision:2,unexpectedPrivateField:42})));
   await testCase('Missing cipher field rejected',()=>assertFails(updateDoc(ref(self),{revision:2,ciphertext:{
      version:1,algorithm:'AES-256-GCM/PBKDF2-SHA256',iterations:600000,salt:'AAAAAA==',data:'AQABAg=='}})));
   await testCase('Oversize ciphertext rejected',()=>assertFails(updateDoc(ref(self),{revision:2,ciphertext:{
      ...record().ciphertext,data:'A'.repeat(725001)}})));
   await testCase('Non-AES algorithm rejected',()=>assertFails(updateDoc(ref(self),{revision:2,ciphertext:{
      ...record().ciphertext,algorithm:'plaintext'}})));
   await testCase('Correct next revision accepted',()=>assertSucceeds(updateDoc(ref(self),{revision:2,digest:'b'.repeat(64),updatedAt:serverTimestamp()})));
   await testCase('Another account denied after owner update',()=>assertFails(getDoc(ref(stranger))));
   // Exercise actual Firestore SDK transaction retry/compare-and-swap against
   // the real emulator; never run these synthetic writes against a live project.
   const cas=(context,expectedRevision,expectedDigest,nextDigest)=>runTransaction(context.firestore(),async tx=>{
     const target=ref(context),snapshot=await tx.get(target);
     if(!snapshot.exists()||snapshot.data().revision!==expectedRevision||snapshot.data().digest!==expectedDigest)
       throw Error('sync-conflict: version changed');
     tx.update(target,{revision:expectedRevision+1,digest:nextDigest,updatedAt:serverTimestamp()});
     return expectedRevision+1;
   });
   await testCase('SDK transaction CAS accepts exact remote generation and digest',async()=>{
     const revision=await assertSucceeds(cas(self,2,'b'.repeat(64),'c'.repeat(64)));
     assert.equal(revision,3);
     assert.equal((await getDoc(ref(self))).data().revision,3);
   });
   await testCase('SDK transaction refuses previously read stale generation',async()=>{
     await assert.rejects(cas(self,2,'b'.repeat(64),'d'.repeat(64)),/sync-conflict/);
     assert.equal((await getDoc(ref(self))).data().revision,3);
   });
   await testCase('SDK transaction refuses altered digest at current generation',async()=>{
     await assert.rejects(cas(self,3,'b'.repeat(64),'d'.repeat(64)),/sync-conflict/);
     assert.equal((await getDoc(ref(self))).data().digest,'c'.repeat(64));
   });
   await testCase('SDK transaction cannot advance someone elses identity',()=>assertFails(cas(stranger,3,'c'.repeat(64),'d'.repeat(64))));
   await testCase('SDK transaction allows next valid generation after rejected changes',async()=>{
     assert.equal(await assertSucceeds(cas(self,3,'c'.repeat(64),'d'.repeat(64))),4);
     assert.equal((await getDoc(ref(self))).data().revision,4);
   });

 });
 console.log('FIREBASE_RULES_EMULATOR_OK '+count+' isolated synthetic checks; no live Firebase project or user data.');
}catch(e){process.exitCode=1;console.error('FIREBASE_RULES_EMULATOR_FAIL '+count+' passed before failure:',e?.message);}
