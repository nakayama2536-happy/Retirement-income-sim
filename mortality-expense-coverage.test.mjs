import test from 'node:test';
import assert from 'node:assert/strict';
import {mortalityExpenseCoverageBreaks} from './mortality-ui.mjs';

const example=()=>({
  itemized:{months:[
    {month:'2070-07',known:79.68,unallocated:6.4},
    {month:'2070-08',known:0,unallocated:86.22},
    {month:'2070-09',known:0,unallocated:86.4}
  ]},
  mortality:{monthly:[
    {month:'2070-07',postDeath:true},
    {month:'2070-08',postDeath:true},
    {month:'2070-09',postDeath:true}
  ]},
  baseline:[
    {month:'2070-07',annualAge:95,expense:86.08},
    {month:'2070-08',annualAge:96,expense:86.22},
    {month:'2070-09',annualAge:96,expense:86.4}
  ]
});
test('Detects transition from known expense items to all-unallocated budget',()=>{
 const x=example();assert.deepEqual(mortalityExpenseCoverageBreaks(x.itemized,x.mortality,x.baseline),[
  {month:'2070-08',age:96,priorKnown:79.68,budget:86.22,months:2}
 ]);
});
test('No false alarm when known expense detail persists',()=>{const x=example();x.itemized.months[1].known=20;x.itemized.months[1].unallocated=66.22;assert.deepEqual(mortalityExpenseCoverageBreaks(x.itemized,x.mortality,x.baseline),[]);});
test('No false alarm for months before the death event',()=>{const x=example();x.mortality.monthly[1].postDeath=false;assert.deepEqual(mortalityExpenseCoverageBreaks(x.itemized,x.mortality,x.baseline),[]);});
test('No false alarm for mismatched or incomplete data',()=>{const x=example();x.itemized.months[1].unallocated=10;assert.deepEqual(mortalityExpenseCoverageBreaks(x.itemized,x.mortality,x.baseline),[]);assert.deepEqual(mortalityExpenseCoverageBreaks(null,x.mortality,x.baseline),[]);});
