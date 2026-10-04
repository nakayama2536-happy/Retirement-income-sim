// I-06 read-only comparison. These values never update the plan or storage.
import {
  estimateAnnualTaxSocial, estimateSimpleIncomeTaxes,
  fukuyamaCarePremium2026, fukuyamaNhiPremium2026,
  lateElderlyMedicalPremium2026, projectIdeco, runRetirementPlan
} from './calc.mjs';

const clone=x=>structuredClone(x);
const finite=x=>Number.isFinite(Number(x));
const parseDate=value=>{
  if(!value)return null;
  const m=String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m)return null;
  const d=new Date(Date.UTC(Number(m[1]),Number(m[2])-1,Number(m[3])));
  return Number.isNaN(d.getTime())?null:d;
};
const iso=d=>d?d.toISOString().slice(0,10):null;
const daysInMonth=(year,month)=>new Date(Date.UTC(year,month+1,0)).getUTCDate();
const addMonths=(date,count)=>{
  const d=new Date(date),day=d.getUTCDate();
  const first=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+Number(count),1));
  first.setUTCDate(Math.min(day,daysInMonth(first.getUTCFullYear(),first.getUTCMonth())));
  return first;
};
const addYears=(date,count)=>addMonths(date,Number(count)*12);
const monthIndex=d=>d.getUTCFullYear()*12+d.getUTCMonth();
const monthInRange=(date,start,end)=>Boolean(start&&monthIndex(date)>=monthIndex(start)&&(!end||monthIndex(date)<=monthIndex(end)));
const ageOn=(date,birth)=>{
  let age=date.getUTCFullYear()-birth.getUTCFullYear();
  if(date.getUTCMonth()<birth.getUTCMonth()||(date.getUTCMonth()===birth.getUTCMonth()&&date.getUTCDate()<birth.getUTCDate()))age--;
  return age;
};
const monthsBetween=(start,end)=>monthIndex(end)-monthIndex(start);
const pensionMonthly=(person,date)=>{
  const start=parseDate(person?.startDate);
  return start&&monthIndex(date)>=monthIndex(start)?Number(person?.annualAtStart||0)/12:0;
};
const retirementDate=c=>parseDate(c?.employment?.primary?.mainRetirement?.baseDate)||addYears(parseDate(c?.people?.primary?.birthDate)||new Date(Date.UTC(1965,0,1)),65);
const sideWorkRange=(c,person)=>{
  const birth=parseDate(c?.people?.[person]?.birthDate)||new Date(Date.UTC(1965,0,1));
  const side=c?.employment?.[person]?.sideWork||{};
  if(person==='primary'){
    const base=retirementDate(c),mode=side.startMode||'after_high_age_benefit';
    return {start:parseDate(side.startDate)||(mode==='at_retirement'?base:addMonths(base,Number(c?.unemployment?.baselineSideWorkDelayMonths??2))),end:parseDate(side.endDate)||addYears(birth,76)};
  }
  return {start:parseDate(side.startDate),end:parseDate(side.endDate)};
};
const annualSideWork=(c,person,start)=>{
  const side=c?.employment?.[person]?.sideWork||{},range=sideWorkRange(c,person);
  let total=0;
  for(let n=0;n<12;n++)if(monthInRange(addMonths(start,n),range.start,range.end))total+=Number(side.monthlyGross||0);
  return total;
};

