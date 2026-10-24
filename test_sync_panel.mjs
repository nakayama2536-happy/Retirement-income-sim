import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mountSyncPanel,hasExternalEditorFocus,SYNC_PUBLIC_CONFIG_KEY,SYNC_MARKER_KEY,SYNC_REVIEW_KEY} from './sync-panel.mjs';

import {FakeCipherCloud} from './sync-policy.mjs';
import {encryptSnapshot} from './sync-crypto.mjs';
class NodeElement{
 constructor(tag,doc){this.tagName=tag;this.ownerDocument=doc;this.children=[];this.listeners={};this.value='';this.checked=false;this.disabled=false;this.textContent='';this.attributes={};this.classList={add(){}};}
 setAttribute(k,v){this.attributes[k]=String(v);if(k==='name')this.name=v;}
 appendChild(x){this.children.push(x);return x;}
 replaceChildren(...items){this.children=items;}
 addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);}
 async emit(k){for(const fn of this.listeners[k]||[])await fn({preventDefault(){}});}
}
const doc={createElement(tag){return new NodeElement(tag,doc)},addEventListener(){},removeEventListener(){}};
const walk=x=>[x,...(x.children||[]).flatMap(walk)];
// Select stable action numbers, not translated button copy.
const actionNumber={
 'Firebaseに本人ログインして確認':1,'クラウド内容と端末内容を照合（書込みなし）':4,
 'この端末を初回の同期元にする':6,'確認したクラウドをこの端末へ初回取込':7
};
const btn=(r,label)=>walk(r).find(x=>x.tagName==='button'&&x.attributes['data-sync-action']===String(actionNumber[label]));
const loginForm=r=>walk(r).find(x=>x.tagName==='form'&&x.attributes.id==='lifeplanCloudUnlock');
const idle=async ui=>{const deadline=Date.now()+10000;while(ui.getState().working){if(Date.now()>deadline)throw Error('UI timeout');await new Promise(r=>setTimeout(r,5));}};
const input=(r,name)=>walk(r).find(x=>x.name===name);
class Storage{data=new Map();getItem(k){return this.data.get(k)??null;}setItem(k,v){this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}}
const local=()=>({config:{plan:{startDate:'2044-01-15',initialAsset:1}},scenarios:[],opaque:{keep:1}});
test('rendering optional sync panel never starts Firebase or changes local data',()=>{
 let calls=0;const root=new NodeElement('div',doc),store=new Storage(),value=local();
 const ui=mountSyncPanel(root,{getState:()=>structuredClone(value),replaceLocal:()=>{throw Error('not allowed');},
  validateState:()=>{},storage:store,createStore:async()=>{calls++;throw Error('no');},windowRef:{navigator:{onLine:true},addEventListener(){},removeEventListener(){}},documentRef:doc});
 assert.equal(calls,0);assert.equal(ui.getState().connected,false);
 assert.equal(btn(root,'この端末を初回の同期元にする').disabled,true);
 assert.equal(btn(root,'確認したクラウドをこの端末へ初回取込').disabled,true);
 assert.equal(store.data.size,0);ui.destroy();
});
test('initial connection requires explicit local config, passphrase, backup confirmation and source choice',async()=>{
 const root=new NodeElement('div',doc),storage=new Storage(),cloud=new FakeCipherCloud(),current=local();let writeCount=0;
 const provider={signIn:async()=>({uid:'test-user'}),getIdentity:()=>({uid:'test-user',projectId:'test-project'}),
  read:()=>cloud.read(),compareAndSwap:(a,b)=>cloud.compareAndSwap(a,b)};
 const ui=mountSyncPanel(root,{getState:()=>structuredClone(current),replaceLocal:()=>{writeCount++;},
  validateState:s=>{if(!s?.config)throw Error('invalid');},storage,createStore:async()=>provider,
  windowRef:{navigator:{onLine:true},addEventListener(){},removeEventListener(){}},documentRef:doc});
 for(const [name,value] of Object.entries({syncApiKey:'fake-key',syncAuthDomain:'test-project.firebaseapp.com',syncProjectId:'test-project',syncAppId:'1:12:web:fake',
  syncEmail:'fictional@example.test',syncPassword:'fictional-password',syncPhrase:'fictional encryption passphrase'}))input(root,name).value=value;
 assert.equal(cloud.writes,0);
 // Do not initiate cloud writes until the user actively chooses initial upload.
 await loginForm(root).emit('submit');
 // Wait for the actual operation, including encryption validation.
 await idle(ui);
 assert.equal(ui.getState().connected,true);
 assert.equal(cloud.writes,0);assert.equal(writeCount,0);
 assert.equal(btn(root,'この端末を初回の同期元にする').disabled,true);
 input(root,'syncBackupConfirmed').checked=true;await input(root,'syncBackupConfirmed').emit('change');
 assert.equal(btn(root,'この端末を初回の同期元にする').disabled,false);
 ui.destroy();
});

