import {recoveryPair,APP_BUILD,CURRENT_FEATURES} from './backup-compatibility.mjs';
import {validateSavedState} from './migration.mjs';
export const RECOVERY_TARGETS={current:{appBuild:APP_BUILD,features:CURRENT_FEATURES},'public-v0.9':{appBuild:'公開元v0.9（保存済み旧本体）',features:[]}};
export function checkRecoveryFile(value,target){
 const profile=RECOVERY_TARGETS[target];
 if(!profile)throw new Error('復旧先のアプリ版を選んでください。');
 const pair=recoveryPair(value,profile);
 if(!pair.compatible)return pair.message;
 validateSavedState(value);
 return `${profile.appBuild}との組合せは形式・必要機能の事前検証を通過しました。設定と比較案${value.scenarios.length}件を確認しました。この確認では保存データを変更していません。旧本体へ戻す場合は、その版で更新前に出力したバックアップを使用してください。実機での復旧成功は未確認です。`;
}
export function mountRecoveryCheck({document=globalThis.document}={}){
 const file=document.getElementById('recoveryCheckFile'),target=document.getElementById('recoveryTarget'),output=document.getElementById('recoveryCheckResult');
 let serial=0;
 const check=async()=>{
  const ticket=++serial,chosen=file.files?.[0],selected=target.value;
  if(!chosen){output.textContent='復旧先の版とバックアップを選択してください。保存は行いません。';return;}
  try{const value=JSON.parse(await chosen.text());const message=checkRecoveryFile(value,selected);if(ticket===serial)output.textContent=message;}
  catch(error){if(ticket===serial)output.textContent=`復旧の事前確認を停止しました。${error.message} 読み込み前の保存データは変更されていません。`;}
 };
 file.addEventListener('change',check);target.addEventListener('change',check);
 return {check};
}
