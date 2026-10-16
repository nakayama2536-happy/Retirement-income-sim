import test from 'node:test';
import assert from 'node:assert/strict';
import {mountSyncPanel,SYNC_PUBLIC_CONFIG_KEY,SYNC_MARKER_KEY} from './sync-panel.mjs';
import {FakeCipherCloud} from './sync-policy.mjs';
class NodeElement{
 constructor(tag,doc){this.tagName=tag;this.ownerDocument=doc;this.children=[];this.listeners={};this.value='';this.checked=false;this.disabled=false;this.textContent='';this.attributes={};}
 setAttribute(k,v){this.attributes[k]=String(v);if(k==='name')this.name=v;}
 appendChild(x){this.children.push(x);return x;}
 replaceChildren(...items){this.children=items;}
 addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);}
 async emit(k){for(const fn of this.listeners[k]||[])await fn();}
}
const doc={createElement(tag){return new NodeElement(tag,doc)},addEventListener(){},removeEventListener(){}};
const walk=x=>[x,...(x.children||[]).flatMap(walk)];
const btn=(r,label)=>walk(r).find(x=>x.tagName==='button'&&x.textContent===label);
const input=(r,name)=>walk(r).find(x=>x.name===name);
class Storage{data=new Map();getItem(k){return this.data.get(k)??null;}setItem(k,v){this.data.set(k,String(v));}}
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
 await btn(root,'Firebaseに本人ログインして確認').emit('click');
 // Event handler invokes an async guarded closure; wait a few microtasks.
 await new Promise(resolve=>setTimeout(resolve,20));
 assert.equal(ui.getState().connected,true);
 assert.equal(cloud.writes,0);assert.equal(writeCount,0);
 assert.equal(btn(root,'この端末を初回の同期元にする').disabled,true);
 input(root,'syncBackupConfirmed').checked=true;await input(root,'syncBackupConfirmed').emit('change');
 assert.equal(btn(root,'この端末を初回の同期元にする').disabled,false);
 ui.destroy();
});
