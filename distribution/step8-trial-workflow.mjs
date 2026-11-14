// Step 8 offline input-contract candidate. No persistence, no adoption, no personal defaults.
// This module is intentionally not connected to the app UI until the current-main port is verified.
import { runRetirementPlan } from './calc.mjs';
import { parseMonth } from './salary-life.mjs';

const has=(obj,key)=>Object.prototype.hasOwnProperty.call(obj??{},key);
const numeric=(v)=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
const dateFromString=(s)=>{
  if(typeof s!=='string'||!/^(\d{4})-(\d{2})-(\d{2})$/.test(s))return null;
  const d=new Date(s+'T00:00:00Z');
  return Number.isFinite(+d)&&d.toISOString().slice(0,10)===s?d:null;
};
const daysInMonth=(y,m)=>new Date(Date.UTC(y,m,0)).getUTCDate();
function startDateForMonth(month,birth){
  if(parseMonth(month)===null||!birth)return null;
  const [year,monthNum]=month.split('-').map(Number);
  return `${month}-${String(Math.min(birth.getUTCDate(),daysInMonth(year,monthNum))).padStart(2,'0')}`;
}
function ageAt(date,birth){
  let years=date.getUTCFullYear()-birth.getUTCFullYear();
  const birthday=new Date(Date.UTC(date.getUTCFullYear(),birth.getUTCMonth(),Math.min(birth.getUTCDate(),daysInMonth(date.getUTCFullYear(),birth.getUTCMonth()+1))));
  return years-(date<birthday?1:0);
}
export function step8ExistingView(config){
  const p=config?.plan??{}, i=config?.ideco??{};
  return Object.freeze({
    startMonth:typeof p.startDate==='string'?p.startDate.slice(0,7):null,
    salaryLastMonth:config?.cashflow?.salaryLife?.lastSalaryMonth??null,
    priceBaseMonth:has(p,'priceBaseMonth')?p.priceBaseMonth:null,
    openingBalance:has(p,'openingBalance')?structuredClone(p.openingBalance):null,
    assetScope:has(p,'idecoAssetScope')?p.idecoAssetScope:null,
    legacyScope:has(p,'initialAssetIncludesIdeco')?p.initialAssetIncludesIdeco:null,
    annuityStartMonth:has(i,'annuityStartMonth')?i.annuityStartMonth:null,
    lumpMonth:typeof i.lumpDate==='string'?i.lumpDate.slice(0,7):null,
    startAsset:numeric(p.initialAsset)?p.initialAsset:null,
    thresholds:structuredClone(config?.management?.thresholds??{}),
    notice:'開始資産は評価月の残高であり、年齢期末目標ではありません。iDeCo年金の手取税・社会保険は未検証です。'
  });
}
export function step8DraftFromConfig(config){
  const view=step8ExistingView(config);
  return {
    startMonth:view.startMonth??'', priceBaseMonth:view.priceBaseMonth??'',
    salaryLastMonth:view.salaryLastMonth??'',
    openingAsOfMonth:view.openingBalance?.asOfMonth??'',
    openingAmount:view.openingBalance?.amount??null,
    openingConfirmed:false, // never carry across a confirmation to a new trial
    idecoAssetScope:view.assetScope??'',
    replaceLegacyScope:false,
    annuityStartMonth:view.annuityStartMonth??'',
  };
}
export function step8DraftIssues(config,draft){
  const issues=[];const fail=(code,message)=>issues.push({code,message});
  const p=config?.plan??{},i=config?.ideco??{};
  const b=dateFromString(config?.people?.primary?.birthDate);
  const start=parseMonth(draft?.startMonth),price=parseMonth(draft?.priceBaseMonth),before=parseMonth(draft?.openingAsOfMonth);
  if(!b)fail('birth','本人の生年月日が未設定または不正です。');
  if(start===null)fail('start-month','計算開始月をYYYY-MMで入力してください。');
  if(price===null)fail('price-base-month','物価基準月をYYYY-MMで入力してください。');
  if(start!==null&&price!==null&&price>start)fail('price-after-start','物価基準月を計算開始月より後にしないでください。');
  if(start!==null&&before!==start-1)fail('opening-month','開始残高の評価月は計算開始月の前月にしてください。');
  const lastSalary=parseMonth(draft?.salaryLastMonth);
  if(lastSalary===null)fail('last-salary-month','給与生活最終月をYYYY-MMで明示してください。');
  else if(start!==null&&lastSalary!==start-1)fail('last-salary-boundary','この開始残高接続案では、給与生活最終月を計算開始月の前月と一致させてください。資産負担の空白月・重複月を防ぎます。');
  if(!numeric(draft?.openingAmount))fail('opening-amount','開始残高は明示的な0以上の数値としてください。未入力は0円ではありません。');
  if(draft?.openingConfirmed!==true)fail('opening-confirmation','評価月と資産範囲を確認してください。');
  if(config?.cashflow?.salaryLife?.mode!=='net-transfer-v1')fail('salary-mode','この新方式の試算には給与生活方式の明示設定が必要です。方式は自動変更しません。');
  if(!i||!has(config,'ideco'))fail('ideco-settings','iDeCo設定の不存在を0円として補いません。');
  if(draft?.idecoAssetScope!=='received-lump-only-v1')fail('asset-scope','受取済み一時金のみ包含し、未受取年金原資を除外する資産範囲を明示してください。');
  if(has(p,'initialAssetIncludesIdeco')&&draft?.replaceLegacyScope!==true)fail('legacy-scope','旧iDeCo包含フラグの明示置換を確認してください。');
  const firstAnnuity=parseMonth(draft?.annuityStartMonth),lump=parseMonth(i?.lumpDate?.slice(0,7)),contributionEnd=parseMonth(i?.contributionEndDate?.slice(0,7));
  if(firstAnnuity===null)fail('annuity-first','iDeCo年金の初回受取月をYYYY-MMで指定してください。');
  if(lump===null||contributionEnd===null)fail('ideco-receipt-dates','iDeCo一時金受取月・掛金終了月は未確認のまま補いません。');
  if(start!==null&&lump!==null&&lump>=start)fail('lump-not-prior','受取済み一時金を開始残高に含めるには、開始月より前に受け取っている必要があります。');
  if(lump!==null&&contributionEnd!==null&&lump<contributionEnd)fail('lump-before-end','一時金が掛金終了より前です。');
  if(firstAnnuity!==null&&((lump!==null&&firstAnnuity<lump)||(contributionEnd!==null&&firstAnnuity<contributionEnd)))fail('annuity-before-lump','年金初回は一時金受取・掛金終了以降にしてください。');
  if(b&&start!==null){const dt=dateFromString(startDateForMonth(draft.startMonth,b)); const a=ageAt(dt,b);
    if(a<64)fail('before-64','64歳より前の計算は、この候補で対応していません。');
    if(!Number.isInteger(p.endAge)||a>=p.endAge)fail('end-age','開始年齢が計画終了年齢に達しています。');
  }
  return issues;
}
// Fail closed when connected to a different calc.mjs that silently ignores new plan fields.
// This is a runtime observation guard, not a claim of full engine or tax correctness.
export function step8ProjectionCompatibility(draft, result){
  const rows=result?.monthlyDetails;
  const issues=[];
  const fail=(code,message)=>issues.push({code,message});
  const targetBase=`${draft.priceBaseMonth}-01`;
  const first=rows?.[0];
  if(!Array.isArray(rows)||!rows.length||!first){
    fail('engine-monthly-details','計算エンジンが月次検証情報を返していません。統合版での試算を停止しました。');
    return issues;
  }
  if(first.month!==draft.startMonth||first.startAsset!==draft.openingAmount){
    fail('engine-opening-balance','開始月または開始残高が計算結果と一致しません。未対応の実装で試算を続行できません。');
  }
  if(rows.some(row=>row.baseDate!==targetBase)){
    fail('engine-price-basis','計算エンジンの物価基準が指定月と一致しません。ステップ5が未統合の可能性があります。');
  }
  const monthIndex=s=>parseMonth(s);
  const b=monthIndex(draft.priceBaseMonth);
  if(rows.some(row=>row.monthsFromBase!==monthIndex(row.month)-b)){
    fail('engine-price-months','物価経過月数が指定基準と一致しません。新しい基準月が計算へ反映されていません。');
  }
  if(rows.some(row=>typeof row.idecoLumpReceipt==='number'&&row.idecoLumpReceipt!==0)){
    fail('engine-lump-double','開始前に受取済みのiDeCo一時金が計画期間内で再計上されています。');
  }
  const principal=result?.idecoProjection?.annuityPrincipal;
  if(typeof principal==='number' && principal>0){
    const monthSeries=rows.map(row=>row.month);
    if(monthSeries.includes(draft.annuityStartMonth)){
      const firstAnnuity=rows.find(row=>row.idecoAnnuity>0);
      if(firstAnnuity?.month!==draft.annuityStartMonth){
        fail('engine-annuity-month','iDeCo年金が指定した初回受取月から始まっていません。ステップ7の統合を確認してください。');
      }
    }
  }
  return issues;
}
export function step8Trial(config,draft){
  const issues=step8DraftIssues(config,draft);
  if(issues.length)return {ok:false,issues,config:null,projection:null};
  const next=structuredClone(config),birth=dateFromString(next.people.primary.birthDate);
  next.plan.startDate=startDateForMonth(draft.startMonth,birth);
  next.plan.startAge=ageAt(dateFromString(next.plan.startDate),birth);
  next.plan.initialAsset=draft.openingAmount;
  next.plan.priceBaseMonth=draft.priceBaseMonth;
  next.cashflow.salaryLife.lastSalaryMonth=draft.salaryLastMonth;
  next.plan.openingBalance={mode:'prior-month-close-v1',asOfMonth:draft.openingAsOfMonth,startMonth:draft.startMonth,amount:draft.openingAmount,confirmed:true};
  if(draft.replaceLegacyScope===true)delete next.plan.initialAssetIncludesIdeco;
  next.plan.idecoAssetScope='received-lump-only-v1';
  next.ideco.annuityStartMonth=draft.annuityStartMonth;
  let result;
  try{result=runRetirementPlan(next,{includeMonthlyDetails:true});}
  catch(e){return {ok:false,issues:[{code:'engine',message:e.message}],config:null,projection:null};}
  const compatibility=step8ProjectionCompatibility(draft,result);
  if(compatibility.length)return {ok:false,issues:compatibility,config:null,projection:null};
  return {
    ok:true,issues:[],config:next,
    projection:{firstMonth:result.monthlyDetails?.[0]?.month??null,firstMonthAsset:result.monthlyDetails?.[0]?.startAsset??null,
      ageEnd:result.rows?.at(-1)?.age??null,finalAsset:result.finalAsset,monthlyCount:result.monthlyDetails?.length??null,
      retirementDate:result.retirementDate??null},
    notice:'これは保存前の比較用試算です。iDeCo年金は既存の予定額で、受給規約・手取・税社会保険の制度適合性は未検証です。',
    changes:{priceBaseMonth:draft.priceBaseMonth,startMonth:draft.startMonth,salaryLastMonth:draft.salaryLastMonth,openingAsOfMonth:draft.openingAsOfMonth,
      confirmedAmount:draft.openingAmount,idecoScope:'received-lump-only-v1',annuityFirst:draft.annuityStartMonth,
      legacyScopeReplaced:draft.replaceLegacyScope===true}
  };
}
export function step8SetField(prev,field,value){
  if(!['startMonth','priceBaseMonth','salaryLastMonth','openingAsOfMonth','openingAmount','idecoAssetScope','annuityStartMonth','replaceLegacyScope','openingConfirmed'].includes(field))throw Error('未対応の入力項目です。');
  const next={...structuredClone(prev),[field]:value};
  if(field!=='openingConfirmed')next.openingConfirmed=false;
  return next;
}
