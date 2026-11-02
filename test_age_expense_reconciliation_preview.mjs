import test from 'node:test';
import assert from 'node:assert/strict';
import {previewAgeExpenseAgainstReconciliation} from './age-expense-reconciliation-preview.mjs';
const mk=(month,age,idx,priceFactor=1)=>({month,age,annualRowIndex:idx,scope:'asset-funded',priceFactor,actual:{expense:44*priceFactor},budget:{base:{priceBasis:'plan-start-base'},check:{status:'resolved',amount:44*priceFactor}}});
const trace={months:[mk('2054-12',79,0),mk('2055-01',80,1),mk('2059-12',84,2),mk('2060-01',85,3)],periods:[79,80,84,85].map((age,i)=>({age,annualRowIndex:i,monthCount:1}))};
test('年齢境界は計算エンジン月次年齢に従い80歳と85歳で変化',()=>{
 const x=previewAgeExpenseAgainstReconciliation(trace);
 assert.deepEqual(x.months.map(m=>m.referenceBaseMonthly),[44,47,47,44.1]);
 assert.deepEqual(x.months.map(m=>m.vehicleActive),[true,true,true,false]);
 assert.equal(x.periods[1].variance,3);
 assert.ok(Math.abs(x.periods[3].variance-0.1)<1e-9);
 assert.equal(x.adopted,false);
});
test('物価係数を二重適用せず既存価格基準で比較',()=>{
 const x=structuredClone(trace);x.months[1]=mk('2055-01',80,1,1.5);
 const p=previewAgeExpenseAgainstReconciliation(x);
 assert.equal(p.months[1].referenceMonthly,70.5);
 assert.equal(p.months[1].actualMonthly,66);
 assert.equal(p.months[1].variance,4.5);
});
test('出典不一致や未確認月を0として採用しない',()=>{
 const x=structuredClone(trace);
 x.months[0].budget.base.priceBasis='target-period-nominal';
 x.months[1].budget.check.amount=43;
 x.months[2].scope='family-reference';
 const p=previewAgeExpenseAgainstReconciliation(x);
 assert.deepEqual(p.months.slice(0,3).map(m=>m.status),['unresolved','unresolved','unresolved']);
 assert.equal(p.periods[0].referenceTotal,null);
 assert.equal(p.periods[1].variance,null);
});
test('入力データは変更しない',()=>{
 const before=structuredClone(trace);
 previewAgeExpenseAgainstReconciliation(trace);
 assert.deepEqual(trace,before);
});
