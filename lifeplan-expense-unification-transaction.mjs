/** Draft-only persistence adapter. Not mounted in published UI.
 * Explicit injected storage and validated backup receipt are mandatory.
 * One complete-state write only, after revalidation and source re-read.
 */
import {buildExpenseUnificationAdoption,undoExpenseUnificationAdoption,REQUIRED_FEATURE} from './lifeplan-expense-unification-adoption.mjs';
const copy=x=>structuredClone(x);
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const state=x=>object(x)&&object(x.config)&&Array.isArray(x.scenarios);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const blocked=reason=>({status:'blocked',reason,saved:false});

export function prepareUnificationState(input,{validate}={}){
 if(!state(input))return blocked('INVALID_STATE');
 if(typeof validate!=='function')return blocked('TARGET_VALIDATOR_MISSING');
 const before=copy(input);
 // Saved comparisons may carry independent legacy expense readers. Converting
 // only the active baseline would leave a mixed-format project after adoption.
 // Never rewrite scenario snapshots implicitly, nor claim global unification.
 for(let i=0;i<before.scenarios.length;i++){
  const snap=before.scenarios[i]?.config;
  if(!object(snap))continue;
  const expense=snap.cashflow?.expenseCategories;
  if((Array.isArray(expense)&&expense.length>0)
      ||snap.cashflow?.detailSourceProfile==='public-v0.9'
      ||object(snap.expenseUnificationCandidate)
      ||object(snap.expenseUnificationArchive))
   return {...blocked('SAVED_SCENARIO_REQUIRES_SEPARATE_MIGRATION'),scenarioIndex:i};
 }
 const r=buildExpenseUnificationAdoption(before.config);
 if(r.status!=='adoption-proposal-only')return {...blocked(r.reason||'SOURCE_NOT_ELIGIBLE'),codes:r.codes||[]};
 const candidate={...before,config:r.config};
 try{validate(candidate)}catch{return blocked('TARGET_VALIDATION_FAILED')}
 if(!same(before,input)||!same(candidate.scenarios,input.scenarios))return blocked('SOURCE_CHANGED');
 return {status:'prepared',saved:false,candidate,proof:r.proof,requiresFeature:REQUIRED_FEATURE};
}

export async function commitPreparedUnification({store,key,expectedRaw,prepared,validate,writeBackup,allowWrite=false}={}){
 if(!allowWrite)return blocked('WRITE_NOT_AUTHORIZED');
 if(!store||typeof store.getItem!=='function'||typeof store.setItem!=='function'||typeof key!=='string'||!key)return blocked('INVALID_STORAGE');
 if(typeof expectedRaw!=='string'||store.getItem(key)!==expectedRaw)return blocked('STALE_SOURCE');
 if(prepared?.status!=='prepared'||typeof validate!=='function'||typeof writeBackup!=='function')return blocked('UNVERIFIED_CANDIDATE');
 let before;
 try{before=JSON.parse(expectedRaw)}catch{return blocked('INVALID_JSON')}
 if(!state(before))return blocked('INVALID_STATE');
 const verified=prepareUnificationState(before,{validate});
 if(verified.status!=='prepared'||!same(verified.candidate,prepared.candidate))return blocked('CANDIDATE_CHANGED');
 const next=copy(verified.candidate);
 try{validate(next)}catch{return blocked('TARGET_VALIDATION_FAILED')}
 let receipt;
 try{receipt=await writeBackup(copy(before))}catch{return blocked('BACKUP_FAILED')}
 if(receipt?.secured!==true||typeof receipt.receipt!=='string'||!receipt.receipt.trim())return blocked('BACKUP_NOT_SECURED');
 if(store.getItem(key)!==expectedRaw)return blocked('STALE_AFTER_BACKUP');
 const encoded=JSON.stringify(next);
 try{store.setItem(key,encoded)}catch{return blocked('WRITE_FAILED')}
 if(store.getItem(key)!==encoded)return {status:'write-unconfirmed',saved:false,reason:'READBACK_MISMATCH',requiresRecovery:true};
 return {status:'saved',saved:true,backupSecured:true,requiredFeature:REQUIRED_FEATURE};
}

export function undoPreparedUnification({store,key,expectedRaw,validate,allowWrite=false}={}){
 if(!allowWrite)return blocked('WRITE_NOT_AUTHORIZED');
 if(!store||typeof store.getItem!=='function'||typeof store.setItem!=='function'||typeof key!=='string'||!key)return blocked('INVALID_STORAGE');
 if(typeof expectedRaw!=='string'||store.getItem(key)!==expectedRaw)return blocked('STALE_SOURCE');
 let before;
 try{before=JSON.parse(expectedRaw)}catch{return blocked('INVALID_JSON')}
 if(!state(before))return blocked('INVALID_STATE');
 const undone=undoExpenseUnificationAdoption(before.config);
 if(undone.status!=='undo-proposal-only')return blocked(undone.reason||'CANNOT_UNDO');
 const next={...copy(before),config:undone.config};
 try{if(typeof validate!=='function')throw Error('validator');validate(next)}catch{return blocked('RESTORED_STATE_INVALID')}
 if(store.getItem(key)!==expectedRaw)return blocked('STALE_BEFORE_UNDO');
 const encoded=JSON.stringify(next);
 try{store.setItem(key,encoded)}catch{return blocked('WRITE_FAILED')}
 if(store.getItem(key)!==encoded)return {status:'write-unconfirmed',saved:false,reason:'READBACK_MISMATCH',requiresRecovery:true};
 return {status:'undone',saved:true};
}
