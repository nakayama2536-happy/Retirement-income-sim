import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewExpenseUnification} from './lifeplan-expense-unification-review.mjs';
const fixture=()=>({plan:{startAge:65,endAge:99},cashflow:{expenseCategories:[{key:'food',items:[{key:'grocery',periods:[{fromAge:65,toAge:95,amount:12}]}]}],periodOverrides:[]}});
test('read-only preview reports 95 yes, 96 no without exposing monetary amounts',()=>{
 const c=fixture(),before=JSON.stringify(c),r=reviewExpenseUnification(c);
 assert.equal(r.status,'candidate-only');assert.equal(r.adoptable,false);assert.equal(r.candidateAvailable,true);
 assert.deepEqual(r.count,{legacy:1,standard:0,age95:1,age96:0});
 assert.equal(JSON.stringify(c),before);assert.equal(r.candidate,undefined);
 assert.equal(JSON.stringify(r).includes('"amount":12'),false);
});
test('coexisting standard configuration blocks automatic conversion',()=>{
 const c=fixture();c.expenseDetail={monthlyCategories:[{key:'food',amount:10}]};
 const r=reviewExpenseUnification(c);assert.equal(r.status,'blocked');assert.equal(r.adoptable,false);
 assert.ok(r.issues.some(i=>i.code==='STANDARD_EXISTS'));
});
test('explicit zero stays present through inspection; gap remains unregistered',()=>{
 const c=fixture();c.cashflow.expenseCategories[0].items[0].periods[0].amount=0;
 const r=reviewExpenseUnification(c);assert.equal(r.count.age95,1);assert.equal(r.count.age96,0);
});
test('invalid/missing money blocks rather than being filled as zero',()=>{
 const c=fixture();delete c.cashflow.expenseCategories[0].items[0].periods[0].amount;
 const r=reviewExpenseUnification(c);assert.equal(r.status,'blocked');assert.equal(r.adoptable,false);
});
test('empty config does not become an adopted zero',()=>{
 const r=reviewExpenseUnification(null);assert.equal(r.status,'no-config');assert.equal(r.adoptable,false);
});
test('source errors are not surfaced as leaked data',()=>{
 const c=fixture();c.cashflow.expenseCategories={};const r=reviewExpenseUnification(c);
 assert.equal(r.status,'blocked');assert.equal(r.adoptable,false);
});