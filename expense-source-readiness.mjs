// Inspect standard expense source structure, without changing or exporting any saved amounts.
// This is an input-shape audit, not a calculation or a proposal to adopt values.
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o??{},k);
const validId=v=>(typeof v==='string'&&v.trim()!=='')||(typeof v==='number'&&Number.isFinite(v));
const amountStatus=v=>{
 if(v===undefined||v===null||(typeof v==='string'&&!v.trim()))return 'missing';
 if((typeof v!=='number'&&typeof v!=='string')||!Number.isFinite(Number(v))||Number(v)<0)return 'invalid';
 return 'present';
};
export function expenseSourceReadiness(config){
 const roots=config?.expenseDetail?.monthlyCategories;
 if(!Array.isArray(roots))return {status:'not-registered',items:[],counts:{missingId:0,missingAmount:0,invalidAmount:0,ready:0,needsReview:0}};
 const items=[];
 function visit(row,path,parentLabel='',seen=new Set(),parentKey=false){
  const label=String(row?.label||row?.key||'名称未設定');
  const location=parentLabel?parentLabel+' ＞ '+label:label;
  if(!row||typeof row!=='object'||Array.isArray(row)){
   items.push({label:location,path,identity:'invalid',amount:'not-applicable',action:'形式の確認'});
   return;
  }
  const id=row.id??row.key;
  const identity=validId(id)?'present':'missing';
  const children=Array.isArray(row.items)?row.items:null;
  if(own(row,'items')&&!children){
   items.push({label:location,path,identity,amount:'not-applicable',action:'子項目の形式を確認'});
   return;
  }
  if(children?.length){
   // Parent categories are counted as an identifier prerequisite, not as a missing amount.
   if(identity==='missing')items.push({label:location,path,identity,amount:'not-applicable',action:'大項目のID・キーを確認'});
   const current=new Set();
   for(let i=0;i<children.length;i++){
    const child=children[i],token=child?.id??child?.key;
    const duplicate=validId(token)&&current.has(String(token));
    if(validId(token))current.add(String(token));
    const childPath=path+'/items/'+i;
    visit(child,childPath,location);
    if(duplicate)items.at(-1).action='同じ大項目内の識別キー重複を確認';
   }
  }else{
   const amount=amountStatus(row.amount);
   const action=identity==='missing'?'本人が識別情報を確認':amount==='missing'?'本人が保存元の金額を確認':amount==='invalid'?'元データの金額形式を確認':'確認済みの基礎入力';
   items.push({label:location,path,identity,amount,action});
  }
 }
 for(let i=0;i<roots.length;i++)visit(roots[i],'/expenseDetail/monthlyCategories/'+i);
 const counts={missingId:items.filter(x=>x.identity==='missing').length,missingAmount:items.filter(x=>x.amount==='missing').length,invalidAmount:items.filter(x=>x.amount==='invalid').length,ready:items.filter(x=>x.identity==='present'&&x.amount==='present'&&x.action==='確認済みの基礎入力').length,needsReview:items.filter(x=>x.action!=='確認済みの基礎入力').length};
 return {status:'ready',items,counts};
}
