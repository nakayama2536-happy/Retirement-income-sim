import test from 'node:test';import assert from 'node:assert/strict';import {allocateTaxSocial} from './tax-social-allocation.mjs';
test('年金天引きと支出負担で同一税を二重計上しない',()=>{
 const x=allocateTaxSocial({grossPension:25,lines:[{id:'income-tax',amount:1,route:'pension-withheld'},{id:'national-health',amount:2,route:'expense-paid'}]});
 assert.deepEqual(x,{grossPension:25,netPension:24,withheld:1,expensePaid:2,unknownCount:0,complete:true,totalCashflowDeduction:3,alreadyWithheldNotExpense:1});
});
test('不明税額はゼロ扱いせず未確認とし、同一項目ID重複は拒否する',()=>{
 const x=allocateTaxSocial({grossPension:25,lines:[{id:'care',route:'unconfirmed'}]});assert.equal(x.complete,false);assert.equal(x.unknownCount,1);
 assert.throws(()=>allocateTaxSocial({grossPension:25,lines:[{id:'tax',amount:1,route:'pension-withheld'},{id:'tax',amount:1,route:'expense-paid'}]}),/重複/);
 assert.throws(()=>allocateTaxSocial({grossPension:25,lines:[{id:'tax',amount:26,route:'pension-withheld'}]}),/超え/);
});
