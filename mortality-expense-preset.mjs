/** Read-only suggested multipliers stored with the user's private settings.
 * This module never writes to cloud, local storage or adopted cashflow.
 * Monetary values and user identifiers must not be embedded in this module.
 */
const PROFILES=new Set(['public-v0.9','work-v0.9.7']);
export function readMortalityExpensePreset(config){
  const p=config?.mortalityExpensePreset;
  if(p==null)return null;
  if(p.version!==1||!PROFILES.has(p.sourceProfile)||p.deceased!=='primary'||!p.factorsByItemKey||typeof p.factorsByItemKey!=='object'||Array.isArray(p.factorsByItemKey))
    throw new Error('万一の費目別倍率の保存形式を確認してください。元の設定は変更しません。');
  for(const value of Object.values(p.factorsByItemKey))
    if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>3)
      throw new Error('万一の費目別倍率が不正です。数値を自動補正しません。');
  if(typeof p.unallocatedFactor!=='number'||!Number.isFinite(p.unallocatedFactor)||p.unallocatedFactor<0||p.unallocatedFactor>3)
    throw new Error('未照合予算残額の倍率が不正です。');
  return p;
}
export function mortalityFactorForItem(preset,itemId){
  if(!preset)return 1;
  const match=String(itemId).match(/(?:^|\\/)key:([^/]+)$/);
  if(!match)return 1;
  let key;
  try{key=decodeURIComponent(match[1]);}catch{return 1;}
  const value=preset.factorsByItemKey[key];
  return value===undefined?1:value;
}
