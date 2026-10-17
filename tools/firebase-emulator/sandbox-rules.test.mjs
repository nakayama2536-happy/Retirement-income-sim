import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
import assert from 'node:assert/strict';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,getDoc,setDoc,deleteDoc,updateDoc,serverTimestamp} from 'firebase/firestore';

const here=dirname(fileURLToPath(import.meta.url));
const template=readFileSync(resolve(here,'../../docs/firebase-sync-sandbox.rules.example'),'utf8');
const owner='synthetic-test-owner',foreign='synthetic-foreign-uid';
const record=(revision=1)=>({ownerUid:owner,formatVersion:1,revision,digest:'a'.repeat(64),
 ciphertext:{version:1,algorithm:'AES-256-GCM/PBKDF2-SHA256',iterations:600000,
 salt:'AAAAAA==',iv:'AAAAAA==',data:'AQABAg=='},updatedAt:serverTimestamp()});
const firestore={host:'127.0.0.1',port:8087};
const env=await initializeTestEnvironment({projectId:'demo-lifeplan-sync-rulecheck',firestore:{...firestore,rules:template}});
let passed=0,configured=null;
const check=async(name,fn)=>{await fn();passed++;console.log('PASS '+name);};
try{
 await env.clearFirestore();
 const self=env.authenticatedContext(owner);
 const path=ctx=>doc(ctx.firestore(),'sandbox',owner,'snapshots','trial');
 await check('Unset sandbox owner denies writes',()=>assertFails(setDoc(path(self),record())));
 await env.cleanup();
 configured=await initializeTestEnvironment({projectId:'demo-lifeplan-sync-rulecheck',
   firestore:{...firestore,rules:template.replaceAll('__SET_SANDBOX_TEST_UID_PRIVATELY__',owner)}});
 // The test-only rule change occurs inside the local emulator, never Firebase Cloud.
 const context=configured.authenticatedContext(owner);
 await check('Owner can write fictional trial document',()=>assertSucceeds(setDoc(path(context),record())));
 await check('Owner can read fictional trial document',async()=>{const snap=await assertSucceeds(getDoc(path(context)));assert.equal(snap.data().revision,1);});
 const other=configured.authenticatedContext(foreign);
 await check('Foreign user cannot read trial',()=>assertFails(getDoc(path(other))));
 await check('Foreign user cannot overwrite trial',()=>assertFails(setDoc(path(other),record())));
 await check('Unrelated live sync path remains inaccessible',()=>assertFails(setDoc(doc(context.firestore(),'owners',owner,'snapshots','current'),record())));
 await check('Valid increment allowed',()=>assertSucceeds(updateDoc(path(context),{revision:2,digest:'b'.repeat(64),updatedAt:serverTimestamp()})));
 await check('Repeated revision denied',()=>assertFails(updateDoc(path(context),{revision:2})));
 await check('Foreign delete denied',()=>assertFails(deleteDoc(path(other))));
 await check('Owner can clean up disposable trial document',()=>assertSucceeds(deleteDoc(path(context))));
 await check('Document no longer exists after cleanup',async()=>{const snap=await assertSucceeds(getDoc(path(context)));assert.equal(snap.exists(),false);});
 console.log('FIREBASE_SANDBOX_EMULATOR_OK '+passed+' synthetic rules checks, cleanup confirmed.');
}catch(err){process.exitCode=1;console.error(err);}finally{await env.cleanup().catch(()=>{});if(configured)await configured.cleanup();}
