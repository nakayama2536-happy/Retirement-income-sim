// Explicit receipt planning only. Eligibility and future daily rates are not inferred.
import {dateParts} from './date-display.mjs';
export const UNEMPLOYMENT_MODES={none:'計上しない',basic:'基本手当（65歳未満で離職）',highAge:'高年齢求職者給付金（65歳以上で離職・一時金）'};
const iso=d=>d.toISOString().slice(0,10);
const monthIndex=s=>Number(s.slice(0,4))*12+Number(s.slice(5,7))-1;
const monthString=n=>`${Math.floor(n/12)}-${String(n%12+1).padStart(2,'0')}`;
function number(v,label,min,max){if(v==null||String(v).trim()===''||!Number.isInteger(Number(v))||Number(v)<min||Number(v)>max)throw Error(`${label}を${min}～${max}の整数で入力してください。`);return Number(v);}
function day(v,label){if(!dateParts(v)?.day)throw Error(`${label}を有効な年月日で入力してください。`);return v;}
export function unemploymentPlan(c){
 const p=c.unemployment?.receiptPlan;
 if(p==null)return {status:'legacy',rows:[],total:0};
 if(p.version!==1||!Object.hasOwn(UNEMPLOYMENT_MODES,p.mode))throw Error('未対応の失業給付プランです。');
 if(p.mode==='none')return {status:'disabled',rows:[],total:0};
 if(p.seekingWork!==true||p.eligibilityChecked!==true)throw Error('就職する意思・能力と、加入期間・離職理由等の受給条件を確認してください。');
 if(!['estimate','confirmed'].includes(p.amountStatus))throw Error('給付日額が仮置きか確認済みかを指定してください。');
 if(typeof p.basis!=='string'||!p.basis.trim()||p.basis.length>300)throw Error('日額・日数・受取期間の根拠を300文字以内で入力してください。');
 const retirement=day(p.retirementDate,'離職日'),birth=day(c.people?.primary?.birthDate,'本人の生年月日');
 const boundary=new Date(`${birth}T00:00:00Z`);boundary.setUTCFullYear(boundary.getUTCFullYear()+65);boundary.setUTCDate(boundary.getUTCDate()-1);
 const high=retirement>=iso(boundary);
 if((p.mode==='highAge')!==high)throw Error('離職日と給付種類が一致しません。65歳到達日は誕生日の前日です。');
 const registered=c.employment?.primary?.mainRetirement?.baseDate;
 if(registered&&registered!==retirement)throw Error('本業退職の保存日と離職日が異なります。退職条件を先に確認してください。');
 const dailyYen=number(p.dailyYen,'給付日額（円）',1,100000),days=number(p.days,'支給予定日数',1,360);
 if(high&&![30,50].includes(days))throw Error('高年齢求職者給付金は30日分または50日分で指定してください。');
 for(const key of ['startMonth','endMonth'])if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(p[key]||''))throw Error('受取開始月・終了月を指定してください。');
 const start=monthIndex(p.startMonth),end=monthIndex(p.endMonth),count=end-start+1;
 if(count<1||count>14||count>days||(high&&count!==1))throw Error('基本手当は1～14か月、高年齢給付は同じ1か月の受取期間にしてください。');
 if(p.startMonth<=retirement.slice(0,7))throw Error('この月次予定では受取開始を離職月の翌月以降に指定してください。');
 const endDate=new Date(`${birth}T00:00:00Z`);endDate.setUTCFullYear(endDate.getUTCFullYear()+Number(c.plan.endAge)+1);
 // End birthday month may be partially in-range; the engine checks actual schedule coverage.
 if(p.startMonth<c.plan.startDate.slice(0,7)||p.endMonth>iso(endDate).slice(0,7))throw Error('受取期間を計画期間内に指定してください。');
 if((c.events||[]).some(e=>e.type==='income'&&/失業|求職者|基本手当|雇用保険/.test(e.label||'')))throw Error('臨時収入に失業給付らしい予定があります。重複を確認してから専用プランを設定してください。');
 let remainder=days;const regular=Math.floor(days/count),rows=[];
 for(let n=start;n<=end;n++){const d=n===end?remainder:regular;remainder-=d;rows.push({month:monthString(n),days:d,amount:d*dailyYen/10000,label:UNEMPLOYMENT_MODES[p.mode]+'（受取予定）'});}
 return {status:'configured',rows,total:dailyYen*days/10000,dailyYen,days,mode:p.mode,retirementDate:retirement,amountStatus:p.amountStatus};
}
export function unemploymentEvents(c){return unemploymentPlan(c).rows.map(r=>({date:r.month+'-01',label:`${r.label} ${r.amount.toLocaleString('ja-JP',{maximumFractionDigits:2})}万円（受取月・日付未確定）`}));}

// Advisory only: never mutates employment, receipt plans or saved conditions.
export function laborDateRecommendation(c,endAge=76){
 const birth=dateParts(c.people?.primary?.birthDate),retirement=c.employment?.primary?.mainRetirement?.baseDate;
 const endMonth=birth&&Number.isInteger(endAge)?`${birth.y+endAge}-${String(birth.month).padStart(2,'0')}`:null;
 let startMonth=null,reason='退職日と失業給付の受取予定を保存すると表示します。';
 try{
  const p=unemploymentPlan(c);
  if(dateParts(retirement)?.day&&p.status!=='legacy'){
   const last=p.status==='configured'?p.rows.at(-1).month:retirement.slice(0,7);
   startMonth=monthString(Math.max(monthIndex(retirement.slice(0,7)),monthIndex(last))+1);
   reason=p.status==='configured'?'退職月と給付受取終了月の遅い方の翌月。':'給付を計上しない設定のため、退職月の翌月。';
  }
 }catch{reason='退職日・失業給付設定に不整合があるため、開始の参考値は表示できません。';}
 return {startMonth,endMonth,startDate:startMonth?startMonth+'-01':null,endDate:endMonth?monthString(monthIndex(endMonth)+1)+'-01':null,reason};
}
