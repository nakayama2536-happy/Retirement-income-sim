import {inspectCashflowSources,cashflowSourceSignature as signature} from './cashflow-sources.mjs';
import {runRetirementPlan,runForecastFromLatestActual} from './calc.mjs';

const PROFILE='public-v0.9';
const clone=structuredClone;
const object=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const equal=(a,b)=>signature(a)===signature(b);
const validAmount=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
const overlaps=(a,b)=>Number(a.fromAge)<=Number(b.toAge)&&Number(b.fromAge)<=Number(a.toAge);
const adoptionKey=itemId=>`i05:${encodeURIComponent(itemId)}`;

function validateState(state){
 if(!state?.config||!Array.isArray(state.scenarios)||state.scenarios.some(s=>!s?.config))throw new Error('現在設定・比較案を確認してください。');
}
function references(state){
 const view=inspectCashflowSources(state.config,{sourceProfile:PROFILE}),out=[];
 for(const item of view.items.filter(i=>i.route==='income-reference')){
  const variants=item.variants.filter(v=>v.profile===PROFILE);
  if(variants.length!==1||variants[0].identityStatus!=='resolved')continue;
  for(const rule of view.rules.filter(r=>r.profile===PROFILE&&r.itemId===item.itemId)){
   if(rule.status==='resolved'&&rule.period.type==='age'&&['monthly','annual'].includes(rule.unit)&&rule.priceBasis==='nominal-fixed')out.push({
    itemId:item.itemId,sourceKey:variants[0].key,label:variants[0].label||item.label||item.itemId,ruleRef:rule.ruleRef,period:clone(rule.period),amount:rule.amount,unit:rule.unit,
    priceBasis:rule.priceBasis,sourceRefs:clone(rule.sourceRefs)
   });
  }
 }
 return out;
}
export function listIncomeReferences(state){validateState(state);return references(state);}
export function createIncomeDraft(state){validateState(state);return {baseSignature:signature(state),sourceProfile:PROFILE,selection:null};}

function verifySelection(state,draft){
 const empty=createIncomeDraft(state);
 if(draft?.baseSignature!==empty.baseSignature)throw new Error('設定・実績・比較案が変わりました。入力元を再確認してください。');
 const s=draft?.selection;
 if(!object(s)||typeof s.itemId!=='string'||typeof s.ruleRef!=='string')throw new Error('採用する参考収入を選択してください。');
 const ref=references(state).filter(r=>r.itemId===s.itemId&&r.ruleRef===s.ruleRef);
 if(ref.length!==1)throw new Error('出典・内部ID・期間を一意に確認できません。');
 const r=ref[0];
 if(!equal(s.period,r.period)||s.unit!==r.unit||s.priceBasis!==r.priceBasis)throw new Error('期間・単位・価格基準は参考値から変更できません。');
 if(!validAmount(s.amount))throw new Error('金額は0以上の有限数値で指定してください。空欄を0にはしません。');
 if(!['separate','net_transfer'].includes(s.fundingTreatment))throw new Error('計上先を選択してください。');
 if(s.fundingTreatment==='net_transfer'&&!state.config.cashflow?.salaryLife)throw new Error('給与生活方式が未採用のため、家計内振替は選べません。');
 return {s,r};
}
const locator=(r)=>({sourceItemId:r.itemId,period:clone(r.period),unit:r.unit,priceBasis:r.priceBasis});
const isMatch=(row,loc)=>row?.source==='income-adoption-v1'&&equal(row.incomeAdoption,loc);

function ensureCalculation(result){
 if(!Number.isFinite(result.finalAsset)||result.rows.some(r=>['startAsset','endAsset','extraIncome','totalIncome','investmentGain'].some(k=>!Number.isFinite(r[k]))))throw new Error('計算結果が数値範囲外です。反映案を停止します。');
}

