import test from 'node:test';import assert from 'node:assert/strict';import {calculateSurvivor65Reference as calc,calculateDeferredBasicReference as defer} from './survivor-pension-calculator.mjs';
test('方式Aを選択',()=>{const x=calc({deceasedEarningsBaseAnnual:200,ownEmployeeAnnual:20,ownBasicAnnual:80});assert.equal(x.selected,'A');assert.equal(x.referenceTotal,230);});
test('方式Bを選択',()=>{const x=calc({deceasedEarningsBaseAnnual:100,ownEmployeeAnnual:90,ownBasicAnnual:80});assert.equal(x.selected,'B');assert.equal(x.survivorPensionPayable,5);});
test('本人厚生年金が上回る場合の差額はゼロ',()=>{const x=calc({deceasedEarningsBaseAnnual:0,ownEmployeeAnnual:100,ownBasicAnnual:70});assert.equal(x.survivorPensionPayable,0);});
test('未入力を拒否',()=>assert.throws(()=>calc({deceasedEarningsBaseAnnual:undefined,ownEmployeeAnnual:0,ownBasicAnnual:0})));
test('負数を拒否',()=>assert.throws(()=>calc({deceasedEarningsBaseAnnual:-1,ownEmployeeAnnual:0,ownBasicAnnual:0})));
test('NaNを拒否',()=>assert.throws(()=>calc({deceasedEarningsBaseAnnual:NaN,ownEmployeeAnnual:0,ownBasicAnnual:0})));
test('繰下げ月数60か月',()=>assert.equal(defer({basicAt65Annual:100,monthsDeferred:60}).amount,142));
test('繰下げ月数の不正値を拒否',()=>assert.throws(()=>defer({basicAt65Annual:100,monthsDeferred:121})));
test('確定採用不可',()=>assert.equal(calc({deceasedEarningsBaseAnnual:100,ownEmployeeAnnual:50,ownBasicAnnual:80,eligibilityConfirmed:true}).eligibleForAdoption,false));

import {registeredSurvivorInputs} from './survivor-pension-calculator.mjs';
test('reference65 uses only existing private adopted values for either spouse',()=>{
 const c={income:{pensions:{primary:{reference65:{source:'synthetic-a',employeeEarningsAnnual:'125',basicAnnual:'80'}},spouse:{reference65:{source:'synthetic-b',employeeEarningsAnnual:'30',basicAnnual:'85'}}}}};
 const p=registeredSurvivorInputs(c,'primary');
 assert.equal(p.deceasedEarnings,125);assert.equal(p.ownEmployee,30);assert.equal(p.ownBasic,85);
 const s=registeredSurvivorInputs(c,'spouse');
 assert.equal(s.deceasedEarnings,30);assert.equal(s.ownEmployee,125);assert.equal(s.ownBasic,80);
});
test('reference65 never infers missing values or accepts raw yen as man-yen',()=>{
 const c={income:{pensions:{primary:{reference65:{source:'2026 fictional',employeeEarningsAnnual:'120'}},spouse:{reference65:{source:'2026 fictional',employeeEarningsAnnual:'24',basicAnnual:''}}}}};
 assert.throws(()=>registeredSurvivorInputs(c,'primary'),/未登録/);
 c.income.pensions.spouse.reference65.basicAnnual='1234567';
 assert.throws(()=>registeredSurvivorInputs(c,'primary'),/万円/);
 c.income.pensions.spouse.reference65.basicAnnual='0';
 assert.equal(registeredSurvivorInputs(c,'primary').ownBasic,0);
});

import {readFileSync} from 'node:fs';
test('遺族年金の表示言語タグはブラウザが受理する日本語ロケールを使う',()=>{
 const ui=readFileSync(new URL('./survivor-pension-ui.mjs',import.meta.url),'utf8');
 const locale=ui.match(/toLocaleString\('([^']+)'/)?.[1];
 assert.equal(locale,'ja-JP');
 assert.equal(Intl.getCanonicalLocales(locale)[0],'ja-JP');
 assert.doesNotMatch(ui,/toLocaleString\('ja-J'/);
});
