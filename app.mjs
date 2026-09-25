import {
  runRetirementPlan, runForecastFromLatestActual, latestActual, planRowAtAge, scenarioMetrics,
  formatMan, pensionAnnualFromBase65, pensionAdjustmentFactor,
  retirementIncomeDeduction, taxableRetirementIncome, nisaCapacity, expenseDetailSummary, evaluateReviewTriggers,
  factorDecomposition, certaintyItems, CERTAINTY_LABELS, CERTAINTY_DESCRIPTIONS, integrityChecks, ANNUAL_REVIEW_ITEMS, RULES_VERSION,
  projectIdeco, unemploymentComparison, idecoOverlapReference, retirementIdecoTaxSummary, estimateSimpleIncomeTaxes, retirementTaxEstimate,
  fukuyamaCarePremium2026, lateElderlyMedicalPremium2026, lateElderlyMedicalPremium2026Details, fukuyamaNhiPremium2026, fukuyamaNhiPremium2026Details
} from './calc.mjs';
import { saveConfig, loadConfig, loadScenarios, saveScenarios, downloadJson, migrateConfig } from './storage.mjs';
import { RULES } from './rules.mjs';
import { cashflowSummaryForAge, flattenEditableItems, applyPeriodEdit, formatPeriodList } from './cashflow.mjs';
import { downloadAnnualCsv } from './csv-export.mjs';

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
  renderHome(); renderCashflow(); renderYearTable(); renderActuals(); renderAnnualReview(); renderScenarios(); renderSettings(); renderRules(); drawChart(); renderTimeline(); renderCertainty(); renderFactors(); renderIntegrity(); renderCalculationBasis();
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
  if (!['confirmed','official_estimate'].includes(config.income?.pensions?.spouse?.certainty)) check.push('配偶者の公的年金額は未確認です');
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


function renderIntegrity(){
  const issues=integrityChecks(config);
  const box=el('integritySummary');
  const errors=issues.filter(x=>x.level==='error');
  const warns=issues.filter(x=>x.level==='warn');
  if(!issues.length){
    box.innerHTML='<p class="integrity-ok"><strong>整合性チェック：問題なし</strong></p><p class="muted">年間予算、予備枠、生活費内訳、臨時イベントの主要整合を確認済みです。</p>';
    return;
  }
  box.innerHTML=`<p><strong>${errors.length?`エラー ${errors.length}件`:'エラーなし'} / 警告 ${warns.length}件</strong></p><div class="pending-list">${issues.map(i=>`<article class="pending-item"><span class="pending-type ${i.level==='error'?'integrity-error':'integrity-warn'}">${i.level==='error'?'エラー':'警告'}</span><div><strong>${escapeHtml(i.title)}</strong><p>${escapeHtml(i.detail)}</p></div></article>`).join('')}</div>`;
}

function renderReviewAlerts() {
  const triggers = evaluateReviewTriggers(config, result);
  el('reviewCount').textContent = triggers.length ? `${triggers.length}件` : '該当なし';
  el('reviewAlerts').innerHTML = triggers.length
    ? triggers.map(t=>`<article class="pending-item"><span class="pending-type ${t.level==='review'?'review-type':''}">${t.level==='review'?'見直し':'注意'}</span><div><strong>${t.title}</strong><p>${t.detail}</p></div></article>`).join('')
    : '<p class="muted">現在、設定済みの自動見直し条件には該当していません。</p>';
}

