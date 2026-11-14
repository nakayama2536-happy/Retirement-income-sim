import test from 'node:test';
import assert from 'node:assert/strict';
import {mortalityExpenseChangeText,mortalityItemizedTotals} from './mortality-itemized-ui.mjs';
const fmt= (before,after)=>mortalityExpenseChangeText(before,after);
test('factor below one reduces expense and labels subtraction',()=>{
 const t=mortalityItemizedTotals([{id:'food',priceBasis:'plan-start-base'}],{expense:55,unallocated:45,priceFactor:1,amounts:{food:10}},{food:.6},1);
 assert.equal(t.fullAfter,51);
 assert.match(fmt(t.fullBefore,t.fullAfter),/− 減額 4万円/);
});
test('factor above one increases expense and labels addition, not negative reduction',()=>{
 const t=mortalityItemizedTotals([{id:'food',priceBasis:'plan-start-base'}],{expense:55,unallocated:45,priceFactor:1,amounts:{food:10}},{food:1.2},1);
 assert.equal(t.fullAfter,57);
 const v=fmt(t.fullBefore,t.fullAfter);
 assert.match(v,/＋ 増額 2万円/);
 assert.doesNotMatch(v,/− 減額/);
});
test('factor equal to one displays no change',()=>{assert.match(fmt(55,55),/変更なし/);});
test('invalid totals are not quietly displayed',()=>{assert.throws(()=>fmt(55,NaN));assert.throws(()=>fmt(-1,0));});
