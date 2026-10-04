import {commitPlanState} from './state.mjs';
import {replaceState} from './storage.mjs';
import {assertBackupCompatibility,APP_BUILD} from './backup-compatibility.mjs';
import {validateSavedState} from './migration.mjs';

export function isFullBackup(value){return !!value&&typeof value==='object'&&!Array.isArray(value)&&!!value.config&&Array.isArray(value.scenarios);}
export function createFullBackup(state,{now=new Date()}={}){
 if(!isFullBackup(state))throw new Error('統合状態の形式を確認してください。');
 const compatibility=assertBackupCompatibility(state);validateSavedState(state);
 const out=structuredClone(state);
 out.schemaVersion ??= '0.9';
 out.recoveryCompatibility={...out.recoveryCompatibility,protocol:1,producerBuild:APP_BUILD,requiredFeatures:compatibility.requiredFeatures};
 out.exportedAt=now.toISOString();
 return out;
}
export function restoreFullBackup(current,backup,{commit=commitPlanState,save=replaceState}={}){
 assertBackupCompatibility(backup);validateSavedState(backup);
 if(!isFullBackup(backup))throw new Error('設定とシナリオを含む一括バックアップではありません。');
 const candidate=structuredClone(backup);
 return commit(current,candidate,save,{preserveScenarioRoles:true,replaceEnvelope:true});
}
