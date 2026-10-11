// Explicit proposals on native settings; never writes storage or changes a mode.
import {runRetirementPlan,replaceAgeRangeOverride} from './calc.mjs';
import {reconcileCashflow} from './cashflow-reconciliation.mjs';
import {configSignature} from './storage.mjs';
import {projectNisaWithdrawal,IDECO_MODES} from './withdrawal-plan.mjs';
export const EXPENSE_GROUPS=[['living','生活費'],['insurance','保険'],['taxes','税・社会保険'],['travel','旅行費']];
export const EXPENSE_EXAMPLES={living:['食費','日用品','住居費','電気・ガス・水道','通信費','交通・車','医療・介護','衣服・理美容','趣味・交際','教育・家族支援','その他生活費'],insurance:['生命保険','医療保険','がん保険','火災・地震保険','自動車保険','その他保険'],taxes:['労働収入の税・社会保険','年金の税・社会保険','その他の税・社会保険'],travel:['旅行費']};
const profiles=['work-v0.9.7','public-v0.9'];
const num=(v,label,min=0,max=1e9)=>{if(v===''||v==null||!Number.isFinite(Number(v))||Number(v)<min||Number(v)>max)throw Error(`${label}を${min}～${max}の数値で入力してください。未入力は0にしません。`);return Number(v);};
const text=(v,label)=>{if(typeof v!=='string'||!v.trim()||v.length>100)throw Error(`${label}を入力してください（100文字以内）。`);return v.trim();};
function date(v,label){if(!/^\d{4}-\d{2}-\d{2}$/.test(v||'')||new Date(v).toISOString().slice(0,10)!==v)throw Error(`${label}を実在する日付で入力してください。`);return v;}
function range(d,c){const a=num(d.fromAge,'開始年齢',0,120),b=num(d.toAge,'終了年齢',0,120);if(!Number.isInteger(a)||!Number.isInteger(b)||a>b)throw Error('年齢範囲を確認してください。');if(a<Number(c.plan.startAge)||b>Number(c.plan.endAge))throw Error('計画期間内の年齢を指定してください。');return [a,b];}
function setOverride(c,row){c.cashflow||={};c.cashflow.periodOverrides=replaceAgeRangeOverride(c.cashflow.periodOverrides||[],row);}
function pathGet(c,p){return p.split('/').filter(Boolean).reduce((o,k)=>o?.[k],c);}
export function expenseEntries(c,profile){
 const root=profile==='public-v0.9'?'/cashflow/expenseCategories':'/expenseDetail/monthlyCategories';
 return (pathGet(c,root)||[]).flatMap((g,i)=>Array.isArray(g.items)&&g.items.length?g.items.map((r,j)=>({path:`${root}/${i}/items/${j}`,group:g.label||g.key,label:r.label||r.key,key:r.key,row:r})): [{path:`${root}/${i}`,group:g.label||g.key,label:g.label||g.key,key:g.key,row:g}]);
}
function editExpense(c,d){
 if(!profiles.includes(d.profile))throw Error('内訳の保存元を選んでください。');
 const [fromAge,toAge]=range(d,c),amount=num(d.amount,'内訳金額'),monthly=d.unit==='annual'?amount/12:amount;
 if(!['monthly','annual'].includes(d.unit))throw Error('月額または年額を選んでください。');
 const label=text(d.label,'項目名');let target;
 if(!d.target&&d.group==='travel'){
  if(d.profile==='work-v0.9.7'){c.expenseDetail||={monthlyCategories:[]};c.expenseDetail.travelAnnualBase??=0;setOverride(c,{kind:'travel',key:'travel',label,fromAge,toAge,amount,unit:d.unit});}
  else{c.cashflow||={};const old=(c.cashflow.travel||[]).map(r=>({...r,kind:'travel',key:'travel',amount:r.annualAmount,unit:'annual'}));c.cashflow.travel=replaceAgeRangeOverride(old,{kind:'travel',key:'travel',fromAge,toAge,amount:monthly*12,unit:'annual'}).map(({kind,key,amount,unit,...r})=>({...r,annualAmount:amount}));}
  c.cashflow||={};c.cashflow.detailSourceProfile=d.profile;return;
 }
 if(d.target){target=expenseEntries(c,d.profile).find(x=>x.path===d.target);if(!target)throw Error('編集対象が変わりました。');target.row.label=label;}
 else{
  if(!EXPENSE_GROUPS.some(([k])=>k===d.group))throw Error('大項目を選んでください。');
  const root=d.profile==='public-v0.9'?((c.cashflow||={}).expenseCategories||=[]):((c.expenseDetail||={}).monthlyCategories||=[]);
  const key=`detail-${d.group}`;
  let group=root.find(g=>g.key===key);if(!group){group={key,label:EXPENSE_GROUPS.find(([k])=>k===d.group)[1],items:[]};root.push(group);}
  if(!Array.isArray(group.items))throw Error('既存の大項目の形式を確認してください。');
  if(group.items.some(r=>r.label===label))throw Error('同じ名前が登録済みです。既存項目を選んで変更してください。');
  const existing=new Set(expenseEntries(c,d.profile).map(x=>x.key));let n=1;while(existing.has(`${key}-${n}`))n++;
  const row={key:`${key}-${n}`,label,...(d.profile==='public-v0.9'?{periods:[{fromAge:Number(c.plan.startAge),toAge:Number(c.plan.endAge),amount:0}]}:{amount:0})};group.items.push(row);target={row,key:row.key};
 }
 if(d.profile==='public-v0.9'){
  if(!Array.isArray(target.row.periods))throw Error('この旧形式の合計項目は、既存の内訳編集から変更してください。');
  const rows=target.row.periods.map(r=>({...r,kind:'expense',key:target.key,unit:'monthly'}));
  target.row.periods=replaceAgeRangeOverride(rows,{kind:'expense',key:target.key,fromAge,toAge,amount:monthly,unit:'monthly'}).map(({kind,key,unit,...r})=>r);
 }else{
  if(!target.key||expenseEntries(c,d.profile).filter(x=>x.key===target.key).length!==1)throw Error('内訳のキーが未設定・重複しています。');
  const roots=c.expenseDetail?.monthlyCategories||[],parent=roots.find(g=>(g.items||[]).includes(target.row));
  if(parent&&(c.cashflow?.periodOverrides||[]).some(r=>r.kind==='expense'&&r.key===parent.key&&Number(r.toAge)>=fromAge&&Number(r.fromAge)<=toAge))throw Error('この期間は大項目の合計で上書き中です。大項目の設定を先に確認してください。');
  setOverride(c,{kind:'expense',key:target.key,label,fromAge,toAge,amount,unit:d.unit});
 }
 // Explicit display-source selection only; legacy sources remain intact.
 c.cashflow||={};c.cashflow.detailSourceProfile=d.profile;
}
function alignBudget(c,d){
 if(!profiles.includes(d.profile))throw Error('集計する内訳の保存元を選んでください。');
 const [fromAge,toAge]=range(d,c),rec=reconcileCashflow(c,{sourceProfile:d.profile});
 let count=0;
 for(let age=fromAge;age<=toAge;age++){
  const ms=rec.months.filter(m=>m.age===age&&m.scope==='asset-funded');if(!ms.length)continue;
  if(ms.some(m=>m.detailTotal===null||!m.priceFactor||m.budget.check.status!=='resolved'))throw Error(`${age}歳期の内訳に未入力・未計算・保存元の不一致があります。税・旅行費も確認してください。`);
  const vals=ms.map(m=>m.detailTotal/m.priceFactor*12),annual=vals[0];
  if(vals.some(x=>Math.abs(x-annual)>1e-7))throw Error(`${age}歳期は月別の価格基準が異なるため一括反映できません。予算を個別に設定してください。`);
  if(age<65&&c.cashflow.salaryLife)throw Error('65歳前の予算は労働収入タブで変更してください。');
  setOverride(c,{kind:'budget',key:'budget',label:'内訳から設定した年間予算',fromAge:age,toAge:age,amount:annual,unit:'annual'});count++;
 }
 if(!count)throw Error('選択期間に資産から生活費を支払う月がありません。');c.cashflow||={};c.cashflow.detailSourceProfile=d.profile;
}
function event(c,d){
 const amount=num(d.amount,'金額'),label=text(d.label,'項目名'),day=date(d.date,'対象年月日');
 const trace=runRetirementPlan(c,{includeMonthlyDetails:true}).monthlyDetails;
 if(!trace.some(m=>m.month===day.slice(0,7)))throw Error('対象年月は計画期間内で指定してください。開始前の受取は開始資産に含まれるか確認が必要です。');
 if(!['income','expense'].includes(d.type)||!['separate','net_transfer'].includes(d.fundingTreatment))throw Error('収入・支出と計上方法を指定してください。');
 c.events||=[];let row;
 if(d.target!==''){const index=num(d.target,'対象番号',0,c.events.length-1);if(!Number.isInteger(index)||!c.events[index])throw Error('対象がありません。');row=c.events[index];}
 else{if(c.events.some(e=>e.type===d.type&&e.date?.slice(0,7)===day.slice(0,7)&&e.label===label&&Number(e.amount)===amount))throw Error('同じ予定が登録済みです。既存の予定を選択してください。');row={id:`detail-event-${crypto.randomUUID()}`};c.events.push(row);}
 if(row.id&&row.id===c.retirement?.receiptEventId&&!d.allowRetirement)throw Error('退職金と連動した行です。退職金タブで受取条件を変更してください。');
 Object.assign(row,{label,date:day,amount,type:d.type,fundingTreatment:d.fundingTreatment,inflationAdjusted:d.type==='expense'&&d.inflationAdjusted===true});
 return row;
}
function mutate(c,kind,d){
 if(kind==='goal'){
  const age=num(d.age,'目標年齢',Number(c.plan.startAge),Number(c.plan.endAge));
  if(!Number.isInteger(age))throw Error('目標年齢は整数で入力してください。');
  c.management||={};c.management.thresholds={...(c.management.thresholds||{})};
  if(d.clearGoal===true)delete c.management.thresholds[age];
  else c.management.thresholds[age]=num(d.amount,'目標資産額');
  return;
 }
 if(kind==='nisaWithdrawal'){
  c.nisa||={};
  const p={...(c.nisa.withdrawal||{}),version:1,mode:d.mode};
  if(d.mode!=='none'){
   p.startMonth=d.startMonth;p.endMonth=d.mode==='all'?d.startMonth:d.endMonth;
   if(d.mode==='fixed')p.monthlyAmount=num(d.monthlyAmount,'毎月の取り崩し額');
   if(d.mode==='rate')p.monthlyRate=num(d.monthlyRate,'毎月の取り崩し率',0,100);
  }
  c.nisa.withdrawal=p;projectNisaWithdrawal(c);return;
 }
 if(kind==='idecoWithdrawal'){
  if(!c.ideco)throw Error('先にiDeCoの残高・積立条件を設定してください。');
  if(c.plan.initialAssetIncludesIdeco!==false)throw Error('開始資産からiDeCoが除かれているか確認してください。');
  if(!Object.hasOwn(IDECO_MODES,d.receiptMode))throw Error('iDeCoの受取方法を選択してください。');
  const i={...c.ideco,lumpDate:date(d.lumpDate,'受取開始日')};
  if(!i.contributionEndDate||i.lumpDate<i.contributionEndDate)throw Error('受取開始日は掛金終了日以降で指定してください。');
  const months=runRetirementPlan(c,{includeMonthlyDetails:true}).monthlyDetails;
  if(!months.some(m=>m.month===i.lumpDate.slice(0,7)))throw Error('受取開始月は計画期間内で指定してください。開始前の受取にはその時点の資産確認が必要です。');
  i.lumpPercent=d.receiptMode==='lump'?100:d.receiptMode==='annuity'?0:num(d.lumpPercent,'一時金割合',0,100);
  if(d.receiptMode==='combined'&&(i.lumpPercent<=0||i.lumpPercent>=100))throw Error('併用の場合は一時金割合を0%より大きく100%未満にしてください。');
  i.annuityPercent=100-i.lumpPercent;
  if(d.receiptMode!=='lump'){
   i.annuityYears=num(d.annuityYears,'年金受取年数',5,20);if(!Number.isInteger(i.annuityYears))throw Error('年金受取年数は整数で入力してください。');
   i.annuityReturn=num(d.annuityReturn,'年金受取中の利回り',-99,100);
  }
  c.ideco=i;return;
 }
 if(kind==='expense')return editExpense(c,d);
 if(kind==='budget')return alignBudget(c,d);
 if(kind==='event')return event(c,d);
 if(kind==='extra'){
  const [fromAge,toAge]=range(d,c),amount=num(d.amount,'追加収入');if(!['monthly','annual'].includes(d.unit)||!['separate','net_transfer'].includes(d.fundingTreatment))throw Error('単位・計上方法を確認してください。');
  const old=(c.cashflow?.periodOverrides||[]).find(r=>r.kind==='income'&&r.key===d.target);
  if(d.target&&!old)throw Error('対象の追加収入がありません。');
  const label=text(d.label,'項目名');if(!old&&(c.cashflow?.periodOverrides||[]).some(r=>r.kind==='income'&&(r.label||r.key)===label))throw Error('同じ追加収入が登録済みです。既存項目を選んでください。');
  setOverride(c,{...(old||{}),kind:'income',key:old?.key||`detail-income-${crypto.randomUUID()}`,label,fromAge,toAge,amount,unit:d.unit,fundingTreatment:d.fundingTreatment});return;
 }
 if(kind==='labor'){
  if(!['primary','spouse'].includes(d.person))throw Error('本人・配偶者を選んでください。');
  const f=c.cashflow?.salaryLife;if(f&&f.postSalaryLabor?.mode!=='existing_confirmed'&&d.useIndividualLabor!==true)throw Error('現在は終了後の夫婦合計額で計算しています。下の給与生活の試算で「既存の就労設定」を明示選択してから個別設定してください。');
  if(f&&d.useIndividualLabor===true)f.postSalaryLabor={mode:'existing_confirmed'};
  const start=date(d.startDate,'開始日'),end=date(d.endDate,'終了日');if(start>=end)throw Error('終了日は開始日の後にしてください（終了月は含みません）。');
  const job=d.job||'sideWork';if(!['regularWork','sideWork'].includes(job))throw Error('正社員・アルバイトを選んでください。');
  if(start.slice(0,7)>=end.slice(0,7))throw Error('終了月は開始月の翌月以降にしてください。終了月は含みません。');
  c.employment||={};c.employment[d.person]||={};
  c.employment[d.person][job]={...c.employment[d.person][job],monthlyGross:num(d.monthlyGross,'月額収入'),startDate:start,endDate:end};return;
 }
 if(kind==='nisa'){
  const marketValue=num(d.marketValue,'開始時点のNISA評価額',0,Number(c.plan.initialAsset));
  const usageYear=num(d.usageYear??new Date().getFullYear(),'利用枠の確認年',2024,2200);if(!Number.isInteger(usageYear))throw Error('確認年は整数で入力してください。');
  c.nisa={...(c.nisa||{}),usageYear,marketValue,tsumitateUsed:num(d.tsumitateUsed,'つみたて枠使用額',0,120),growthUsed:num(d.growthUsed,'成長枠使用額',0,240),lifetimeBookUsed:num(d.lifetimeBookUsed,'保有分の取得価額',0,1800)};return;
 }
 if(kind==='ideco'){
  if(c.plan.initialAssetIncludesIdeco!==false)throw Error('開始資産からiDeCoが除かれているか未確認です。重複計上を避けるため、確認してから設定してください。');
  const i={...(c.ideco||{})};for(const k of ['asOfDate','contributionEndDate','joinDate','lumpDate'])i[k]=date(d[k],k);
  if(i.contributionEndDate<i.asOfDate||i.lumpDate<i.contributionEndDate||i.joinDate>i.asOfDate)throw Error('加入日・残高基準日・掛金終了日・受取日の順序を確認してください。');
  for(const k of ['currentBalance','monthlyContribution'])i[k]=num(d[k],k);
  for(const k of ['accumulationReturn','annuityReturn'])i[k]=num(d[k],k,-99,100);
  i.lumpPercent=num(d.lumpPercent,'一時金割合',0,100);i.annuityPercent=100-i.lumpPercent;i.annuityYears=num(d.annuityYears,'年金受取年数',5,20);if(!Number.isInteger(i.annuityYears))throw Error('年数は整数で入力してください。');
  // The existing tax-reference switch and contribution source are preserved.
  c.ideco=i;return;
 }
 if(kind==='retirement'){
  const r={...(c.retirement||{}),amount:num(d.amount,'退職金額'),serviceYears:num(d.serviceYears,'勤続年数',1,80),receiveDate:date(d.receiveDate,'受取日'),companyStartDate:date(d.companyStartDate,'入社日')};
  if(!Number.isInteger(r.serviceYears)||r.companyStartDate>r.receiveDate)throw Error('勤続年数・入社日・受取日を確認してください。');
  if(d.postReceipt){
   const receipt=num(d.receipt,'資産に加える受取額',0,r.amount);
   const linked=c.events?.findIndex(e=>e.id&&e.id===c.retirement?.receiptEventId)??-1;
   const target=linked>=0?String(linked):d.eventTarget||'';
   if(target===''&&(c.events||[]).some(e=>e.type==='income'&&e.date?.slice(0,7)===r.receiveDate.slice(0,7)))throw Error('同じ月に既存の臨時収入があります。対応する行を選択し、重複を確認してください。');
   if(target!==''&&c.events[Number(target)]?.type!=='income')throw Error('既存の収入行を選んでください。');
   const row=event(c,{allowRetirement:true,target,type:'income',label:'退職金受取',amount:receipt,date:r.receiveDate,fundingTreatment:'separate'});
   row.id||=`detail-event-${crypto.randomUUID()}`;r.receiptEventId=row.id;
  }else if(r.receiptEventId){throw Error('退職金の受取行が連動中です。受取額も確認して試算してください。');}
  c.retirement=r;return;
 }
 throw Error('未対応の編集です。');
}
export function detailProposal(state,kind,values){
 const c=structuredClone(state.config);mutate(c,kind,values);
 projectNisaWithdrawal(c);
 const before=runRetirementPlan(state.config),after=runRetirementPlan(c);
 if(!Number.isFinite(after.finalAsset))throw Error('試算結果が数値範囲を超えました。');
 return {kind,baseSignature:configSignature(state),candidate:c,candidateSignature:configSignature(c),values:structuredClone(values),before:before.finalAsset,after:after.finalAsset,rows:after.rows,changed:configSignature(c)!==configSignature(state.config)};
}
export function verifyDetailProposal(state,p){if(!p||p.baseSignature!==configSignature(state)||p.candidateSignature!==configSignature(p.candidate))throw Error('設定または比較案が変わりました。再試算してください。');return p.candidate;}
export function changedPaths(before,after,path=[]){
 if(configSignature(before)===configSignature(after))return [];
 if(before&&after&&typeof before==='object'&&typeof after==='object'&&!Array.isArray(before)&&!Array.isArray(after))return [...new Set([...Object.keys(before),...Object.keys(after)])].flatMap(k=>changedPaths(before[k],after[k],[...path,k]));
 return [{path,before:structuredClone(before),after:structuredClone(after)}];
}
export function undoDetail(config,patches){
 const c=structuredClone(config);
 for(const p of patches){let o=c;for(const key of p.path.slice(0,-1)){if(!o||typeof o!=='object')throw Error('対象が変更されています。取消できません。');o=o[key];}const key=p.path.at(-1);
 if(!o||configSignature(o[key])!==configSignature(p.after))throw Error('対象が後から変更されています。取消できません。');
 if(p.before===undefined)delete o[key];else o[key]=structuredClone(p.before);
 }return c;
}