test('manual external restore creates a durable review barrier without Firebase writes',()=>{
 let calls=0;const storage=new Storage(),root=new NodeElement('div',doc);
 const create=()=>mountSyncPanel(root,{getState:local,replaceLocal:()=>{throw Error('must not replace');},
 validateState:()=>{},storage,createStore:async()=>{calls++;throw Error('unexpected cloud');},
 windowRef:{navigator:{onLine:true},addEventListener(){},removeEventListener(){}},documentRef:doc});
 let ui=create();assert.equal(ui.getState().reviewPending,false);
 ui.noteExternalRestore();
 assert.equal(ui.getState().reviewPending,true);
 assert.equal(JSON.parse(storage.getItem(SYNC_REVIEW_KEY)).reason,'manual-restore');
 assert.equal(calls,0);ui.destroy();
 ui=create();assert.equal(ui.getState().reviewPending,true);assert.equal(calls,0);
 ui.destroy();
});
test('app marks external full/config JSON restores before any persistent write',()=>{
 const code=fs.readFileSync(new URL('./app.mjs',import.meta.url),'utf8');
 assert.match(code,/if\(full\)\{\s*syncPanel\?\.noteExternalRestore\(\);\s*const committed=restoreFullBackup/);
 assert.match(code,/syncPanel\?\.noteExternalRestore\(\);\s*if\(!commitState\(next,nextScenarios,false\)\)return/);
});

test('editing a different screen invalidates cloud import review without replacing local data',async()=>{
 const activeDoc={...doc,_listeners:{},
  addEventListener(type,listener){(this._listeners[type]??=[]).push(listener);},
  removeEventListener(){},
  querySelector:()=>null,activeElement:null};
 const root=new NodeElement('div',activeDoc),storage=new Storage(),cloud=new FakeCipherCloud();
 const passphrase='fictional-encryption-secret-16plus';
 const encrypted=await encryptSnapshot(local(),passphrase);
 cloud.latest={formatVersion:1,revision:1,digest:encrypted.digest,ciphertext:encrypted.payload};
 let replaced=0;
 const fakeStore={
  signIn:async()=>({uid:'fake-user'}),
  getIdentity:()=>({projectId:'test-project',uid:'fake-user'}),
  read:()=>cloud.read(),
  compareAndSwap:(a,b)=>cloud.compareAndSwap(a,b)
 };
 const panel=mountSyncPanel(root,{getState:local,replaceLocal:()=>{replaced++;},
  validateState:()=>{},storage,createStore:async()=>fakeStore,
  windowRef:{navigator:{onLine:true},addEventListener(){},removeEventListener(){}},
  documentRef:activeDoc});
 for(const [name,value] of Object.entries({syncApiKey:'fake-key',syncAuthDomain:'test-project.firebaseapp.com',syncProjectId:'test-project',syncAppId:'1:12:web:fake',
  syncEmail:'fictional@example.test',syncPassword:'fictional-password',syncPhrase:passphrase}))input(root,name).value=value;
 await loginForm(root).emit('submit');
 await idle(panel);
 input(root,'syncBackupConfirmed').checked=true;await input(root,'syncBackupConfirmed').emit('change');
 await btn(root,'クラウド内容と端末内容を照合（書込みなし）').emit('click');
 await idle(panel);
 assert.equal(panel.getState().previewOK,true);
 assert.equal(btn(root,'確認したクラウドをこの端末へ初回取込').disabled,false);
 for(const listener of activeDoc._listeners.input||[])listener({target:{closest:sel=>sel==='#dashboard'?{}:null}});
 assert.equal(panel.getState().pendingEdits,true);
 assert.equal(panel.getState().previewOK,false);
 assert.equal(btn(root,'確認したクラウドをこの端末へ初回取込').disabled,true);
 await btn(root,'確認したクラウドをこの端末へ初回取込').emit('click');
 assert.equal(replaced,0);assert.equal(cloud.writes,0);
 panel.destroy();
});

test('focused Firebase sync inputs are not mistaken for unsaved financial edits in Safari',()=>{
 const focused=(isSync)=>({closest(selector){
  if(selector==='#dashboard input, #dashboard select, #dashboard textarea')return this;
  if(selector==='#privateSyncContainer')return isSync?{}:null;
  return null;
 }});
 assert.equal(hasExternalEditorFocus({activeElement:focused(true)}),false);
 assert.equal(hasExternalEditorFocus({activeElement:focused(false)}),true);
 assert.equal(hasExternalEditorFocus({activeElement:{closest:()=>null}}),false);
 assert.equal(hasExternalEditorFocus(null),false);
});

test('legacy salary suggestion without editing is not an unsaved draft, but saved edits remain protected',async()=>{
 const {salaryDraftNeedsProtection}=await import('./salary-ui.mjs');
 const {salaryDraftFromConfig}=await import('./salary-workflow.mjs');
 const original=JSON.parse(fs.readFileSync(new URL('./tools/browser-test/synthetic-full.json',import.meta.url),'utf8')).config;
 assert.equal(original.cashflow?.salaryLife,undefined);
 const automatic=salaryDraftFromConfig(original);
 assert.equal(salaryDraftNeedsProtection(original,automatic,false),false);
 assert.equal(salaryDraftNeedsProtection(original,automatic,true),true);
 const changed=structuredClone(automatic);changed.settings.monthlyAddition='4321';
 assert.equal(salaryDraftNeedsProtection(original,changed,true),true);
 // If a salary-life mode was already adopted, an unmatched draft stays protected.
 const adopted=structuredClone(original);adopted.cashflow.salaryLife=structuredClone(automatic.settings);
 const adoptedDraft=salaryDraftFromConfig(adopted);
 assert.equal(salaryDraftNeedsProtection(adopted,adoptedDraft,false),false);
 const different=structuredClone(adoptedDraft);different.settings.lastSalaryMonth='2040-01';
 assert.equal(salaryDraftNeedsProtection(adopted,different,false),true);
});
