// Isolated, non-adopting comparison of explicitly provided plan conditions.
// No storage, network, or browser access. Input values must be synthetic or privately authorized.
import {step8Trial} from './step8-trial-workflow.mjs';
import {runRetirementPlan} from './calc.mjs';
const nonnegative=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const month=v=>typeof v==='string'&&/^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const validDate=v=>{if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return false;const d=new Date(v+'T00:00:00Z');return Number.isFinite(+d)&&d.toISOString().slice(0,10)===v;};
const fail=(code,message)=>({ok:false,issues:[{code,message}],saved:false,adopted:false});
export function compareFullPlan(config,request){
 const before=JSON.stringify(config);
 if(!request||!Array.isArray(request.budgets)||!request.budgets.length||!Array.isArray(request.events))return fail('inputs','予算・臨時収支の明示入力が必要です。');
 if(!month(request.primarySideStartMonth))return fail('labor-month','本人アルバイトの開始月が不正です。');
 if(request.budgets.some(b=>!Number.isInteger(b.fromAge)||!Number.isInteger(b.toAge)||b.fromAge>b.toAge||!nonnegative(b.annualBudget)))return fail('budget-invalid','予算の年齢または金額が不正です。');
 for(let i=1;i<request.budgets.length;i++)if(request.budgets[i].fromAge!==request.budgets[i-1].toAge+1)return fail('budget-gap','予算期間の空白または重複があります。');
 if(request.events.some(e=>!['income','expense'].includes(e.type)||!validDate(e.date)||!nonnegative(e.amount)||!e.label?.trim()||(!['separate','budget','net_transfer'].includes(e.fundingTreatment)||(e.type==='income'&&e.fundingTreatment==='budget'))))return fail('event-invalid','臨時収支の入力が不正です。');
 const ids=new Set((config.events||[]).map(e=>e.id).filter(Boolean));
 for(const e of request.events){if(e.id){if(ids.has(e.id))return fail('event-duplicate','イベントIDが重複しています。');ids.add(e.id);}}
 const trial=step8Trial(config,request.opening);
 if(!trial.ok)return {ok:false,issues:trial.issues,saved:false,adopted:false};
 const proposed=structuredClone(trial.config);
 if(request.budgets[0].fromAge>Math.max(65, proposed.plan.startAge)||request.budgets.at(-1).toAge<proposed.plan.endAge)return fail('budget-coverage','計算期間を通じた年間管理予算が必要です。');
 if(request.events.some(e=>e.date.slice(0,7)<request.opening.startMonth))return fail('event-before-start','計算開始前の臨時収支はこの比較で追加できません。');
 proposed.budgets=structuredClone(request.budgets);
 proposed.events=[...(proposed.events||[]),...structuredClone(request.events)];
 if(!proposed.employment?.primary?.sideWork)return fail('labor-missing','本人の就労設定がありません。');
 proposed.employment.primary.sideWork.startDate=request.primarySideStartMonth+'-01';
 proposed.employment.primary.sideWork.startMode='custom';
 let base,candidate;
 try{base=runRetirementPlan(config,{includeMonthlyDetails:true});candidate=runRetirementPlan(proposed,{includeMonthlyDetails:true});}catch(e){return fail('calculation',e.message);}
 if(JSON.stringify(config)!==before)return fail('source-mutated','保存済み設定が変更されました。');
 const ageRows=[70,75,80,85,90,95].map(age=>{const row=candidate.rows.find(r=>r.age===age),target=proposed.management?.thresholds?.[age];return {age,endAsset:row?.endAsset??null,referenceTarget:typeof target==='number'?target:null,met:row&&typeof target==='number'?row.endAsset>=target:null};});
 return {ok:true,saved:false,adopted:false,baseFinalAsset:base.finalAsset,candidateFinalAsset:candidate.finalAsset,ageRows,monthlyCount:candidate.monthlyDetails.length,firstNegativeMonth:candidate.monthlyDetails.find(r=>r.endAsset<0)?.month??null,proposal:proposed,notes:['未反映比較であり、保存・採用は行っていません。','iDeCo年金手取・税社会保険・受給資格は別途検証が必要です。']};
}
