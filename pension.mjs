import {runRetirementPlan,runForecastFromLatestActual,integrityChecks,CERTAINTY_LABELS} from './calc.mjs';
import {configSignature} from './storage.mjs';

export const PENSION_PEOPLE=['primary','spouse'];
const fields=['startDate','annualAtStart','certainty','adoptionSource'];
const names={primary:'本人',spouse:'配偶者'};
const pick=p=>Object.fromEntries(fields.filter(k=>Object.hasOwn(p||{},k)).map(k=>[k,structuredClone(p[k])]));
const validDate=value=>typeof value==='string'&&/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;

export function pensionDraftFromConfig(config){
  return Object.fromEntries(PENSION_PEOPLE.map(key=>{
    const p=config.income?.pensions?.[key]||{};
    return [key,{startMonth:p.startDate?.slice(0,7)||'',annualAtStart:p.annualAtStart??0,certainty:p.certainty||'unknown',adoptionSource:p.adoptionSource||''}];
  }));
}

export function pensionDraftContext(config){
  return configSignature({people:config.people,label:config.meta?.label,startDate:config.plan?.startDate,pensions:config.income?.pensions});
}

export function pensionDraftMatches(config,draft){
  const normalized=structuredClone(draft);
  for(const key of PENSION_PEOPLE){
    if(normalized[key]?.annualAtStart===''||normalized[key]?.annualAtStart==null)return false;
    normalized[key].annualAtStart=Number(normalized[key].annualAtStart);
  }
  return configSignature(normalized)===configSignature(pensionDraftFromConfig(config));
}

function candidateFromDraft(config,draft){
  const next=structuredClone(config);
  if(!validDate(config.people?.primary?.birthDate))throw new Error('本人の生年月日を設定JSONで確認してください。');
  for(const key of PENSION_PEOPLE){
    const d=draft?.[key], name=names[key];
    if(!d||d.annualAtStart===''||d.annualAtStart==null||!Number.isFinite(Number(d.annualAtStart))||Number(d.annualAtStart)<0)
      throw new Error(`${name}の年金年額は0以上の数値で入力してください。`);
    const amount=Number(d.annualAtStart), month=String(d.startMonth||'');
    if(amount>0&&!validDate(config.people?.[key]?.birthDate))throw new Error(`${name}の生年月日を設定JSONで確認してください。`);
    if((amount>0&&!month)||(month&&!/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(month)))
      throw new Error(`${name}の受給開始月を確認してください。`);
    if(month&&config.people?.[key]?.birthDate&&month<config.people[key].birthDate.slice(0,7))
      throw new Error(`${name}の受給開始月が生年月日より前です。`);
    if(!Object.hasOwn(CERTAINTY_LABELS,d.certainty))throw new Error(`${name}の確度を選択してください。`);
    if(typeof d.adoptionSource!=='string'||d.adoptionSource.length>160)throw new Error('出典・メモは160文字以内で入力してください。');
    const p=next.income.pensions[key];
    // 月を編集しない限り、JSON内の既存の日付をそのまま保つ。
    if(month!==(p.startDate?.slice(0,7)||'')||(month&&!validDate(p.startDate))){
      if(month)p.startDate=month+'-01';else delete p.startDate;
    }
    p.annualAtStart=amount;
    if(d.certainty!==(p.certainty||'unknown'))p.certainty=d.certainty;
    if(d.adoptionSource!==(p.adoptionSource||'')){
      if(d.adoptionSource)p.adoptionSource=d.adoptionSource;else delete p.adoptionSource;
    }
  }
  if(next.income.pensions.primary.certainty!==config.income.pensions.primary.certainty){
    next.certainty ||= {};
    next.certainty.pension=next.income.pensions.primary.certainty;
  }
  return next;
}

export function calculatePensionCandidate(config){
  const errors=integrityChecks(config).filter(x=>x.level==='error');
  if(errors.length)throw new Error(errors[0].title);
  const result=runRetirementPlan(config), forecast=runForecastFromLatestActual(config);
  if(!Number.isFinite(result.finalAsset)||result.rows.some(r=>!Number.isFinite(r.endAsset))||(forecast&&!Number.isFinite(forecast.projection.finalAsset)))
    throw new Error('計算結果が有効な数値になりません。入力値を確認してください。');
  return {result,forecast};
}

export function previewPension(config,draft){
  const candidate=candidateFromDraft(config,draft);
  const changedPeople=PENSION_PEOPLE.filter(key=>configSignature(pick(config.income.pensions[key]))!==configSignature(pick(candidate.income.pensions[key])));
  return {baseSignature:configSignature(config),draft:structuredClone(draft),candidate,changedPeople,...calculatePensionCandidate(candidate)};
}

export function applyPensionPreview(current,preview,save,now=new Date().toISOString()){
  if(!preview||preview.baseSignature!==configSignature(current))throw new Error('試算後に前提が変わりました。もう一度試算してください。');
  const checked=previewPension(current,preview.draft);
  if(!checked.changedPeople.length)return {config:current,changed:false,...checked};
  const next=checked.candidate;
  const transaction={id:crypto.randomUUID(),action:'apply',at:now,source:'年金シート',planLabel:current.meta?.label||'現在の計画',people:checked.changedPeople,
    before:Object.fromEntries(checked.changedPeople.map(k=>[k,pick(current.income.pensions[k])])),
    after:Object.fromEntries(checked.changedPeople.map(k=>[k,pick(next.income.pensions[k])])),
    priorGlobalCertainty:current.certainty&&Object.hasOwn(current.certainty,'pension')?{value:current.certainty.pension}:{}
  };
  next.pensionWorkflow={lastApply:transaction,history:[...(current.pensionWorkflow?.history||[]),transaction].slice(-10)};
  save(next,current); // 成功するまで呼び出し側の設定を差し替えない。
  return {config:next,changed:true,result:checked.result,forecast:checked.forecast};
}

export function pensionUndoAvailable(config){
  const t=config.pensionWorkflow?.lastApply;
  return !!t&&Array.isArray(t.people)&&t.people.length>0&&t.people.every(k=>PENSION_PEOPLE.includes(k)&&configSignature(pick(config.income.pensions[k]))===configSignature(t.after?.[k]));
}

export function undoPensionApply(current,save,now=new Date().toISOString()){
  if(!pensionUndoAvailable(current))throw new Error('取消できる反映がないか、年金設定が別の操作で変更されています。');
  const t=current.pensionWorkflow.lastApply, next=structuredClone(current);
  for(const key of t.people){
    const p=next.income.pensions[key];
    for(const field of fields)delete p[field];
    Object.assign(p,structuredClone(t.before[key]));
  }
  if(t.people.includes('primary')&&current.certainty?.pension===t.after.primary.certainty){
    if(Object.hasOwn(t.priorGlobalCertainty||{},'value'))next.certainty.pension=t.priorGlobalCertainty.value;
    else if(next.certainty)delete next.certainty.pension;
  }
  const calculated=calculatePensionCandidate(next);
  next.pensionWorkflow={lastApply:null,history:[...(current.pensionWorkflow.history||[]),{id:crypto.randomUUID(),action:'undo',at:now,source:'年金シート',people:t.people,undoes:t.id}].slice(-10)};
  save(next,current);
  return {config:next,...calculated};
}