function renderCashflow() {
  const ageSel=el('cashflowAge'); if(!ageSel) return;
  const prev=Number(ageSel.value||65); ageSel.innerHTML='';
  for(let age=Math.max(65,Number(config.plan?.startAge||64));age<=Number(config.plan?.endAge||95);age++){const o=document.createElement('option');o.value=age;o.textContent=`${age}歳`;ageSel.appendChild(o);}
  ageSel.value=String(Math.min(Number(config.plan?.endAge||95),Math.max(65,prev||65)));
  const age=Number(ageSel.value), cf=cashflowSummaryForAge(config,age), planRow=planRowAtAge(result,age), investment=Number(planRow?.investmentGain||0);
  el('cashflowSummary').innerHTML=`<dl><div><dt>現金収入</dt><dd>${money(cf.totalIncome)}</dd></div><div><dt>資産運用益</dt><dd>${money(investment)}</dd></div><div><dt>予定原価（詳細内訳）</dt><dd>${money(cf.plannedCost)}</dd></div><div><dt>管理予算</dt><dd>${money(cf.managementBudget)}</dd></div><div><dt>予算バッファ</dt><dd class="${cf.buffer<0?'buffer-negative':'buffer-positive'}">${cf.buffer>=0?'+':''}${money(cf.buffer)}</dd></div><div><dt>現金収支（予定原価基準）</dt><dd class="${cf.operatingBalance<0?'neg':'pos'}">${cf.operatingBalance>=0?'+':''}${money(cf.operatingBalance)}</dd></div></dl><p class="muted">${age}歳時点。固定費等は64歳価格からインフレ${Number(config.plan?.inflation||0).toFixed(1)}%/年で調整。税・社会保険は計算可能な場合、2026年制度を将来へ仮適用した自動予定額を使います。</p>`;
  const i=cf.income;
  const incomeRows=[['本人 労働収入',i.primaryLabor],['配偶者 労働収入',i.spouseLabor],['本人 公的年金',i.primaryPension],['配偶者 公的年金',i.spousePension],['iDeCo/DC年金',i.idecoAnnuity],['雇用保険',i.unemployment],['一時金・臨時収入',i.extraIncome],...cf.manualIncomeRows.map(x=>[x.label,x.annual])].filter(x=>Math.abs(Number(x[1]||0))>0.0001);
  el('incomeDetail').innerHTML=`<table class="cashflow-table"><thead><tr><th>項目</th><th>年額</th><th>月平均</th></tr></thead><tbody>${incomeRows.map(([label,annual])=>`<tr><td>${escapeHtml(label)}</td><td>${money(annual)}</td><td>${money(Number(annual)/12)}</td></tr>`).join('')||'<tr><td colspan="3">収入なし</td></tr>'}<tr class="cashflow-cat"><td>現金収入合計</td><td>${money(cf.totalIncome)}</td><td>${money(cf.totalIncome/12)}</td></tr><tr><td>資産運用益（別管理）</td><td>${money(investment)}</td><td>—</td></tr></tbody></table>`;
  let exp='';
  for(const cat of cf.expenseCategories){
    exp+=`<tr class="cashflow-cat"><td>${escapeHtml(cat.label)}${cat.auto?' <span class="pill">自動</span>':''}</td><td>${money(cat.monthly)}</td><td>${money(cat.annual)}</td></tr>`;
    for(const item of cat.items||[]){const monthly=item.monthly!=null?item.monthly:Number(item.annual||0)/12;const period=item.periods?`<div class="period-note">${escapeHtml(formatPeriodList(item.periods,'monthly'))}</div>`:'';exp+=`<tr><td class="cashflow-sub">${escapeHtml(item.label)}${period}</td><td>${money(monthly)}</td><td>${money(item.annual||monthly*12)}</td></tr>`;}
    if(cat.note) exp+=`<tr><td colspan="3" class="muted">${escapeHtml(cat.note)}</td></tr>`;
  }
  exp+=`<tr class="cashflow-cat"><td>旅行費</td><td>—</td><td>${money(cf.travelAnnual)}<div class="period-note">基準額 ${money(cf.travelBase)}/年</div></td></tr><tr class="cashflow-cat"><td>予定原価 合計</td><td>${money(cf.operatingAnnual/12)}</td><td>${money(cf.plannedCost)}</td></tr>`;
  el('expenseDetail').innerHTML=`<table class="cashflow-table"><thead><tr><th>項目</th><th>月額</th><th>年額</th></tr></thead><tbody>${exp}</tbody></table>`;
  el('expenseReconcile').innerHTML=`<dl><div><dt>詳細予定原価</dt><dd>${money(cf.plannedCost)}</dd></div><div><dt>管理予算</dt><dd>${money(cf.managementBudget)}</dd></div><div><dt>バッファ</dt><dd class="${cf.buffer<0?'buffer-negative':'buffer-positive'}">${cf.buffer>=0?'+':''}${money(cf.buffer)}</dd></div><div><dt>旅行費</dt><dd>${money(cf.travelAnnual)}</dd></div></dl><p class="muted">資産シミュレーションは管理予算を支出正本とします。予定原価が下がればバッファが増え、予定原価が管理予算を超えると赤字表示して予算見直し対象にします。</p>`;
  const reductions=config.cashflow?.expenseReductionIdeas||[], improvements=config.cashflow?.incomeImprovementIdeas||[];
  el('improvementIdeas').innerHTML=`<div class="idea-grid"><div><h3>経費削減案</h3><ul>${reductions.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul></div><div><h3>収益改善案</h3><ul>${improvements.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul></div></div>`;
  renderPeriodEditor();
}
function renderPeriodEditor(){
  const sel=el('periodTarget'); if(!sel) return;
  const previous=sel.value, items=flattenEditableItems(config);
  sel.innerHTML=items.map(x=>`<option value="${x.kind}:${x.key}">${escapeHtml(x.categoryLabel)}｜${escapeHtml(x.label)}</option>`).join('');
  if(items.some(x=>`${x.kind}:${x.key}`===previous)) sel.value=previous;
  const current=items.find(x=>`${x.kind}:${x.key}`===sel.value)||items[0], f=el('periodEditForm');
  if(current){let periods=[];if(current.kind==='expense') periods=(config.cashflow?.expenseCategories||[]).flatMap(c=>c.items||[]).find(x=>x.key===current.key)?.periods||[];else if(current.kind==='budget') periods=(config.budgets||[]).map(x=>({fromAge:x.fromAge,toAge:x.toAge,amount:x.annualBudget}));else if(current.kind==='travel') periods=(config.cashflow?.travel||[]).map(x=>({fromAge:x.fromAge,toAge:x.toAge,amount:x.annualAmount}));else periods=(config.cashflow?.manualIncomeItems||[]).find(x=>x.key===current.key)?.periods||[];el('periodCurrent').textContent=`現在設定：${formatPeriodList(periods,current.unit)||'期間設定なし'}`;if(f?.elements?.unit) f.elements.unit.value=current.unit||'monthly';}
}
function savePeriodEdit(ev){
  ev.preventDefault(); const f=ev.currentTarget, [kind,key]=String(f.target.value).split(':');
  const ok=applyPeriodEdit(config,{kind,key,fromAge:+f.fromAge.value,toAge:+f.toAge.value,amount:+f.amount.value,unit:f.unit.value});
  if(!ok){showNotice('対象項目を更新できませんでした。','error');return;}
  refresh(); showNotice(`${f.fromAge.value}〜${f.toAge.value}歳の金額を一括設定しました。`);
}

function derivePending() {
  const items = [];
  if (!['confirmed','official_estimate'].includes(config.income?.pensions?.spouse?.certainty)) items.push({type:'要確認', title:'配偶者の公的年金額', reason:`設定中の配偶者年金 ${formatMan(config.income?.pensions?.spouse?.annualAtStart||0,1)}万円/年は暫定値です。ねんきん定期便等で確認後に更新します。`});
  if (config.nisa?.accountBreakdownStatus === 'pending') items.push({type:'要判断', title:'NISA・課税口座・現金の64歳時点内訳', reason:'総資産試算は継続できます。取崩し順序と税引後精度を高める段階で確定します。'});
  if (config.retirement?.majorSpendDetailStatus === 'pending') items.push({type:'要判断', title:'退職金の大型支出内訳と開始資産の時点整合', reason:`社宅退去を本業退職の約6か月前に検討するため、大型支出枠 ${formatMan(config.retirement?.majorSpendPlanned||0)}万円と開始資産の関係を詳細内訳確定時に照合します。`});
  if (!config.care?.facilityRoomType) items.push({type:'要判断', title:'特養の個室／多床室など介護費の詳細条件', reason:'現状は年代別年間予算で包含しています。施設費を個別積上げする際に必要です。'});
  if (config.taxPolicy?.rulesAsOf) items.push({type:'要更新', title:'退職前の制度再確認', reason:`税・社会保険・雇用保険は現在 ${config.taxPolicy.rulesAsOf} 制度による参考計算です。退職前に最新制度で更新します。`});
  for (const title of config.pendingDecisions || []) {
    if (!items.some(i=>i.title===title)) items.push({type:'保留',title,reason:'判断または外部確認が必要なため、計算を止めず保留管理しています。'});
  }
  return items;
}

