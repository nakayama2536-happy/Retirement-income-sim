// Compatibility is evaluated before normalization, calculation or any write.
export const APP_BUILD='v0.9.7-i08-recovery-1';
export const CURRENT_FEATURES=['salary-net-transfer-v1','anchored-months-v1','expense-adoption-v1','income-adoption-v1'];
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function requiredFeatures(value){
 const configs=value.config?[value.config,...(Array.isArray(value.scenarios)?value.scenarios.map(s=>s?.config):[])]:[value];
 const features=new Set();
 for(const c of configs){
  if(c?.cashflow?.salaryLife?.mode==='net-transfer-v1')features.add('salary-net-transfer-v1');
  else if(c?.cashflow?.salaryLife?.mode && c.cashflow.salaryLife.mode!=='legacy')throw new Error('未対応の給与生活方式です。');
  if(c?.plan?.calendarMode==='anchored-months-v1')features.add('anchored-months-v1');
  else if(c?.plan?.calendarMode && c.plan.calendarMode!=='legacy')throw new Error('未対応の期間方式です。');
  if(c?.expenseWorkflow)features.add('expense-adoption-v1');
  if(c?.incomeWorkflow||c?.cashflow?.periodOverrides?.some(row=>row?.source==='income-adoption-v1'||row?.incomeAdoption))features.add('income-adoption-v1');
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
