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

import {mortalityFamilyResultModel} from './mortality-ui.mjs';

test('家族向け結果要約は同じ月次資産・支出・年金の値を読み取り、元データを変更しない',()=>{
 const original={monthlyDetails:[{month:'2044-08',expense:60},{month:'2044-09',expense:64.5}]};
 const mortality={firstChangedMonth:'2044-09',firstNegativeMonth:'2067-11',finalAsset:-4629.7,
 monthly:[{month:'2044-08'},{month:'2044-09',publicPension:14.8,expense:54.3,expenseReduction:10.2}]};
 const input={original,mortality,parameters:{deceased:'primary',deathMonth:'2044-08'}};
 const before=JSON.stringify(input);
 const model=mortalityFamilyResultModel(input);
 assert.deepEqual([model.referenceMonth,model.expense,model.reduction,model.pension,model.firstNegativeMonth,model.finalAsset],
 ['2044-09',54.3,10.2,14.8,'2067-11',-4629.7]);
 assert.equal(model.deceased,'計画の本人');assert.equal(JSON.stringify(input),before);
});

test('期間末死亡では死亡後の年金・生活費を推定しない',()=>{
 const model=mortalityFamilyResultModel({original:{monthlyDetails:[{month:'2080-12',expense:40}]},
 mortality:{monthly:[{month:'2080-12',endAsset:10}],firstChangedMonth:'2081-01',firstNegativeMonth:null,finalAsset:10},
 parameters:{deceased:'spouse',deathMonth:'2080-12'}});
 assert.equal(model.referenceMonth,null);assert.equal(model.pension,null);assert.equal(model.expense,null);
 assert.equal(model.firstNegativeMonth,null);assert.equal(model.deceased,'計画の配偶者');
});

test('家族向けの結果は計算表を折りたたみ、詳細とCSVを温存する',()=>{
 assert.match(ui,/id='mortalityFamilySummary'/);
 assert.match(ui,/id='mortalityAdvancedDetails'/);
 assert.match(ui,/計算の詳しい内容・比較表・CSVを見る/);
 assert.match(ui,/advancedBody\.append\(\.\.\.Array\.from\(results\.children\)\)/);
 assert.match(ui,/renderMortalityFamilySummary\(\{mortality,original,parameters\}\)/);
});
