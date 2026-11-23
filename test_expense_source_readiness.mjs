import test from 'node:test';
import assert from 'node:assert/strict';
import {expenseSourceReadiness} from './expense-source-readiness.mjs';
import {expenseSourceReadinessHtml} from './expense-display.mjs';

const fake=(items)=>({expenseDetail:{monthlyCategories:[{key:'fixed',label:'架空の固定費',items}]}});
test('missing key with saved amount is distinguished from missing amount with saved key',()=>{
 const c=fake([{label:'識別情報なし',amount:5},{key:'has-id',label:'金額なし'}]);
 const saved=structuredClone(c),r=expenseSourceReadiness(c);
 assert.equal(r.counts.missingId,1);assert.equal(r.counts.missingAmount,1);
 assert.equal(r.items[0].identity,'missing');assert.equal(r.items[0].amount,'present');
 assert.equal(r.items[1].identity,'present');assert.equal(r.items[1].amount,'missing');
 assert.deepEqual(c,saved);
});
test('explicit zero is a present amount; invalid negative and nonnumeric amounts are separately identified',()=>{
 const r=expenseSourceReadiness(fake([{key:'zero',amount:0},{key:'negative',amount:-1},{key:'bad',amount:'not-number'}]));
 assert.equal(r.counts.ready,1);assert.equal(r.counts.invalidAmount,2);assert.equal(r.counts.missingAmount,0);
});
test('duplicate keys are flagged without guessing or auto-renaming identities',()=>{
 const c=fake([{key:'same',amount:1},{key:'same',amount:2}]),before=structuredClone(c),r=expenseSourceReadiness(c);
 assert.equal(r.counts.needsReview,1);assert.match(r.items[1].action,/重複/);assert.deepEqual(c,before);
});
test('missing parent key is reported, and parent amount is not required when children exist',()=>{
 const c={expenseDetail:{monthlyCategories:[{label:'大項目',items:[{key:'child',amount:2}]}]}};
 const r=expenseSourceReadiness(c);
 assert.equal(r.counts.missingId,1);assert.equal(r.counts.missingAmount,0);
 assert.equal(r.items[0].amount,'not-applicable');
});
test('diagnostic HTML is escaped and contains no actual monetary amounts or data paths',()=>{
 const c=fake([{label:'<img src=x>',amount:823.45}]);
 const r=expenseSourceReadiness(c),html=expenseSourceReadinessHtml(r);
 assert.ok(!html.includes('<img src=x>'));assert.match(html,/&lt;img/);
 assert.ok(!html.includes('823.45'));assert.ok(!html.includes('/expenseDetail/'));
});
test('a complete source has no disruptive diagnostic summary',()=>{
 const r=expenseSourceReadiness(fake([{key:'rent',amount:5},{key:'water',amount:0}]));
 assert.equal(r.counts.needsReview,0);assert.equal(expenseSourceReadinessHtml(r),'');
});
test('missing standard data is not treated as zero or replaced by legacy records',()=>{
 const r=expenseSourceReadiness({cashflow:{expenseCategories:[{key:'old',amount:9}]}});
 assert.equal(r.status,'not-registered');assert.equal(r.items.length,0);assert.equal(expenseSourceReadinessHtml(r),'');
});
