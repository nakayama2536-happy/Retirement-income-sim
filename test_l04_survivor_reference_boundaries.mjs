import test from 'node:test';
import assert from 'node:assert/strict';
import {calculateSurvivor65Reference, calculateDeferredBasicReference, registeredSurvivorInputs} from './survivor-pension-calculator.mjs';

// Fictional amounts in units of 10,000 JPY per year. No private user data.
test('age 65+ survivor amount uses higher statutory formula and subtracts own employees pension',()=>{
 const a=calculateSurvivor65Reference({deceasedEarningsBaseAnnual:120,ownEmployeeAnnual:30,ownBasicAnnual:80});
 assert.equal(a.formulaA,90);
 assert.equal(a.formulaB,75);
 assert.equal(a.selected,'A');
 assert.equal(a.survivorPensionPayable,60);
 assert.equal(a.referenceTotal,170);
 assert.equal(a.eligibleForAdoption,false);
});

test('alternative statutory formula can win without counting own pension twice',()=>{
 const a=calculateSurvivor65Reference({deceasedEarningsBaseAnnual:100,ownEmployeeAnnual:100,ownBasicAnnual:70});
 assert.equal(a.formulaA,75);
 assert.equal(a.formulaB,100);
 assert.equal(a.selected,'B');
 assert.equal(a.survivorPensionPayable,0);
 assert.equal(a.referenceTotal,170);
 assert.equal(a.eligibleForAdoption,false);
});

test('no survivor difference when own employees pension exceeds nominal survivor amount',()=>{
 const a=calculateSurvivor65Reference({deceasedEarningsBaseAnnual:0,ownEmployeeAnnual:160,ownBasicAnnual:75});
 assert.equal(a.survivorPensionPayable,0);
 assert.equal(a.referenceTotal,235);
});

test('unknown or malformed pension amounts never silently become zero',()=>{
 for(const n of [undefined,null,'',NaN,Infinity,-1,'120']) {
  assert.throws(()=>calculateSurvivor65Reference({deceasedEarningsBaseAnnual:n,ownEmployeeAnnual:10,ownBasicAnnual:60}));
 }
});

test('registered inputs require sources and explicitly preserve source config',()=>{
 const config={income:{pensions:{primary:{reference65:{source:'fictional source A',employeeEarningsAnnual:100,basicAnnual:65}},spouse:{reference65:{source:'fictional source B',employeeEarningsAnnual:20,basicAnnual:70}}}}};
 const before=structuredClone(config);
 const a=registeredSurvivorInputs(config,'primary');
 assert.deepEqual(a,{deceased:'primary',survivor:'spouse',deceasedEarnings:100,ownEmployee:20,ownBasic:70,sources:{deceased:'fictional source A',survivor:'fictional source B'}});
 const b=registeredSurvivorInputs(config,'spouse');
 assert.equal(b.deceasedEarnings,20);
 assert.equal(b.ownEmployee,100);
 assert.deepEqual(config,before);
 assert.throws(()=>registeredSurvivorInputs({income:{pensions:{primary:{reference65:{source:'fictional'}},spouse:{reference65:{}}}}},'primary'));
});

test('deferred basic pension stays nonadopted and enforces month limits',()=>{
 const r=calculateDeferredBasicReference({basicAt65Annual:80,monthsDeferred:60});
 assert.equal(r.amount,113.6);
 assert.equal(r.eligibleForAdoption,false);
 for(const months of [-1,121,1.5,NaN])assert.throws(()=>calculateDeferredBasicReference({basicAt65Annual:80,monthsDeferred:months}));
});
