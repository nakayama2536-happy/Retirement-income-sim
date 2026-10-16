import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {collection,doc,getDoc,getDocs,setDoc,updateDoc,deleteDoc,serverTimestamp} from 'firebase/firestore';

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
 });
 console.log('FIREBASE_RULES_EMULATOR_OK '+count+' isolated synthetic checks; no live Firebase project or user data.');
}catch(e){process.exitCode=1;console.error('FIREBASE_RULES_EMULATOR_FAIL '+count+' passed before failure:',e?.message);}
