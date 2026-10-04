// Salary-life engine v1. All amounts are 万円; months use UTC YYYY-MM.
export const SALARY_LIFE_MODE = 'net-transfer-v1';
export const monthIndex = date => date.getUTCFullYear() * 12 + date.getUTCMonth();
export function parseMonth(value) {
  if (typeof value !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null;
  return Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7)) - 1;
}
function dateMonth(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(value + 'T00:00:00Z');
  return Number.isFinite(+date) && date.toISOString().slice(0, 10) === value ? monthIndex(date) : null;
}
const amount = x => typeof x === 'number' && Number.isFinite(x) && x >= 0;
export class SalaryLifeValidationError extends Error {
  constructor(issues) {
    super(issues.map(x => x.detail).join('\n'));
    this.name = 'SalaryLifeValidationError';
    this.issues = issues;
  }
}
export function salaryLifeIsBefore(settings, date) {
  return monthIndex(date) <= parseMonth(settings.lastSalaryMonth);
}
export function salaryLifeContribution(config, date, retirementDate) {
  const i = config.ideco;
  if (!i) return 0;
  const month = monthIndex(date);
  const start = dateMonth(i.asOfDate);
  const end = dateMonth(i.contributionEndDate || retirementDate.toISOString().slice(0, 10));
  return start !== null && end !== null && month >= start && month < end ? i.monthlyContribution : 0;
}

