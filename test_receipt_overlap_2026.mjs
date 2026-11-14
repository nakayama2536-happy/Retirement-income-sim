import test from 'node:test';
import assert from 'node:assert/strict';
import {overlapWindow,compareReceiptPlans} from './receipt-comparison.mjs';

test('iDeCo received by 2025 uses the earlier four-year review window',()=>{
  assert.equal(overlapWindow(2029,2025).requiresAdjustment,true);
  assert.equal(overlapWindow(2030,2025).requiresAdjustment,false);
  assert.equal(overlapWindow(2029,2025).status,'within-4-years');
  assert.equal(overlapWindow(2031,2025).status,'outside-4-years');
});

test('iDeCo received from 2026 uses the nine-year review window',()=>{
  assert.equal(overlapWindow(2035,2026).requiresAdjustment,true);
  assert.equal(overlapWindow(2036,2026).requiresAdjustment,false);
  assert.equal(overlapWindow(2035,2026).status,'within-9-years');
  assert.equal(overlapWindow(2036,2026).status,'outside-9-years');
});

test('company retirement lump sum first retains nineteen-year window',()=>{
  assert.equal(overlapWindow(2026,2045).requiresAdjustment,true);
  assert.equal(overlapWindow(2026,2046).requiresAdjustment,false);
  assert.equal(overlapWindow(2026,2045).status,'within-19-years');
});

test('same-year and invalid years require separate review',()=>{
  assert.equal(overlapWindow(2026,2026).status,'same-year');
  assert.equal(overlapWindow(2026,2026).requiresAdjustment,true);
  assert.equal(overlapWindow(null,2026).status,'unconfirmed');
});

test('comparison stays reference-only and does not invent taxes or net amounts',()=>{
  const rows=compareReceiptPlans({
    company:{grossMan:1500,year:2031},ideco:{receiptBalanceMan:1000},
    options:[{id:'fictional',idecoYear:2025,lumpPercent:100}]
  });
  assert.equal(rows.length,1);
  assert.equal(rows[0].status,'reference-only');
  assert.equal(rows[0].overlap.requiresAdjustment,false);
  assert.equal(rows[0].estimatedIncomeTaxMan,null);
  assert.equal(rows[0].estimatedResidentTaxMan,null);
  assert.equal(rows[0].netReceiptsMan,null);
});
