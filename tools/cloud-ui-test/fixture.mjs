// Isolated synthetic fixture. No real SDK or external request is used.
import {mountSyncPanel,SYNC_PUBLIC_CONFIG_KEY,SYNC_MARKER_KEY,SYNC_AUTO_RESUME_KEY,SYNC_REVIEW_KEY} from '../../sync-panel.mjs';
import {encryptSnapshot,snapshotDigest} from '../../sync-crypto.mjs';
const phrase='fixture encryption phrase for UI';
const identity={uid:'fictional-owner',projectId:'fictional-project'};
const cfg={apiKey:'fixture-public-key',authDomain:'fixture.example.test',projectId:identity.projectId,appId:'1:0:web:fixture'};
const start=()=>({config:{plan:{startDate:'2042-01-15',initialAsset:1200}},scenarios:[],opaque:{keep:'fixture'}});
let state=start(),cloud=null,authIdentity={...identity},providerCalls=0,reads=0,writes=0,replaced=0,signIns=0,failRead=false,failWrite=false,signOutFailure=false,replaceFailure=false,storageFail=null;
let timers=new Set(),listeners=new Set(),networkOnline=true,readDelay=null;
const data=new Map(),storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>{if(storageFail===k)throw Error('storage-write-failure');data.set(k,String(v));},removeItem:k=>data.delete(k)};
const mode=new URLSearchParams(location.search).get('mode')||'returning';
async function encode(s,revision=1){const e=await encryptSnapshot(s,phrase);return {formatVersion:1,revision,digest:e.digest,ciphertext:e.payload};}
if(mode!=='fresh')cloud=await encode(state);
if(mode!=='fresh'&&mode!=='newdevice'){
 data.set(SYNC_MARKER_KEY,JSON.stringify({version:1,...identity,baseRevision:1,baseRemoteDigest:cloud.digest,baseLocalDigest:await snapshotDigest(state),enabled:true,backupConfirmed:true}));
}
data.set(SYNC_PUBLIC_CONFIG_KEY,JSON.stringify(cfg));
if(mode==='expired')authIdentity=null;
if(mode==='mismatch')authIdentity={...identity,uid:'fictional-other'};
if(mode==='stopped')data.set(SYNC_AUTO_RESUME_KEY,'stopped');
if(mode==='corrupt')data.set(SYNC_MARKER_KEY,'{invalid');
if(mode==='newdevice')state.config.plan.initialAsset=900;
if(mode==='localupdate'||mode==='conflict')state.config.fixtureEdit='local';
if(mode==='remoteupdate'||mode==='conflict'){const next=start();next.config.fixtureEdit='remote';cloud=await encode(next,2);}
if(mode==='fresh')authIdentity=null;
const provider={
 getSessionIdentity:()=>structuredClone(authIdentity),
 getIdentity:()=>{if(!authIdentity)throw Error('本人認証が必要です。');return structuredClone(authIdentity);},
 signIn:async(email,password)=>{signIns++;if(!authIdentity){if(!email||!password)throw Error('ログイン情報が必要です。');authIdentity={...identity};for(const f of listeners)f(authIdentity);}return authIdentity;},
 watchSession:fn=>{listeners.add(fn);fn(authIdentity);return()=>listeners.delete(fn);},
 signOut:async()=>{if(signOutFailure)throw Error('signout-unavailable');authIdentity=null;for(const f of listeners)f(null);},
 read:async()=>{reads++;if(readDelay)await readDelay;if(failRead||!networkOnline)throw Object.assign(Error('fixture network'),{code:'unavailable'});return structuredClone(cloud);},
 compareAndSwap:async(e,n)=>{if(failWrite)throw Object.assign(Error('fixture network'),{code:'unavailable'});if((cloud?.revision??0)!==e.revision||(cloud?.digest??null)!==e.digest)throw Error('fixture-cas-conflict');writes++;cloud=structuredClone(n);return structuredClone(cloud);}
};
const windowRef={navigator:{get onLine(){return networkOnline;}},addEventListener:(...a)=>window.addEventListener(...a),removeEventListener:(...a)=>window.removeEventListener(...a)};
let ui;
function mount(){ui=mountSyncPanel(document.getElementById('privateSyncContainer'),{
 getState:()=>structuredClone(state),replaceLocal:s=>{if(replaceFailure)throw Error('replace-failure');replaced++;state=structuredClone(s);return structuredClone(state);},validateState:s=>{if(!s?.config||!Array.isArray(s.scenarios))throw Error('不正な架空データです。');},
 storage,createStore:async()=>{providerCalls++;return provider;},windowRef,documentRef:document,
 schedule:(fn,ms)=>{if(ms!==30000)throw Error('unexpected interval');timers.add(fn);return fn;},unschedule:fn=>timers.delete(fn)
});return ui.ready;}
await mount();
window.fixture={phrase,cfg,async remount(){ui.destroy();await mount();},get ui(){return ui;},
 counters:()=>({providerCalls,reads,writes,replaced,signIns,timers:timers.size,listeners:listeners.size}),
 snapshot:()=>({state:structuredClone(state),cloud:structuredClone(cloud),storage:[...data],ui:ui.getState()}),
 advance:()=>{for(const f of timers)f();},
 edit:(text,notify=true)=>{state.config.fixtureEdit=text;if(notify)ui.onLocalChange();},
 async remoteEdit(text){const next=structuredClone(state);next.config.fixtureEdit=text;cloud=await encode(next,(cloud?.revision||0)+1);},
 restoreBarrier:()=>ui.noteExternalRestore(),failReads:v=>{failRead=v;},failWrites:v=>{failWrite=v;},failSignOut:v=>{signOutFailure=v;},failReplace:v=>{replaceFailure=v;},failStorage:k=>{storageFail=k;},
 changeAuth:(valid)=>{authIdentity=valid?{...identity,uid:'fictional-other'}:null;for(const f of listeners)f(authIdentity);},
 offline:()=>{networkOnline=false;window.dispatchEvent(new Event('offline'));},online:()=>{networkOnline=true;window.dispatchEvent(new Event('online'));},
 blockReads:()=>{let resolve;readDelay=new Promise(r=>resolve=r);window.releaseFixtureRead=()=>{readDelay=null;resolve();};},
 notifyExternalEdit:()=>{const n=document.getElementById('externalEdit');n.dispatchEvent(new Event('input',{bubbles:true}));},
 destroy:()=>ui.destroy()
};
