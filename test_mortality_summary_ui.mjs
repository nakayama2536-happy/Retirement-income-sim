import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('./mortality-ui.mjs',import.meta.url),'utf8');
test('年金の試算用入力を詳細欄に格納し65歳基準の参照表示を維持',()=>{
 const manual=ui.indexOf('<details id="mortalityPensionSettings">');
 const total=ui.indexOf('name="survivorPension"');
 const pre=ui.indexOf('name="preClaimPension"');
 assert(manual>=0 && total>manual && pre>manual);
 assert.match(ui,/id="mortalityPensionAuto"/);
});
test('支出減額と結果月額は計算済み値を読むだけで保存値を変更しない',()=>{
 assert.match(ui,/id='mortalityQuickSummary'/);
 assert.match(ui,/after\.expenseReduction/);
 assert.match(ui,/before\.expense/);
 assert.match(ui,/after\.expense/);
 assert.match(ui,/after\.publicPension/);
});

test('死亡翌月の基準・減額・変更後を要約直下に表示し増額にも対応',()=>{
 assert.match(ui,/id='mortalityBudgetIdentity'/);
 assert.match(ui,/after\.expenseReduction<0\?'＋':'−'/);
 assert.match(ui,/Math\.abs\(after\.expenseReduction\)/);
 assert.match(ui,/formatTotal\(before\.expense\)/);
 assert.match(ui,/formatTotal\(after\.expense\)/);
 assert.match(ui,/保存済みの管理予算は変更しません/);
});