// Validate the whole plan, including months preceding a forecast's restart.
// Never manufacture personal defaults or mutate the supplied configuration.
export function salaryLifeIssues(config, context) {
  const s = config.cashflow?.salaryLife;
  if (s === undefined) return [];
  const issues = [], seen = new Set();
  const fail = (code, detail) => {
    if (!seen.has(code)) { seen.add(code); issues.push({level:'error', code:`salary-life-${code}`, title:'給与生活の設定を確認してください', detail}); }
  };
  if (!s || s.mode !== SALARY_LIFE_MODE) {
    fail('mode', '給与生活の計算方式が不明です。旧方式として読み替えることはできません。');
    return issues;
  }
  const {start, end, birth, retirementDate, idecoProjection} = context;
  if (![start, end, birth, retirementDate].every(d => d instanceof Date && Number.isFinite(+d)) || end <= start || monthIndex(end) - monthIndex(start) > 1200) {
    fail('dates', '計画の日付・期間を確認してください（最大100年）。'); return issues;
  }
  if (dateMonth(config.people?.primary?.birthDate) === null || dateMonth(config.plan?.startDate) === null) fail('plan-dates', '新方式には本人の生年月日と計画開始日の明示が必要です。');
  const startAge = config.plan?.startAge;
  const anniversaryDay = Math.min(birth.getUTCDate(), new Date(Date.UTC(start.getUTCFullYear(),birth.getUTCMonth()+1,0)).getUTCDate());
  if (!Number.isInteger(startAge) || start.getUTCFullYear() !== birth.getUTCFullYear()+startAge || start.getUTCMonth() !== birth.getUTCMonth() || start.getUTCDate() !== anniversaryDay) fail('start-anchor', '初期の新方式では、計画開始日を開始年齢の誕生日にそろえてください。別時点の残高を無断で転用できません。');
  const first = monthIndex(start), stop = monthIndex(end), last = parseMonth(s.lastSalaryMonth);
  const age64 = monthIndex(birth) + 64 * 12;
  if (first < age64 || (first === age64 && start.getUTCDate() < birth.getUTCDate())) fail('before-64', '64歳未満の試算には別の基準残高と計算期間の拡張が必要です。');
  // last=first-1 explicitly means asset-funded living begins in the first plan month.
  if (last === null || last < first - 1 || last >= stop) fail('last-month', '給与生活最終月は、計画開始月の前月から計画最終月までのYYYY-MMで指定してください。');
  for (const field of ['monthlyAddition','monthlyWithdrawal']) if (!amount(s[field])) fail(field, `${field}: 月額を0以上の数値で明示してください。未入力を0円に変換しません。`);
  if (!amount(config.plan?.initialAsset) || !Number.isFinite(config.plan?.afterTaxReturn) || config.plan.afterTaxReturn <= -100 || !Number.isFinite(config.plan?.inflation) || config.plan.inflation <= -100) fail('plan-numbers', '開始資産・運用率・インフレ率を数値で確認してください。率は-100%より大きい必要があります。');
  if (last === null) return issues;
  const post = s.postSalaryLabor;
  if (last < stop - 1) {
    if (!['existing_confirmed','none','monthly'].includes(post?.mode)) fail('post-labor', '給与生活終了後の就労収入を確認してください。既存条件を使う場合も明示的な選択が必要です。');
    if (post?.mode === 'monthly' && (!amount(post.monthlyAmount) || parseMonth(post.lastMonth) === null || parseMonth(post.lastMonth) < last + 1 || parseMonth(post.lastMonth) >= stop)) fail('post-labor-monthly', '終了後の就労収入の月額と最終月を指定してください。');
  }
  const i = config.ideco;
  if (i && (!amount(i.monthlyContribution) || !idecoProjection || !Number.isFinite(idecoProjection.balance))) fail('ideco', 'iDeCo掛金・基準日・拠出終了日を確認してください。');
  const lump = i ? dateMonth(i.lumpDate || i.contributionEndDate || retirementDate.toISOString().slice(0, 10)) : null;
  const contributionEnd = i ? dateMonth(i.contributionEndDate || retirementDate.toISOString().slice(0, 10)) : null;
  if (i && (lump === null || lump < contributionEnd)) fail('ideco-receipt-date', '拠出終了より前のiDeCo受取は、この計算方式では扱えません。受取日を確認してください。');
  if (i && config.plan?.initialAssetIncludesIdeco !== false) fail('ideco-scope', '新方式では開始資産にiDeCoを含めないことを明示してください。');
  const events = config.events || [], periods = config.cashflow?.periodOverrides || [];
  if (!Array.isArray(events) || !Array.isArray(periods)) { fail('rows', '臨時収支・期間別設定は配列で指定してください。'); return issues; }
  for (const [n, e] of events.entries()) {
    const m = dateMonth(e.date);
    if (m === null || !['income','expense'].includes(e.type) || !amount(e.amount)) { fail(`event-${n}`, `臨時収支${n + 1}の日付・種類・金額を確認してください。`); continue; }
    if (m < first || m >= stop || e.amount === 0) continue;
    const allowed = m <= last ? ['separate','net_transfer'] : e.type === 'expense' ? ['separate','budget'] : ['separate'];
    if (!allowed.includes(e.fundingTreatment)) fail(`event-${n}`, `臨時収支${n + 1}を純入出金内・管理予算内・別枠の適切な区分に明示してください。`);
  }
  const receipt = key => {
    if (!['separate','net_transfer'].includes(s.receiptTreatment?.[key])) fail(`receipt-${key}`, `給与生活中の${key}受取が純入出金内か別枠かを確認してください。`);
  };
  for (let m = first; m < stop; m++) {
    const day = Math.min(start.getUTCDate(), new Date(Date.UTC(Math.floor(m / 12), m % 12 + 1, 0)).getUTCDate());
    const date = new Date(Date.UTC(Math.floor(m / 12), m % 12, day));
    let age = date.getUTCFullYear() - birth.getUTCFullYear();
    const birthdayDay = Math.min(birth.getUTCDate(), new Date(Date.UTC(date.getUTCFullYear(), birth.getUTCMonth()+1, 0)).getUTCDate());
    if (date.getUTCMonth() < birth.getUTCMonth() || (date.getUTCMonth() === birth.getUTCMonth() && day < birthdayDay)) age--;
    const before = m <= last;
    let budget = null;
    if (!before) {
      if (age < 65) {
        if (!amount(s.pre65MonthlyBudget)) fail('pre65-budget', '前倒し期間の65歳前の月額管理予算を入力してください。');
        if (periods.some(x => x.kind === 'budget' && age >= Number(x.fromAge) && age <= Number(x.toAge))) fail('pre65-budget-overlap', '65歳前の期間別管理予算が既にあります。新方式の予算との重複を解消してください。');
        budget = s.pre65MonthlyBudget;
      } else {
        const overrides = periods.filter(x => x.kind === 'budget' && x.key === 'budget' && age >= Number(x.fromAge) && age <= Number(x.toAge));
        const rows = (config.budgets || []).filter(x => age >= Number(x.fromAge) && age <= Number(x.toAge));
        const row = overrides[0] || rows[0];
        if (overrides.length > 1 || (!overrides.length && rows.length !== 1) || !row || !amount(overrides.length ? row.amount : row.annualBudget) || (overrides.length && !['monthly','annual'].includes(row.unit))) fail(`budget-${age}`, `${age}歳の管理予算の金額・範囲・重複を確認してください。`);
        else budget = overrides.length ? row.amount / (row.unit === 'monthly' ? 1 : 12) : row.annualBudget / 12;
      }
    }
    for (const [n, row] of periods.entries()) if (row.kind === 'income' && age >= Number(row.fromAge) && age <= Number(row.toAge)) {
      if (!amount(row.amount) || !['monthly','annual'].includes(row.unit)) fail(`period-${n}`, `期間別収入${n + 1}の金額・単位を確認してください。`);
      if (row.amount && !(before ? ['separate','net_transfer'] : ['separate']).includes(row.fundingTreatment)) fail(`period-${n}`, `期間別収入${n + 1}の計上先を確認してください。切替前後で扱いが変わる場合は期間を分けてください。`);
    }
    if (before) {
      for (const person of Object.values(config.income?.pensions || {})) if (person?.annualAtStart > 0 && dateMonth(person.startDate) !== null && m >= dateMonth(person.startDate)) receipt('pension');
      if (i && idecoProjection && lump !== null && ((m === lump && idecoProjection.lumpGross) || (m >= lump && m < lump + idecoProjection.annuityMonths && idecoProjection.annuityMonthly))) receipt('ideco');
      if (config.unemployment?.baselineMode === 'retire_at_65' && m === monthIndex(retirementDate)) receipt('unemployment');
    }
    const contribution = salaryLifeContribution(config, date, retirementDate);
    if (contribution > 0) {
      const phase = before ? 'before' : 'after', funding = s.idecoFunding?.[phase];
      const external = before ? 'salary' : 'household';
      if (!funding || ![external,'plan_asset'].includes(funding.source)) fail(`funding-${phase}`, `${before ? '給与生活中' : '給与生活終了後'}のiDeCo掛金原資を確認してください。`);
      else if (funding.source === external) {
        if (funding.accounting !== undefined) fail(`funding-${phase}-duplicate`, '家計原資の掛金を計画資産の引出・予算・別枠支出に重ねて指定できません。');
      } else {
        const allowed = before ? ['separate','withdrawal'] : ['separate','budget'];
        if (!allowed.includes(funding.accounting)) fail(`funding-${phase}-accounting`, '計画資産からの掛金は計上先を一つだけ指定してください。');
        if (funding.accounting === 'withdrawal' && s.monthlyWithdrawal < contribution) fail('contribution-withdrawal', '掛金を含む月額取崩しが掛金額を下回っています。');
        const inflatedBudget = budget * Math.pow(1 + config.plan.inflation / 100, (m - first) / 12);
        if (funding.accounting === 'budget' && amount(budget) && inflatedBudget < contribution) fail('contribution-budget', '掛金を含む管理予算が掛金額を下回っています。');
      }
    }
  }
  return issues;
}
