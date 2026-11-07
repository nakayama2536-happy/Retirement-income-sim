import test from 'node:test';import assert from 'node:assert/strict';
import {inspectLegacyExpenseMigration as check} from './lifeplan-expense-migration-preflight.mjs';
const sample=()=>({plan:{startAge:65,endAge:99},cashflow:{expenseCategories:[{key:'food',items:[{key:'groceries',periods:[{fromAge:65,toAge:95,amount:9}]}]}]}});
test('95 yes 96 no means review, never infer zero',()=>{const r=check(sample());assert.equal(r.referenceAge95,1);assert.equal(r.referenceAge96,0);assert.equal(r.status,'review-required');assert.equal(r.proposedWrites,0);});
test('overlapping periods blocks',()=>{const c=sample();c.cashflow.expenseCategories[0].items[0].periods.push({fromAge:95,toAge:99,amount:10});assert.equal(check(c).status,'blocked');});
test('explicit coverage 65-99 can proceed to mapping review',()=>{const c=sample();c.cashflow.expenseCategories[0].items[0].periods[0].toAge=99;assert.equal(check(c).status,'eligible-for-mapping-review');});
test('existing standard stays separate',()=>{const c=sample();c.expenseDetail={monthlyCategories:[{key:'food',amount:12}]};assert.ok(check(c).diagnostics.some(x=>x.code==='STANDARD_ALREADY_PRESENT'));});
test('missing is not zero',()=>{const c=sample();delete c.cashflow.expenseCategories[0].items[0].periods[0].amount;assert.equal(check(c).status,'blocked');});
test('original config remains unchanged',()=>{const c=sample(),b=JSON.stringify(c);check(c);assert.equal(JSON.stringify(c),b);});