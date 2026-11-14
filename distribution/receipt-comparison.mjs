/** Read-only retirement/iDeCo receipt comparison diagnostic layer.
 * All monetary values are in 万円. No storage, network, or DOM access.
 * Status is explicitly not a verified tax calculation.
 */
export const RECEIPT_RULESET = '2026-reference-diagnostic';
const validYear = y => Number.isInteger(y) && y >= 1900 && y <= 2200;
const validMoney = x => typeof x === 'number' && Number.isFinite(x) && x >= 0;
function checkYear(y,name,missing){if(!validYear(y))missing.push(name);}
function checkMoney(x,name,missing){if(!validMoney(x))missing.push(name);}
export function overlapWindow(companyYear,idecoLumpYear){
  if(!validYear(companyYear)||!validYear(idecoLumpYear))return {status:'unconfirmed',reason:'受取年が未確認'};
  if(companyYear === idecoLumpYear)return {status:'same-year',requiresAdjustment:true,reason:'同年受取は別計算が必要'};
  if(idecoLumpYear < companyYear){const gap=companyYear-idecoLumpYear;return {status:gap<=9?'within-9-years':'outside-9-years',requiresAdjustment:gap<=9,gap,reason:'DC一時金を先に受領し、会社退職金を後で受領'};}
  const gap=idecoLumpYear-companyYear;
  return {status:gap<=19?'within-19-years':'outside-19-years',requiresAdjustment:gap<=19,gap,reason:'会社退職金を先に受領し、DC一時金を後で受領'};
}
export function compareReceiptPlans({company={},ideco={},publicPensions=[],options=[]}={}){
  if(!Array.isArray(options))throw new TypeError('options must be an array');
  return options.map((o,index)=>{
    const issues=[];
    const ratio=o.lumpPercent;
    checkMoney(company.grossMan,'退職金額',issues);checkYear(o.companyYear??company.year,'会社退職金受取年',issues);
    checkMoney(ideco.receiptBalanceMan,'iDeCo受取時残高',issues);
    if(typeof ratio!=='number'||!Number.isFinite(ratio)||ratio<0||ratio>100)issues.push('iDeCo一時金割合');
    const hasLump=typeof ratio==='number'&&ratio>0;
    const hasAnnuity=typeof ratio==='number'&&ratio<100;
    if(hasLump)checkYear(o.idecoYear,'iDeCo一時金受取年',issues);
    if(hasAnnuity){checkYear(o.idecoYear,'iDeCo年金受取開始年',issues);if(!Number.isInteger(o.annuityYears)||o.annuityYears<5||o.annuityYears>20)issues.push('年金期間（5～20年）');}
    if(!Array.isArray(publicPensions))issues.push('公的年金一覧');
    else for(const [i,p] of publicPensions.entries()){checkYear(p.startYear,`公的年金${i+1}開始年`,issues);checkMoney(p.grossAnnualMan,`公的年金${i+1}年額`,issues);}
    const companyYear=o.companyYear??company.year;
    const window=hasLump?overlapWindow(companyYear,o.idecoYear):null;
    const grossLump=issues.length===0?ideco.receiptBalanceMan*ratio/100:null;
    const grossAnnuity=issues.length===0?ideco.receiptBalanceMan*(1-ratio/100):null;
    const annuityByYear=[];
    if(issues.length===0&&hasAnnuity){
      // Principal-only reference; actual annuity depends on payout rules, fees and return.
      for(let y=o.idecoYear;y<o.idecoYear+o.annuityYears;y++){
        const idecoAnnual=grossAnnuity/o.annuityYears;
        // Only pensions of the same recipient can be combined for the relevant tax computation.
        const ownPension=publicPensions.filter(p=>p.person==='primary'&&p.startYear<=y).reduce((sum,p)=>sum+p.grossAnnualMan,0);
        annuityByYear.push({year:y,idecoAnnualMan:idecoAnnual,ownPublicPensionAnnualMan:ownPension,combinedPrimaryPensionMan:idecoAnnual+ownPension});
      }
    }
    const warnings=[
      '所得税・住民税・社会保険料は未算定。税引後受取額も未算定。',
      '重複調整は受取年による対象判定のみ。実際の重複加入・勤続期間、先行受取額、同年受取等に応じた控除額算定は未対応。',
      '年金分割は元本均等の参考表示。運用益・手数料・税金・規約による受取制限は未反映。'
    ];
    if(window?.requiresAdjustment)warnings.push('退職所得控除の重複調整を個別確認する必要があります。');
    return {id:o.id??`plan-${index+1}`,label:o.label??`案${index+1}`,status:issues.length?'incomplete':'reference-only',missing:issues,companyYear:validYear(companyYear)?companyYear:null,companyGrossMan:validMoney(company.grossMan)?company.grossMan:null,idecoYear:validYear(o.idecoYear)?o.idecoYear:null,lumpPercent:ratio,idecoLumpGrossMan:grossLump,idecoAnnuityPrincipalMan:grossAnnuity,overlap:window,annuityByYear,estimatedIncomeTaxMan:null,estimatedResidentTaxMan:null,netReceiptsMan:null,warnings};
  });
}