function renderPending() {
  const items = derivePending();
  el('pendingCount').textContent = `${items.length}件`;
  el('pendingList').innerHTML = items.map(i=>`<article class="pending-item"><span class="pending-type">${i.type}</span><div><strong>${i.title}</strong><p>${i.reason}</p></div></article>`).join('') || '<p>現在、保留事項はありません。</p>';
}

function renderYearTable() {
  const body = el('yearRows'); body.innerHTML = '';
  result.rows.forEach(r => {
    const a = config.actuals?.[r.age];
    const actualAsset = a?.endAsset;
    const diff = actualAsset === undefined || actualAsset === null ? null : Number(actualAsset) - r.endAsset;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.age}</td><td>${formatMan(r.startAsset)}</td><td>${formatMan(r.investmentGain)}</td><td>${formatMan(r.totalIncome)}</td><td>${formatMan(r.expense+r.extraExpense)}</td><td>${formatMan(r.endAsset)}</td><td>${actualAsset==null?'—':formatMan(actualAsset)}</td><td class="${diff==null?'':diff<0?'neg':'pos'}">${diff==null?'—':`${diff>=0?'+':''}${formatMan(diff)}`}</td>`;
    body.appendChild(tr);
  });
}

function drawPolyline(svg, points, x, y, className) {
  if (!points.length) return;
  const ns='http://www.w3.org/2000/svg';
  const line=document.createElementNS(ns,'polyline');
  line.setAttribute('points',points.map(p=>`${x(p.age)},${y(p.endAsset)}`).join(' '));
  line.setAttribute('class',className); line.setAttribute('fill','none'); svg.appendChild(line);
}

function drawChart() {
  const svg = el('assetChart');
  const w = 820, h = 300, pad = {l:54,r:18,t:18,b:36};
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`); svg.innerHTML = '';
  const planPoints = [{age:config.plan.startAge, endAsset:config.plan.initialAsset}, ...result.rows.map(r=>({age:r.age+1,endAsset:r.endAsset}))];
  const actualPoints = Object.entries(config.actuals || {}).map(([age,a])=>({age:+age,endAsset:+a.endAsset})).filter(p=>Number.isFinite(p.endAsset)).sort((a,b)=>a.age-b.age);
  const forecastPoints = forecast ? [{age:forecast.actual.age+1,endAsset:+forecast.actual.endAsset}, ...forecast.projection.rows.map(r=>({age:r.age+1,endAsset:r.endAsset}))] : [];
  const all = [...planPoints, ...actualPoints, ...forecastPoints];
  const maxY = Math.max(...all.map(p=>p.endAsset), 1000) * 1.08;
  const minAge = config.plan.startAge, maxAge = config.plan.endAge + 1;
  const x = age => pad.l + (age-minAge)/(maxAge-minAge)*(w-pad.l-pad.r);
  const y = val => h-pad.b - val/maxY*(h-pad.t-pad.b);
  const ns='http://www.w3.org/2000/svg';

  const roughStep=maxY/4;
  const magnitude=Math.pow(10,Math.max(0,Math.floor(Math.log10(roughStep||1))));
  const gridStep=Math.max(1,Math.ceil(roughStep/magnitude)*magnitude);
  for(let v=0;v<=maxY;v+=gridStep){
    const gy=document.createElementNS(ns,'line'); gy.setAttribute('x1',pad.l);gy.setAttribute('x2',w-pad.r);gy.setAttribute('y1',y(v));gy.setAttribute('y2',y(v));gy.setAttribute('class','grid');svg.appendChild(gy);
    const t=document.createElementNS(ns,'text');t.textContent=`${formatMan(v)}`;t.setAttribute('x',pad.l-8);t.setAttribute('y',y(v)+4);t.setAttribute('text-anchor','end');t.setAttribute('class','axis');svg.appendChild(t);
  }
  [65,70,75,80,85,90,95,96].forEach(a=>{
    const t=document.createElementNS(ns,'text');t.textContent=`${a}`;t.setAttribute('x',x(a));t.setAttribute('y',h-12);t.setAttribute('text-anchor','middle');t.setAttribute('class','axis');svg.appendChild(t);
  });

  drawPolyline(svg, planPoints, x, y, 'asset-line');
  if (forecastPoints.length) drawPolyline(svg, forecastPoints, x, y, 'forecast-line');

  actualPoints.forEach(p=>{
    const c=document.createElementNS(ns,'circle'); c.setAttribute('cx',x(p.age)); c.setAttribute('cy',y(p.endAsset)); c.setAttribute('r','5'); c.setAttribute('class','actual-point'); svg.appendChild(c);
  });
  result.keyAges.forEach(k=>{
    const c=document.createElementNS(ns,'circle');c.setAttribute('cx',x(k.age+1));c.setAttribute('cy',y(k.asset));c.setAttribute('r','3');c.setAttribute('class','key-point');svg.appendChild(c);
  });
}

