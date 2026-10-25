import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const html=read('./index.html'),app=read('./app.mjs'),helper=read('./ui-entry-guards.mjs'),sw=read('./sw.js');
for(const id of ['periodEditForm','periodChangePreview','periodChangeSummary','periodChangeReviewed','periodChangeApply','periodChangeCancel','budgetPriceBase','periodPriceBase','expensesPriceBase'])
 test('HUI02 required form and safety anchor exists: '+id,()=>assert.ok(html.includes(`id="${id}"`)));
test('HUI02 original period form no longer says immediate save',()=>{
 assert.doesNotMatch(html,/>期間設定を保存・反映<\/button>/);
 assert.match(html,/変更内容を確認（まだ保存しない）/);
 assert.match(html,/この変更を取り消す（未保存）/);
});
test('HUI02 old instantaneous delete route not executed on first click',()=>{
 assert.doesNotMatch(app,/if\(dp\)\{const next=structuredClone\(config\)/);
 assert.match(app,/periodPreview=planPeriodDelete/);
 assert.match(app,/el\('periodChangeReviewed'\)\.checked/);
 assert.match(app,/confirmPeriodOverride\(\)/);
});
test('HUI02 guards live state and stale form before commit',()=>{
 assert.match(app,/proposalStamp\(live\)!==preview\.baseStamp/);
 assert.match(app,/JSON\.stringify\(parsePeriodForm\(el\('periodEditForm'\)\)\)!==preview\.formStamp/);
 assert.match(app,/verifyPeriodPlan\(\{config,scenarios\},preview\)/);
 assert.match(app,/if\(!commitState\(candidate\)\)/);
});
test('HUI02 settings numeric fields never coerce blank directly in submit handler',()=>{
 const save=app.slice(app.indexOf('function applySettings(ev)'),app.indexOf('\n\nfunction renderCalculationBasis'));
 assert.match(save,/basicSettingsValues\(ev\.currentTarget\)/);
 assert.doesNotMatch(save,/\+f\./);
 assert.match(helper,/未入力/);
});
test('HUI02 budget-only key is guarded and not silently ignored',()=>{
 assert.match(helper,/kind==='budget'&&key!=='budget'/);
 assert.match(app,/elements\.key\.value='budget'/);
});
test('HUI02 dynamic price-base description is wired at all three panels',()=>{
 for(const id of ['expensesPriceBase','periodPriceBase','budgetPriceBase'])assert.match(app,new RegExp(id));
 assert.match(helper,/priceBaseMonth/);
 assert.match(helper,/計算開始月/);
 assert.doesNotMatch(html,/金額は64歳時点の価格として扱い/);
});
test('HUI02 new standalone module is available offline without SW takeover',()=>{
 assert.match(sw,/ASSETS\.push\('\.\/ui-entry-guards\.mjs'\)/);
 assert.doesNotMatch(sw,/skipWaiting\s*\(/);
 assert.doesNotMatch(sw,/clients\.claim\s*\(/);
});
