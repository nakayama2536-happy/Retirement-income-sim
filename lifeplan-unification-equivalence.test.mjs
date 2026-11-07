import test from 'node:test';
import assert from 'node:assert/strict';
import {proveCandidateEquivalence} from './lifeplan-unification-equivalence.mjs';
const cfg=()=>({
 plan:{startAge:70,endAge:99},
 budgets:[{fromAge:70,toAge:99,annualBudget:660}],
 income:{pensions:{primary:{annualAtStart:120}}},
 cashflow:{expenseCategories:[{key:'living',label:'生活費',items:[{key:'food',label:'食費',periods:[{fromAge:70,toAge:95,amount:12}]}]}],periodOverrides:[]},
 expenseDetail:{monthlyCategories:[]},
 events:[],people:{primary:{birthDate:'1980-01-01'}},
});
test('95/96 boundary: 30 age-checks, preserve exact in-range and missing',()=>{
 const c=cfg(),s=JSON.stringify(c),r=proveCandidateEquivalence(c);
 assert.equal(r.status,'candidate-equivalent');assert.equal(r.proof.checks,30);
 assert.equal(r.proof.matched,30);assert.equal(r.proof.missingReferenceChecks,4);
 assert.equal(r.candidate.expenseUnificationCandidate.adopted,false);
 assert.equal(JSON.stringify(c),s);
});
test('explicit zero is resolved, not missing',()=>{
 const c=cfg();c.cashflow.expenseCategories[0].items[0].periods=[{fromAge:70,toAge:95,amount:0}];
 const r=proveCandidateEquivalence(c);assert.equal(r.status,'candidate-equivalent');assert.equal(r.proof.missingReferenceChecks,4);
});
test('noncontiguous periods retain missing gap',()=>{
 const c=cfg();c.cashflow.expenseCategories[0].items[0].periods=[{fromAge:70,toAge:74,amount:12},{fromAge:80,toAge:95,amount:20}];
 const r=proveCandidateEquivalence(c);assert.equal(r.status,'candidate-equivalent');assert.equal(r.proof.missingReferenceChecks,9);
});
test('different amounts by age remain unchanged',()=>{
 const c=cfg();c.cashflow.expenseCategories[0].items[0].periods=[{fromAge:70,toAge:89,amount:10},{fromAge:90,toAge:95,amount:18}];
 const r=proveCandidateEquivalence(c);assert.equal(r.status,'candidate-equivalent');assert.equal(r.candidate.cashflow.periodOverrides.length,2);
});
test('existing standard categories block rather than overwrite',()=>{
 const c=cfg();c.expenseDetail.monthlyCategories=[{key:'food',label:'食費',amount:22}];
 const r=proveCandidateEquivalence(c);assert.equal(r.status,'blocked');assert.ok(r.issues.includes('STANDARD_EXISTS'));
});
test('cross group same child key blocks',()=>{
 const c=cfg();c.cashflow.expenseCategories.push({key:'other',items:[{key:'food',periods:[{fromAge:70,toAge:95,amount:3}]}]});
 const r=proveCandidateEquivalence(c);assert.equal(r.status,'blocked');assert.ok(r.issues.includes('CROSS_GROUP_ITEM_KEY_COLLISION'));
});
test('existing standard expense override blocks',()=>{
 const c=cfg();c.cashflow.periodOverrides=[{kind:'expense',key:'food',fromAge:80,toAge:90,amount:22,unit:'monthly'}];
 const r=proveCandidateEquivalence(c);assert.equal(r.status,'blocked');assert.ok(r.issues.includes('EXISTING_EXPENSE_OVERRIDES'));
});
test('taxSocial category blocks',()=>{
 const c=cfg();c.cashflow.expenseCategories.push({key:'taxSocial',fallbackMonthly:4,items:[]});
 const r=proveCandidateEquivalence(c);assert.equal(r.status,'blocked');
});
test('travel remains separate and blocks',()=>{
 const c=cfg();c.cashflow.travel=[{fromAge:70,toAge:95,annualAmount:20}];
 const r=proveCandidateEquivalence(c);assert.equal(r.status,'blocked');assert.ok(r.issues.includes('TRAVEL_SEPARATE_REVIEW'));
});
test('overlapping age segments block',()=>{
 const c=cfg();c.cashflow.expenseCategories[0].items[0].periods=[{fromAge:70,toAge:80,amount:12},{fromAge:80,toAge:90,amount:13}];
 const r=proveCandidateEquivalence(c);assert.equal(r.status,'blocked');
});
test('absent ranges not converted to zero',()=>{
 const c=cfg();c.cashflow.expenseCategories[0].items[0].periods=[{fromAge:85,toAge:95,amount:14}];
 const r=proveCandidateEquivalence(c);assert.equal(r.status,'candidate-equivalent');assert.equal(r.proof.missingReferenceChecks,19);
});
test('source plan, budget, income and events immutable',()=>{
 const c=cfg();const old=structuredClone(c);const r=proveCandidateEquivalence(c);
 assert.equal(r.status,'candidate-equivalent');for(const key of ['plan','budgets','income','events','people'])assert.deepEqual(r.candidate[key],old[key]);assert.deepEqual(c,old);
});
test('out-of-range requested age rejects',()=>assert.throws(()=>proveCandidateEquivalence(cfg(),{ages:[95,100]}),/invalid-age-list/));