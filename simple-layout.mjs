// Presentation only: move existing controls without changing data or listeners.
export function simplifyLayout(doc) {
  if (doc.documentElement.dataset.simpleLayout) return;
  doc.documentElement.dataset.simpleLayout = '1';
  const byId = id => doc.getElementById(id);
  const wrap = (node, title) => {
    if (!node) return;
    const details = doc.createElement('details');
    details.className = 'card supplementary';
    const summary = doc.createElement('summary');
    summary.textContent = title;
    details.append(summary);
    node.before(details);
    details.append(node);
    return details;
  };
  const annual = byId('annualCashflowSummary');
  const card = annual.closest('article');
  card.querySelector('h2').textContent = '年次計算の確認';
  card.querySelector('.info')?.remove();
  const csv = byId('allcsv').querySelector('article');
  csv.querySelector('h2').textContent = 'CSV出力・詳細表';
  const exportButton = byId('exportAnnualCsvBtn');
  exportButton.textContent = '簡易年次CSVを保存';
  csv.querySelector('h2').after(exportButton);
  card.querySelector('p.muted').textContent = '金額は年次計算表で確認できます。簡易年次CSV・詳細CSVは「CSV出力・詳細表」にまとめました。';
  doc.querySelector('[data-tab="allcsv"]').textContent = 'CSV出力・詳細表';
  for (const id of ['expenseDisplaySource', 'detailCsvSource']) {
    wrap(byId(id).closest('label'), '詳細：以前の内訳データを確認');
  }
  // Keep source selection semantics. Ambiguous profiles must not be auto-adopted.
  const period = byId('periodEditForm').closest('details.card');
  byId('budget').append(period);
  period.querySelector('summary').textContent = '補助：既存項目・予算の期間を個別に変更';
  const expenseIntro = byId('expenses').querySelector('article');
  expenseIntro.querySelector('h2').textContent = '生活費・保険の参考内訳（任意）';
  expenseIntro.querySelector('p').textContent = '年齢別予算だけで試算する場合、この画面の入力は不要です。内訳を入力して予算との差を確認できます。予算を変更する場合は「予算設定」を開いてください。内訳だけを変更しても資産推移は変わりません。';
  for (const id of ['pensionToolRun','taxToolRun','idecoToolRun','retirementToolRun','unemploymentToolRun']) {
    const tool = byId(id).closest('article');
    wrap(tool, '参考試算：' + tool.querySelector('h2').textContent);
  }
  const home = byId('home');
  const info = doc.createElement('div');
  home.append(info);
  for (const id of ['certaintySummary','calculationBasis','sourceStatus']) info.append(byId(id).closest('article'));
  wrap(info, '詳細：入力値の確度・計算根拠・制度の更新状態');
  const notices = doc.createElement('section');
  notices.setAttribute('aria-label', '要確認事項');
  const heading = doc.createElement('h2');
  heading.textContent = '要確認事項';
  notices.append(heading);
  info.closest('details').before(notices);
  for (const id of ['checks','integritySummary','reviewAlerts','pendingList']) notices.append(byId(id).closest('article'));
  // Preserve individual warning categories and all existing updates.
  for (const grid of home.querySelectorAll('.two-col')) if (!grid.children.length) grid.remove();
  wrap(byId('exportBtn'), '補助：現在の設定だけを保存');
  byId('exportFullBtn').textContent = '一括バックアップを保存（推奨）';
  byId('exportFullBtn').className = 'primary';

  // Settings have many independent controls. Group by user intent while keeping
  // the original DOM nodes, IDs, handlers and adopted values unchanged.
  const settings=byId('settings');
  const group=(key,title,nodes,{open=false}={})=>{
    const box=doc.createElement('details');box.className='card settings-category';
    box.dataset.settingsGroup=key;box.id='settingsGroup-'+key;box.open=open;
    const head=doc.createElement('summary');head.textContent=title;
    const body=doc.createElement('div');body.className='settings-group-body';
    box.append(head,body);settings.append(box);
    for(const node of nodes)if(node)body.append(node);
    return box;
  };
  const settingsOverview=byId('settingsCurrentSummary')?.closest('article');
  const finance=byId('settingsForm')?.closest('article');
  const backups=byId('exportFullBtn')?.closest('article');
  const goals=byId('detail-goal')?.closest('article');
  const display=byId('showActuals')?.closest('article');
  const certainty=byId('certaintyForm')?.closest('article');
  const undo=byId('detailUndo')?.closest('article');
  const recovery=byId('calendarSheet')?.closest('details.card');
  const settingsColumns=finance?.parentElement;
  group('backup','クラウド・バックアップ｜普段の保存と確認',[byId('privateSyncCard'),backups],{open:true});
  group('finance','計画の基本条件｜資産・利回り・物価',[settingsOverview,finance]);
  group('goals','計算期間・年齢別目標',[byId('detail-horizon'),goals]);
  group('compare','比較試算・未採用案',[byId('step8TrialCard')]);
  group('maintenance','表示・確度・復旧などの補助機能',[display,certainty,recovery,undo]);
  if(settingsColumns&&!settingsColumns.children.length)settingsColumns.remove();
}

export function annualCheckText(rows) {
  if (!rows.length) return '年次計算結果がないため、整合性は未確認です。';
  const problems = rows.filter(r => r.status !== 'ready' || !r.identityMatches);
  const unresolved = rows.filter(r => r.unresolvedMonthCount > 0);
  const over = rows.filter(r => r.overBudgetMonths?.length);
  return [
    problems.length ? '資産増減の一致を確認できない年齢期：' + problems.map(r => r.age).join('・') + '歳。' : '全' + rows.length + '年齢期で、期首資産＋運用益＋現金収支＝期末資産を確認しました。',
    unresolved.length ? '参考内訳が未確定の年齢期：' + unresolved.map(r => r.age).join('・') + '歳。未確定値は0とみなしません。' : '',
    over.length ? '参考内訳が管理予算を超える年齢期：' + over.map(r => r.age).join('・') + '歳。生活費・保険で確認してください。' : '',
    rows.some(r => !r.sourceProfile) ? '参考内訳の採用元が未確定の期間があります。必要な場合は生活費・保険の詳細で確認してください。' : '',
    'これは計算上の整合確認であり、将来の資産や制度適合性を保証するものではありません。'
  ].filter(Boolean).join('\n');
}
