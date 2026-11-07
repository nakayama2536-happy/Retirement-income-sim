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
 // Migrate the adopted baseline AND every independently saved legacy snapshot.
 // All changes remain in memory until all checks succeed; no partial commits.
 const snapshots=[];
 for(let i=0;i<before.scenarios.length;i++){
  const scenario=before.scenarios[i],snap=scenario?.config;
  if(!object(snap))return {...blocked('SCENARIO_INVALID'),scenarioIndex:i};
  if(snap.expenseUnificationArchive||snap.expenseUnificationCandidate)return {...blocked('SCENARIO_ALREADY_MIGRATED'),scenarioIndex:i};
  const categories=snap.cashflow?.expenseCategories;
  const legacy=Array.isArray(categories)&&categories.length>0;
  if(!legacy){
   if(snap.cashflow?.detailSourceProfile==='public-v0.9')return {...blocked('SCENARIO_LEGACY_SOURCE_INCOMPLETE'),scenarioIndex:i};
   continue;
  }
  const outcome=buildExpenseUnificationAdoption(snap);
  if(outcome.status!=='adoption-proposal-only')
   return {...blocked('SCENARIO_MIGRATION_BLOCKED'),scenarioIndex:i,codes:outcome.codes||[],detail:outcome.reason||null};
  snapshots.push({index:i,id:scenario.id??null,config:outcome.config});
 }
 const r=buildExpenseUnificationAdoption(before.config);
 if(r.status!=='adoption-proposal-only')return {...blocked(r.reason||'SOURCE_NOT_ELIGIBLE'),codes:r.codes||[]};
 const candidate={...before,config:r.config};
 if(snapshots.length){
  for(const entry of snapshots)candidate.scenarios[entry.index].config=entry.config;
  candidate.expenseUnificationScenarioJournal={
   format:'legacy-expense-scenarios-v1',
   entries:snapshots.map(({index,id})=>({index,id}))
  };
 }
 try{validate(candidate)}catch{return blocked('TARGET_VALIDATION_FAILED')}
 if(!same(before,input)||candidate.scenarios.length!==input.scenarios.length)return blocked('SOURCE_CHANGED');
 return {status:'prepared',saved:false,candidate,proof:{...r.proof,convertedScenarios:snapshots.length},requiresFeature:REQUIRED_FEATURE};
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
 const journal=before.expenseUnificationScenarioJournal;
 const reversions=[];
 if(journal!==undefined){
  if(!object(journal)||journal.format!=='legacy-expense-scenarios-v1'||!Array.isArray(journal.entries))return blocked('SCENARIO_JOURNAL_INVALID');
  const seen=new Set();
  for(const entry of journal.entries){
   const idx=entry?.index,scenario=before.scenarios[idx];
   if(!Number.isInteger(idx)||idx<0||seen.has(idx)||!scenario||scenario.id!==entry.id)return blocked('SCENARIO_ID_CHANGED');
   seen.add(idx);
   const reverted=undoExpenseUnificationAdoption(scenario.config);
   if(reverted.status!=='undo-proposal-only')return {...blocked('SCENARIO_MIGRATED_FIELDS_CHANGED'),scenarioIndex:idx};
   reversions.push({index:idx,config:reverted.config});
  }
 }
 const undone=undoExpenseUnificationAdoption(before.config);
 if(undone.status!=='undo-proposal-only')return blocked(undone.reason||'CANNOT_UNDO');
 const next={...copy(before),config:undone.config};
 for(const entry of reversions)next.scenarios[entry.index].config=entry.config;
 delete next.expenseUnificationScenarioJournal;
 try{if(typeof validate!=='function')throw Error('validator');validate(next)}catch{return blocked('RESTORED_STATE_INVALID')}
 if(store.getItem(key)!==expectedRaw)return blocked('STALE_BEFORE_UNDO');
 const encoded=JSON.stringify(next);
 try{store.setItem(key,encoded)}catch{return blocked('WRITE_FAILED')}
 if(store.getItem(key)!==encoded)return {status:'write-unconfirmed',saved:false,reason:'READBACK_MISMATCH',requiresRecovery:true};
 return {status:'undone',saved:true};
}
