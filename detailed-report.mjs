import {reconcileCashflow} from './cashflow-reconciliation.mjs';
import {inspectCashflowSources} from './cashflow-sources.mjs';
import {expenseDisplayProfile} from './expense-display.mjs';
import {ageOn} from './date-display.mjs';
const fmt=n=>Number.isFinite(n)?n.toLocaleString('ja-JP',{maximumFractionDigits:2}):'未確定';
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function detailedReport(config,{sourceProfile='',period='annual'}={}){
 const profile=expenseDisplayProfile(config,sourceProfile),rec=reconcileCashflow(config,{sourceProfile:profile||'unknown'}),view=inspectCashflowSources(config,{sourceProfile:profile||'unknown'});
 const labels=new Map(view.items.map(x=>[x.itemId,x.label||x.itemId]));const rows=[];
 const col=(m,group,category,item,amount,scope='集計',note='',status)=>({period:period==='monthly'?m.month:`${m.annualAge}歳期`,date:m.date,primaryAge:ageOn(m.date,config.people?.primary?.birthDate),spouseAge:ageOn(m.date,config.people?.spouse?.birthDate),group,category,item,amount:Number.isFinite(amount)?amount:null,unit:'万円',scope,status:status||(Number.isFinite(amount)?'確認済み':'未確定'),note});
 for(const m of rec.calculation.monthlyDetails){
  const r=rec.months[m.sequence];
  const add=(...args)=>{const row=col(m,...args);rows.push(row);return row;};
  add('資産','残高','期首資産',m.startAsset,'残高');add('資産','運用','運用益',m.investmentGain);add('資産','残高','期末資産',m.endAsset,'残高');
  add('収入','合計','現金収入合計',m.totalIncome,'合計');
  for(const [k,label] of [['labor','労働収入'],['primaryPension','本人公的年金'],['spousePension','配偶者公的年金'],['idecoAnnuity','iDeCo年金'],['unemployment','雇用保険'],['extraIncome','一時金・臨時・追加収入']])add('収入','中項目',label,m[k],'内数');
  for(const [k,label] of [['primaryLabor','本人の労働収入'],['spouseLabor','配偶者の労働収入'],['combinedLabor','夫婦合計で指定した労働収入']])add('収入','労働収入の内訳',label,m[k],'内数');
  add('収入','一時金の内訳','iDeCo一時金の資産計上額',m.idecoLumpReceipt,'内数');add('収入','一時金の内訳','連動設定した退職金受取',m.retirementReceipt,'内数','従来の臨時収入に登録した退職金は、明示連動するまでは一般の臨時収入です。');
  add('支出','合計','支出合計',m.expense+m.extraExpense,'合計');add('支出','中項目','年間予算からの支出',m.expense,'内数');add('支出','中項目','臨時・別枠支出',m.extraExpense,'内数');
  add('収支','差額','現金収支',m.totalIncome-m.expense-m.extraExpense);
  add('資金移動','家計','家計から資産への追加',m.householdAddition,'内数');add('資金移動','家計','資産から家計への取崩し',m.householdWithdrawal,'内数');add('資金移動','iDeCo','計画資産からの掛金',m.idecoContributionFromAsset,'内数','掛金原資は労働収入タブの設定。別途合計へ加えません。');
  for(const e of m.events)add('明細',e.amount<0?'支出・控除':'収入等',e.label,Number(e.amount),'参考明細','税引前・税・手取等の重複を含むため明細を合計しません。');
  if(profile){
   const walk=(d,parent='')=>{const item=add('支出内訳',parent||labels.get(d.itemId),labels.get(d.itemId),d.priced.amount,'予算の参考内訳',r.scope==='family-reference'?'給与生活等の家計参考月。資産からの支出に加算しません。':d.children?.length?'子項目を含む合計。再加算しません。':'年間予算に含めて使う内訳。独立加算しません。');item.itemId=d.itemId;for(const child of d.children||[])walk(child,labels.get(d.itemId));};
   r.details.forEach(d=>walk(d));
  }else add('支出内訳','保存元','内訳の保存元未選択',null,'予算の参考内訳','CSVタブで使用する内訳を選択してください。');
  add('支出内訳','予算照合','予算と内訳の差',r.gap,'参考差額');
 }
 let output=rows;
 if(period==='annual'){
  const grouped=new Map();
  for(const r of rows){const key=JSON.stringify([r.period,r.group,r.category,r.item,r.scope,r.itemId]);let out=grouped.get(key);if(!out){out={...r,amount:r.amount,months:1};grouped.set(key,out);}else{out.months++;if(r.item==='期末資産'){out.amount=r.amount;out.date=r.date;out.primaryAge=r.primaryAge;out.spouseAge=r.spouseAge;}else if(r.item!=='期首資産')out.amount=out.amount===null||r.amount===null?null:out.amount+r.amount;if(r.amount===null)out.status='一部未確定';}}
  output=[...grouped.values()];
 }
 // Saved assumptions are distinguishable from annual cash flows.
 for(const [key,label] of [['usageYear','NISA利用枠の確認年'],['marketValue','開始資産のうちNISA評価額'],['tsumitateUsed','今年つみたて枠使用額'],['growthUsed','今年成長枠使用額'],['lifetimeBookUsed','保有分の取得価額']]){
  const m=rec.calculation.monthlyDetails[0];if(m)output.push({...col(m,'設定','NISA',label,config.nisa?.[key],'入力設定','開始資産の内数・利用枠。収入へ加算しません。'),period:'設定値',unit:key==='usageYear'?'年':'万円'});
 }
 return {rows:output,profile,period,rec};
}
export const DETAIL_COLUMNS=[['period','対象期間'],['date','基準日'],['primaryAge','本人年齢'],['spouseAge','配偶者年齢'],['group','大項目'],['category','中項目'],['item','項目'],['itemId','内訳の管理ID'],['scope','集計上の扱い'],['amount','金額'],['unit','単位'],['status','状態'],['note','説明']];
const cell=v=>{if(v==null)return '';let s=String(v);if(typeof v!=='number'&&/^[\s]*[=+@\-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';};
export function detailedCsv(report){return '\uFEFF'+[DETAIL_COLUMNS.map(([,label])=>cell(label)).join(','),...report.rows.map(r=>DETAIL_COLUMNS.map(([key])=>cell(r[key])).join(','))].join('\r\n')+'\r\n';}
export function groupedYearHtml(result,mode='summary'){
 const income=[['labor','労働収入'],['primaryPension','本人年金'],['spousePension','配偶者年金'],['idecoAnnuity','iDeCo年金'],['unemployment','雇用保険'],['extraIncome','一時金・臨時・追加']];
 const cols=mode==='income'?income:mode==='expense'?[['expense','年間予算'],['extraExpense','臨時・別枠']]:[['totalIncome','収入合計'],['allExpense','支出合計'],['balance','現金収支']];
 return {head:`<tr><th>年齢期</th><th>期首資産</th><th>運用益</th>${cols.map(([,label])=>`<th>${label}</th>`).join('')}<th>期末資産</th></tr>`,body:result.rows.map(r=>`<tr><td>${r.age}歳</td><td>${fmt(r.startAsset)}</td><td>${fmt(r.investmentGain)}</td>${cols.map(([k])=>`<td>${fmt(k==='allExpense'?r.expense+r.extraExpense:k==='balance'?r.totalIncome-r.expense-r.extraExpense:r[k])}</td>`).join('')}<td>${fmt(r.endAsset)}</td></tr>`).join('')};
}
