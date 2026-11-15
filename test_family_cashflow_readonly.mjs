import test from 'node:test';
import assert from 'node:assert/strict';
import {makeFamilyCashflowView} from './family-cashflow-readonly.mjs';
const base=()=>({
 status:'ready',age:70,monthCount:12,startDate:'2044-08-27',endDate:'2045-07-27',
 incomeTotal:420,managementExpense:400,extraExpense:20,totalExpense:420,cashBalance:0,
 investmentGain:100,startAsset:1500,endAsset:1600,identityMatches:true,
 components:{labor:60,primaryPension:200,spousePension:120,idecoAnnuity:0,
  unemployment:0,idecoLumpReceipt:0,retirementReceipt:40,otherExtraIncome:0},
 sourceProfile:null,referenceGap:null
});
test('12-month age-period: totals and monthly averages are traceable',()=>{
 const s=base(),out=makeFamilyCashflowView(s);
 assert.equal(out.status,'ready');assert.equal(out.monthCount,12);
 assert.equal(out.incomeMonthlyAverage,35);assert.equal(out.expenseMonthlyAverage,35);
 assert.equal(out.sourceColumnsIncome,380);assert.equal(out.otherIncludedIncome,40);
 assert.equal(out.periodStart,'2044-08');assert.equal(out.periodEnd,'2045-07');
});
test('short period uses actual month count, never assumes 12',()=>{
 const s=base();s.monthCount=1;const o=makeFamilyCashflowView(s);
 assert.equal(o.incomeMonthlyAverage,420);assert.equal(o.expenseMonthlyAverage,420);
});
test('missing values do not become zero',()=>{
 for(const v of [null,undefined,'',NaN]){
  const s=base();s.incomeTotal=v;
  assert.equal(makeFamilyCashflowView(s).status,'unavailable');
 }
});
test('missing split components do not fabricate a breakdown',()=>{
 const s=base();delete s.components.primaryPension;
 const o=makeFamilyCashflowView(s);assert.equal(o.status,'ready');
 assert.equal(o.sourceColumnsIncome,null);assert.equal(o.otherIncludedIncome,null);
 assert.equal(o.periodicIncomeKnown,false);
});
test('explicit zero is accepted and distinguished from missing',()=>{
 const s=base();s.incomeTotal=0;s.managementExpense=0;s.extraExpense=0;s.totalExpense=0;s.cashBalance=0;
 const o=makeFamilyCashflowView(s);assert.equal(o.status,'ready');assert.equal(o.incomeTotal,0);
});
test('invalid age, month count or reconciliation stops disclosure',()=>{
 for(const p of [{monthCount:0},{monthCount:13},{monthCount:1.5},{age:'70'},{identityMatches:false},{totalExpense:421},{cashBalance:1},{endAsset:1601}]){
  assert.equal(makeFamilyCashflowView({...base(),...p}).status,'unavailable');
 }
});
test('asset end negative is not labeled as borrowing',()=>{
 const s=base();s.startAsset=-150;s.endAsset=-50;const o=makeFamilyCashflowView(s);
 assert.equal(o.negativeAgeEnd,true);assert.equal(o.status,'ready');
});
test('does not mutate read-only annual aggregate',()=>{
 const s=base(),snapshot=structuredClone(s);makeFamilyCashflowView(s);
 assert.deepEqual(s,snapshot);
});
test('unrecognized calculated states are not treated as ready',()=>{
 assert.equal(makeFamilyCashflowView(null).status,'unavailable');
 assert.equal(makeFamilyCashflowView({status:'no-period'}).status,'unavailable');
});
