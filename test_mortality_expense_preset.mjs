import test from 'node:test';
import assert from 'node:assert/strict';
import {readMortalityExpensePreset,mortalityFactorForItem} from './mortality-expense-preset.mjs';
const example={mortalityExpensePreset:{version:1,sourceProfile:'public-v0.9',deceased:'primary',unallocatedFactor:1,
  factorsByItemKey:{rent:1,primaryMobile:0,spouseMobile:1,food:0.6,insurance1:0,insurance3:1}}};
test('private saved multipliers resolve by stable expense key without changing adopted config',()=>{
 const before=JSON.stringify(example),p=readMortalityExpensePreset(example);
 assert.equal(p.sourceProfile,'public-v0.9');
 assert.equal(mortalityFactorForItem(p,'expense/key:fixed/key:primaryMobile'),0);
 assert.equal(mortalityFactorForItem(p,'expense/key:variable/key:food'),0.6);
 assert.equal(mortalityFactorForItem(p,'expense/key:insurance/key:insurance1'),0);
 assert.equal(mortalityFactorForItem(p,'expense/key:insurance/key:insurance3'),1);
 assert.equal(mortalityFactorForItem(p,'expense/key:car/key:unlisted'),1);
 assert.equal(JSON.stringify(example),before);
});
test('missing preset preserves existing UI default and malformed preset blocks unsafe adoption',()=>{
 assert.equal(readMortalityExpensePreset({}),null);
 assert.equal(mortalityFactorForItem(null,'expense/key:fixed/key:rent'),1);
 assert.throws(()=>readMortalityExpensePreset({mortalityExpensePreset:{...example.mortalityExpensePreset,unallocatedFactor:null}}));
 assert.throws(()=>readMortalityExpensePreset({mortalityExpensePreset:{...example.mortalityExpensePreset,factorsByItemKey:{food:NaN}}}));
});
