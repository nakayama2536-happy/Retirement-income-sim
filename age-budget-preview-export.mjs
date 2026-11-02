/** Pure rendering/export adapter for an unadopted age-budget preview. */
const COLUMNS=[['period','集計区分'],['month','対象月'],['age','年齢'],['changed','変更対象'],['expenseBefore','変更前支出_万円'],['expenseAfter','変更後支出_万円'],['expenseDifference','支出差額_万円'],['endAssetBefore','変更前月末資産_万円'],['endAssetAfter','変更後月末資産_万円'],['status','状態']];
const num=n=>typeof n==='number'&&Number.isFinite(n);
function validate(preview){
 if(preview?.stage!=='preview-only'||preview.adopted!==false||preview.saved!==false||!Array.isArray(preview.months)||!num(preview.finalAssetBefore)||!num(preview.finalAssetAfter))throw Error('未採用の比較案が必要です');
 for(const m of preview.months)if(typeof m.month!=='string'||!/^\d{4}-\d{2}$/.test(m.month)||!Number.isInteger(m.age)||typeof m.changed!=='boolean'||[m.expenseBefore,m.expenseAfter,m.expenseDifference,m.endAssetBefore,m.endAssetAfter].some(n=>!num(n)))throw Error('比較月次データが不正です');
}
const safe=(v)=>{if(v===null||v===undefined)return '';const s=String(v);return /^[=+\-@]/.test(s)?"'"+s:s;};
const csvCell=v=>{const s=safe(v).replace(/"/g,'""');return /[",\r\n]/.test(s)?'"'+s+'"':s;};
export function ageBudgetPreviewRows(preview){
 validate(preview);
 return preview.months.map(m=>({period:'month',month:m.month,age:m.age,changed:m.changed?'対象':'対象外',expenseBefore:m.expenseBefore,expenseAfter:m.expenseAfter,expenseDifference:m.expenseDifference,endAssetBefore:m.endAssetBefore,endAssetAfter:m.endAssetAfter,status:'未採用・参考比較'}));
}
export function ageBudgetPreviewCsv(preview){
 const rows=ageBudgetPreviewRows(preview);
 const heading=COLUMNS.map(([,label])=>csvCell(label)).join(',');
 const body=rows.map(row=>COLUMNS.map(([key])=>csvCell(row[key])).join(','));
 return '\uFEFF'+[heading,...body].join('\r\n')+'\r\n';
}
export function ageBudgetPreviewView(preview){
 const rows=ageBudgetPreviewRows(preview);
 return {status:'preview-only',adopted:false,saved:false,monthCount:rows.length,changedMonthCount:rows.filter(r=>r.changed==='対象').length,finalAssetBefore:preview.finalAssetBefore,finalAssetAfter:preview.finalAssetAfter,finalAssetDifference:preview.finalAssetDifference,columns:COLUMNS.map(([,label])=>label),rows};
}
