// One editing owner per origin, across Safari tabs / supported browser contexts.
// No localStorage spin-lock: it cannot provide atomic mutual exclusion.
let allowed=typeof window==='undefined';
export function assertWriteAccess(){if(!allowed)throw new Error('別画面が編集中、または安全な同時更新制御を利用できません。現在の画面は読み取り専用です。編集画面を閉じ、再読み込みしてください。');}
export async function acquireWriteAccess({locks=globalThis.navigator?.locks,target=globalThis.window}={}){
 allowed=false;
 if(!locks?.request)return {writable:false,reason:'lock-unavailable'};
 return new Promise(resolve=>{
  locks.request('lifeplan-sim-edit-owner',{mode:'exclusive',ifAvailable:true},async lock=>{
   if(!lock){resolve({writable:false,reason:'other-screen'});return;}
   allowed=true;
   await new Promise(release=>{
    target?.addEventListener('pagehide',()=>{allowed=false;release();},{once:true});
    resolve({writable:true,reason:'exclusive-owner'});
   });
  }).catch(()=>{allowed=false;resolve({writable:false,reason:'lock-failed'});});
 });
}