// Frozen reproduction of the saved public-v0.9 household reference route.
// It is comparison-only; the Work engine does not call it for asset calculation.
export function publicV09TaxSocialReference(config,age){
  const c=clone(config),pBirth=parseDate(c?.people?.primary?.birthDate)||new Date(Date.UTC(1965,0,1));
  const sBirth=parseDate(c?.people?.spouse?.birthDate)||new Date(Date.UTC(1965,0,1));
  const start=addYears(pBirth,Number(age)),pAge=ageOn(start,pBirth),sAge=ageOn(start,sBirth);
  const pSalary=annualSideWork(c,'primary',start),sSalary=annualSideWork(c,'spouse',start);
  let pPension=0,sPension=0,idecoAnnuity=0;
  const projection=projectIdeco(c),lumpDate=parseDate(c?.ideco?.lumpDate||c?.ideco?.contributionEndDate)||retirementDate(c);
  for(let n=0;n<12;n++){
    const d=addMonths(start,n);
    pPension+=pensionMonthly(c?.income?.pensions?.primary,d);
    sPension+=pensionMonthly(c?.income?.pensions?.spouse,d);
    const m=lumpDate?monthsBetween(lumpDate,d):-1;
    if(projection&&m>=0&&m<projection.annuityMonths)idecoAnnuity+=projection.annuityMonthly;
  }
  pPension+=idecoAnnuity;
  const pTax0=estimateSimpleIncomeTaxes({salaryGross:pSalary,pensionGross:pPension,age:pAge,spouseIncomeMan:null});
  const sTax0=estimateSimpleIncomeTaxes({salaryGross:sSalary,pensionGross:sPension,age:sAge,spouseIncomeMan:null});
  const pIncome=pTax0.residentTotalIncome,sIncome=sTax0.residentTotalIncome;
  const pTaxed=pTax0.residentTax>0,sTaxed=sTax0.residentTax>0,householdTaxed=pTaxed||sTaxed;
  let nhi=0,late=0;const under75=[];
  if(pAge<75)under75.push(pIncome);else late+=lateElderlyMedicalPremium2026(pIncome);
  if(sAge<75)under75.push(sIncome);else late+=lateElderlyMedicalPremium2026(sIncome);
  if(under75.length)nhi=fukuyamaNhiPremium2026({memberIncomesMan:under75,members:under75.length,adultMembers:under75.length,careMembers40to64:0});
  const pCare=pAge>=65?fukuyamaCarePremium2026({totalIncome:pIncome,pensionGross:pPension,ownResidentTaxed:pTaxed,householdResidentTaxed:householdTaxed}):0;
  const sCare=sAge>=65?fukuyamaCarePremium2026({totalIncome:sIncome,pensionGross:sPension,ownResidentTaxed:sTaxed,householdResidentTaxed:householdTaxed}):0;
  const social=nhi+late+pCare+sCare,denom=Math.max(1,pIncome+sIncome),pShare=social*(pIncome/denom),sShare=social-pShare;
  const pTax=estimateSimpleIncomeTaxes({salaryGross:pSalary,pensionGross:pPension,age:pAge,spouseIncomeMan:sIncome,spouseAge:sAge,socialInsurance:pShare});
  const sTax=estimateSimpleIncomeTaxes({salaryGross:sSalary,pensionGross:sPension,age:sAge,spouseIncomeMan:pIncome,spouseAge:pAge,socialInsurance:sShare});
  const incomeTax=pTax.incomeTax+sTax.incomeTax,residentTax=pTax.residentTax+sTax.residentTax;
  return {total:incomeTax+residentTax+social,incomeTax,residentTax,nhi,lateElderly:late,care:pCare+sCare,
    incomeBasis:{startDate:iso(start),primaryAge:pAge,spouseAge:sAge,primarySalary:pSalary,spouseSalary:sSalary,primaryPension:pPension-idecoAnnuity,spousePension:sPension,idecoAnnuity},
    rulesAsOf:'2026-09-25',note:'保存済み公開元v0.9の算定経路を比較用に再現。iDeCo年金を本人年金所得へ含め、概算社会保険料を所得控除へ配分します。'};
}

function publicRoute(config,age){
  const category=(config?.cashflow?.expenseCategories||[]).find(x=>x?.key==='taxSocial');
  const mode=config?.cashflow?.taxSocialMode;
  if(mode==='auto_if_possible'){
    const value=publicV09TaxSocialReference(config,age);
    return {id:'public-v0.9',label:'公開元 v0.9予定原価',status:category?'reference':'not-registered',amount:value.total,assetEffect:false,method:'収入連動の旧自動概算',rulesAsOf:value.rulesAsOf,registered:Boolean(category),details:value};
  }
  if(!category)return {id:'public-v0.9',label:'公開元 v0.9予定原価',status:'not-registered',amount:null,assetEffect:false,method:'税社保項目なし',rulesAsOf:'2026-09-25',registered:false};
  const raw=category.fallbackMonthly;
  if(raw!==undefined&&raw!==null&&raw!==''&&finite(raw)&&Number(raw)>0)return {id:'public-v0.9',label:'公開元 v0.9予定原価',status:'manual',amount:Number(raw)*12,assetEffect:false,method:'設定済み月額×12',rulesAsOf:'2026-09-25',registered:true,rawMonthly:Number(raw)};
  return {id:'public-v0.9',label:'公開元 v0.9予定原価',status:'substitute',amount:48,assetEffect:false,method:'旧版代替値 月4万円×12',rulesAsOf:'2026-09-25',registered:true,rawMonthly:raw??null};
}
function hasWorkTax(config){
  const roots=config?.expenseDetail?.monthlyCategories||[];
  return roots.some(x=>x?.key==='taxSocial'||(x?.items||[]).some(y=>y?.key==='taxSocial'));
}