function renderTimeline(){
  const list=el('timeline'); list.innerHTML='';
  const primaryBirth=new Date(`${config.people?.primary?.birthDate}T00:00:00`);
  const ageAt=d=>{const x=new Date(`${d}T00:00:00`);let a=x.getFullYear()-primaryBirth.getFullYear();if(x.getMonth()<primaryBirth.getMonth()||(x.getMonth()===primaryBirth.getMonth()&&x.getDate()<primaryBirth.getDate()))a--;return a;};
  const raw=[
    [config.plan?.startDate,'老後計画開始'],
    [config.retirement?.receiveDate,'退職金受取'],
    [config.employment?.primary?.mainRetirement?.baseDate,'本業退職（基本）'],
    [config.ideco?.lumpDate||config.ideco?.contributionEndDate,'iDeCo/DC 50%一時金・年金開始'],
    [config.income?.pensions?.spouse?.startDate,'配偶者 公的年金開始'],
    [config.income?.pensions?.primary?.startDate,'本人 公的年金開始'],
    [config.employment?.spouse?.sideWork?.endDate,'配偶者アルバイト終了'],
    [config.employment?.primary?.sideWork?.endDate,'本人アルバイト終了']
  ].filter(x=>x[0]).map(([date,label])=>({date,label,age:ageAt(date)}));
  const items=[...raw,...(config.events||[]).filter(e=>e.date).map(e=>({date:e.date,label:e.label,age:ageAt(e.date)}))].sort((a,b)=>a.date.localeCompare(b.date));
  items.forEach(i=>{ const li=document.createElement('li'); li.innerHTML=`<strong>${i.age}歳</strong><span>${escapeHtml(i.label)} <small>${escapeHtml(i.date.slice(0,7))}</small></span>`; list.appendChild(li); });
}

