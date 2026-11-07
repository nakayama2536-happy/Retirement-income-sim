/** Read-only mortality expense comparison CSV. Values in 万円; never persists or adopts. */
export const EXPENSE_COLUMNS=[['month','年月'],['age','本人年齢期'],['postDeath','死亡翌月以降'],['baselineExpense','基準管理予算_万円'],['expenseReduction','管理予算減額_万円'],['expense','比較後管理予算_万円'],['baselineExtraExpense','基準臨時支出_万円'],['extraExpense','比較臨時支出_万円'],['funeralExpense','死亡月一時費用_万円'],['unallocated','未照合管理予算残額_万円'],['known','確認済費目合計_万円'],['identityStatus','管理予算検算'],['basisStatus','内訳状態']];
export const ITEM_COLUMNS=[['month','年月'],['age','本人年齢期'],['itemId','費目ID'],['itemName','費目名'],['status','状態'],['source','参考内訳出典'],['baseAmount','登録内訳月額_物価換算後_万円'],['factor','死亡後倍率'],['afterAmount','死亡後参考月額_万円'],['difference','減額_万円']];
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const close=(a,b)=>Math.abs(a-b)<1e-7*Math.max(1,Math.abs(a),Math.abs(b));
const cell=x=>{if(x==null||typeof x==='number'&&!Number.isFinite(x))return '';let v=String(x);if(/^[\s]*[=+@\-\t\r]/.test(v))v="'"+v;return /[",\r\n]/.test(v)?'"'+v.replaceAll('"','""')+'"':v;};
export function csvString(columns,rows){return '\ufeff'+[columns.map(([,label])=>cell(label)).join(','),...rows.map(row=>columns.map(([key])=>cell(row[key])).join(','))].join('\r\n')+'\r\n';}
function requirePreview(comparison){
 const monthly=comparison?.mortality?.monthly,base=comparison?.original?.monthlyDetails;
 if(!Array.isArray(monthly)||!Array.isArray(base)||!monthly.length||monthly.length!==base.length)throw Error('月次比較と基準台帳の件数が一致しません');
 monthly.forEach((r,i)=>{if(r.month!==base[i].month||![r.baselineExpense,r.expenseReduction,r.expense].every(finite)||!close(r.baselineExpense-r.expenseReduction,r.expense))throw Error(r.month+': 管理予算減額と比較後予算が一致しません');});
 return {monthly,base};
}
export function mortalityExpenseAuditRows(comparison){
 const {monthly,base}=requirePreview(comparison);
 return monthly.map((r,i)=>{const x=comparison.itemized?.months?.[i],d=x?.month===r.month?x:null;
 return {month:r.month,age:base[i].annualAge,postDeath:r.postDeath?'はい':'いいえ',baselineExpense:r.baselineExpense,expenseReduction:r.expenseReduction,expense:r.expense,baselineExtraExpense:base[i].extraExpense,extraExpense:r.extraExpense,funeralExpense:r.funeralExpense,unallocated:d?.unallocated??null,known:d?.known??null,identityStatus:close(r.baselineExpense-r.expenseReduction,r.expense)?'一致':'不一致',basisStatus:d?'登録内訳＋未照合残額':'個別内訳未確認'};});
}
export function mortalityExpenseItemRows(comparison){
 const {monthly,base}=requirePreview(comparison),detail=comparison.itemized,factors=comparison.itemFactors;
 if(!detail?.months||!Array.isArray(detail.items)||detail.months.length!==monthly.length||!factors||!finite(factors.unallocated))throw Error('費目内訳または倍率が未確認です');
 const rows=[];
 for(let i=0;i<monthly.length;i++){
  const d=detail.months[i],m=monthly[i];if(d.month!==m.month)throw Error(m.month+': 年月不一致');
  let total=d.unallocated,after=d.unallocated*factors.unallocated;
  for(const item of detail.items){
   const amount=d.amounts?.[item.id],present=finite(amount),factor=factors[item.id];
   if(!finite(factor))throw Error(item.id+': 倍率が未確認です');
   if(present){total+=amount;after+=amount*factor;}
   rows.push({month:m.month,age:base[i].annualAge,itemId:item.id,itemName:item.label||item.name||item.id,status:present?'対象月':'対象期間外または未登録',source:detail.sourceProfile||'未確認',baseAmount:present?amount:null,factor,afterAmount:present?amount*factor:null,difference:present?amount*(1-factor):null});
  }
  rows.push({month:m.month,age:base[i].annualAge,itemId:'unallocated',itemName:'未照合の管理予算残額',status:'予算差額',source:detail.sourceProfile||'未確認',baseAmount:d.unallocated,factor:factors.unallocated,afterAmount:d.unallocated*factors.unallocated,difference:d.unallocated*(1-factors.unallocated)});
  if(!close(total,m.baselineExpense))throw Error(m.month+': 費目合計と管理予算が一致しません');
  if(m.postDeath&&!close(after,m.expense))throw Error(m.month+': 費目倍率と死亡後予算が一致しません');
 }
 return rows;
}
export const mortalityExpenseAuditCsv=x=>csvString(EXPENSE_COLUMNS,mortalityExpenseAuditRows(x));
export const mortalityExpenseItemCsv=x=>csvString(ITEM_COLUMNS,mortalityExpenseItemRows(x));
export function downloadMortalityExpenseCsv(comparison,{documentRef=document,urlRef=URL,now=new Date()}={}){
 const files=[['monthly',mortalityExpenseAuditCsv(comparison)]];
 if(comparison.itemized)files.push(['items',mortalityExpenseItemCsv(comparison)]);
 const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 for(const [kind,csv] of files){const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=urlRef.createObjectURL(blob),a=documentRef.createElement('a');a.href=url;a.download='lifeplan-mortality-expense-'+kind+'-UNADOPTED-'+date+'.csv';a.click();setTimeout(()=>urlRef.revokeObjectURL(url),1000);}
 return {count:files.length};
}
