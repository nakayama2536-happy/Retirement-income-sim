import { cashflowSummaryForAge } from './cashflow.mjs';

const MONEY_DIGITS = 6;

function finiteOrBlank(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round((n + Number.EPSILON) * 10 ** MONEY_DIGITS) / 10 ** MONEY_DIGITS : '';
}

function isoDateAtAge(birthDate, age) {
  if (!birthDate) return '';
  const d = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setFullYear(d.getFullYear() + Number(age));
  return d.toISOString().slice(0, 10);
}

function fullAgeOn(dateIso, birthDate) {
  if (!dateIso || !birthDate) return '';
  const d = new Date(`${dateIso}T00:00:00`);
  const b = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(d.getTime()) || Number.isNaN(b.getTime())) return '';
  let age = d.getFullYear() - b.getFullYear();
  if (d.getMonth() < b.getMonth() || (d.getMonth() === b.getMonth() && d.getDate() < b.getDate())) age--;
  return age;
}

function nextDayBefore(dateIso) {
  if (!dateIso) return '';
  const d = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function textCell(value) {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return s;
}

function csvCell(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  const s = textCell(value).replaceAll('"', '""');
  return `"${s}"`;
}

function uniqueColumn(registry, key, label) {
  if (!registry.has(key)) registry.set(key, { key, label });
}

function expenseItemKey(categoryKey, itemKey) {
  return `expenseItem:${categoryKey}:${itemKey}`;
}

function expenseCategoryKey(categoryKey) {
  return `expenseCategory:${categoryKey}`;
}

function manualIncomeKey(itemKey) {
  return `manualIncome:${itemKey}`;
}

export function buildAnnualCsvDataset(config, result, { exportedAt = new Date().toISOString() } = {}) {
  if (!config || !result?.rows) throw new Error('CSV出力に必要な計算結果がありません。');

  const prepared = result.rows.map(plan => ({
    plan,
    cf: cashflowSummaryForAge(config, plan.age),
    actual: config.actuals?.[plan.age] || null
  }));

  const dynamicIncome = new Map();
  const dynamicExpenseCategories = new Map();
  const dynamicExpenseItems = new Map();

  for (const { cf } of prepared) {
    for (const item of cf.manualIncomeRows || []) {
      uniqueColumn(dynamicIncome, manualIncomeKey(item.key || item.label), `追加収入_${item.label}_万円`);
    }
    for (const category of cf.expenseCategories || []) {
      uniqueColumn(dynamicExpenseCategories, expenseCategoryKey(category.key || category.label), `支出_${category.label}_小計_万円`);
      for (const item of category.items || []) {
        uniqueColumn(dynamicExpenseItems, expenseItemKey(category.key || category.label, item.key || item.label), `支出_${category.label}_${item.label}_万円`);
      }
    }
  }

  const fixedColumns = [
    ['exportedAt','出力日時'],['schemaVersion','アプリスキーマ'],['rulesAsOf','制度基準日'],
    ['periodYear','年度(年齢期開始年)'],['age','本人年齢'],['spouseAge','配偶者年齢'],['periodStart','期間開始日'],['periodEnd','期間終了日'],['inflationFactor','インフレ係数'],
    ['startAsset','期首資産_万円'],['investmentGain','資産運用益_万円'],
    ['primaryLabor','本人労働収入_万円'],['spouseLabor','配偶者労働収入_万円'],['primaryPension','本人公的年金_万円'],['spousePension','配偶者公的年金_万円'],['idecoAnnuity','iDeCo_DC年金_万円'],['unemployment','雇用保険_万円'],['extraIncome','一時金_臨時収入_万円']
  ].map(([key,label])=>({key,label}));

  const afterIncomeColumns = [
    {key:'detailTotalIncome',label:'現金収入合計_詳細_万円'},
    {key:'engineLabor',label:'労働収入合計_計算エンジン_万円'},
    {key:'enginePension',label:'年金収入合計_計算エンジン_万円'},
    {key:'engineTotalIncome',label:'現金収入合計_計算エンジン_万円'}
  ];
  const afterExpenseColumns = [
    {key:'travelAnnual',label:'旅行費_万円'},
    {key:'plannedCost',label:'詳細予定原価_万円'},
    {key:'managementBudget',label:'管理予算_万円'},
    {key:'buffer',label:'予算バッファ_万円'},
    {key:'operatingBalance',label:'現金収支_詳細原価基準_万円'},
    {key:'managementBalance',label:'現金収支_管理予算基準_万円'},
    {key:'engineExpense',label:'支出_計算エンジン_万円'},
    {key:'extraExpense',label:'臨時支出_計算エンジン_万円'},
    {key:'engineTotalOutflow',label:'総支出_計算エンジン_万円'},
    {key:'endAsset',label:'計画年末資産_万円'},
    {key:'managementThreshold',label:'管理基準_万円'},
    {key:'managementMargin',label:'管理基準差_万円'},
    {key:'actualEndAsset',label:'実績年末資産_万円'},
    {key:'actualDiff',label:'実績差_万円'},
    {key:'actualExpense',label:'実績年間支出_万円'},
    {key:'actualLabor',label:'実績労働収入_万円'},
    {key:'actualPension',label:'実績年金収入_万円'},
    {key:'actualReturnRate',label:'実績税引後運用利回り_pct'},
    {key:'actualTaxSocial',label:'実績税社会保険_万円'},
    {key:'actualReserveBalance',label:'実績予備枠残高_万円'},
    {key:'actualSafeAssetBalance',label:'実績安全資産残高_万円'},
    {key:'events',label:'計画イベント'},
    {key:'actualNote',label:'実績メモ'}
  ];

  const columns = [
    ...fixedColumns,
    ...dynamicIncome.values(),
    ...afterIncomeColumns,
    ...dynamicExpenseCategories.values(),
    ...dynamicExpenseItems.values(),
    ...afterExpenseColumns
  ];

  const primaryBirth = config.people?.primary?.birthDate;
  const spouseBirth = config.people?.spouse?.birthDate;
  const schemaVersion = config.meta?.schemaVersion || config.schemaVersion || '';
  const rulesAsOf = config.taxPolicy?.rulesAsOf || '';

  const rows = prepared.map(({ plan, cf, actual }) => {
    const periodStart = isoDateAtAge(primaryBirth, plan.age);
    const nextPeriodStart = isoDateAtAge(primaryBirth, Number(plan.age) + 1);
    const thresholdRaw = config.management?.thresholds?.[plan.age];
    const threshold = thresholdRaw === undefined || thresholdRaw === null ? '' : finiteOrBlank(thresholdRaw);
    const row = {
      exportedAt,
      schemaVersion,
      rulesAsOf,
      periodYear: periodStart ? Number(periodStart.slice(0,4)) : '',
      age: Number(plan.age),
      spouseAge: fullAgeOn(periodStart, spouseBirth),
      periodStart,
      periodEnd: nextDayBefore(nextPeriodStart),
      inflationFactor: finiteOrBlank(cf.inflationFactor),
      startAsset: finiteOrBlank(plan.startAsset),
      investmentGain: finiteOrBlank(plan.investmentGain),
      primaryLabor: finiteOrBlank(cf.income?.primaryLabor),
      spouseLabor: finiteOrBlank(cf.income?.spouseLabor),
      primaryPension: finiteOrBlank(cf.income?.primaryPension),
      spousePension: finiteOrBlank(cf.income?.spousePension),
      idecoAnnuity: finiteOrBlank(cf.income?.idecoAnnuity),
      unemployment: finiteOrBlank(cf.income?.unemployment),
      extraIncome: finiteOrBlank(cf.income?.extraIncome),
      detailTotalIncome: finiteOrBlank(cf.totalIncome),
      engineLabor: finiteOrBlank(plan.labor),
      enginePension: finiteOrBlank(plan.pension),
      engineTotalIncome: finiteOrBlank(plan.totalIncome),
      travelAnnual: finiteOrBlank(cf.travelAnnual),
      plannedCost: finiteOrBlank(cf.plannedCost),
      managementBudget: finiteOrBlank(cf.managementBudget),
      buffer: finiteOrBlank(cf.buffer),
      operatingBalance: finiteOrBlank(cf.operatingBalance),
      managementBalance: finiteOrBlank(cf.managementBalance),
      engineExpense: finiteOrBlank(plan.expense),
      extraExpense: finiteOrBlank(plan.extraExpense),
      engineTotalOutflow: finiteOrBlank(Number(plan.expense || 0) + Number(plan.extraExpense || 0)),
      endAsset: finiteOrBlank(plan.endAsset),
      managementThreshold: threshold,
      managementMargin: threshold === '' ? '' : finiteOrBlank(Number(plan.endAsset || 0) - Number(threshold)),
      actualEndAsset: actual?.endAsset == null ? '' : finiteOrBlank(actual.endAsset),
      actualDiff: actual?.endAsset == null ? '' : finiteOrBlank(Number(actual.endAsset) - Number(plan.endAsset || 0)),
      actualExpense: actual?.expense == null ? '' : finiteOrBlank(actual.expense),
      actualLabor: actual?.labor == null ? '' : finiteOrBlank(actual.labor),
      actualPension: actual?.pension == null ? '' : finiteOrBlank(actual.pension),
      actualReturnRate: actual?.returnRate == null ? '' : finiteOrBlank(actual.returnRate),
      actualTaxSocial: actual?.taxSocial == null ? '' : finiteOrBlank(actual.taxSocial),
      actualReserveBalance: actual?.reserveBalance == null ? '' : finiteOrBlank(actual.reserveBalance),
      actualSafeAssetBalance: actual?.safeAssetBalance == null ? '' : finiteOrBlank(actual.safeAssetBalance),
      events: (plan.events || []).map(e => `${e.date || ''} ${e.label || ''} ${finiteOrBlank(e.amount)}万円`.trim()).join(' / '),
      actualNote: actual?.note || ''
    };

    for (const item of cf.manualIncomeRows || []) row[manualIncomeKey(item.key || item.label)] = finiteOrBlank(item.annual);
    for (const category of cf.expenseCategories || []) {
      row[expenseCategoryKey(category.key || category.label)] = finiteOrBlank(category.annual);
      for (const item of category.items || []) row[expenseItemKey(category.key || category.label, item.key || item.label)] = finiteOrBlank(item.annual);
    }
    return row;
  });

  return { columns, rows };
}

export function datasetToCsv({ columns, rows }) {
  const header = columns.map(c => csvCell(c.label)).join(',');
  const body = rows.map(row => columns.map(c => csvCell(row[c.key])).join(',')).join('\r\n');
  return `${header}\r\n${body}\r\n`;
}

export function buildAnnualCsvText(config, result, options = {}) {
  return datasetToCsv(buildAnnualCsvDataset(config, result, options));
}

export function downloadAnnualCsv(config, result, filename = `retirement-annual-all-items-${new Date().toISOString().slice(0,10)}.csv`) {
  const csv = buildAnnualCsvText(config, result);
  const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
