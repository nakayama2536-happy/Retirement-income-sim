import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareExpenseUnification,resolveUnifiedExpenseAtAge} from './lifeplan-expense-unification-candidate.mjs';
const fixture=()=>({plan:{startAge:65,endAge:99},cashflow:{expenseCategories:[
 {key:'fixed',label:'固定費',items:[{key:'rent',label:'住居',periods:[{fromAge:65,toAge:95,amount:12}]}]},
 {key:'variable',label:'変動費',items:[{key:'food',label:'食費',periods:[{fromAge:65,toAge:79,amount:6},{fromAge:80,toAge:95,amount:7}]},{key:'care',label:'介護',periods:[{fromAge:95,toAge:95,amount:0}]}]}
],periodOverrides:[]}});
const attempt=c=>prepareExpenseUnification(c);
test('creates candidate without modifying source',()=>{const c=fixture(),before=structuredClone(c),r=attempt(c);assert.equal(r.status,'candidate-only');assert.deepEqual(c,before);assert.equal(r.candidate.cashflow.expenseCategories.length,2);assert.equal(r.summary.items,3);assert.equal(r.summary.periodOverrides,4);});
test('95 is resolved; 96 is MISSING not 0',()=>{const r=attempt(fixture());assert.deepEqual(resolveUnifiedExpenseAtAge(r.candidate,'fixed','rent',95),{status:'resolved',amount:12});assert.deepEqual(resolveUnifiedExpenseAtAge(r.candidate,'fixed','rent',96),{status:'missing',amount:null,reason:'outside-original-coverage'});});
test('explicit zero remains resolved zero',()=>{const r=attempt(fixture());assert.deepEqual(resolveUnifiedExpenseAtAge(r.candidate,'variable','care',95),{status:'resolved',amount:0});assert.equal(resolveUnifiedExpenseAtAge(r.candidate,'variable','care',96).amount,null);});
test('multiple ranges preserve boundary and gaps',()=>{const c=fixture();c.cashflow.expenseCategories[1].items[0].periods=[{fromAge:65,toAge:75,amount:6},{fromAge:80,toAge:95,amount:7}];const r=attempt(c);assert.equal(resolveUnifiedExpenseAtAge(r.candidate,'variable','food',75).amount,6);assert.equal(resolveUnifiedExpenseAtAge(r.candidate,'variable','food',76).status,'missing');assert.equal(resolveUnifiedExpenseAtAge(r.candidate,'variable','food',80).amount,7);});
test('existing standard content blocks',()=>{const c=fixture();c.expenseDetail={monthlyCategories:[{key:'fixed',items:[]}]};assert.equal(attempt(c).status,'blocked');});
test('overlapping periods block',()=>{const c=fixture();c.cashflow.expenseCategories[0].items[0].periods.push({fromAge:95,toAge:99,amount:12});assert.equal(attempt(c).status,'blocked');});
test('no missing or invalid amount is converted to zero',()=>{const c=fixture();delete c.cashflow.expenseCategories[0].items[0].periods[0].amount;assert.equal(attempt(c).status,'blocked');});
test('item-key collision across groups blocks ambiguous override mapping',()=>{const c=fixture();c.cashflow.expenseCategories[1].items[0].key='rent';assert.equal(attempt(c).status,'blocked');});
test('tax category blocks pending separate review',()=>{const c=fixture();c.cashflow.expenseCategories.push({key:'taxSocial',fallbackMonthly:3,items:[]});assert.equal(attempt(c).status,'blocked');});
test('travel requires separate review',()=>{const c=fixture();c.cashflow.travel=[{fromAge:65,toAge:99,annualAmount:10}];assert.equal(attempt(c).status,'blocked');});
test('candidate marker prevents duplicate conversion',()=>{const first=attempt(fixture());assert.equal(attempt(first.candidate).status,'blocked');});
test('nonexpense work overrides survive candidate',()=>{const c=fixture();c.cashflow.periodOverrides.push({kind:'budget',key:'budget',fromAge:65,toAge:99,amount:600,unit:'annual'});const r=attempt(c);assert.equal(r.status,'candidate-only');assert.equal(r.candidate.cashflow.periodOverrides.filter(x=>x.kind==='budget').length,1);});