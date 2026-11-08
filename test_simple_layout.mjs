import test from 'node:test';
import assert from 'node:assert/strict';
import {annualCheckText} from './simple-layout.mjs';
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

test('家族向け設定・バックアップは表示と重要操作を分け、保存処理を追加しない',async()=>{
 const {readFileSync}=await import('node:fs');
 const source=readFileSync(new URL('./simple-layout.mjs',import.meta.url),'utf8');
 assert.match(source,/settingsOverview\.before\(guide\)/);
 assert.match(source,/group\('finance','条件を変更する/);
 assert.match(source,/group\('backup','① 一括バックアップ/);
 assert.match(source,/group\('cloud','② クラウド/);
 assert.match(source,/group\('restore','③ 復旧用/);
 assert.match(source,/wrap\(importLabel,'重要操作/);
 assert.doesNotMatch(source,/localStorage|commitState|restoreFullBackup|replaceLocal|signInWith/);
});
