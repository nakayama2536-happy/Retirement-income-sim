import test from 'node:test';import assert from 'node:assert/strict';
import {mortalityExpenseAuditRows,mortalityExpenseItemRows,mortalityExpenseAuditCsv,mortalityExpenseItemCsv,mortalityAssetAuditRows,mortalityAssetAuditCsv} from './mortality-expense-csv.mjs';
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

test('expense CSV keeps negative numeric reductions as numeric fields',()=>{const f=fixture();f.mortality.monthly[0].expenseReduction=-10;f.mortality.monthly[0].expense=110;f.itemFactors.food=1.25;const rows=mortalityExpenseAuditCsv(f).split('\r\n');assert.ok(rows[1].includes(',-10,110,'));});

test('pre-death item CSV uses the unchanged baseline despite configured postdeath multipliers',()=>{const f=fixture();f.mortality.monthly[0].postDeath=false;f.mortality.monthly[0].expenseReduction=0;f.mortality.monthly[0].expense=100;const rows=mortalityExpenseItemRows(f);const food=rows.find(x=>x.month==='2071-01'&&x.itemId==='food');assert.equal(food.factor,0.5);assert.equal(food.afterAmount,40);assert.equal(food.difference,0);});

function assetFixture(){
 const f=fixture();
 f.original.monthlyDetails[0].annualAge=95;f.original.monthlyDetails[1].annualAge=96;
 Object.assign(f.mortality.monthly[0],{startAsset:100,investmentGain:1,income:10,extraExpense:2,funeralExpense:0,endAsset:29});
 Object.assign(f.mortality.monthly[1],{startAsset:29,investmentGain:0,income:5,extraExpense:1,funeralExpense:0,endAsset:-69});
 return f;
}
test('asset CSV computes exact monthly balances, reduction identity, initial negative month',()=>{
 const f=assetFixture(),rows=mortalityAssetAuditRows(f);
 assert.equal(rows.length,2);assert.equal(rows[0].endAsset,29);assert.equal(rows[1].endAsset,-69);
 assert.equal(rows[0].firstNegative,'いいえ');assert.equal(rows[1].firstNegative,'はい');
 assert.ok(mortalityAssetAuditCsv(f).startsWith('\ufeff年月'));
 assert.ok(mortalityAssetAuditCsv(f).includes('月末資産_万円'));
});
test('asset CSV stops on invalid arithmetic and asset continuity',()=>{
 const f=assetFixture();f.mortality.monthly[1].endAsset=-68;
 assert.throws(()=>mortalityAssetAuditRows(f),/月末資産/);
 f.mortality.monthly[1].endAsset=-69;f.mortality.monthly[1].startAsset=30;f.mortality.monthly[1].endAsset=-68;
 assert.throws(()=>mortalityAssetAuditRows(f),/前月末/);
});
test('asset CSV never changes its input comparison',()=>{
 const f=assetFixture(),snapshot=JSON.stringify(f);
 mortalityAssetAuditCsv(f);assert.equal(JSON.stringify(f),snapshot);
});
