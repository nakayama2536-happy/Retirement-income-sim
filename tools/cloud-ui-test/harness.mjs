import {Document,walk} from './dom.mjs';
import {mountSyncPanel,SYNC_PUBLIC_CONFIG_KEY,SYNC_MARKER_KEY,SYNC_AUTO_RESUME_KEY} from '../../sync-panel.mjs';
import {encryptSnapshot,snapshotDigest} from '../../sync-crypto.mjs';
export async function makeFixture(mode='returning'){
 const phrase='fixture encryption phrase for UI',identity={uid:'fictional-owner',projectId:'fictional-project'};
 const cfg={apiKey:'fixture-public-key',authDomain:'fixture.example.test',projectId:identity.projectId,appId:'1:0:web:fixture'};
 const start=()=>({config:{plan:{startDate:'2042-01-15',initialAsset:1200}},scenarios:[],opaque:{keep:'fixture'}});
 let state=start(),cloud=null,authIdentity={...identity},providerCalls=0,reads=0,writes=0,replaced=0,signIns=0,failRead=false,failWrite=false,signOutFailure=false,replaceFailure=false,storageFail=null,allowed=true,afterCalls=0;
 const timers=new Set(),watchers=new Set(),data=new Map();let networkOnline=true,readDelay=null,releaseRead;
 const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>{if(storageFail===k)throw Error('storage-write-failure');data.set(k,String(v));},removeItem:k=>data.delete(k)};
 async function encode(s,revision=1){const e=await encryptSnapshot(s,phrase);return {formatVersion:1,revision,digest:e.digest,ciphertext:e.payload};}
 if(mode!=='fresh')cloud=await encode(state);
 if(mode!=='fresh'&&mode!=='newdevice')data.set(SYNC_MARKER_KEY,JSON.stringify({version:1,...identity,baseRevision:1,baseRemoteDigest:cloud.digest,baseLocalDigest:await snapshotDigest(state),enabled:true,backupConfirmed:true}));
 data.set(SYNC_PUBLIC_CONFIG_KEY,JSON.stringify(cfg));
 if(mode==='expired'||mode==='fresh')authIdentity=null;
 if(mode==='mismatch')authIdentity={...identity,uid:'fictional-other'};
 if(mode==='stopped')data.set(SYNC_AUTO_RESUME_KEY,'stopped');
 if(mode==='corrupt')data.set(SYNC_MARKER_KEY,'{invalid');
 if(mode==='newdevice')state.config.plan.initialAsset=900;
 if(mode==='localupdate'||mode==='conflict')state.config.fixtureEdit='local';
 if(mode==='remoteupdate'||mode==='conflict'){const next=start();next.config.fixtureEdit='remote';cloud=await encode(next,2);}
 const provider={getSessionIdentity:()=>structuredClone(authIdentity),
  getIdentity:()=>{if(!authIdentity)throw Error('本人認証が必要です。');return structuredClone(authIdentity);},
  signIn:async(email,password)=>{signIns++;if(!authIdentity){if(!email||!password)throw Error('ログイン情報が必要です。');authIdentity={...identity};for(const f of watchers)f(authIdentity);}return authIdentity;},
  watchSession:fn=>{watchers.add(fn);fn(authIdentity);return()=>watchers.delete(fn);},
  signOut:async()=>{if(signOutFailure)throw Error('signout-unavailable');authIdentity=null;for(const f of watchers)f(null);},
  read:async()=>{reads++;if(readDelay)await readDelay;if(failRead||!networkOnline)throw Object.assign(Error('fixture network'),{code:'unavailable'});return structuredClone(cloud);},
  compareAndSwap:async(e,n)=>{if(failWrite)throw Object.assign(Error('fixture network'),{code:'unavailable'});if((cloud?.revision??0)!==e.revision||(cloud?.digest??null)!==e.digest)throw Error('fixture-cas-conflict');writes++;cloud=structuredClone(n);return structuredClone(cloud);}};
 const doc=new Document(),root=doc.createElement('div');root.setAttribute('id','privateSyncContainer');const dashboard=doc.createElement('main');dashboard.setAttribute('id','dashboard');dashboard.appendChild(root);doc.body.appendChild(dashboard);
 const events=new Map(),win={navigator:{get onLine(){return networkOnline;}},addEventListener:(t,f)=>{if(!events.has(t))events.set(t,new Set());events.get(t).add(f);},removeEventListener:(t,f)=>events.get(t)?.delete(f)};
 const emitWindow=t=>{for(const f of events.get(t)||[])f();};
 let ui;
 function mount(){ui=mountSyncPanel(root,{getState:()=>structuredClone(state),replaceLocal:s=>{if(replaceFailure)throw Error('replace-failure');replaced++;state=structuredClone(s);return structuredClone(state);},
  afterReplace:()=>{afterCalls++;},writeAllowed:()=>allowed,validateState:s=>{if(!s?.config||!Array.isArray(s.scenarios))throw Error('不正な架空データです。');},
  storage,createStore:async()=>{providerCalls++;return provider;},windowRef:win,documentRef:doc,
  schedule:(f,ms)=>{if(ms!==30000)throw Error('unexpected interval');timers.add(f);return f;},unschedule:f=>timers.delete(f)});return ui.ready;}
 const input=name=>walk(root).find(n=>n.name===name);
 const button=n=>walk(root).find(e=>e.getAttribute('data-sync-action')===String(n));
 const idle=async()=>{const end=Date.now()+10000;while(ui.getState().working){if(Date.now()>end)throw Error('UI timeout');await new Promise(r=>setTimeout(r,3));}};
 const click=async(n,{force=false}={})=>{const b=button(n);if(b.disabled&&!force)throw Error('disabled action '+n);if(n===1)await doc.getElementById('lifeplanCloudUnlock').emit('submit');else await b.emit('click');await idle();};
 const unlock=async(wrong=false)=>{if(!doc.getElementById('lifeplanCloudLogin').hidden){input('syncEmail').value='fixture@example.test';input('syncPassword').value='fixture-login-password';}input('syncPhrase').value=wrong?'wrong fixture phrase':phrase;await click(1);};
 await mount();
 return {doc,root,phrase,ui:()=>ui,input,button,idle,click,unlock,data,storage,
  manual:()=>walk(root).find(n=>n.getAttribute('aria-label')==='直前のボタン操作の結果').children.find(n=>n.getAttribute('class')==='cloud-result').textContent,
  status:()=>walk(root).find(n=>n.getAttribute('class')==='cloud-status').textContent,
  auto:()=>walk(root).find(n=>n.tagName==='details'&&n.children[0]?.textContent==='直近の自動処理・ログイン確認').textContent,
  counters:()=>({providerCalls,reads,writes,replaced,signIns,timers:timers.size,listeners:watchers.size,afterCalls}),
  snapshot:()=>({state:structuredClone(state),cloud:structuredClone(cloud),storage:[...data],ui:ui.getState()}),
  backup:async()=>{input('syncBackupConfirmed').checked=true;await input('syncBackupConfirmed').emit('change');},
  advance:async()=>{for(const f of timers)f();await idle();},
  edit:async(text,notify=true)=>{state.config.fixtureEdit=text;if(notify)ui.onLocalChange();await idle();},
  remoteEdit:async(text)=>{const next=structuredClone(state);next.config.fixtureEdit=text;cloud=await encode(next,(cloud?.revision||0)+1);},
  restoreBarrier:()=>ui.noteExternalRestore(),failReads:v=>{failRead=v;},failWrites:v=>{failWrite=v;},failSignOut:v=>{signOutFailure=v;},failReplace:v=>{replaceFailure=v;},failStorage:k=>{storageFail=k;},forbidWrites:()=>{allowed=false;},
  expire:other=>{authIdentity=other?{...identity,uid:'fictional-other'}:null;for(const f of watchers)f(authIdentity);},
  offline:()=>{networkOnline=false;emitWindow('offline');},online:async()=>{networkOnline=true;emitWindow('online');await idle();},
  blockReads:()=>{readDelay=new Promise(r=>releaseRead=r);},releaseRead:()=>{readDelay=null;releaseRead();},
  dirty:()=>doc.emit('input',{target:{closest:selector=>selector==='#dashboard'?dashboard:null}}),
  remount:async()=>{ui.destroy();await mount();},destroy:()=>ui.destroy(),
  removeCloud:()=>{cloud=null;},corruptCloud:()=>{cloud.ciphertext.data='invalid';},
  html:()=>root.outerHTML
 };
}
