// H-UI-02: UI-only input gates and dry-run proposals. No storage, cloud or DOM access.
import {runRetirementPlan,replaceAgeRangeOverride} from './calc.mjs';
import {configSignature} from './storage.mjs';

export function explicitNumber(raw,label,{integer=false,min=-Infinity,max=Infinity}={}) {
  if(raw===null||raw===undefined||String(raw).trim()==='')throw new Error(`${label}が未入力です。0にする場合は0を入力してください。`);
  const value=Number(raw);
  if(!Number.isFinite(value)||(integer&&!Number.isInteger(value))||value<min||value>max)
    throw new Error(`${label}には有効な${integer?'整数':'数値'}を入力してください。`);
  return value;
}
export function basicSettingsValues(form){
  const fields=[['initialAsset','開始時点の対象資産'],['afterTaxReturn','資産全体の税引後利回り'],['inflation','物価上昇率'],['reserveTotal','予定外の支出に備える予備枠']];
  return Object.fromEntries(fields.map(([k,label])=>[k,explicitNumber(form.elements[k]?.value,label)]));
}
const month=s=>/^\d{4}-(0[1-9]|1[0-2])$/.test(s);
export function priceBaseExplanation(config){
  const plan=config?.plan||{};
  const start=typeof plan.startDate==='string'&&month(plan.startDate.slice(0,7))?plan.startDate.slice(0,7):null;
  const explicit=Object.prototype.hasOwnProperty.call(plan,'priceBaseMonth');
  const base=explicit?plan.priceBaseMonth:start;
  if(typeof base!=='string'||!month(base))return '費用の物価基準月：未確認。空欄を開始月や0で補いません。保存値を確認してください。';
  const label=base.slice(0,4)+'年'+Number(base.slice(5))+'月';
  const startLabel=start?start.slice(0,4)+'年'+Number(start.slice(5))+'月':'未確認';
  return `費用の物価基準月：${label}${explicit?'（明示設定）':'（従来方式：計画開始月を使用）'}。計算開始月：${startLabel}。費用は物価基準月の価格（万円、月額／年額を区別）で入力し、将来の物価上昇分は重ねて入力しません。`;
}
export function parsePeriodForm(form){
  const fields=form.elements;
  const kind=String(fields.kind?.value||''),key=String(fields.key?.value||'').trim();
  if(!['expense','travel','budget'].includes(kind))throw new Error('費目の種類を選択してください。追加収入は専用画面で反映してください。');
  if(!key)throw new Error('項目名を入力してください。');
  if(kind==='budget'&&key!=='budget')throw new Error('管理予算の内部項目名は budget です。年齢別年間予算表の編集も利用できます。');
  const fromAge=explicitNumber(fields.fromAge?.value,'開始年齢',{integer:true,min:0,max:120});
  const toAge=explicitNumber(fields.toAge?.value,'終了年齢',{integer:true,min:fromAge,max:120});
  const amount=explicitNumber(fields.amount?.value,'金額',{min:0});
  const unit=String(fields.unit?.value||'');
  if(!['monthly','annual'].includes(unit))throw new Error('金額の月額・年額を選択してください。');
  if(kind==='budget'&&unit!=='annual')throw new Error('管理予算は年額で入力してください。');
  return {kind,key,label:String(fields.label?.value||'').trim()||key,fromAge,toAge,amount,unit};
}
export function proposalStamp(state){return configSignature({config:state.config,scenarios:state.scenarios});}
function makeProposal(state,candidate,action,selected){
  const before=state.config.cashflow?.periodOverrides||[];
  const after=candidate.cashflow?.periodOverrides||[];
  const target=selected;
  const previous=before.filter(r=>r.kind===target.kind&&String(r.key)===String(target.key));
  const next=after.filter(r=>r.kind===target.kind&&String(r.key)===String(target.key));
  const old=runRetirementPlan(state.config);
  const revised=runRetirementPlan(candidate);
  return {action,selected:structuredClone(selected),baseStamp:proposalStamp(state),candidate,
    beforeRows:structuredClone(previous),afterRows:structuredClone(next),
    beforeFinal:old.finalAsset,afterFinal:revised.finalAsset,
    changed:configSignature(before)!==configSignature(after)};
}
export function planPeriodUpdate(state,fields){
  const input=parsePeriodForm(fields);
  const candidate=structuredClone(state.config);
  candidate.cashflow||={};
  candidate.cashflow.periodOverrides=replaceAgeRangeOverride(candidate.cashflow.periodOverrides||[],input);
  return makeProposal(state,candidate,'upsert',input);
}
export function planPeriodDelete(state,index){
  const rows=state.config.cashflow?.periodOverrides||[];
  if(!Number.isInteger(index)||index<0||index>=rows.length)throw new Error('削除対象の設定が見つかりません。');
  const item=rows[index];
  if(item?.kind==='income')throw new Error('追加収入は専用画面で管理してください。');
  const candidate=structuredClone(state.config);
  candidate.cashflow.periodOverrides.splice(index,1);
  return makeProposal(state,candidate,'delete',item);
}
export function verifyPeriodPlan(state,proposal){
  if(!proposal||!proposal.changed)throw new Error('反映する差分がありません。');
  if(proposalStamp(state)!==proposal.baseStamp)throw new Error('試算後に保存済み設定・比較案が更新されました。再度確認してください。');
  return proposal.candidate;
}
export function formatPeriodRow(r){
  return `${r.label||r.key}（${r.kind} / ${r.fromAge}〜${r.toAge}歳 / ${r.amount}万円${r.unit==='monthly'?'/月':'/年'}）`;
}
