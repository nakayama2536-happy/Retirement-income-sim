import {
  runRetirementPlan, runForecastFromLatestActual, latestActual, planRowAtAge, scenarioMetrics,
  formatMan, pensionAnnualFromBase65, pensionAdjustmentFactor,
  retirementIncomeDeduction, taxableRetirementIncome, nisaCapacity, expenseDetailSummary, evaluateReviewTriggers,
  factorDecomposition, certaintyItems, CERTAINTY_LABELS, integrityChecks, ANNUAL_REVIEW_ITEMS, RULES_VERSION,
  projectIdeco, unemploymentComparison, idecoOverlapReference, retirementIdecoTaxSummary, estimateSimpleIncomeTaxes, retirementTaxEstimate,
  fukuyamaCarePremium2026, lateElderlyMedicalPremium2026, lateElderlyMedicalPremium2026Details, fukuyamaNhiPremium2026, fukuyamaNhiPremium2026Details
} from './calc.mjs';
import { saveConfig, loadConfig, loadScenarios, saveScenarios, downloadJson, migrateConfig } from './storage.mjs';
import { RULES } from './rules.mjs';

let config = loadConfig();
let scenarios = loadScenarios();
let result = null;
let forecast = null;

const el = id => document.getElementById(id);
const money = v => `${formatMan(v, 0)}万円`;
const numOrBlank = v => v === '' || v === null || v === undefined ? null : Number(v);

function showNotice(msg, type='info') {
  const n = el('notice'); n.textContent = msg; n.dataset.type = type; n.hidden = false;
  setTimeout(()=>n.hidden=true, 4500);
}

function validateConfig(c) {
  const errors = [];
  if (!c?.plan) errors.push('plan がありません');
  if (!Array.isArray(c?.budgets) || !c.budgets.length) errors.push('年間予算がありません');
  if (!c?.income?.pensions?.primary || !c?.income?.pensions?.spouse) errors.push('夫婦別の年金設定がありません');
  const integrityErrors=integrityChecks(c).filter(x=>x.level==='error').slice(0,3);
  errors.push(...integrityErrors.map(x=>x.title));
  return [...new Set(errors)];
}

function setEmptyState() {
  el('emptyState').hidden = false;
  el('dashboard').hidden = true;
  renderRules();
}

function ensureBaseScenario() {
  if (!config) return;
  const existing = scenarios.find(s => s.role === 'baseline');
  if (existing) return;
  if (scenarios.length) {
    scenarios[0].role = 'baseline';
    scenarios[0].name ||= '基準ケース';
    saveScenarios(scenarios);
    return;
  }
  const snapshot = scenarioSnapshot(config);
  scenarios = [{ id: crypto.randomUUID(), name: config.meta?.label || '基準ケース', role:'baseline', savedAt: new Date().toISOString(), selected: true, config: snapshot }];
  saveScenarios(scenarios);
}

function scenarioSnapshot(c) {
  const s = structuredClone(c);
  delete s.actuals;
  delete s.reviews;
  delete s.pendingDecisions;
  return s;
}

function refresh() {
  if (!config) return setEmptyState();
  config = migrateConfig(config);
  const errors = validateConfig(config);
  if (errors.length) { showNotice(`設定エラー: ${errors.join(' / ')}`, 'error'); return; }
  try {
    result = runRetirementPlan(config);
    forecast = runForecastFromLatestActual(config);
  } catch (e) { showNotice(e.message, 'error'); return; }
  el('emptyState').hidden = true;
  el('dashboard').hidden = false;
  saveConfig(config);
  ensureBaseScenario();
  renderHome(); renderExpenseDetail(); renderYearTable(); renderActuals(); renderAnnualReview(); renderScenarios(); renderSettings(); renderRules(); drawChart(); renderTimeline(); renderCertainty(); renderFactors(); renderIntegrity(); renderCalculationBasis();
}

