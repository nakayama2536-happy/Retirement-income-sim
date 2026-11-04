import test from 'node:test';
import assert from 'node:assert/strict';
import {mortalityItemizedTotals,referenceExpenseMonth} from './mortality-itemized-ui.mjs';
import {readFileSync} from 'node:fs';
import {mortalityFirstNegativeDiagnostic} from './mortality-ui.mjs';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
test('registered subtotal, inflated subtotal, unallocated remainder, and full budget reconcile without double counting',()=>{
 const items=[{id:'rent',priceBasis:'plan-start-base'},{id:'gas',priceBasis:'plan-start-base'}];
 const month={expense:65,unallocated:52.4,priceFactor:1.05,amounts:{rent:11.55,gas:1.05}};
 const original=JSON.stringify({items,month});
 const totals=mortalityItemizedTotals(items,month,{rent:1,gas:0.8},0.7);
 near(totals.base,12);near(totals.priced,12.6);near(totals.after,12.39);
 near(totals.remainder,52.4);near(totals.remainderAfter,36.68);
 near(totals.fullBefore,65);near(totals.fullAfter,49.07);
 assert.equal(JSON.stringify({items,month}),original);
});
test('zero amounts do not fabricate registered cost; unsupported nonzero prices remain unconfirmed',()=>{
 const i=[{id:'known',priceBasis:'plan-start-base'},{id:'future',priceBasis:'unknown'}];
 const month={expense:20,unallocated:9,priceFactor:1.1,amounts:{known:11}};
 near(mortalityItemizedTotals(i,month,{known:1,future:0},1).base,10);
 const unknown={...month,expense:21,amounts:{known:11,future:1}};
 assert.equal(mortalityItemizedTotals(i,unknown,{known:1,future:0},1).base,null);
});
test('invalid or contradictory totals and multipliers do not silently produce numbers',()=>{
 const items=[{id:'a',priceBasis:'plan-start-base'}];
 const month={expense:10,unallocated:2,priceFactor:1,amounts:{a:8}};
 assert.throws(()=>mortalityItemizedTotals(items,month,{a:NaN},1));
 assert.throws(()=>mortalityItemizedTotals(items,month,{a:1},-0.1));
 assert.throws(()=>mortalityItemizedTotals(items,{...month,expense:9},{a:1},1),/一致しません/);
});
test('subtotal rows and responsive labels are present in the read-only UI',()=>{
 const ui=readFileSync(new URL('./mortality-itemized-ui.mjs',import.meta.url),'utf8');
 const css=readFileSync(new URL('./styles.css',import.meta.url),'utf8');
 for(const t of ['個別費目の合計','未照合の管理予算残額','管理予算全体の合計'])assert.match(ui,new RegExp(t));
 assert.match(ui,/\[data-mortality-total\]/);
 assert.match(css,/\.mortality-total-budget/);
 assert.match(css,/data-mortality-column/);
});

test('mortality reference month chooses the month after death, never an earlier month',()=>{
 const months=[{month:'2060-01',expense:55},{month:'2060-02',expense:55},{month:'2060-03',expense:55}];
 assert.equal(referenceExpenseMonth(months,'2060-01')?.month,'2060-02');
 assert.equal(referenceExpenseMonth(months,'2060-03'),null);
 assert.equal(referenceExpenseMonth(months,'2061-01'),null);
 assert.equal(referenceExpenseMonth(months,'2059-12')?.month,'2060-01');
 assert.equal(referenceExpenseMonth(months,'')?.month,'2060-01');
 assert.equal(referenceExpenseMonth([], '2060-01'),null);
});
test('itemized preview refuses omitted multipliers, preserving explicit zero',()=>{
 const items=[{id:'food',priceBasis:'plan-start-base'}];
 const month={expense:20,unallocated:10,priceFactor:1,amounts:{food:10}};
 assert.throws(()=>mortalityItemizedTotals(items,month,{},1));
 assert.equal(mortalityItemizedTotals(items,month,{food:0},1).fullAfter,10);
 assert.equal(mortalityItemizedTotals(items,month,{food:1.2},1).fullAfter,22);
});

test('first negative month shows a 3+3 month read-only ledger and reconciliation',()=>{
 const months=Array.from({length:9},(_,i)=>{
   const amount=3-i;
   return {month:'2069-'+String(i+5).padStart(2,'0'),startAsset:amount+1,investmentGain:0,
     income:0,baselineExpense:1.5,expenseReduction:0.5,expense:1,extraExpense:0,
     funeralExpense:0,endAsset:amount};
 });
 const before=JSON.stringify(months);
 const rows=mortalityFirstNegativeDiagnostic(months,'2069-09');
 assert.deepEqual(rows.map(x=>x.month),['2069-06','2069-07','2069-08','2069-09','2069-10','2069-11','2069-12']);
 assert.equal(rows.find(x=>x.firstNegative)?.month,'2069-09');
 assert.ok(rows.every(x=>x.reconciled));
 assert.equal(JSON.stringify(months),before);
});
test('month-end ledger includes funeral and extra expense, and reports mismatch rather than masking it',()=>{
 const months=[
  {month:'2069-08',startAsset:2,investmentGain:0.1,income:0.2,baselineExpense:1.5,
   expenseReduction:0.5,expense:1,extraExpense:0.1,funeralExpense:0,endAsset:1.2},
  {month:'2069-09',startAsset:1.2,investmentGain:0,income:0,baselineExpense:1.5,
   expenseReduction:0.5,expense:1,extraExpense:0.3,funeralExpense:0.2,endAsset:-0.3}
 ];
 assert.ok(mortalityFirstNegativeDiagnostic(months,'2069-09').every(x=>x.reconciled));
 const bad=structuredClone(months);bad[1].endAsset=-0.2;
 assert.equal(mortalityFirstNegativeDiagnostic(bad,'2069-09')[1].reconciled,false);
});
test('missing and contradictory initial depletion dates are not silently accepted',()=>{
 const months=[
  {month:'2069-08',endAsset:-0.1},
  {month:'2069-09',endAsset:-0.2}
 ];
 assert.deepEqual(mortalityFirstNegativeDiagnostic(months,null),[]);
 assert.throws(()=>mortalityFirstNegativeDiagnostic(months,'2069-09'),/一致しません/);
 assert.throws(()=>mortalityFirstNegativeDiagnostic(months,'2069-10'),/一致しません/);
 assert.throws(()=>mortalityFirstNegativeDiagnostic(months,'2069-09',13));
});
test('diagnostic UI uses existing monthly comparison ledger and does not change adopted data',()=>{
 const ui=readFileSync(new URL('./mortality-ui.mjs',import.meta.url),'utf8');
 assert.match(ui,/mortalityFirstNegativeMonthlyTable/);
 assert.match(ui,/renderFirstNegativeDiagnostic\(results,mortality\)/);
 assert.match(ui,/月末資産/);
});
