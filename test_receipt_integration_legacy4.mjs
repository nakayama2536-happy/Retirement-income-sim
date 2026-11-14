// Synthetic values only. Run at repository root on the isolated PR branch.
import test from 'node:test';
import assert from 'node:assert/strict';
import {compareReceiptDraft} from './receipt-comparison-ui.mjs';
import {retirementOverlapDeduction} from './receipt-tax-reference.mjs';

const base={
 companyStart:'2000-01-01',companyEnd:'2025-12-31',companyReceipt:'2025-12-01',companyGross:'1800',
 idecoStart:'2000-01-01',idecoEnd:'2023-12-31',idecoReceipt:'2023-10-01',idecoGross:'1500',
 year:'',birthDate:'',idecoPension:'',publicPension:'',otherIncome:''
};
const confirmations={allGeneral:true,noOtherReceipts:true,verifiedPeriods:true,verifiedEligible:true};
const company={periodStart:base.companyStart,periodEnd:base.companyEnd,receiptDate:base.companyReceipt,grossMan:1800};
const ideco={periodStart:base.idecoStart,periodEnd:base.idecoEnd,receiptDate:base.idecoReceipt,grossMan:1500};

test('2023 -> 2025: four-year deduction reaches receipt UI tax calculation',()=>{
 const standalone=retirementOverlapDeduction({company,ideco});
 assert.equal(standalone.status,'reference-calculated');
 assert.equal(standalone.adjustedDeductionMan,140);
 const r=compareReceiptDraft(base,confirmations);
 assert.equal(r.retirement.status,'reference-calculated');
 assert.equal(r.retirement.laterDeductionMan,140);
 assert.equal(r.tax.status,'reference');
 assert.equal(r.tax.laterTaxableMan,830);
 assert.equal(r.tax.taxYen,1414595);
 assert.equal(r.retirementNetReferenceYen,33000000-r.tax.taxYen-r.tax.residentTaxReferenceYen);
 assert.equal(r.adoptable,false);
});

test('tax clearance remains missing until all verifications checked',()=>{
 for(const k of Object.keys(confirmations)){
  const r=compareReceiptDraft(base,{...confirmations,[k]:false});
  assert.equal(r.tax.status,'incomplete');
  assert.equal(r.retirementNetReferenceYen,null);
 }
});

test('2023 -> 2026: transitional check safely blocks tax and net',()=>{
 const r=compareReceiptDraft({...base,companyReceipt:'2026-12-01'},confirmations);
 assert.equal(r.retirement.status,'requires-transitional-rule-review');
 assert.equal(r.tax.status,'incomplete');
 assert.equal(r.retirementNetReferenceYen,null);
});

test('2023 -> 2028: outside former four-year window',()=>{
 const r=compareReceiptDraft({...base,companyReceipt:'2028-12-01'},confirmations);
 assert.equal(r.retirement.status,'outside-window');
 assert.equal(r.retirement.laterDeductionMan,1220);
 assert.equal(r.tax.status,'reference');
});

test('same-year receipt is not automatically adoptable',()=>{
 const r=compareReceiptDraft({...base,companyReceipt:'2023-12-01'},confirmations);
 assert.equal(r.retirement.status,'same-year-special-calculation-required');
 assert.equal(r.adoptable,false);
});

test('omitted pension fields are not zero-valued pensions',()=>{
 const r=compareReceiptDraft(base,confirmations);
 assert.equal(r.pension.status,'not-requested');
 assert.equal(r.pension.pensionMiscIncomeMan,null);
});
