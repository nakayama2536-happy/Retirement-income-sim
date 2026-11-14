// One editing owner per origin, across Safari tabs / supported browser contexts.
// No localStorage spin-lock: it cannot provide atomic mutual exclusion.
// The public lease reflects the CURRENT Web Lock, not only the startup result.
let allowed=typeof window==='undefined';
export function assertWriteAccess(){
 if(!allowed)throw new Error('別画面が編集中、または安全な同時更新制御を利用できません。現在の画面は読み取り専用です。編集画面を閉じ、再読み込みしてください。');
}
export async function acquireWriteAccess({locks=globalThis.navigator?.locks,target=globalThis.window,documentRef=globalThis.document}={}){
 allowed=false;
 let writable=false,reason='initializing',pageHidden=false,releaseHeld=null,requestTask=null,pending=null;
 const subscribers=new Set();
 const lease={
  get writable(){return writable&&allowed;},get reason(){return reason;},
  subscribe(fn){if(typeof fn!=='function')throw TypeError('listener');subscribers.add(fn);return()=>subscribers.delete(fn);}
 };
 const notify=()=>{for(const fn of subscribers){try{fn(lease);}catch{}}};
 const acquire=async()=>{
  if(lease.writable)return true;
  if(pending)return pending;
  if(!locks?.request){reason='lock-unavailable';notify();return false;}
  pending=(async()=>{
   // A prior pagehide may have released our callback while the browser is
   // still settling its request promise. Do not race a second exclusive claim.
   if(requestTask)await requestTask.catch(()=>{});
   if(pageHidden){reason='page-hidden';notify();return false;}
   let resolveReady;
   const ready=new Promise(resolve=>{resolveReady=resolve;});
   requestTask=Promise.resolve().then(()=>locks.request('lifeplan-sim-edit-owner',
    {mode:'exclusive',ifAvailable:true},async lock=>{
     if(!lock){reason='other-screen';notify();resolveReady(false);return;}
     if(pageHidden){reason='page-hidden';notify();resolveReady(false);return;}
     writable=true;allowed=true;reason='exclusive-owner';notify();
     await new Promise(release=>{
      releaseHeld=()=>{
       writable=false;allowed=false;reason='released';releaseHeld=null;notify();release();
      };
      resolveReady(true);
     });
    })).catch(()=>{writable=false;allowed=false;reason='lock-failed';notify();resolveReady(false);});
   return ready;
  })().finally(()=>{pending=null;});
  return pending;
 };
 const resume=async()=>{
  if(pageHidden||documentRef?.visibilityState==='hidden')return;
  if(pending)await pending;
  if(!pageHidden&&!lease.writable)await acquire();
 };
 target?.addEventListener?.('pagehide',()=>{
  pageHidden=true;
  if(releaseHeld)releaseHeld();
  else {writable=false;allowed=false;reason='page-hidden';notify();}
 });
 target?.addEventListener?.('pageshow',()=>{
  pageHidden=false;
  if(documentRef?.visibilityState!=='hidden')void resume();
 });
 documentRef?.addEventListener?.('visibilitychange',()=>{
  if(documentRef.visibilityState==='hidden'){
   pageHidden=true;
   if(releaseHeld)releaseHeld();
   else {writable=false;allowed=false;reason='page-hidden';notify();}
  }else if(documentRef.visibilityState==='visible'){pageHidden=false;void resume();}
 });
 await acquire();
 return lease;
}
