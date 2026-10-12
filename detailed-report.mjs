import {projectNisaWithdrawal} from './withdrawal-plan.mjs';
import {reconcileCashflow} from './cashflow-reconciliation.mjs';
import {inspectCashflowSources} from './cashflow-sources.mjs';
import {expenseDisplayProfile} from './expense-display.mjs';
import {ageOn} from './date-display.mjs';
const fmt=n=>Number.isFinite(n)?n.toLocaleString('ja-JP',{maximumFractionDigits:2}):'未確定';
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function detailedReport(config,{sourceProfile='',period='annual'}={}){
 const profile=expenseDisplayProfile(config,sourceProfile),rec=reconcileCashflow(config,{sourceProfile:profile||'unknown'}),view=inspectCashflowSources(config,{sourceProfile:profile||'unknown'});
 const nisa=projectNisaWithdrawal(config,rec.calculation.monthlyDetails);
 const labels=new Map(view.items.map(x=>[x.itemId,x.label||x.itemId]));const rows=[];
 const col=(m,group,category,item,amount,scope='集計',note='',status)=>({period:period==='monthly'?m.month:`${m.annualAge}歳期`,date:m.date,primaryAge:ageOn(m.date,config.people?.primary?.birthDate),spouseAge:ageOn(m.date,config.people?.spouse?.birthDate),group,category,item,amount:Number.isFinite(amount)?amount:null,unit:'万円',scope,status:status||(Number.isFinite(amount)?'確認済み':'未確定'),note});
 for(const m of rec.calculation.monthlyDetails){
  const r=rec.months[m.sequence];
  const add=(...args)=>{const row=col(m,...args);rows.push(row);return row;};
  add('資産','残高','期首資産',m.startAsset,'残高');add('資産','運用','運用益',m.investmentGain);add('資産','残高','期末資産',m.endAsset,'残高');
  if(nisa.status==='configured'){
   const n=nisa.rows[m.sequence],note='独立したNISAの参考計画。取崩しは資産内の移動で、収入・支出へ再加算しません。生活費への自動充当・追加売却は未対応。';
   for(const [key,label,scope] of [['startBalance','NISA期首残高（参考）','期首残高（参考）'],['gain','NISA運用益（参考）','運用参考'],['requested','NISA取崩し指定額（参考）','資金移動参考'],['withdrawal','NISA取崩し可能額（参考）','資金移動参考'],['unmet','NISA指定額に対する不足（参考）','不足参考'],['endBalance','NISA期末残高（参考）','期末残高（参考）']])add('資金移動','NISA',label,n[key],scope,note,n.overTotal?'総資産との整合要確認':n.unmet>0?'取崩し指定額に不足あり':'参考試算');
  }
  add('収入','合計','現金収入合計',m.totalIncome,'合計');
  for(const [k,label] of [['labor','労働収入'],['primaryPension','本人公的年金'],['spousePension','配偶者公的年金'],['idecoAnnuity','iDeCo年金'],['unemployment','雇用保険']])add('収入',k==='idecoAnnuity'?'iDeCo':'中項目',label,m[k],'内数');
  add('収入','iDeCo','iDeCo一時金の資産計上額',m.idecoLumpReceipt,'内数');
  add('収入','退職金','連動設定した退職金受取',m.retirementReceipt,'内数','明示連動した退職金のみ。未連動の臨時収入はその他に残します。');
  add('収入','資産への入金','家計から資産への追加',m.householdAddition,'内数');
  add('収入','中項目','その他の臨時・追加収入',m.extraIncome-m.idecoLumpReceipt-m.retirementReceipt-m.householdAddition,'内数','iDeCo一時金・連動退職金・家計からの追加を除いた額。名称だけでは分類しません。');
  for(const [k,label] of [['primaryLabor','本人の労働収入'],['spouseLabor','配偶者の労働収入'],['combinedLabor','夫婦合計で指定した労働収入']])add('収入','労働収入の内訳',label,m[k],'内数');
  for(const [person,label] of [['primary','本人'],['spouse','配偶者']])for(const [type,title] of [['Regular','正社員'],['Side','アルバイト']]){
   add('労働収入の登録額','税引前',label+title+'の登録額',config.employment?.[person]?.[type==='Regular'?'regularWork':'sideWork']?m[person+type+'Gross']:null,'家計参考額','給与生活中は資産へ直接加算しません。未登録の正社員収入は未設定。',config.employment?.[person]?.[type==='Regular'?'regularWork':'sideWork']?'確認済み':'未設定');
   add('収入','労働収入の内訳',label+title+'の資産計上額',m[person+type+'Labor'],'内数');
  }

  add('支出','合計','支出合計',m.expense+m.extraExpense,'合計');add('支出','中項目','年間予算からの支出',m.expense,'内数');add('支出','中項目','臨時・別枠支出',m.extraExpense,'内数');
  add('収支','差額','現金収支',m.totalIncome-m.expense-m.extraExpense);
  add('資金移動','家計','資産から家計への取崩し',m.householdWithdrawal,'内数');add('資金移動','iDeCo','計画資産からの掛金',m.idecoContributionFromAsset,'内数','掛金原資はiDeCoタブで確認する設定。別途合計へ加えません。');
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
  for(const r of rows){const key=JSON.stringify([r.period,r.group,r.category,r.item,r.scope,r.itemId]);let out=grouped.get(key);if(!out){out={...r,amount:r.amount,months:1};grouped.set(key,out);}else{out.months++;if(r.item==='期末資産'||r.scope==='期末残高（参考）'){out.amount=r.amount;out.date=r.date;out.primaryAge=r.primaryAge;out.spouseAge=r.spouseAge;}else if(r.item!=='期首資産'&&r.scope!=='期首残高（参考）')out.amount=out.amount===null||r.amount===null?null:out.amount+r.amount;if(r.amount===null)out.status='一部未確定';}}
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
export function groupedYearHtml(result,mode='summary',config=null){
 const nisa=config?projectNisaWithdrawal(config,result.monthlyDetails):null;
 const withdrawals=new Map();
 for(const m of nisa?.rows||[])withdrawals.set(m.annualAge,(withdrawals.get(m.annualAge)||0)+m.withdrawal);
 const nisaCell=age=>!nisa||nisa.status==='unconfigured'?'未設定':nisa.status==='disabled'?fmt(0):withdrawals.has(age)?fmt(withdrawals.get(age)):'未確定';
 const income=[['labor','労働収入'],['primaryPension','本人年金'],['spousePension','配偶者年金'],['idecoAnnuity','iDeCo年金'],['unemployment','雇用保険'],...(result.monthlyDetails?[['idecoLumpReceipt','iDeCo一時金'],['retirementReceipt','連動退職金'],['householdAddition','家計からの追加'],['otherExtraIncome','その他の臨時・追加']]:[['extraIncome','一時金・臨時・追加（iDeCo等を含む）']])];
 const cols=mode==='income'?income:mode==='expense'?[['expense','年間予算'],['extraExpense','臨時・別枠']]:[['totalIncome','収入合計'],['allExpense','支出合計'],['balance','現金収支']];
 return {head:`<tr><th>年齢期</th><th>期首資産</th><th>運用益</th>${cols.map(([,label])=>`<th>${label}</th>`).join('')}<th>NISA取崩額（資金移動）</th><th>期末資産</th></tr>`,body:result.rows.map(original=>{const r={...original};if(result.monthlyDetails){const ms=result.monthlyDetails.filter(m=>m.annualAge===r.age);for(const key of ['idecoLumpReceipt','retirementReceipt'])r[key]=ms.reduce((n,m)=>n+m[key],0);r.otherExtraIncome=r.extraIncome-r.idecoLumpReceipt-r.retirementReceipt-(r.householdAddition||0);}return `<tr><td>${r.age}歳</td><td>${fmt(r.startAsset)}</td><td>${fmt(r.investmentGain)}</td>${cols.map(([k])=>`<td>${fmt(k==='allExpense'?r.expense+r.extraExpense:k==='balance'?r.totalIncome-r.expense-r.extraExpense:r[k])}</td>`).join('')}<td>${nisaCell(r.age)}</td><td>${fmt(r.endAsset)}</td></tr>`;}).join('')};
}

// Pivot monthly observations, preserving first/last balances and incomplete values.
const seriesKey=r=>JSON.stringify([r.group,r.category,r.item,r.scope,r.itemId||'',r.unit]);
export const TREND_KEYS=[['period','対象期間'],['startDate','開始基準日'],['endDate','終了基準日'],['primaryAge','本人年齢'],['spouseAge','配偶者年齢'],['months','対象月数']];
export function wideDetailedReport(config,{sourceProfile='',period='monthly'}={}){
 if(!['monthly','annual','calendar'].includes(period))throw Error('集計単位を確認してください。');
 const long=detailedReport(config,{sourceProfile,period:'monthly'}),columns=new Map(),periods=new Map(),monthPeriods=new Map();
 const bucket=m=>period==='monthly'?m.month:period==='calendar'?`${m.month.slice(0,4)}年`:`${m.annualAge}歳期`;
 for(const m of long.rec.calculation.monthlyDetails){
  const key=bucket(m);monthPeriods.set(m.month,key);let r=periods.get(key);
  const pa=ageOn(m.date,config.people?.primary?.birthDate),sa=ageOn(m.date,config.people?.spouse?.birthDate);
  if(!r){r={period:key,startDate:m.date,endDate:m.date,primaryAge:pa,spouseAge:sa,months:0,values:{},statuses:{},firstPrimaryAge:pa,firstSpouseAge:sa};periods.set(key,r);}
  r.endDate=m.date;r.primaryAge=r.firstPrimaryAge===pa?pa:`${r.firstPrimaryAge}～${pa}`;r.spouseAge=r.firstSpouseAge===sa?sa:`${r.firstSpouseAge}～${sa}`;r.months++;
 }
 const addColumn=r=>{const id=seriesKey(r);if(!columns.has(id)){
  const section=/NISA/i.test(r.item+' '+r.category)?'NISA':/iDeCo|DC/i.test(r.item+' '+r.category)?'iDeCo':r.group;
  columns.set(id,{id,group:r.group,category:r.category,itemId:r.itemId,section,label:`${r.group} / ${r.category} / ${r.item}${r.itemId?' ［'+r.itemId+'］':''} ［${r.scope}・${r.unit}］`,item:r.item,scope:r.scope,note:r.note,unit:r.unit,detailOnly:isDetailColumn(r,config)});
 }return id;};
 for(const r of long.rows){const id=addColumn(r);
  if(r.period==='設定値'){for(const out of periods.values()){out.values[id]=r.amount;out.statuses[id]=r.amount===null?'未設定':'固定設定値（将来残高ではありません）';}continue;}
  const out=periods.get(monthPeriods.get(r.period));if(!out)continue;
  if(!Object.hasOwn(out.values,id)||r.item==='期末資産'||r.scope==='期末残高（参考）')out.values[id]=r.amount;
  else if(r.item!=='期首資産'&&r.scope!=='期首残高（参考）')out.values[id]=out.values[id]===null||r.amount===null?null:out.values[id]+r.amount;
  out.statuses[id]=out.values[id]===null?'未確定':out.statuses[id]==='総資産との整合要確認'||r.status==='総資産との整合要確認'?'総資産との整合要確認':out.statuses[id]==='取崩し指定額に不足あり'||r.status==='取崩し指定額に不足あり'?'取崩し指定額に不足あり':r.status;
 }
 for(const out of periods.values())for(const col of columns.values())if(!Object.hasOwn(out.values,col.id)){
  // Sparse event observations mean no event in that period, not an unknown input.
  out.values[col.id]=col.group==='明細'?0:null;out.statuses[col.id]=col.group==='明細'?'該当なし':'未確定';
 }
 return {period,profile:long.profile,columns:[...columns.values()],rows:[...periods.values()]};
}
export function selectTrendColumns(report,selectedIds){
 if(selectedIds===undefined)return report.columns;
 const ids=new Set(selectedIds);return report.columns.filter(c=>ids.has(c.id));
}
export function trendCsv(report,selectedIds,{includeStatus=false}={}){
 const columns=selectTrendColumns(report,selectedIds);if(!columns.length)throw Error('出力する項目を1つ以上選択してください。');
 const header=[...TREND_KEYS.map(([,label])=>label),...columns.flatMap(c=>includeStatus?[c.label,`${c.label} 状態`]:[c.label])];
 return '\uFEFF'+[header,...report.rows.map(r=>[...TREND_KEYS.map(([key])=>r[key]),...columns.flatMap(c=>includeStatus?[r.values[c.id],r.statuses[c.id]]:[r.values[c.id]])])].map(row=>row.map(cell).join(',')).join('\r\n')+'\r\n';
}

// Summary and source observations remain inspectable without duplicating normal CSV columns.
function isDetailColumn(r,config){
 if(['明細','設定','労働収入の登録額'].includes(r.group))return true;
 if(r.category==='労働収入の内訳'){
  if(r.item==='夫婦合計で指定した労働収入')return config.cashflow?.salaryLife?.postSalaryLabor?.mode!=='monthly';
  if(['本人の労働収入','配偶者の労働収入'].includes(r.item))return true;
  // Keep active regular pay visible; only redundant/unregistered regular rows are hidden.
  if(r.item.includes('正社員'))return !config.employment?.[r.item.startsWith('本人')?'primary':'spouse']?.regularWork;
 }
 return false;
}
export function visibleTrendColumns(report,includeDetails=false){return report.columns.filter(c=>includeDetails||!c.detailOnly);}

// Picker presentation only: preserve column IDs, CSV labels and calculation order.
export function trendPickerItemsHtml(columns,excluded=new Set()){
 const row=(c,child=false)=>`<label class="check-label trend-picker-row${child?' trend-picker-child':''}" title="${esc(c.note)}"><input type="checkbox" data-column-id="${esc(c.id)}" ${excluded.has(c.id)?'':'checked'}><span>${esc(c.item)}${c.itemId?' ［'+esc(c.itemId)+'］':''} <small>${esc(c.scope)}・${esc(c.unit)}</small></span></label>`;
 if(!columns.length)return '';
 if(columns[0].section!=='収入')return columns.map(c=>`<label class="check-label"><input type="checkbox" data-column-id="${esc(c.id)}" ${excluded.has(c.id)?'':'checked'}>${esc(c.label)}</label>`).join('');
 const groups=new Map();
 for(const c of columns){
  const key=c.scope==='合計'?'合計':c.item==='労働収入'||c.category==='労働収入の内訳'?'労働収入':c.item.includes('公的年金')?'公的年金':'その他の受取・入金';
  if(!groups.has(key))groups.set(key,[]);groups.get(key).push(c);
 }
 return '<p class="muted trend-picker-help">資産に計上する収入です。別枠のiDeCo一時金・年金も収入合計に含みます。合計と内訳は重ねて足しません。</p>'+['合計','労働収入','公的年金','その他の受取・入金'].filter(k=>groups.has(k)).map(k=>k==='合計'?'<div class="trend-picker-total">'+groups.get(k).map(c=>row(c)).join('')+'</div>':'<fieldset class="trend-picker-group"><legend>'+k+'</legend>'+groups.get(k).map(c=>row(c,k==='労働収入'&&c.item!=='労働収入')).join('')+(k==='労働収入'?'<p class="muted">字下げした項目は労働収入の内訳です。詳細表示では小計も含みます。</p>':'')+'</fieldset>').join('');
}