function renderHome() {
  el('status').textContent = result.status;
  el('status').dataset.status = result.status;
  el('currentAsset').textContent = money(config.plan.initialAsset);
  el('finalAsset').textContent = money(result.finalAsset);
  el('finalThreshold').textContent = money(result.finalThreshold);
  el('reserve').textContent = money(result.reserve);
  el('afterReserve').textContent = money(result.finalAfterReserveUse);
  el('reserveUsedThreshold').textContent = money(result.reserveUsedThreshold);
  el('safeAssetMinimum').textContent = money(config.reserve?.minimumSafeAsset||0);

  if (forecast) {
    el('forecastFinalAsset').textContent = money(forecast.projection.finalAsset);
    const delta = forecast.projection.finalAsset - result.finalAsset;
    el('forecastFinalAsset').className = delta < 0 ? 'neg' : delta > 0 ? 'pos' : '';
    el('forecastNote').textContent = `${forecast.actual.age}歳実績から再予測（当初比 ${delta>=0?'+':''}${money(delta)}）`;
  } else {
    el('forecastFinalAsset').textContent = '未入力';
    el('forecastFinalAsset').className = '';
    el('forecastNote').textContent = '実績入力後に自動更新';
  }

  const key = el('keyAges'); key.innerHTML = '';
  result.keyAges.forEach(k => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${k.age}歳末</td><td>${money(k.asset)}</td><td>${money(k.threshold)}</td><td class="${k.margin<0?'neg':'pos'}">${k.margin>=0?'+':''}${money(k.margin)}</td>`;
    key.appendChild(tr);
  });

  const check = [];
  const ideco=projectIdeco(config);
  if (ideco) check.push(`65歳iDeCo/DC見込は運用前提による試算です（約${formatMan(ideco.balance)}万円）`);
  if (config.income?.pensions?.spouse?.certainty !== 'confirmed') check.push('配偶者の公的年金額は未確認です');
  if (config.reserve.total > 0 && result.finalAfterReserveUse < result.reserveUsedThreshold) check.push('予備枠全使用時は95歳の最低目安を下回ります');
  if (forecast && forecast.projection.finalAsset < result.finalThreshold) check.push('最新実績からの再予測が95歳管理基準を下回っています');
  el('checks').innerHTML = check.length ? check.map(x=>`<li>${x}</li>`).join('') : '<li>主要な未確認事項はありません。</li>';

  renderReviewAlerts();
  renderPending();
}


function certaintyClass(level){
  return ['confirmed','official_estimate','company_estimate'].includes(level) ? 'certainty-high'
    : ['plan','scenario'].includes(level) ? 'certainty-mid' : 'certainty-low';
}

function renderCertainty(){
  const items=certaintyItems(config);
  const uncertain=items.filter(x=>['assumption','unknown'].includes(x.level)).length;
  const rows=items.map(x=>{
    const value=x.value==null?'—':`${formatMan(x.value, x.unit==='%'?2:0)}${x.unit}`;
    return `<div class="certainty-row"><div><strong>${escapeHtml(x.label)}</strong><small>${value}</small></div><span class="certainty-tag ${certaintyClass(x.level)}">${escapeHtml(x.labelText)}</span></div>`;
  }).join('');
  el('certaintySummary').innerHTML=`<p class="muted">仮定・未確認 ${uncertain}項目。確度は計算結果を変更せず、前提の状態だけを管理します。</p><div class="certainty-list">${rows}</div>`;
}

function renderFactors(){
  const baseline=scenarios.find(s=>s.role==='baseline') || scenarios[0];
  const box=el('factorSummary');
  if(!baseline){ box.innerHTML='<p class="muted">基準ケースがありません。</p>'; return; }
  let d;
  try { d=factorDecomposition(baseline.config, config); }
  catch(e){ box.innerHTML=`<p class="muted">要因分解できませんでした: ${escapeHtml(e.message)}</p>`; return; }
  const max=Math.max(...d.impacts.map(x=>Math.abs(x.impact)),1);
  const sorted=[...d.impacts].sort((a,b)=>Math.abs(b.impact)-Math.abs(a.impact));
  const rows=sorted.map(x=>{
    const width=Math.max(2,Math.abs(x.impact)/max*100);
    return `<div class="factor-row"><div class="factor-label"><span>${escapeHtml(x.label)}</span><strong class="${x.impact<0?'neg':x.impact>0?'pos':''}">${x.impact>=0?'+':''}${formatMan(x.impact,0)}万円</strong></div><div class="factor-track"><i class="${x.impact<0?'factor-neg':'factor-pos'}" style="width:${width}%"></i></div></div>`;
  }).join('');
  const actualImpact=forecast ? forecast.projection.finalAsset-result.finalAsset : null;
  box.innerHTML=`<p class="muted">比較基準：${escapeHtml(baseline.name)}。現在条件との差額を配分しています。</p><div class="factor-total"><span>基準比</span><strong class="${d.totalDifference<0?'neg':d.totalDifference>0?'pos':''}">${d.totalDifference>=0?'+':''}${formatMan(d.totalDifference,0)}万円</strong></div>${rows}${actualImpact==null?'':`<div class="actual-impact"><span>最新実績を反映した追加影響</span><strong class="${actualImpact<0?'neg':actualImpact>0?'pos':''}">${actualImpact>=0?'+':''}${formatMan(actualImpact,0)}万円</strong></div>`}<p class="muted">要因分解は条件変更の相互作用を各項目へ配分する方式です。最新実績の影響は条件変更とは分けて表示します。</p>`;
}

