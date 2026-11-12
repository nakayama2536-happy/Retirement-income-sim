/** Minimum comparison input snapshots stored inside the ONE integrated backup/sync state.
 * Never stores calculated tables, passwords, Firebase keys, or UI-only transient output.
 * Legacy standalone drafts are read-only sources for an older device's first transfer.
 */
export const INPUT_SNAPSHOT_VERSION=1;
const keys=['mortality','salary','pension'];
const legacy={mortality:'lifeplan-mortality-input-draft-v1',salary:'lifeplan-sim-salary-draft-v1',pension:'lifeplan-sim-pension-draft-v0.9'};
const mortalityFields=['deceased','deathMonth','survivorPension','preClaimPension','funeral','deceasedEarnings','survivorEmployee','survivorBasic','sourceProfile','residualFactor'];
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const has=(x,k)=>Object.prototype.hasOwnProperty.call(x??{},k);
const maxBytes=120_000;
const safeValue=(v,label)=>{if(!object(v))throw Error(label+'の入力保存形式が不正です');if(JSON.stringify(v).length>maxBytes)throw Error(label+'の入力データが大きすぎます');return structuredClone(v);};
export function validateInputSnapshots(payload){
 if(payload==null)return null;
 if(!object(payload)||payload.version!==1||Object.keys(payload).some(k=>k!=='version'&&!keys.includes(k)))throw Error('比較入力スナップショットの形式・版が不正です');
 for(const key of keys){
  if(!has(payload,key)||payload[key]===null)continue;
  const x=safeValue(payload[key],key);
  if(typeof x.context!=='string'||!x.context||x.context.length>50_000)throw Error(key+'の照合情報が不正です');
  if(key==='mortality'){
   if(x.version!==1||!object(x.values)||!object(x.factors)||Object.keys(x).some(k=>!['version','context','values','factors'].includes(k)))throw Error('万一の入力形式が不正です');
   if(Object.keys(x.values).some(k=>!mortalityFields.includes(k)||typeof x.values[k]!=='string'||x.values[k].length>256))throw Error('万一の入力パラメータが不正です');
   if(Object.keys(x.factors).length>300||Object.entries(x.factors).some(([k,v])=>k.length>256||typeof v!=='string'||v.length>64))throw Error('万一の費目倍率が不正です');
  }else if(!object(x.draft)||Object.keys(x).some(k=>!['context','draft'].includes(k)))throw Error(key+'の下書き構造が不正です');
 }
 return payload;
}
export function setInputSnapshot(state,key,entry){
 if(!keys.includes(key))throw Error('未対応の比較入力です');
 const savedInputs={...structuredClone(state.savedInputs??{version:1}),version:1,[key]:entry===null?null:structuredClone(entry)};
 validateInputSnapshots(savedInputs);
 return {...state,savedInputs};
}
export function getInputSnapshot(state,key){
 if(!keys.includes(key))throw Error('未対応の比較入力です');
 validateInputSnapshots(state?.savedInputs);
 return state?.savedInputs?.[key]??null;
}
function parseLegacy(store,key){
 const raw=store?.getItem(legacy[key]);if(raw===null||raw===undefined)return null;
 let data;try{data=JSON.parse(raw);}catch{throw Error(key+'の旧下書きJSONが破損しています。入力の保護を優先し、一括転送を停止しました');}
 if(key==='mortality'){
  if(data?.version!==1||typeof data.context!=='string'||!object(data.values)||!object(data.factors))throw Error('万一の旧下書き形式が不正です');
  data={version:1,context:data.context,values:Object.fromEntries(Object.entries(data.values).filter(([k,v])=>mortalityFields.includes(k)&&typeof v==='string')),
   factors:Object.fromEntries(Object.entries(data.factors).filter(([k,v])=>k.length<=256&&typeof v==='string'&&v.length<=64))};
 }else if(!object(data)||typeof data.context!=='string'||!object(data.draft))throw Error(key+'の旧下書き形式が不正です');
 return data;
}
/** Pure/read-only materialization. The actual integrated state is never changed here. */
export function stateForFullTransfer(state,store){
 if(!object(state)||!state.config||!Array.isArray(state.scenarios))return state;
 if(has(state,'savedInputs')){validateInputSnapshots(state.savedInputs);return state;}
 const draft={version:1};let found=false;
 for(const key of keys){const value=parseLegacy(store,key);if(value!==null){draft[key]=value;found=true;}}
 if(!found)return state;
 validateInputSnapshots(draft);
 return {...state,savedInputs:draft};
}
