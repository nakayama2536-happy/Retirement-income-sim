import test from 'node:test';
import assert from 'node:assert/strict';
import {annualCheckText,familyAgeLedgerSummary,familyAgeEndShortageSummary} from './simple-layout.mjs';
const row={age:65,status:'ready',identityMatches:true,sourceProfile:'work-v0.9.7',unresolvedMonthCount:0,overBudgetMonths:[]};
test('全期間の一致を表示し元データを変更しない',()=>{
 const rows=[row,{...row,age:66}];const before=structuredClone(rows);
 assert.match(annualCheckText(rows),/全2年齢期/);assert.deepEqual(rows,before);
});
test('別年齢の不一致を落とさない',()=>assert.match(annualCheckText([row,{...row,age:70,identityMatches:false}]),/確認できない年齢期：70歳/));
test('未確定・予算超過・出典不明を保持',()=>{
 const text=annualCheckText([{...row,sourceProfile:'',unresolvedMonthCount:3,overBudgetMonths:[1]}]);
 for(const term of ['未確定','0とみなしません','管理予算を超える','採用元'])assert.ok(text.includes(term));
});
test('空の結果を合格にしない',()=>assert.match(annualCheckText([]),/未確認/));
test('未計算期間を不一致と区別せず確認不能として警告する',()=>assert.match(annualCheckText([{age:66,status:'no-period'}]),/確認できない年齢期：66歳/));

test('家族向け年齢期要約は既存の年間収支を読み取るだけで元データを変更しない',()=>{
 const rows=[
 {age:65,startAsset:500,investmentGain:10,totalIncome:120,expense:80,extraExpense:20,endAsset:530},
 {age:66,startAsset:530,investmentGain:12,totalIncome:90,expense:120,extraExpense:0,endAsset:512}
 ];
 const before=structuredClone(rows);
 const r=familyAgeLedgerSummary(rows,65);
 assert.equal(r.status,'ready');
 assert.deepEqual([r.income,r.expense,r.netCashflow,r.endAsset],[120,100,20,530]);
 assert.deepEqual(rows,before);
 assert.equal(familyAgeLedgerSummary(rows,70).status,'unavailable');
});
test('家族向け不足表示は最初の年齢期末のみ。月次不足や借入と断定しない',()=>{
 const rows=[{age:90,endAsset:200},{age:91,endAsset:-10},{age:92,endAsset:-200}];
 assert.deepEqual(familyAgeEndShortageSummary(rows),{status:'ready',age:91,message:'初めて年齢期末の残高がマイナスになったのは91歳期末です'});
 assert.equal(familyAgeEndShortageSummary([{age:95,endAsset:0}]).age,null);
 assert.equal(familyAgeEndShortageSummary([{age:95,endAsset:NaN}]).status,'unavailable');
 assert.equal(familyAgeEndShortageSummary([]).status,'unavailable');
});
test('年額要約で欠損した収入をゼロとして補完しない',()=>{
 assert.equal(familyAgeLedgerSummary([{age:70,startAsset:20,investmentGain:0,expense:10,extraExpense:0,endAsset:10}],70).status,'unavailable');
});
