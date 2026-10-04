import {migrateConfig,saveState} from './storage.mjs';
import {calculatePensionCandidate} from './pension.mjs';

export function commitPlanState(current,candidate,save=saveState,{preserveScenarioRoles=false,replaceEnvelope=false}={}){
  const envelope=replaceEnvelope?structuredClone(candidate):{...structuredClone(current),...structuredClone(candidate)};
  const next={...envelope,config:migrateConfig(candidate.config),scenarios:structuredClone(candidate.scenarios)};
  if(!next.config||!Array.isArray(next.scenarios))throw new Error('設定とシナリオの形式を確認してください。');
  for(const c of [next.config,...next.scenarios.map(s=>s.config)]){
    if(!c?.income?.pensions?.primary||!c?.income?.pensions?.spouse)throw new Error('夫婦別の年金設定がありません。');
    for(const [age,a] of Object.entries(c.actuals||{})){
      if(!Number.isInteger(Number(age))||Number(age)<Number(c.plan.startAge)||Number(age)>Number(c.plan.endAge)||a.endAsset==null||!Number.isFinite(Number(a.endAsset)))throw new Error('実績の年齢・年末資産を確認してください。');
    }
    calculatePensionCandidate(migrateConfig(c));
  }
  next.scenarios=next.scenarios.map(s=>({...s,config:migrateConfig(s.config)}));
  if(next.scenarios.filter(s=>s.role==='baseline').length>1)throw new Error('基準ケースが重複しています。');
  if(!preserveScenarioRoles&&!next.scenarios.some(s=>s.role==='baseline')){
    if(next.scenarios.length)next.scenarios[0].role='baseline';
    else{
      const snapshot=structuredClone(next.config);
      for(const key of ['actuals','reviews','pendingDecisions'])delete snapshot[key];
      next.scenarios.push({id:crypto.randomUUID(),name:next.config.meta?.label||'基準ケース',role:'baseline',savedAt:new Date().toISOString(),selected:true,config:snapshot});
    }
  }
  const calculated=calculatePensionCandidate(next.config);
  const saved=save(next,current);
  return {...saved,...calculated};
}
