import test from 'node:test';import assert from 'node:assert/strict';
import {mortalityExpenseAuditRows,mortalityExpenseItemRows,mortalityExpenseAuditCsv,mortalityExpenseItemCsv} from './mortality-expense-csv.mjs';
const fixture=()=>({
 original:{monthlyDetails:[{month:'2071-01',annualAge:95,extraExpense:0},{month:'2072-01',annualAge:96,extraExpense:0}]},
 mortality:{monthly:[{month:'2071-01',postDeath:true,baselineExpense:100,expenseReduction:20,expense:80,extraExpense:0,funeralExpense:0},{month:'2072-01',postDeath:true,baselineExpense:102,expenseReduction:0,expense:102,extraExpense:0,funeralExpense:0}]},
 itemized:{sourceProfile:'work-v0.9.7',items:[{id:'food',label:'食費'}],months:[{month:'2071-01',amounts:{food:40},unallocated:60,known:40},{month:'2072-01',amounts:{},unallocated:102,known:0}]},
 itemFactors:{food:0.5,unallocated:1}
});
test('expense CSV preserves 96-year no-reduction result',()=>{const rows=mortalityExpenseAuditRows(fixture());assert.equal(rows[0].expenseReduction,20);assert.equal(rows[1].expenseReduction,0);assert.equal(rows[1].identityStatus,'一致');});
test('expense CSV identifies unavailable expense items',()=>{const rows=mortalityExpenseItemRows(fixture());assert.equal(rows.find(x=>x.month==='2072-01'&&x.itemId==='food').status,'対象期間外または未登録');assert.equal(rows.find(x=>x.month==='2072-01'&&x.itemId==='food').baseAmount,null);});
test('expense CSV BOM / known audit columns',()=>{assert.ok(mortalityExpenseAuditCsv(fixture()).startsWith('\ufeff年月'));assert.ok(mortalityExpenseItemCsv(fixture()).includes('未照合の管理予算残額'));});
test('expense CSV rejects mismatched budget',()=>{const f=fixture();f.mortality.monthly[0].expense=79;assert.throws(()=>mortalityExpenseAuditRows(f),/一致しません/);});
