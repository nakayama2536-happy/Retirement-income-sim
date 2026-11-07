import test from 'node:test';
import assert from 'node:assert/strict';
import {auditMortalityExpense} from './mortality-expense-audit.mjs';
const base=[{month:'2060-01',expense:55},{month:'2060-02',expense:55},{month:'2060-03',expense:55}];
const preview=[
 {month:'2060-01',postDeath:false,expenseReduction:0,expense:55,income:20,extraExpense:0,funeralExpense:0,startAsset:1000,investmentGain:0,endAsset:965},
 {month:'2060-02',postDeath:true,expenseReduction:10,expense:45,income:15,extraExpense:0,funeralExpense:0,startAsset:965,investmentGain:0,endAsset:935},
 {month:'2060-03',postDeath:true,expenseReduction:10,expense:45,income:15,extraExpense:0,funeralExpense:0,startAsset:935,investmentGain:0,endAsset:905}
];
test('死亡翌月から支出減算、全期間の月末資産を検算',()=>{
 const copy=structuredClone(preview),actual=auditMortalityExpense(base,preview);
 assert.equal(actual.totalExpenseReduction,20);assert.equal(actual.firstChangedMonth,'2060-02');
 assert.deepEqual(actual.months.map(x=>x.adjustedExpense),[55,45,45]);
 assert.deepEqual(preview,copy);
});
test('減額が支出に反映されない場合は停止',()=>{
 const rows=structuredClone(preview);rows[1].expense=55;
 assert.throws(()=>auditMortalityExpense(base,rows),/一致しません/);
});
test('減額が月末資産に反映されない場合は停止',()=>{
 const rows=structuredClone(preview);rows[1].endAsset=925;
 assert.throws(()=>auditMortalityExpense(base,rows),/月末資産/);
});
test('死亡月前の不正な減額・翌月初残高不連続を拒否',()=>{
 const rows=structuredClone(preview);rows[0].expenseReduction=1;
 assert.throws(()=>auditMortalityExpense(base,rows),/死亡月以前|一致しません/);
 const other=structuredClone(preview);other[2].startAsset=900;
 assert.throws(()=>auditMortalityExpense(base,other),/月初残高|月末資産/);
});
test('負の減額は支出増額として取り扱う',()=>{
 const rows=structuredClone(preview);rows[1].expenseReduction=-5;rows[1].expense=60;rows[1].endAsset=920;
 rows[2].startAsset=920;rows[2].endAsset=890;
 assert.equal(auditMortalityExpense(base,rows).totalExpenseReduction,5);
});
test('死亡月の一時費用を一度だけ計上',()=>{
 const rows=structuredClone(preview);rows[0].funeralExpense=25;rows[0].endAsset=940;
 rows[1].startAsset=940;rows[1].endAsset=910;rows[2].startAsset=910;rows[2].endAsset=880;
 assert.equal(auditMortalityExpense(base,rows).months[0].monthEndAsset,940);
});
