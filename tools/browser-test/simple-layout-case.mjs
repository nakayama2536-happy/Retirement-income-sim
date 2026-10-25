import assert from 'node:assert/strict';
export async function validateSimpleLayout(page) {
  const result = await page.evaluate(async () => {
    const {simplifyLayout} = await import('./simple-layout.mjs');
    const before = document.body.innerHTML;
    simplifyLayout(document);
    const same = before === document.body.innerHTML;
    const ids = [...document.querySelectorAll('[id]')].map(n=>n.id);
    return {
      same, unique: ids.length === new Set(ids).size,
      annualTitle: document.getElementById('annualCashflowSummary').closest('article').querySelector('h2').textContent,
      csvPanel: document.getElementById('exportAnnualCsvBtn').closest('.panel').id,
      budgetPanel: document.getElementById('periodEditForm').closest('.panel').id,
      warningsVisible: ['checks','integritySummary','reviewAlerts'].every(id=>!document.getElementById(id).closest('details')),
      pendingCountOnSummary: !!document.getElementById('pendingList').closest('details.home-pending') && !!document.getElementById('pendingCount').closest('details.home-pending > summary'),
      refsCollapsed: ['expenseDisplaySource','detailCsvSource','taxToolRun','exportBtn'].every(id=>{
        const d=document.getElementById(id).closest('details');return d&&!d.open;
      })
    };
  });
  assert.deepEqual(result,{same:true,unique:true,annualTitle:'年次計算の確認',csvPanel:'allcsv',budgetPanel:'budget',warningsVisible:true,pendingCountOnSummary:true,refsCollapsed:true});
}
