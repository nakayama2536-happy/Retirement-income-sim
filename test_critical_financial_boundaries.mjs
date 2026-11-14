import test from 'node:test';
import assert from 'node:assert/strict';
import {retirementOverlapDeduction} from './receipt-tax-reference.mjs';
import {calculateSurvivor65Reference} from './survivor-pension-calculator.mjs';
import {auditMortalityExpense} from './mortality-expense-audit.mjs';

// Synthetic values only; tax-law comparison is limited to the implemented reference scope.
const p=(receiptDate,grossMan=1500)=>({periodStart:'2010-01-01',periodEnd:'2035-12-31',receiptDate,grossMan});
test('2026 iDeCo-first window includes 9 prior calendar years but excludes 10',()=>{
 const within=retirementOverlapDeduction({ideco:p('2026-08-01'),company:p('2035-08-01')});
 const outside=retirementOverlapDeduction({ideco:p('2026-08-01'),company:p('2036-08-01')});
 assert.equal(within.gap,9);assert.equal(within.status,'reference-calculated');
 assert.equal(outside.gap,10);assert.equal(outside.status,'outside-window');
});
test('company-first window includes 19 prior years but excludes 20',()=>{
 const within=retirementOverlapDeduction({company:p('2026-07-01'),ideco:p('2045-07-01')});
 const outside=retirementOverlapDeduction({company:p('2026-07-01'),ideco:p('2046-07-01')});
 assert.equal(within.gap,19);assert.equal(within.status,'reference-calculated');
 assert.equal(outside.gap,20);assert.equal(outside.status,'outside-window');
});
test('prior DC before 2026 within four years stops pending transition review',()=>{
 const x=retirementOverlapDeduction({ideco:p('2025-10-01'),company:p('2029-10-01')});
 assert.equal(x.status,'requires-transitional-rule-review');
 assert.equal(x.adjustedDeductionMan,null);
});
test('survivor 65+ receives only positive difference above own employee pension',()=>{
 const x=calculateSurvivor65Reference({deceasedEarningsBaseAnnual:100,ownEmployeeAnnual:90,ownBasicAnnual:80});
 assert.equal(x.formulaA,75);assert.equal(x.formulaB,95);
 assert.equal(x.survivorPensionPayable,5);
 assert.equal(x.referenceTotal,175);
 assert.equal(x.eligibleForAdoption,false);
});
test('post-death reduction is subtracted from management budget and reaches month end assets',()=>{
 const baseline=[{month:'2060-01',expense:55},{month:'2060-02',expense:55}];
 const preview=[
  {month:'2060-01',postDeath:false,expenseReduction:0,expense:55,income:0,extraExpense:0,funeralExpense:0,startAsset:100,investmentGain:0,endAsset:45},
  {month:'2060-02',postDeath:true,expenseReduction:15,expense:40,income:10,extraExpense:0,funeralExpense:0,startAsset:45,investmentGain:0,endAsset:15}
 ];
 const verified=auditMortalityExpense(baseline,preview);
 assert.equal(verified.totalExpenseReduction,15);
 assert.deepEqual(verified.months.map(x=>x.adjustedExpense),[55,40]);
 const broken=structuredClone(preview);broken[1].expense=55;
 assert.throws(()=>auditMortalityExpense(baseline,broken),/一致しません/);
});
