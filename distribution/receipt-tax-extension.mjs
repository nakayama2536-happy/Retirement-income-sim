/** Read-only receipt comparison extension. Units: 万円. 2026 tax-law reference.
 * No localStorage, network, adoption, or final tax estimate.
 */
import {retirementOverlapDeduction,pensionMiscIncomeReference,standardRetirementDeduction} from './receipt-tax-reference.mjs';
const validMoney=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
const validDate=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&!Number.isNaN(Date.parse(x))&&new Date(x).toISOString().slice(0,10)===x;
const years=(a,b)=>{const start=new Date(a),end=new Date(b);let n=end.getUTCFullYear()-start.getUTCFullYear();if(end.getUTCMonth()<start.getUTCMonth()||(end.getUTCMonth()===start.getUTCMonth()&&end.getUTCDate()<start.getUTCDate()))n--;return n+((start.getUTCMonth()!==end.getUTCMonth()||start.getUTCDate()!==end.getUTCDate())?1:0);};
export function assessRetirementReceiptPair({company,ideco,otherRetirementReceipts=[]}={}){
 const items=[company,ideco];const issues=[];
 for(const [index,p] of items.entries()){
  const name=index?'iDeCo':'会社退職金';
  if(!p||!validDate(p.periodStart)||!validDate(p.periodEnd)||p.periodStart>p.periodEnd)issues.push(`${name}の期間が未確認`);
  if(!p||!validDate(p.receiptDate))issues.push(`${name}の受取日が未確認`);
  if(!p||!validMoney(p.grossMan))issues.push(`${name}の受取額が未確認`);
 }
 if(!Array.isArray(otherRetirementReceipts)||otherRetirementReceipts.length)issues.push('その他の退職手当の確認が必要');
 if(issues.length)return {status:'incomplete',issues,taxEstimateMan:null};
 const sameYear=company.receiptDate.slice(0,4)===ideco.receiptDate.slice(0,4);
 if(sameYear)return {status:'same-year-special-calculation-required',issues:['同年の複数の退職手当は個別計算結果を足さず、合計と期間の重複を考慮した税計算が必要'],companyDeductionMan:null,idecoDeductionMan:null,taxEstimateMan:null};
 const overlap=retirementOverlapDeduction({company,ideco});
 const companyYears=years(company.periodStart,company.periodEnd),idecoYears=years(ideco.periodStart,ideco.periodEnd);
 const firstType=company.receiptDate<ideco.receiptDate?'company':'ideco';
 const first=firstType==='company'?company:ideco;
 const firstYears=firstType==='company'?companyYears:idecoYears;
 const firstDeduction=standardRetirementDeduction(firstYears);
 const deduction=overlap.adjustedDeductionMan;
 return {status:overlap.status,issues:overlap.issues,firstType,firstDeductionMan:firstDeduction,laterDeductionMan:deduction,overlap,firstTaxableRetirementIncomeMan:validMoney(first.grossMan)&&firstDeduction!==null?Math.max(0,(first.grossMan-firstDeduction)/2):null,laterTaxableRetirementIncomeMan:validMoney(deduction)?Math.max(0,((firstType==='company'?ideco:company).grossMan-deduction)/2):null,taxEstimateMan:null,notes:['税額には退職所得の例外・所得税の端数処理・住民税を別途確認','受取日・他の受取・制度改正を受取時に再確認']};
}
export function comparePensionYear({calendarYear,birthDate,idecoPensionAnnualMan,publicPensionAnnualMan,otherPensionAnnualMan=0,otherIncomeMan}={}){
 const issues=[];
 if(!Number.isInteger(calendarYear)||calendarYear<1900||calendarYear>2200)issues.push('対象年');
 if(!validDate(birthDate))issues.push('受給者生年月日');
 for(const [name,v] of [['iDeCo年金',idecoPensionAnnualMan],['公的年金',publicPensionAnnualMan],['その他の公的年金等',otherPensionAnnualMan],['年金以外の所得',otherIncomeMan]])if(!validMoney(v))issues.push(name);
 if(issues.length)return {status:'incomplete',issues,estimatedIncomeTaxMan:null,estimatedResidentTaxMan:null};
 // NTA tax-year age classification: age on January 1 of the following calendar year.
 const ageAtJan1NextYear=calendarYear+1-Number(birthDate.slice(0,4))-(birthDate.slice(5)> '01-01'?1:0);
 const total=idecoPensionAnnualMan+publicPensionAnnualMan+otherPensionAnnualMan;
 const income=pensionMiscIncomeReference({annualPensionsMan:total,age:ageAtJan1NextYear,otherIncomeMan});
 return {status:income.status,issues:income.issues,calendarYear,ageAtJan1NextYear,totalPensionMan:total,pensionMiscIncomeMan:income.taxablePensionIncomeMan,pensionDeductionMan:income.deductionMan,estimatedIncomeTaxMan:null,estimatedResidentTaxMan:null,assumptions:['同一受給者の公的年金等に該当する給付のみ合算','所得税の年金所得額の参考であり住民税や社会保険料は算定しない']};
}
