import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeReceiptDraft, receiptDraftFromForm, applyReceiptDraft, RECEIPT_DRAFT_KEY} from './receipt-comparison-ui.mjs';

const fieldIds=['companyStart','companyEnd','companyReceipt','companyGross','idecoStart','idecoEnd','idecoReceipt','idecoGross','year','birthDate','idecoPension','publicPension','otherIncome'];
const checkIds=['allGeneral','noOtherReceipts','verifiedPeriods','verifiedEligible'];
function fakeForm(){
 const nodes=new Map([...fieldIds.map(id=>[id,{value:''}]),...checkIds.map(id=>[id,{checked:false}])]);
 return {elements:{namedItem:id=>nodes.get(id)}};
}
test('比較下書きJSONの書出し→読込みは入力を復元し採用値に触れない',()=>{
 const adopted={plan:{initialAsset:1000},ideco:{currentBalance:200}};
 const adoptedBefore=structuredClone(adopted);
 const form=fakeForm();
 form.elements.namedItem('companyStart').value='2010-01-01';
 form.elements.namedItem('companyReceipt').value='2045-01-01';
 form.elements.namedItem('companyGross').value='1500';
 form.elements.namedItem('idecoGross').value='1000';
 form.elements.namedItem('noOtherReceipts').checked=true;
 const json=JSON.stringify(receiptDraftFromForm(form));
 const restored=fakeForm();
 applyReceiptDraft(restored,JSON.parse(json));
 assert.equal(restored.elements.namedItem('companyReceipt').value,'2045-01-01');
 assert.equal(restored.elements.namedItem('companyGross').value,'1500');
 assert.equal(restored.elements.namedItem('noOtherReceipts').checked,true);
 assert.deepEqual(adopted,adoptedBefore);
 assert.match(RECEIPT_DRAFT_KEY,/receipt-comparison/);
});
test('破損・旧形式・実在しない日付は復元前に拒否',()=>{
 const valid=receiptDraftFromForm(fakeForm());
 assert.throws(()=>normalizeReceiptDraft({...valid,version:99}));
 assert.throws(()=>normalizeReceiptDraft({...valid,values:{...valid.values,companyReceipt:'2045-02-30'}}));
 assert.throws(()=>normalizeReceiptDraft({...valid,confirmations:{...valid.confirmations,allGeneral:'yes'}}));
 const form=fakeForm();form.elements.namedItem('companyGross').value='42';
 assert.throws(()=>applyReceiptDraft(form,{...valid,version:99}));
 assert.equal(form.elements.namedItem('companyGross').value,'42');
});
