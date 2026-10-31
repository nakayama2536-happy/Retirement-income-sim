// Compatibility is evaluated before normalization, calculation or any write.
export const APP_BUILD='v0.9.16-missing-id-guidance-20261031';
export const CURRENT_FEATURES=['salary-net-transfer-v1','anchored-months-v1','expense-adoption-v1','income-adoption-v1','nisa-withdrawal-reference-v1','nisa-budget-shortfall-v1','unemployment-receipt-plan-v1','price-base-month-v1','opening-balance-prior-month-close-v1','ideco-received-lump-scope-v1','ideco-annuity-start-month-v1','full-plan-comparison-saved-v1','pension-breakdown-reference-v1'];
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const has=(o,key)=>Object.prototype.hasOwnProperty.call(o??{},key);
const validMonth=v=>typeof v==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(v);
function requiredFeatures(value){
 const configs=value.config?[value.config,...(Array.isArray(value.scenarios)?value.scenarios.map(s=>s?.config):[])]:[value];
 const features=new Set();
 for(const c of configs){
  if(c?.unemployment?.receiptPlan!=null){if(c.unemployment.receiptPlan.version!==1)throw new Error("未対応の失業給付形式です。");features.add("unemployment-receipt-plan-v1");}
  if(c?.nisa?.withdrawal!=null){if(c.nisa.withdrawal.version!==1)throw new Error('未対応のNISA取り崩し形式です。');features.add('nisa-withdrawal-reference-v1');if(c.nisa.withdrawal.mode==='budget')features.add('nisa-budget-shortfall-v1');}
  if(c?.cashflow?.salaryLife?.mode==='net-transfer-v1')features.add('salary-net-transfer-v1');
  else if(c?.cashflow?.salaryLife?.mode && c.cashflow.salaryLife.mode!=='legacy')throw new Error('未対応の給与生活方式です。');
  if(c?.plan?.calendarMode==='anchored-months-v1')features.add('anchored-months-v1');
  else if(c?.plan?.calendarMode && c.plan.calendarMode!=='legacy')throw new Error('未対応の期間方式です。');
  // Optional fields from steps 5–7 change calculation semantics; old builds must reject them.
  // Presence, even with null/empty data, is never silently treated as legacy omission.
  if(has(c?.plan,'priceBaseMonth')){
   if(!validMonth(c.plan.priceBaseMonth))throw new Error('物価基準月の保存形式が不正です。');
   features.add('price-base-month-v1');
  }
  if(has(c?.plan,'openingBalance')){
   const o=c.plan.openingBalance;
   if(!object(o)||o.mode!=='prior-month-close-v1'||!validMonth(o.asOfMonth)||!validMonth(o.startMonth)||typeof o.amount!=='number'||!Number.isFinite(o.amount)||o.amount<0||o.confirmed!==true)throw new Error('開始残高接続の保存形式が不正です。');
   features.add('opening-balance-prior-month-close-v1');
  }
  if(has(c?.plan,'idecoAssetScope')){
   if(c.plan.idecoAssetScope!=='received-lump-only-v1'||has(c.plan,'initialAssetIncludesIdeco'))throw new Error('iDeCo開始資産範囲の保存形式が不正です。');
   features.add('ideco-received-lump-scope-v1');
  }
  if(has(c?.ideco,'annuityStartMonth')){
   if(!validMonth(c.ideco.annuityStartMonth))throw new Error('iDeCo年金初回月の保存形式が不正です。');
   features.add('ideco-annuity-start-month-v1');
  }
  for(const key of ['primary','spouse']){
    const p=c?.income?.pensions?.[key];
    if(!p)continue;
    if(has(p,'breakdownAtStart')||has(p,'survivorReference')||has(p,'reference65')){
      if(has(p,'breakdownAtStart')&&!object(p.breakdownAtStart))throw new Error('年金内訳の保存形式が不正です。');
      if(has(p,'survivorReference')&&!object(p.survivorReference))throw new Error('遺族年金参考情報の形式が不正です。');
      if(has(p,'reference65')&&!object(p.reference65))throw new Error('65歳基準年金資料の形式が不正です。');
      features.add('pension-breakdown-reference-v1');
    }
  }
  if(c?.expenseWorkflow)features.add('expense-adoption-v1');
  if(c?.incomeWorkflow||c?.cashflow?.periodOverrides?.some(row=>row?.source==='income-adoption-v1'||row?.incomeAdoption))features.add('income-adoption-v1');
 }
 // Unknown comparison-plan versions are rejected before any write.
 for(const s of (Array.isArray(value.scenarios)?value.scenarios:[])){
  if(!has(s,'comparisonPlan'))continue;
  const meta=s.comparisonPlan;
  if(!object(meta)||meta.version!==1||meta.kind!=='full-plan-comparison-saved-v1'||
     typeof meta.baseFingerprint!=='string'||!/^[0-9a-f]{16}$/.test(meta.baseFingerprint)||
     !object(meta.inputs)||!object(meta.inputs.opening)||meta.inputs.opening.openingConfirmed!==false||
     !Array.isArray(meta.inputs.budgets)||!Array.isArray(meta.inputs.events)){
   throw new Error('未対応または破損した比較案の保存形式です。');
  }
  features.add('full-plan-comparison-saved-v1');
 }
 return [...features];
}
export function inspectBackupCompatibility(value,{appBuild=APP_BUILD,features=CURRENT_FEATURES}={}){
 try{
  if(!object(value))throw new Error('JSONの形式が不正です。');
  // Schema versions are semantic contracts, never opaque annotations.
  for(const version of [value.schemaVersion,value.meta?.schemaVersion,value.config?.meta?.schemaVersion,...(value.scenarios||[]).map(s=>s?.config?.meta?.schemaVersion)]){
   if(version!=null && !['0.2','0.3','0.4','0.5','0.6','0.7','0.8','0.9'].includes(String(version)))throw new Error(`未対応の保存形式 ${version} です。`);
  }
  const contract=value.recoveryCompatibility;
  if(contract!=null){
   if(!object(contract)||contract.protocol!==1||!Array.isArray(contract.requiredFeatures)||!contract.requiredFeatures.every(x=>typeof x==='string')||typeof contract.producerBuild!=='string'||!contract.producerBuild.trim())throw new Error('未対応または破損したバックアップ互換情報です。');
  }
  const required=[...new Set([...requiredFeatures(value),...(contract?.requiredFeatures||[])])];
  const missing=required.filter(f=>!features.includes(f));
  if(missing.length)throw new Error(`必要な機能：${missing.join('、')}`);
  return {compatible:true,appBuild,requiredFeatures:required,producerBuild:contract?.producerBuild||'旧形式・出力版未記録'};
 }catch(error){return {compatible:false,appBuild,message:`このアプリ版（${appBuild}）では読み込めません。${error.message} 対応するアプリ版が必要です。読み込み前のデータは変更されていません。旧本体への復旧には、その旧版で更新前に出力したバックアップを使用してください。`};}
}
export function assertBackupCompatibility(value,options){const result=inspectBackupCompatibility(value,options);if(!result.compatible)throw new Error(result.message);return result;}
export function recoveryPair(backup,target){
 const check=inspectBackupCompatibility(backup,target);
 return {...check,action:check.compatible?'この組合せを全体検証してから明示復元':'復元停止。対応版で開くか、旧版と更新前バックアップの組を選ぶ'};
}

// New calculation fields saved through any local write need a backward-compatibility
// marker, not only when explicitly exporting a backup. Legacy saves stay byte-compatible.
export function protectNewFeatureState(state){
 const check=assertBackupCompatibility(state);
 const newRequired=check.requiredFeatures.some(f=>[
  'price-base-month-v1','opening-balance-prior-month-close-v1',
  'ideco-received-lump-scope-v1','ideco-annuity-start-month-v1','full-plan-comparison-saved-v1'].includes(f));
 if(!newRequired)return state;
 return {...state,recoveryCompatibility:{...state.recoveryCompatibility,protocol:1,producerBuild:APP_BUILD,requiredFeatures:check.requiredFeatures}};
}

export function createConfigBackup(config){
 const check=assertBackupCompatibility(config);
 return {...structuredClone(config),recoveryCompatibility:{...config.recoveryCompatibility,protocol:1,producerBuild:APP_BUILD,requiredFeatures:check.requiredFeatures}};
}
