import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {estimateSurvivorReference65} from './mortality-preview.mjs';

const ui=readFileSync(new URL('./mortality-ui.mjs',import.meta.url),'utf8');
const source=estimateSurvivorReference65({
  deceasedEmployeeEarningsAnnualBase:120,
  survivorOwnEmployeeAnnual:24,
  survivorOwnBasicAnnual:80,
  survivorAge:70,
  entitlementConfirmed:true,
  ownPensionClaimConfirmed:true,
  deferralConflictReviewed:true
});

test('age-65 survivor amount is internally consistent and contains no deferred own pension',()=>{
  assert.equal(source.survivorTopUpAnnual,66);
  assert.equal(source.totalSurvivingPublicPensionAnnual,170);
});

test('mortality UI separately labels age-65 reference and registered total',()=>{
  assert.match(ui,/公的年金合計（全て65歳基準・受給資格未確認）/);
  assert.match(ui,/年金シートの登録済み年額/);
  assert.match(ui,/繰下げ後の遺族年金込み合計（内訳未確認）/);
});

test('automatic mixed-basis addition and auto-population are not present',()=>{
  assert.doesNotMatch(ui,/ownTotal\+estimate\.survivorTopUpAnnual/);
  assert.doesNotMatch(ui,/registered\+estimate\.survivorTopUpAnnual/);
  assert.doesNotMatch(ui,/hypotheticalTotal\.toFixed/);
  assert.match(ui,/automaticPensionValue=null/);
});

test('explicit, independently confirmed reference workflow remains available',()=>{
  assert.match(ui,/mortalityEstimatePension/);
  assert.match(ui,/entitlementConfirmed:form\.elements\.entitlement\.checked/);
  assert.match(ui,/ownPensionClaimConfirmed:form\.elements\.claimed\.checked/);
  assert.match(ui,/deferralConflictReviewed:form\.elements\.deferral\.checked/);
});
