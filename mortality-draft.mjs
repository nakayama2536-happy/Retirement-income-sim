/** Isolated, unadopted comparison-input cache. It never alters plan storage. */
const KEY='lifeplan-mortality-input-draft-v1';
const allowed=['deceased','deathMonth','survivorPension','preClaimPension','funeral',
  'deceasedEarnings','survivorEmployee','survivorBasic','sourceProfile','residualFactor'];
function signature(config){
  const str=JSON.stringify(config??null);let h=2166136261;
  for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619);}
  return (h>>>0).toString(16);
}
export function readMortalityDraft(config){
  try{
    if(!config||!globalThis.localStorage)return null;
    const blob=JSON.parse(localStorage.getItem(KEY)||'null');
    if(blob?.version!==1||blob.context!==signature(config)||!blob.values||typeof blob.values!=='object')return null;
    const values=Object.fromEntries(allowed.filter(k=>typeof blob.values[k]==='string').map(k=>[k,blob.values[k]]));
    const factors=blob.factors&&typeof blob.factors==='object'&&!Array.isArray(blob.factors)?
      Object.fromEntries(Object.entries(blob.factors).filter(([k,v])=>typeof k==='string'&&k.length<256&&typeof v==='string'&&v.length<64)):{};
    return {values,factors};
  }catch{return null;}
}
export function saveMortalityDraft(config,values,factors={}){
  try{
    if(!config||!globalThis.localStorage)return false;
    const clean=Object.fromEntries(allowed.filter(k=>typeof values?.[k]==='string').map(k=>[k,values[k]]));
    const safe=Object.fromEntries(Object.entries(factors).filter(([k,v])=>typeof k==='string'&&k.length<256&&typeof v==='string'&&v.length<64));
    localStorage.setItem(KEY,JSON.stringify({version:1,context:signature(config),values:clean,factors:safe}));
    return true;
  }catch{return false;}
}
export function clearMortalityDraft(){
  try{globalThis.localStorage?.removeItem(KEY);return true;}catch{return false;}
}