export function taxSocialMethodAudit(config,age){
  const snapshot=clone(config),target=Number(age),calculation=runRetirementPlan(snapshot,{includeMonthlyDetails:true});
  const rowIndex=calculation.rows.findIndex(x=>Number(x.age)===target),row=calculation.rows[rowIndex];
  if(!row)return {status:'no-period',age:target,message:'この年齢期の計算結果はありません。'};
  const months=calculation.monthlyDetails.filter(x=>x.annualRowIndex===rowIndex),funded=months.filter(x=>x.budget);
  const work=estimateAnnualTaxSocial(snapshot,target),actual=snapshot?.actuals?.[target]?.taxSocial;
  const rows=[
    {id:'asset',label:'資産推移',status:funded.length?'adopted':'family-reference',amount:row.expense,assetEffect:true,method:'税社保込みの管理予算',rulesAsOf:snapshot?.taxPolicy?.rulesAsOf||'未設定',registered:true,note:funded.length?'この総支出だけを資産から控除します。税社保参考額は内数です。':'給与生活等の家計参考期間で、管理予算を計画資産から控除していません。'},
    {id:'work',label:'Work予定原価参考',status:hasWorkTax(snapshot)?'reference':'not-registered',amount:work.total,assetEffect:false,method:work.source==='income_based'?'年齢期の給与・公的年金による簡略概算':'収入情報不足時の簡略概算',rulesAsOf:snapshot?.taxPolicy?.rulesAsOf||'2026-09-24',registered:hasWorkTax(snapshot),details:work,note:work.note},
    publicRoute(snapshot,target),
    {id:'tool',label:'制度タブ手取ツール',status:'input-required',amount:null,assetEffect:false,method:'画面入力後だけ計算',rulesAsOf:'2026-09-24',registered:true,note:'給与・年金・配偶者所得の入力値から手取参考を表示します。保存・資産計算はしません。'},
    {id:'actual',label:'年次実績',status:finite(actual)?'actual':'unentered',amount:finite(actual)?Number(actual):null,assetEffect:false,method:'利用者が入力した税社保実額',rulesAsOf:'実績年',registered:finite(actual),note:'見直し判定に使いますが、過去年の資産計算へ自動加算しません。'}
  ];
  const publicRow=rows.find(x=>x.id==='public-v0.9'),workRow=rows.find(x=>x.id==='work');
  return {status:'ready',age:target,startDate:months[0]?.date??null,endDate:months.at(-1)?.date??null,monthCount:months.length,assetFundedMonthCount:funded.length,rows,
    difference:finite(publicRow.amount)&&finite(workRow.amount)?workRow.amount-publicRow.amount:null,
    limitations:['表示は方式差の確認用です。方式を自動選択・保存しません。','暦年課税、前年所得、年度途中の加入切替、個別控除、軽減、iDeCo年金合算など未対応項目があります。','将来期間へ2026年制度を仮適用する参考値で、将来の税額・保険料を確定しません。']};
}

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>finite(n)?`${Number(n).toLocaleString('ja-JP',{maximumFractionDigits:2})}万円`:'未計算';
const statusLabel={adopted:'採用中','family-reference':'家計参考',reference:'参考',manual:'設定値',substitute:'代替値','not-registered':'未登録','input-required':'入力後のみ',actual:'実績',unentered:'未入力'};
export function taxSocialMethodHtml(model){
  if(model.status!=='ready')return `<p>${esc(model.message)}</p>`;
  const rows=model.rows.map(r=>`<tr><td>${esc(r.label)}<br><span class="pill">${esc(statusLabel[r.status]||r.status)}</span></td><td>${money(r.amount)}</td><td>${r.assetEffect?'資産計算に使用':'使用しない'}</td><td>${esc(r.method)}<br><small>基準：${esc(r.rulesAsOf)}${r.registered?'':'／項目未登録'}</small>${r.note?`<br><small>${esc(r.note)}</small>`:''}</td></tr>`).join('');
  const diff=model.difference==null?'方式差は未計算':`Work参考－公開元v0.9参考：${model.difference>=0?'+':''}${money(model.difference)}`;
  return `<p>${model.age}歳期（${esc(model.startDate)}～${esc(model.endDate)}、${model.monthCount}か月）</p><div class="table-wrap"><table><thead><tr><th>経路・状態</th><th>年額</th><th>資産への反映</th><th>方法・基準</th></tr></thead><tbody>${rows}</tbody></table></div><p><strong>${esc(diff)}</strong></p><p>資産推移では税社保込み管理予算を1回だけ控除します。参考額・代替値・実績を管理予算へ重ねて加算しません。</p><p class="muted">${model.limitations.map(esc).join(' ')}</p>`;
}
