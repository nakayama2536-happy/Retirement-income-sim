import test from 'node:test';
import assert from 'node:assert/strict';
import {mountSyncPanel,SYNC_MARKER_KEY,SYNC_AUTO_RESUME_KEY} from './sync-panel.mjs';
import {snapshotDigest,encryptSnapshot} from './sync-crypto.mjs';
import {FakeCipherCloud} from './sync-policy.mjs';
const phrase='synthetic-crypto-secret-long-enough';
const local=(amount)=>({config:{plan:{startDate:'2038-01-01',initialAsset:amount},reviews:{'70':{note:'fiction'}}},scenarios:[{id:'only-synthetic'}],futureEnvelope:{v:3}});
class Element{
 constructor(tag,ownerDocument){this.tagName=tag.toUpperCase();this.ownerDocument=ownerDocument;this.children=[];this.listeners={};this.checked=false;this.disabled=false;this.hidden=false;this.value='';this.textContent='';this.attributes={};this.classList={add(){}};}
 setAttribute(k,v){this.attributes[k]=String(v);if(k==='name')this.name=v;}
 appendChild(x){this.children.push(x);return x;}
 replaceChildren(...items){this.children=items;}
 addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
 async emit(name){for(const fn of this.listeners[name]??[])await fn({preventDefault(){}});}
}
const doc={createElement(tag){return new Element(tag,doc);},addEventListener(){},removeEventListener(){},querySelector(){return null;},activeElement:null};
const all=x=>[x,...x.children.flatMap(all)];
const btn=(root,id)=>all(root).find(x=>x.tagName==='BUTTON'&&x.attributes['data-sync-action']===id);
const el=(root,name)=>all(root).find(x=>x.name===name);
const current=(root)=>all(root).find(x=>x.attributes.role==='status'&&x.attributes.class==='cloud-status');
const form=(root,id)=>all(root).find(x=>x.tagName==='FORM'&&x.attributes.id===id);
const wait=async panel=>{const end=Date.now()+15000;while(panel.getState().working){if(Date.now()>end)throw Error('UI operation stalled');await new Promise(done=>setTimeout(done,5));}};
class Store{data=new Map();getItem(k){return this.data.get(k)??null;}setItem(k,v){this.data.set(k,String(v));}removeItem(k){this.data.delete(k);}}
async function setup(){
 const cloud=new FakeCipherCloud();let iPhone=local(404),replaceCount=0,exports=[],backups=[];
 const oldCipher=await encryptSnapshot(local(101),phrase),remoteCipher=await encryptSnapshot(local(303),phrase),stateDigest=await snapshotDigest(local(101));
 cloud.latest={formatVersion:1,revision:2,digest:remoteCipher.digest,ciphertext:remoteCipher.payload};
 const marker={version:1,projectId:'example-project',uid:'synthetic-account',baseRevision:1,baseRemoteDigest:oldCipher.digest,baseLocalDigest:stateDigest,enabled:true,backupConfirmed:true};
 const storage=new Store();storage.setItem(SYNC_MARKER_KEY,JSON.stringify(marker));storage.setItem(SYNC_AUTO_RESUME_KEY,'stopped');
 const provider={signIn:async()=>({uid:'synthetic-account'}),getIdentity:()=>({projectId:'example-project',uid:'synthetic-account'}),
  read:()=>cloud.read(),compareAndSwap:(a,b)=>cloud.compareAndSwap(a,b)};
 const root=new Element('div',doc);
 const panel=mountSyncPanel(root,{
  getState:()=>structuredClone(iPhone),replaceLocal:(next,prior)=>{assert.deepEqual(iPhone,prior);iPhone=structuredClone(next);replaceCount++;return structuredClone(next);},
  validateState:s=>{if(!s.config)throw Error('invalid');},storage,createStore:async()=>provider,
  exportLocalBackup:state=>{exports.push(structuredClone(state));},
  windowRef:{navigator:{onLine:true},addEventListener(){},removeEventListener(){}},documentRef:doc,
  schedule:()=>1,unschedule:()=>{}
 });
 for(const [k,v]of Object.entries({syncApiKey:'fake',syncAuthDomain:'example-project.firebaseapp.com',syncProjectId:'example-project',syncAppId:'1:12:web:fake',syncEmail:'example@invalid.test',syncPassword:'fictional',syncPhrase:phrase}))el(root,k).value=v;
 await form(root,'lifeplanCloudUnlock').emit('submit');await wait(panel);
 return {root,panel,cloud,storage,exports,backups,get device(){return structuredClone(iPhone);},get replaceCount(){return replaceCount;}};
}
test('③-B visible only after conflict review and requires a fresh JSON export and two consents',async()=>{
 const h=await setup();
 assert.equal(btn(h.root,'3b').disabled,true);
 assert.equal(btn(h.root,'3').disabled,true);
 await btn(h.root,'4').emit('click');await wait(h.panel);
 assert.equal(h.panel.getState().previewOK,true);
 assert.equal(btn(h.root,'3b').disabled,true);
 assert.equal(h.cloud.writes,0);
 // The app never treats its in-browser previous-state backup as proof of a portable JSON file.
 await all(h.root).find(x=>x.attributes['data-sync-conflict-backup']==='1').emit('click');await wait(h.panel);
 assert.equal(h.exports.length,1);assert.equal(h.exports[0].config.plan.initialAsset,404);
 assert.equal(btn(h.root,'3b').disabled,true);
 const f=el(h.root,'syncConflictFileVerified'),d=el(h.root,'syncConflictDiscardConfirmed');
 f.checked=true;await f.emit('change');assert.equal(btn(h.root,'3b').disabled,true);
 d.checked=true;await d.emit('change');assert.equal(btn(h.root,'3b').disabled,false);
 await btn(h.root,'3b').emit('click');await wait(h.panel);
 assert.equal(h.device.config.plan.initialAsset,303);assert.equal(h.replaceCount,1);
 assert.equal(h.cloud.writes,0);assert.equal(h.cloud.latest.revision,2);
 assert.equal(btn(h.root,'3b').disabled,true);assert.equal(h.panel.getState().previewOK,false);
 assert.match(current(h.root).textContent,/クラウドを正として/);
 const prior=JSON.parse(h.storage.getItem('lifeplan-private-sync-previous-v1'));
 assert.equal(prior.state.config.plan.initialAsset,404);
 h.panel.destroy();
});
test('ineligible conflict import without a portable backup callback is disabled',async()=>{
 const h=await setup();h.panel.destroy();
 const root=new Element('div',doc),panel=mountSyncPanel(root,{getState:()=>h.device,replaceLocal:()=>{throw Error('not permitted');},validateState:()=>{},storage:h.storage,createStore:async()=>{throw Error('not used');},windowRef:{navigator:{onLine:true},addEventListener(){},removeEventListener(){}},documentRef:doc});
 assert.equal(btn(root,'3b').disabled,true);panel.destroy();
});
