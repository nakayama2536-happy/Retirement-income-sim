/** Tax/social allocation reference; pure. Does not calculate statutory tax rates. */
const eligible=new Set(['pension-withheld','expense-paid','unconfirmed']);
export function allocateTaxSocial({grossPension,lines}={}){
 if(typeof grossPension!=='number'||!Number.isFinite(grossPension)||grossPension<0)throw Error('税引前年金額を確認してください');
 if(!Array.isArray(lines))throw Error('税社保の内訳を確認してください');
 let withheld=0,expensePaid=0,unknown=0;
 const seen=new Set();
 for(const line of lines){
  const {id,amount,route}=line||{};
  if(typeof id!=='string'||!id||seen.has(id))throw Error('税社保の項目IDが重複または未入力です');
  seen.add(id);
  if(!eligible.has(route))throw Error('年金天引き・別途支払い・未確認の区分を選択してください');
  if(route==='unconfirmed'){unknown++;continue;}
  if(typeof amount!=='number'||!Number.isFinite(amount)||amount<0)throw Error('税社保の金額が不正です');
  if(route==='pension-withheld')withheld+=amount;
  else expensePaid+=amount;
 }
 if(withheld>grossPension)throw Error('年金天引き額が税引前年金を超えています');
 return {grossPension,netPension:grossPension-withheld,withheld,expensePaid,unknownCount:unknown,complete:unknown===0,totalCashflowDeduction:withheld+expensePaid,alreadyWithheldNotExpense:withheld};
}
