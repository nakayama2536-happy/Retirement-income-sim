// Isolated fictional-only regression: actual lease module + panel event ordering.
import test from 'node:test';
import assert from 'node:assert/strict';
import {Document,walk} from './tools/cloud-ui-test/dom.mjs';
import {acquireWriteAccess,assertWriteAccess} from './write-access.mjs';
import {mountSyncPanel,SYNC_MARKER_KEY,SYNC_AUTO_RESUME_KEY} from './sync-panel.mjs';
import {snapshotDigest,encryptSnapshot} from './sync-crypto.mjs';
import {FakeCipherCloud} from './sync-policy.mjs';
const phrase='fictional-only-secret-for-resume-tests';
const state=n=>({config:{plan:{startDate:'2040-01-01',initialAsset:n}},scenarios:[],unknown:{keep:true}});
const pause=()=>new Promise(r=>setImmediate(r));
async function fixture(){
 const doc=new Document(),events=new Map(),win={navigator:{onLine:true},addEventListener(n,fn){if(!events.has(n))events.set(n,new Set());events.get(n).add(fn);},removeEventListener(n,fn){events.get(n)?.delete(fn);}};
 const emit=n=>{for(const fn of events.get(n)||[])fn();};
 let owner=false,grants=0,deny=false;
 const locks={async request(name,opts,fn){assert.equal(opts.ifAvailable,true);assert.equal(opts.mode,'exclusive');if(owner||deny)return fn(null);owner=true;grants++;try{return await fn({name});}finally{owner=false;}}};
 // As in app.mjs, the lease's visibility listener is installed before the panel.
 const lease=await acquireWriteAccess({locks,target:win,documentRef:doc});
 const cloud=new FakeCipherCloud(),prior=await encryptSnapshot(state(100),phrase),remote=await encryptSnapshot(state(300),phrase);
 cloud.latest={formatVersion:1,revision:2,digest:remote.digest,ciphertext:remote.payload};
 const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,String(v)),removeItem:k=>data.delete(k)};
 const identity={projectId:'fictional-project',uid:'fictional-owner'};
 data.set(SYNC_MARKER_KEY,JSON.stringify({version:1,...identity,baseRevision:1,baseRemoteDigest:prior.digest,baseLocalDigest:await snapshotDigest(state(100)),enabled:true,backupConfirmed:true}));data.set(SYNC_AUTO_RESUME_KEY,'stopped');
 let device=state(200),replaces=0,exported=[];
 const provider={signIn:async()=>identity,getIdentity:()=>identity,read:()=>cloud.read(),compareAndSwap:(a,b)=>cloud.compareAndSwap(a,b)};
 const root=doc.createElement('div');root.setAttribute('id','privateSyncContainer');doc.body.appendChild(root);
 const panel=mountSyncPanel(root,{getState:()=>structuredClone(device),replaceLocal:(next)=>{assertWriteAccess();replaces++;device=structuredClone(next);return device;},validateState:s=>assert.ok(s.config),writeAllowed:()=>lease.writable,writeAccessReason:()=>lease.reason,storage,createStore:async()=>provider,exportLocalBackup:s=>{exported.push(structuredClone(s));},windowRef:win,documentRef:doc,schedule:()=>1,unschedule:()=>{}});
 const unsubscribe=lease.subscribe(()=>panel.refreshWriteAccess());
 const input=n=>walk(root).find(x=>x.name===n),button=n=>walk(root).find(x=>x.getAttribute('data-sync-action')===String(n));
 const idle=async()=>{for(let i=0;i<12;i++)await pause();const end=Date.now()+5000;while(panel.getState().working){assert.ok(Date.now()<end,'panel settled');await new Promise(r=>setTimeout(r,3));}for(let i=0;i<8;i++)await pause();};
 for(const [k,v]of Object.entries({syncApiKey:'fiction',syncAuthDomain:'fixture.invalid.test',syncProjectId:identity.projectId,syncAppId:'1:0:web:fiction',syncEmail:'nobody@invalid.test',syncPassword:'fake-password',syncPhrase:phrase}))input(k).value=v;
 await doc.getElementById('lifeplanCloudUnlock').emit('submit');await idle();
 const click=async n=>{assert.equal(button(n).disabled,false,'button '+n+' available');await button(n).emit('click');await idle();};
 await click(4);
 const backup=async()=>{await walk(root).find(x=>x.getAttribute('data-sync-conflict-backup')==='1').emit('click');await idle();};
 const hide=()=>{doc.visibilityState='hidden';doc.emit('visibilitychange');};
 const show=()=>{doc.visibilityState='visible';doc.emit('visibilitychange');};
 return {doc,win,root,lease,panel,cloud,input,button,click,backup,hide,show,emit,idle,exported,deny:v=>{deny=v;},change:()=>{device.config.note='a different saved input';},current:()=>structuredClone(device),count:()=>replaces,cleanup:async()=>{unsubscribe();panel.destroy();emit('pagehide');await idle();}};
}
test('backup checkboxes stay available after Files-like hide/resume, with no automatic write',async()=>{
 const f=await fixture();try{
  await f.backup();
  assert.equal(f.input('syncConflictFileVerified').disabled,false);
  f.hide();await f.idle();assert.equal(f.lease.writable,false);
  f.show();f.emit('focus');await f.idle();assert.equal(f.lease.writable,true);
  console.log('RESUME_STATE',JSON.stringify({lease:f.lease.writable,preview:f.panel.getState().previewOK,status:f.panel.getState().status,fileDisabled:f.input('syncConflictFileVerified').disabled,discardDisabled:f.input('syncConflictDiscardConfirmed').disabled,exports:f.exported.length,cloudWrites:f.cloud.writes,replacements:f.count()}));
  assert.equal(f.input('syncConflictFileVerified').disabled,false,'returning from file verification must not erase a valid backup receipt');
  assert.equal(f.input('syncConflictDiscardConfirmed').disabled,false);
  assert.equal(f.input('syncConflictFileVerified').checked,false);assert.equal(f.input('syncConflictDiscardConfirmed').checked,false);
  assert.equal(f.cloud.writes,0);assert.equal(f.count(),0);
  f.input('syncConflictFileVerified').checked=true;await f.input('syncConflictFileVerified').emit('change');
  assert.equal(f.button('3b').disabled,true,'second consent still required');
  f.input('syncConflictDiscardConfirmed').checked=true;await f.input('syncConflictDiscardConfirmed').emit('change');
  await f.click('3b');assert.equal(f.count(),1);assert.equal(f.current().config.plan.initialAsset,300);assert.equal(f.cloud.writes,0);
 }finally{await f.cleanup();}
});

test('resuming while another editor owns the lease never permits replacement',async()=>{
 const f=await fixture();try{
  await f.backup();f.hide();await f.idle();f.deny(true);f.show();f.emit('focus');await f.idle();
  assert.equal(f.lease.writable,false);assert.equal(f.button('3b').disabled,true);assert.equal(f.count(),0);assert.equal(f.cloud.writes,0);
 }finally{f.deny(false);await f.cleanup();}
});

test('a saved change while away is still refused even with pre-return backup consent',async()=>{
 const f=await fixture();try{
  await f.backup();f.hide();await f.idle();f.change();f.show();await f.idle();
  f.input('syncConflictFileVerified').checked=true;await f.input('syncConflictFileVerified').emit('change');
  f.input('syncConflictDiscardConfirmed').checked=true;await f.input('syncConflictDiscardConfirmed').emit('change');
  // Invoke the same handler even if disabled to demonstrate controller enforcement.
  await f.button('3b').emit('click');await f.idle();
  assert.equal(f.count(),0);assert.equal(f.cloud.writes,0);assert.equal(f.current().config.note,'a different saved input');
 }finally{await f.cleanup();}
});