export function previewIncomeAdoption(state,draft){
 validateState(state);const {s,r}=verifySelection(state,draft),loc=locator(r);
 const candidate=clone(state);candidate.config.cashflow||={};candidate.config.cashflow.periodOverrides||=[];
 const rows=candidate.config.cashflow.periodOverrides;
 const matches=rows.map((row,index)=>({row,index})).filter(x=>isMatch(x.row,loc));
 if(matches.length>1)throw new Error('同じ参考収入の採用行が重複しています。自動修正せず確認してください。');
 const nextRow={...(matches[0]?.row||{}),kind:'income',key:adoptionKey(r.itemId),label:r.label,fromAge:r.period.fromAge,toAge:r.period.toAge,amount:s.amount,unit:r.unit,
  fundingTreatment:s.fundingTreatment,source:'income-adoption-v1',incomeAdoption:loc};
 const conflicts=rows.filter((row,index)=>row?.kind==='income'&&index!==matches[0]?.index&&[r.sourceKey,adoptionKey(r.itemId)].includes(row.key)&&overlaps(row,r.period));
 if(conflicts.length)throw new Error('同じ期間に別の追加収入があります。二重計上を避けるため、期間または既存行を確認してください。');
 const beforeRow=matches.length?clone(matches[0].row):null;
 if(matches.length)rows[matches[0].index]=nextRow;else rows.push(nextRow);
 const before=runRetirementPlan(state.config,{includeMonthlyDetails:true}),after=runRetirementPlan(candidate.config,{includeMonthlyDetails:true});
 const forecastBefore=runForecastFromLatestActual(state.config),forecastAfter=runForecastFromLatestActual(candidate.config);
 [before,after,forecastBefore?.projection,forecastAfter?.projection].filter(Boolean).forEach(ensureCalculation);
 if(before.monthlyDetails.length!==after.monthlyDetails.length||before.rows.length!==after.rows.length)throw new Error('追加収入の採用で計算期間が変わりました。反映案を停止します。');
 for(let i=0;i<before.rows.length;i++)for(const key of ['age','labor','primaryPension','spousePension','idecoAnnuity','unemployment','expense','extraExpense'])if(before.rows[i][key]!==after.rows[i][key])throw new Error('追加収入以外の収支項目が変わりました。反映案を停止します。');
 const applicable=after.monthlyDetails.filter(m=>m.age>=r.period.fromAge&&m.age<=r.period.toAge);
 if(!applicable.length)throw new Error('対象期間が計画内にありません。年齢範囲を確認してください。');
 const months=after.monthlyDetails.map((m,i)=>({month:m.month,age:m.age,before:before.monthlyDetails[i].extraIncome,after:m.extraIncome,delta:m.extraIncome-before.monthlyDetails[i].extraIncome})).filter(m=>m.delta!==0);
 const changed=!equal(beforeRow,nextRow);
 return {baseSignature:draft.baseSignature,sourceProfile:PROFILE,draft:clone(draft),candidate,beforeRow,afterRow:clone(nextRow),locator:loc,reference:clone(r),months,
  annualDeltas:after.rows.map((row,i)=>({age:row.age,delta:row.extraIncome-before.rows[i].extraIncome})).filter(x=>x.delta!==0),
  finalAssetBefore:before.finalAsset,finalAssetAfter:after.finalAsset,forecastBefore,forecastAfter,changed,stage:'preview-only',saved:false,
  notice:s.fundingTreatment==='net_transfer'?'給与生活中は家計内振替として扱い、計画資産へ重ねて加算しません。':'給与・年金・雇用保険・iDeCoとは別の追加収入として計画資産へ計上します。'};
}

export function revalidateIncomePreview(state,preview){
 if(!preview||preview.baseSignature!==signature(state))throw new Error('古い試算です。再試算してください。');
 const verified=previewIncomeAdoption(state,preview.draft);
 if(!equal(verified,preview))throw new Error('反映案または試算結果が変わっています。再試算してください。');
 return verified;
}

export function incomeAdoptionLocator(row){return clone(row?.incomeAdoption);}
export function incomeAdoptionMatches(row,loc){return isMatch(row,loc);}
