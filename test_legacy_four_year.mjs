import test from 'node:test';
import assert from 'node:assert/strict';
import {retirementOverlapDeduction} from './receipt-tax-reference.mjs';

const p=(receiptDate)=>({periodStart:'2010-01-01',periodEnd:'2025-12-31',receiptDate,grossMan:1500});

for (const [a,b,expected] of [
 ['2023-06-01','2025-06-01','reference-calculated'],
 ['2021-06-01','2025-06-01','reference-calculated'],
 ['2020-06-01','2025-06-01','outside-window'],
 ['2025-06-01','2029-06-01','requires-transitional-rule-review'],
 ['2025-06-01','2030-06-01','outside-window'],
 ['2026-06-01','2035-06-01','reference-calculated'],
 ['2026-06-01','2036-06-01','outside-window']
]) test(`iDeCo ${a} -> company ${b}: ${expected}`,()=> {
 const result=retirementOverlapDeduction({ideco:p(a),company:p(b)});
 assert.equal(result.status,expected);
 if(expected==='reference-calculated') assert.ok(result.adjustedDeductionMan < result.laterFullDeductionMan);
 if(expected==='requires-transitional-rule-review') assert.equal(result.adjustedDeductionMan,null);
});
