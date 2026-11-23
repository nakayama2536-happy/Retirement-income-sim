import test from 'node:test';
import assert from 'node:assert/strict';
import {expenseDiagnosticSummary,expenseDiagnosticSummaryHtml,expenseDisplayHtml} from './expense-display.mjs';

const item=(label,amount,codes=[],children=[])=>({label,amount,diagnosticCodes:codes,unresolvedReasons:[],children,sourceRefs:[],itemId:'fixture-'+label});
const model=rows=>({status:'ready',sourceProfile:'work-v0.9.7',age:80,rows,period:{monthCount:12,actualExpense:100,detailTotal:null,gap:null,overBudgetMonths:[],unresolvedMonthCount:12,familyReferenceMonthCount:0},diagnostics:[],limitations:[]});
test('the overview reports individual children but does not double-count their parent',()=>{
 const m=model([item('固定費',null,['incomplete-detail'],[item('家賃',null,['missing-identity','invalid-or-missing-amount']),item('通信費',0)])]);
 const result=expenseDiagnosticSummary(m);
 assert.equal(result.total,1);
 assert.equal(result.counts.identity,1);
 assert.equal(result.counts.amount,1);
 assert.equal(result.counts.other,0);
 assert.equal(result.items[0].label,'固定費 ＞ 家賃');
 assert.match(expenseDiagnosticSummaryHtml(m),/未確定の原因一覧（1項目・読取り専用）/);
});
test('unknown monetary value is different from explicitly saved zero',()=>{
 const result=expenseDiagnosticSummary(model([item('未入力',null,['invalid-or-missing-amount']),item('明示したゼロ',0)]));
 assert.equal(result.total,1);
 assert.equal(result.counts.amount,1);
});
test('tax and price problems do not masquerade as missing amounts',()=>{
 const result=expenseDiagnosticSummary(model([item('税',null,['deferred-tax-calculation']),item('換算',null,['missing-engine-price-factor'])]));
 assert.deepEqual(result.counts,{identity:0,amount:0,tax:1,period:0,price:1,other:0});
});
test('unclassified issues remain visible and invalid periods are counted',()=>{
 const result=expenseDiagnosticSummary(model([item('期間',null,['invalid-period']),item('ほか',null,['unknown-code'])]));
 assert.equal(result.total,2);assert.equal(result.counts.period,1);assert.equal(result.counts.other,1);
});
test('user-visible detail escapes private labels; internal IDs remain collapsed',()=>{
 const m=model([item('<img src=x onerror=alert(1)>',null,['missing-identity'])]);
 const output=expenseDisplayHtml(m,{}).detail;
 assert.ok(!output.includes('<img src=x'));assert.match(output,/&lt;img/);
 assert.match(output,/<details class="expense-diagnostic-summary">/);
 assert.match(output,/技術情報（確認用）/);
});
test('read-only overview leaves the original model and all calculation totals unchanged',()=>{
 const m=model([item('車関連',null,['invalid-or-missing-amount'])]),before=structuredClone(m);
 const a=expenseDiagnosticSummary(m),b=expenseDiagnosticSummaryHtml(m);
 assert.equal(a.total,1);assert.ok(b.length>0);assert.deepEqual(m,before);
 assert.equal(m.period.actualExpense,100);assert.equal(m.period.detailTotal,null);
});
test('no diagnostic block for resolved details or absent source',()=>{
 assert.equal(expenseDiagnosticSummaryHtml(model([item('既存値',120)])),'');
 assert.equal(expenseDiagnosticSummary({status:'choose-source'}).total,0);
});