function renderActuals() {
  const select = el('actualAge');
  const selected = select.value;
  select.innerHTML = '';
  for (let age=config.plan.startAge; age<=config.plan.endAge; age++) {
    const o=document.createElement('option');o.value=age;o.textContent=`${age}歳`;select.appendChild(o);
  }
  const latest = latestActual(config);
  select.value = selected || latest?.age || config.plan.startAge;
  populateActualForm(select.value);

  const body=el('actualRows'); body.innerHTML='';
  const entries=Object.entries(config.actuals||{}).map(([age,a])=>({age:+age,...a})).sort((a,b)=>a.age-b.age);
  entries.forEach(a=>{
    const p=planRowAtAge(result,a.age); const diff=p?Number(a.endAsset)-p.endAsset:null;
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${a.age}</td><td>${p?formatMan(p.endAsset):'—'}</td><td>${formatMan(a.endAsset)}</td><td class="${diff==null?'':diff<0?'neg':'pos'}">${diff==null?'—':`${diff>=0?'+':''}${formatMan(diff)}`}</td><td>${a.expense==null?'—':formatMan(a.expense)}</td><td>${a.taxSocial==null?'—':formatMan(a.taxSocial)}</td><td>${a.safeAssetBalance==null?'—':formatMan(a.safeAssetBalance)}</td><td>${a.note||''}</td><td><button class="link-btn" data-delete-actual="${a.age}">削除</button></td>`;
    body.appendChild(tr);
  });

  const box=el('actualSummary');
  if(!latest){ box.innerHTML='<p>まだ実績は登録されていません。</p>'; return; }
  const plan=planRowAtAge(result,latest.age); const diff=Number(latest.endAsset)-(plan?.endAsset||0); const pct=plan?.endAsset?diff/plan.endAsset*100:0;
  box.innerHTML=`<dl><div><dt>最新実績</dt><dd>${latest.age}歳</dd></div><div><dt>計画資産</dt><dd>${money(plan?.endAsset||0)}</dd></div><div><dt>実績資産</dt><dd>${money(latest.endAsset)}</dd></div><div><dt>差額</dt><dd class="${diff<0?'neg':'pos'}">${diff>=0?'+':''}${money(diff)}（${pct>=0?'+':''}${pct.toFixed(1)}%）</dd></div><div><dt>95歳再予測</dt><dd>${forecast?money(forecast.projection.finalAsset):'—'}</dd></div></dl>`;
}


function populateActualForm(age){
  const f=el('actualForm'); const a=config.actuals?.[Number(age)];
  f.endAsset.value=a?.endAsset ?? '';
  f.expense.value=a?.expense ?? '';
  f.labor.value=a?.labor ?? '';
  f.pension.value=a?.pension ?? '';
  f.returnRate.value=a?.returnRate ?? '';
  f.reserveBalance.value=a?.reserveBalance ?? '';
  f.safeAssetBalance.value=a?.safeAssetBalance ?? '';
  f.taxSocial.value=a?.taxSocial ?? '';
  f.note.value=a?.note ?? '';
}

function saveActual(ev){
  ev.preventDefault(); const f=ev.currentTarget; const age=Number(f.age.value);
  config.actuals ||= {};
  config.actuals[age]={
    endAsset:Number(f.endAsset.value), expense:numOrBlank(f.expense.value), labor:numOrBlank(f.labor.value),
    pension:numOrBlank(f.pension.value), returnRate:numOrBlank(f.returnRate.value), reserveBalance:numOrBlank(f.reserveBalance.value),
    safeAssetBalance:numOrBlank(f.safeAssetBalance.value), taxSocial:numOrBlank(f.taxSocial.value),
    note:f.note.value.trim(), updatedAt:new Date().toISOString()
  };
  f.reset(); refresh(); el('actualAge').value=age; showNotice(`${age}歳の実績を保存し、95歳まで再予測しました。`);
}

function deleteActual(age){
  if(!config.actuals?.[age]) return;
  delete config.actuals[age]; refresh(); showNotice(`${age}歳の実績を削除しました。`);
}


function renderAnnualReview(ageOverride=null){
  const select=el('annualReviewAge');
  const current=ageOverride ?? select.value;
  select.innerHTML='';
  for(let age=config.plan.startAge;age<=config.plan.endAge;age++){
    const o=document.createElement('option');o.value=age;o.textContent=`${age}歳`;select.appendChild(o);
  }
  const latest=latestActual(config);
  const target=Number(current || latest?.age || config.plan.startAge);
  select.value=String(target);
  const review=config.reviews?.[target] || {items:{},note:''};
  const list=el('annualReviewList');
  list.innerHTML=ANNUAL_REVIEW_ITEMS.map(item=>`<label class="review-check"><input type="checkbox" data-review-key="${item.key}" ${review.items?.[item.key]?'checked':''}><span>${escapeHtml(item.label)}</span></label>`).join('');
  el('annualReviewNote').value=review.note || '';
  const done=ANNUAL_REVIEW_ITEMS.filter(item=>review.items?.[item.key]).length;
  el('annualReviewProgress').textContent=`${done}/${ANNUAL_REVIEW_ITEMS.length} 確認済み`;
}

function saveAnnualReview(){
  const age=Number(el('annualReviewAge').value);
  config.reviews ||= {};
  const items={};
  document.querySelectorAll('[data-review-key]').forEach(cb=>{items[cb.dataset.reviewKey]=cb.checked;});
  config.reviews[age]={items,note:el('annualReviewNote').value.trim(),updatedAt:new Date().toISOString()};
  refresh(); el('annualReviewAge').value=String(age); renderAnnualReview(age); showNotice(`${age}歳の年次点検を保存しました。`);
}

function renderScenarios(){
  const wrap=el('scenarioList'); wrap.innerHTML='';
  scenarios.forEach(s=>{
    const m=scenarioMetrics(s.config);
    const article=document.createElement('article'); article.className='scenario-item';
    const baseline=s.role==='baseline';
    article.innerHTML=`<label class="scenario-check"><input type="checkbox" data-scenario-select="${s.id}" ${s.selected?'checked':''}><span><strong>${escapeHtml(s.name)} ${baseline?'<em class="baseline-badge">基準</em>':''}</strong><small>95歳 ${money(m.finalAsset)} / 80歳 ${m.age80Asset==null?'—':money(m.age80Asset)}</small></span></label>${baseline?'<span class="muted">固定</span>':`<button class="link-btn" data-scenario-delete="${s.id}">削除</button>`}`;
    wrap.appendChild(article);
  });
  renderScenarioCompare();
}

function renderScenarioCompare(){
  const selected=scenarios.filter(s=>s.selected).slice(0,3);
  if(!selected.length){ el('scenarioCompare').innerHTML='<p class="muted">比較するシナリオを選択してください。</p>'; return; }
  const metrics=selected.map(s=>({s,m:scenarioMetrics(s.config)}));
  const rows=[
    ['95歳末資産', x=>money(x.m.finalAsset)],
    ['予備枠全使用後', x=>money(x.m.afterReserve)],
    ['80歳末資産', x=>x.m.age80Asset==null?'—':money(x.m.age80Asset)],
    ['90歳末資産', x=>x.m.age90Asset==null?'—':money(x.m.age90Asset)],
    ['税引後運用利回り', x=>`${x.s.config.plan.afterTaxReturn}%`],
    ['インフレ率', x=>`${x.s.config.plan.inflation}%`],
    ['本人バイト終了', x=>x.s.config.employment?.primary?.sideWork?.endDate?.slice(0,7)||'—'],
    ['本人年金開始', x=>x.s.config.income?.pensions?.primary?.startDate?.slice(0,7)||'—']
  ];
  let html='<table><thead><tr><th>指標</th>'+metrics.map(x=>`<th>${escapeHtml(x.s.name)}</th>`).join('')+'</tr></thead><tbody>';
  html+=rows.map(([label,fn])=>`<tr><td>${label}</td>${metrics.map(x=>`<td>${fn(x)}</td>`).join('')}</tr>`).join('');
  html+='</tbody></table>'; el('scenarioCompare').innerHTML=html;
}

function saveCurrentScenario(){
  const input=el('scenarioName'); const name=input.value.trim() || `シナリオ${scenarios.length+1}`;
  scenarios.push({id:crypto.randomUUID(),name,savedAt:new Date().toISOString(),selected:scenarios.filter(s=>s.selected).length<3,config:scenarioSnapshot(config)});
  saveScenarios(scenarios); input.value=''; renderScenarios(); showNotice(`「${name}」を保存しました。`);
}

function toggleScenario(id, checked){
  const current=scenarios.filter(s=>s.selected).length;
  const target=scenarios.find(s=>s.id===id); if(!target) return;
  if(checked && current>=3){ showNotice('同時比較は最大3案です。','error'); renderScenarios(); return; }
  target.selected=checked; saveScenarios(scenarios); renderScenarios();
}

function deleteScenario(id){
  const target=scenarios.find(s=>s.id===id);
  if(target?.role==='baseline'){ showNotice('基準ケースは差分管理の基準なので削除できません。','error'); return; }
  scenarios=scenarios.filter(s=>s.id!==id); saveScenarios(scenarios); renderScenarios(); showNotice('シナリオを削除しました。');
}

function escapeHtml(s=''){ return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

function renderSettings(){
  const f=el('settingsForm'); const p=config.plan;
  f.initialAsset.value=p.initialAsset; f.afterTaxReturn.value=p.afterTaxReturn; f.inflation.value=p.inflation;
  f.laborAnnual.value=(Number(config.employment?.primary?.sideWork?.monthlyGross||0)+Number(config.employment?.spouse?.sideWork?.monthlyGross||0))*12;
  f.reserveTotal.value=config.reserve.total;
  renderCertaintySettings();
}


function renderCertaintySettings(){
  const form=el('certaintyForm'); if(!form) return;
  const guide=el('certaintyGuide');
  if(guide) guide.innerHTML=`<dl>${Object.entries(CERTAINTY_LABELS).map(([key,label])=>`<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(CERTAINTY_DESCRIPTIONS[key]||'')}</dd>`).join('')}</dl>`;
  const items=certaintyItems(config), labels={initialAsset:'64歳開始資産',returnRate:'運用利回り',inflation:'インフレ率',laborIncome:'労働収入',pension:'本人年金',spousePension:'配偶者年金',dc:'DC受取',budgets:'年間予算',retirement:'退職金'};
  const order=Object.keys(labels), itemMap=Object.fromEntries(items.map(x=>[x.key,x])), options=Object.entries(CERTAINTY_LABELS).map(([value,label])=>`<option value="${value}">${label}</option>`).join('');
  form.innerHTML=order.map(key=>{const it=itemMap[key];const value=it?.value==null?'—':`${formatMan(it.value,it.unit==='%'?2:1)}${it.unit||''}`;return `<label class="certainty-setting">${labels[key]}<select name="${key}">${options}</select><small>現在値：${escapeHtml(value)} / ${escapeHtml(CERTAINTY_DESCRIPTIONS[it?.level||'unknown']||'')}</small></label>`;}).join('')+'<button class="primary" type="submit">確度区分を保存</button>';
  order.forEach(key=>{if(!form.elements[key])return;if(key==='spousePension')form.elements[key].value=config.income?.pensions?.spouse?.certainty||'unknown';else form.elements[key].value=config.certainty?.[key]||itemMap[key]?.level||'unknown';});
}

function saveCertainty(ev){
  ev.preventDefault(); const f=ev.currentTarget;
  config.certainty ||= {};
  for(const key of ['initialAsset','returnRate','inflation','laborIncome','pension','dc','budgets','retirement']) config.certainty[key]=f.elements[key].value;
  if(config.income?.pensions?.primary) config.income.pensions.primary.certainty=config.certainty.pension;
  if(config.income?.pensions?.spouse && f.elements.spousePension) config.income.pensions.spouse.certainty=f.elements.spousePension.value;
  refresh(); showNotice('入力値の確度区分を保存しました。');
}

function applySettings(ev){
  ev.preventDefault(); const f=ev.currentTarget;
  config.plan.initialAsset=+f.initialAsset.value; config.plan.afterTaxReturn=+f.afterTaxReturn.value; config.plan.inflation=+f.inflation.value;
  const householdAnnual=+f.laborAnnual.value; const eachMonthly=householdAnnual/24;
  if(config.employment?.primary?.sideWork) config.employment.primary.sideWork.monthlyGross=eachMonthly;
  if(config.employment?.spouse?.sideWork) config.employment.spouse.sideWork.monthlyGross=eachMonthly;
  config.reserve.total=+f.reserveTotal.value;
  refresh(); showNotice('設定を保存し、月次計算で95歳まで再計算しました。');
}


function renderCalculationBasis(){
  const box=el('calculationBasis'), source=el('sourceStatus');
  if(!box||!source||!config||!result) return;
  const start=config.plan?.startDate || '—';
  const ret=config.employment?.primary?.mainRetirement?.baseDate || '—';
  const idecoTax=config.ideco?.applyCurrentLawTaxReference ? '現行制度参考を反映' : '税引前で計上';
  box.innerHTML=`<dl>
    <div><dt>計算単位</dt><dd>月次</dd></div>
    <div><dt>計画開始</dt><dd>${escapeHtml(start)}</dd></div>
    <div><dt>本業退職・基本日</dt><dd>${escapeHtml(ret)}</dd></div>
    <div><dt>通常運用</dt><dd>税引後 ${Number(config.plan?.afterTaxReturn||0).toFixed(5)}%/年</dd></div>
    <div><dt>インフレ</dt><dd>${Number(config.plan?.inflation||0).toFixed(2)}%/年</dd></div>
    <div><dt>支出の正本</dt><dd>管理予算（詳細予定原価＋バッファ）</dd></div>
    <div><dt>iDeCo一時金</dt><dd>${idecoTax}</dd></div>
    <div><dt>95歳末</dt><dd>${money(result.finalAsset)}</dd></div>
  </dl><p class="muted">月末資産＝月初資産＋月次運用益＋各種収入－インフレ調整後支出－臨時支出。詳細予定原価は固定内訳・旅行費・税社会保険自動試算から算出し、管理予算との差をバッファとして管理します。資産計算では管理予算を支出正本とします。</p>`;
  const entries=Object.values(RULES).filter(r=>r&&typeof r==='object'&&r.title);
  source.innerHTML=`<p><strong>制度基準日 ${escapeHtml(RULES.asOf)}</strong></p><ul class="source-list">${entries.map(r=>`<li><a href="${r.url}" target="_blank" rel="noopener">${escapeHtml(r.title)}：${escapeHtml(r.source)}</a></li>`).join('')}</ul><p class="muted">将来の退職・受取時は、その時点の法令・自治体保険料・運営管理機関条件で再確認します。</p>`;
}

function renderRules(){
  el('rulesAsOf').textContent = RULES.asOf;
  const base65=config?.income?.pensions?.primary?.alternatives?.['65']; if(base65!=null && el('pensionBase65')) el('pensionBase65').value=Number(base65).toFixed(4);
  const wrap=el('ruleCards'); wrap.innerHTML='';
  Object.entries(RULES).filter(([k])=>k!=='asOf').forEach(([key,r])=>{
    const article=document.createElement('article'); article.className='rule-card';
    article.innerHTML=`<h3>${r.title}</h3><p>${r.summary}</p><small>出典：<a href="${r.url}" target="_blank" rel="noopener">${r.source}</a> / 制度基準日 ${RULES.asOf}</small>`;
    wrap.appendChild(article);
  });
}

function runPensionTool(){
  const base=+el('pensionBase65').value, age=+el('pensionToolAge').value;
  const birthYear=Number((config?.people?.primary?.birthDate||'1965-01-01').slice(0,4));
  const factor=pensionAdjustmentFactor(age,birthYear), annual=pensionAnnualFromBase65(base,age,birthYear);
  el('pensionToolResult').textContent=`増減率 ${(factor-1)*100>=0?'+':''}${((factor-1)*100).toFixed(1)}% → 年額 約${formatMan(annual,1)}万円`;
}
function runNisaTool(){
  const r=nisaCapacity({tsumitateUsed:+el('nisaTsumitate').value,growthUsed:+el('nisaGrowth').value,lifetimeBookUsed:+el('nisaLifetime').value});
  el('nisaToolResult').textContent=`今年残り ${formatMan(r.annualRemaining)}万円 / 生涯残り ${formatMan(r.lifetimeRemaining)}万円`;
}
function runIdecoTool(){
  const balance=+el('idecoBalance').value, years=+el('idecoYears').value;
  const annual=years>0?balance/years:0;
  const summary=retirementIdecoTaxSummary(config);
  const plan=summary?.plan, overlap=summary?.overlap, lumpTax=summary?.idecoLumpTax;
  const detail=plan?` / 現行計画の65歳見込 約${formatMan(plan.balance,1)}万円、50%一時金 約${formatMan(plan.lumpGross,1)}万円、5年年金 約${formatMan(plan.annuityAnnual,1)}万円/年`:'';
  const warn=overlap?.within19YearRule
    ?` / 19年ルール該当・調整後控除 約${formatMan(overlap.adjustedDeduction,0)}万円`
    :' / 19年ルール非該当参考';
  const net=lumpTax?` / 一時金手取参考 約${formatMan(lumpTax.net,1)}万円`:'';
  el('idecoToolResult').textContent=`入力残高を${years}年均等なら税引前年額 約${formatMan(annual,1)}万円${detail}${warn}${net}`;
  const basis=el('idecoToolBasis');
  if(basis && plan){
    let taxText='重複調整に必要な加入日・退職金情報が不足しています。';
    if(overlap?.adjustedDeduction!=null && lumpTax){
      taxText=`iDeCo加入期間参考 ${overlap.serviceYears}年、通常の退職所得控除 ${formatMan(overlap.fullDeduction,0)}万円。60歳退職金との年差 ${overlap.yearGap ?? '—'}年、${overlap.within19YearRule?'現行19年ルールの対象':'現行19年ルールの対象外'}。前の退職金が控除額未満のため前職期間を ${overlap.deemedYears}年相当として扱う参考計算を行い、重複期間 ${overlap.overlapYears}年、調整後控除 ${formatMan(overlap.adjustedDeduction,0)}万円。一時金の課税退職所得 約${formatMan(lumpTax.taxable,1)}万円、所得税等 約${formatMan(lumpTax.incomeTax,1)}万円、住民税 約${formatMan(lumpTax.residentTax,1)}万円、手取参考 約${formatMan(lumpTax.net,1)}万円。5年年金は公的年金等として扱い、満額1年換算では年額約${formatMan(summary.pensionGross,1)}万円、公的年金等控除後の雑所得参考 約${formatMan(summary.pensionIncome,1)}万円。`;
    }
    basis.textContent=`現在残高から拠出終了月まで月次複利で推計。年金受取は設定利回りで元利均等取崩し。${taxText} 50%一時金＋50%年金の併用可否・比率指定は運営管理機関によって異なるため受取前に確認します。税制は2026年現行法を将来へ仮適用した参考で、受取時点に再確認します。`;
  }
}

function runRetirementTool(){
  const amount=+el('retirementAmount').value, years=+el('serviceYears').value;
  const deduction=retirementIncomeDeduction(years), taxable=taxableRetirementIncome(amount,years), tax=retirementTaxEstimate(amount,deduction);
  el('retirementToolResult').textContent=`退職所得控除 ${formatMan(deduction)}万円 / 課税退職所得 ${formatMan(taxable,1)}万円 / 税額概算 ${formatMan(tax.totalTax,1)}万円 / 手取概算 ${formatMan(tax.net,1)}万円`;
  const basis=el('retirementToolBasis');
  if(basis) basis.textContent=years<=20?`控除は40万円×勤続年数（最低80万円）。控除超過分の1/2を課税退職所得として税額参考を計算します。`:`控除は800万円＋70万円×（勤続年数−20年）。控除超過分の1/2を課税退職所得として税額参考を計算します。65歳のiDeCo/DC一時金側では、この退職金との19年内重複調整を別途適用します。`;
}


function runUnemploymentTool(){
  const u=unemploymentComparison(config);
  el('unemploymentToolResult').textContent=`離職前賃金日額 約${Math.round(u.wageDailyYen).toLocaleString()}円 / 65歳未満の日額 約${Math.round(u.dailyPre65Yen).toLocaleString()}円 / 65歳以上の日額 約${Math.round(u.dailyAt65Yen).toLocaleString()}円 / 65歳以後 ${u.at65.days}日・約${formatMan(u.at65.amount,1)}万円 / 65歳未満一般 ${u.pre65General.days}日・約${formatMan(u.pre65General.amount,1)}万円`;
  const d=el('unemploymentToolBasis');
  if(d) d.textContent=`2026/8/1制度参考。60～64歳は45～80%・日額上限7,830円、高年齢求職者給付金は30歳未満と同じ日額計算式の参考を使用。給付日数・離職理由・賃金は退職直前に再確認します。`;
}
function runTaxSocialTool(){
  const age=+el('taxToolAge').value, salary=+el('taxToolSalary').value, pension=+el('taxToolPension').value;
  const spouseIncomeRaw=el('taxToolSpouseIncome').value;
  const spouseIncome=spouseIncomeRaw===''?null:+spouseIncomeRaw;
  const spouseAge=+el('taxToolSpouseAge').value||65;
  const tax=estimateSimpleIncomeTaxes({salaryGross:salary,pensionGross:pension,age,spouseIncomeMan:spouseIncome,spouseAge});
  const ownIncome=tax.residentTotalIncome;
  const ownTaxed=tax.residentTax>0;
  const householdTaxed=ownTaxed || (spouseIncome!=null && spouseIncome>43);
  const care=age>=65?fukuyamaCarePremium2026({totalIncome:ownIncome,pensionGross:pension,ownResidentTaxed:ownTaxed,householdResidentTaxed:householdTaxed}):0;
  let medical=0, healthLabel='', healthDetail='';
  if(age>=75){
    const md=lateElderlyMedicalPremium2026Details(ownIncome); medical=md.total; healthLabel='後期高齢者医療2026参考';
    healthDetail=`医療分 ${formatMan(md.medical,1)} / 子ども分 ${formatMan(md.child,1)}万円`;
  }else{
    const incomes=spouseIncome==null?[ownIncome]:[ownIncome,spouseIncome];
    const md=fukuyamaNhiPremium2026Details({memberIncomesMan:incomes,members:incomes.length,adultMembers:incomes.length,careMembers40to64:age>=40&&age<65?1:0});
    medical=md.total; healthLabel=`福山市国保2026参考（${incomes.length}人世帯）`;
    healthDetail=`医療 ${formatMan(md.medical,1)} / 支援 ${formatMan(md.support,1)} / 介護 ${formatMan(md.care,1)} / 子ども ${formatMan(md.child,1)}万円`;
  }
  const net=salary+pension-tax.totalTax-care-medical;
  el('taxToolResult').textContent=`所得税 約${formatMan(tax.incomeTax,1)}万円 / 住民税 約${formatMan(tax.residentTax,1)}万円 / 介護保険 約${formatMan(care,1)}万円 / ${healthLabel} 約${formatMan(medical,1)}万円 / 手取参考 約${formatMan(net,1)}万円`;
  const b=el('taxToolBasis');
  if(b){
    const spouseText=spouseIncome==null?'配偶者控除は未指定':`配偶者控除参考：所得税 ${formatMan(tax.spouseIncomeTaxDeduction,0)}万円・住民税 ${formatMan(tax.residentSpouseDeduction,0)}万円`;
    b.textContent=`給与所得 ${formatMan(tax.salaryIncome,1)}万円、公的年金等所得 ${formatMan(tax.pensionIncome,1)}万円、所得税基礎控除 ${formatMan(tax.baseDeduction,0)}万円。${spouseText}。${healthDetail}。年代別年間予算には税・社保を含むため、資産計算へ別加算しません。`;
  }
}

async function importConfig(file){
  const text=await file.text(); const parsed=JSON.parse(text);
  if(parsed?.config && Array.isArray(parsed?.scenarios)){
    const next=migrateConfig(parsed.config); const errors=validateConfig(next);
    if(errors.length) throw new Error(errors.join(' / '));
    config=next; scenarios=parsed.scenarios; saveScenarios(scenarios); refresh(); showNotice('設定＋シナリオの一括バックアップを復元しました。'); return;
  }
  const next=migrateConfig(parsed); const errors=validateConfig(next);
  if(errors.length) throw new Error(errors.join(' / '));
  const oldBaseline=scenarios.find(s=>s.role==='baseline');
  if(oldBaseline){ oldBaseline.role='scenario'; oldBaseline.name=`${oldBaseline.name || '基準ケース'}（旧基準）`; oldBaseline.selected=false; }
  config=next;
  scenarios.push({id:crypto.randomUUID(),name:config.meta?.label||'基準ケース',role:'baseline',savedAt:new Date().toISOString(),selected:true,config:scenarioSnapshot(config)});
  saveScenarios(scenarios);
  refresh(); showNotice('設定JSONを読み込み、新しい基準ケースとして固定しました。');
}

el('settingsForm').addEventListener('submit', applySettings);
el('periodEditForm').addEventListener('submit', savePeriodEdit);
el('cashflowAge').addEventListener('change', renderCashflow);
el('periodTarget').addEventListener('change', renderPeriodEditor);
el('certaintyForm').addEventListener('submit', saveCertainty);
el('actualForm').addEventListener('submit', saveActual);
el('actualAge').addEventListener('change', e=>populateActualForm(e.target.value));
el('annualReviewAge').addEventListener('change', e=>renderAnnualReview(e.target.value));
el('saveAnnualReviewBtn').addEventListener('click', saveAnnualReview);
el('saveScenarioBtn').addEventListener('click', saveCurrentScenario);
el('importFile').addEventListener('change', e=>{ const f=e.target.files?.[0]; if(f) importConfig(f).catch(err=>showNotice(`読込失敗: ${err.message}`,'error')); });
el('importFile2').addEventListener('change', e=>{ const f=e.target.files?.[0]; if(f) importConfig(f).catch(err=>showNotice(`読込失敗: ${err.message}`,'error')); });
el('exportBtn').addEventListener('click',()=>{ if(config) downloadJson(config,`retirement-plan-backup-${new Date().toISOString().slice(0,10)}.json`); });
el('exportFullBtn').addEventListener('click',()=>{ if(config) downloadJson({schemaVersion:'0.9', exportedAt:new Date().toISOString(), config, scenarios},`retirement-plan-full-backup-${new Date().toISOString().slice(0,10)}.json`); });
el('exportAnnualCsvBtn').addEventListener('click',()=>{
  if(!config || !result) return;
  try { downloadAnnualCsv(config,result); showNotice('年度別の全項目CSVを出力しました。'); }
  catch(err) { showNotice(`CSV出力失敗: ${err.message}`,'error'); }
});
el('pensionToolRun').addEventListener('click',runPensionTool);
el('nisaToolRun').addEventListener('click',runNisaTool);
el('idecoToolRun').addEventListener('click',runIdecoTool);
el('retirementToolRun').addEventListener('click',runRetirementTool);
el('unemploymentToolRun').addEventListener('click',runUnemploymentTool);
el('taxToolRun').addEventListener('click',runTaxSocialTool);

document.addEventListener('click', e=>{
  const da=e.target.closest('[data-delete-actual]'); if(da) deleteActual(Number(da.dataset.deleteActual));
  const ds=e.target.closest('[data-scenario-delete]'); if(ds) deleteScenario(ds.dataset.scenarioDelete);
});
document.addEventListener('change', e=>{
  if(e.target.matches('[data-scenario-select]')) toggleScenario(e.target.dataset.scenarioSelect,e.target.checked);
});

document.querySelectorAll('[data-tab]').forEach(btn=>btn.addEventListener('click',()=>{
  document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b===btn));
  document.querySelectorAll('.panel').forEach(p=>p.hidden=p.id!==btn.dataset.tab);
}));

document.querySelectorAll('[data-help]').forEach(btn=>btn.addEventListener('click',()=>{
  el('helpTitle').textContent=btn.dataset.help;
  el('helpBody').textContent=btn.dataset.helpText || 'この項目は老後計画の前提値です。変更後は全期間を再計算します。';
  el('helpDialog').showModal();
}));
el('helpClose').addEventListener('click',()=>el('helpDialog').close());

el('appVersion').textContent='v0.9'; el('rulesVersion').textContent=RULES_VERSION;
refresh();
if('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(()=>{});
