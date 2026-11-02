import test from 'node:test';
import assert from 'node:assert/strict';
import {previewTravelFromReconciliation} from './travel-reconciliation-preview.mjs';
const month=(key,index,expense,assessment='within-budget')=>({
 month:key,annualRowIndex:index,scope:'asset-funded',priceFactor:1,
 assessment,budget:{check:{status:'resolved',amount:expense}},actual:{expense}
});
const trace={months:[month('2040-01',0,40),month('2040-02',0,40),month('2041-01',1,30)],
 periods:[{age:65,annualRowIndex:0,monthCount:2},{age:66,annualRowIndex:1,monthCount:1}]};
const input=(month,nonTravelExpense)=>({month,nonTravelExpense,confirmed:true,priceFactor:1,priceBasis:'engine-month-nominal'});
test('同価格基準の月次確定支出だけで旅行余力と不足を分離',()=>{
 const before=structuredClone(trace);
 const r=previewTravelFromReconciliation(trace,[input('2040-01',25),input('2040-02',45),input('2041-01',30)]);
 assert.deepEqual([r.months[0].travelBudget,r.months[0].shortfall],[15,0]);
 assert.deepEqual([r.months[1].travelBudget,r.months[1].shortfall],[0,5]);
 assert.deepEqual([r.periods[0].travelBudget,r.periods[0].shortfall],[15,5]);
 assert.equal(r.adopted,false);assert.deepEqual(trace,before);
});
test('未確認・価格基準違い・月欠損をゼロとせず未確定',()=>{
 const r=previewTravelFromReconciliation(trace,[{...input('2040-01',25),confirmed:false},{...input('2040-02',25),priceFactor:1.03}]);
 assert.equal(r.periods[0].status,'unresolved');assert.equal(r.periods[0].travelBudget,null);
 assert.equal(r.periods[1].shortfall,null);
});
test('重複年月・月次予算照合不一致・負支出を拒否',()=>{
 assert.throws(()=>previewTravelFromReconciliation(trace,[input('2040-01',2),input('2040-01',3)]),/重複/);
 assert.throws(()=>previewTravelFromReconciliation(trace,[input('2040-01',-1)]),/非負数/);
 const invalid=structuredClone(trace);invalid.months[0].budget.check.amount=39;
 assert.throws(()=>previewTravelFromReconciliation(invalid,[input('2040-01',20)]),/一致しません/);
});
test('家計参考月は資産支出0円の余裕とみなさない',()=>{
 const t=structuredClone(trace);t.months[0].scope='family-reference';
 assert.equal(previewTravelFromReconciliation(t,[input('2040-01',0)]).months[0].travelBudget,null);
});

test('照合側が予算超過と判定した月も確定不足額を隠さない',()=>{
 const x=structuredClone(trace);x.months[1].assessment='over-budget';
 const r=previewTravelFromReconciliation(x,[input('2040-01',25),input('2040-02',45),input('2041-01',30)]);
 assert.equal(r.months[1].shortfall,5);assert.equal(r.periods[0].status,'over-budget');
});
