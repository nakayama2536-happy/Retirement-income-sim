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

function renderExpenseDetail() {
  const detail = config.expenseDetail;
  const wrap = el('expenseDetail');
  const reconcile = el('expenseReconcile');
  if (!detail?.monthlyCategories?.length) {
    wrap.innerHTML='<p class="muted">生活費内訳データは未登録です。</p>';
    reconcile.innerHTML='<p class="muted">個人設定JSONへ内訳を追加すると確認できます。</p>';
    return;
  }
  wrap.innerHTML = `<div class="expense-list">${detail.monthlyCategories.map(c=>`<details><summary><span>${escapeHtml(c.label)}</span><strong>${formatMan(c.amount,1)}万円/月</strong></summary>${(c.items||[]).length?`<ul>${c.items.map(i=>`<li><span>${escapeHtml(i.label)}</span><b>${formatMan(i.amount,1)}万円</b></li>`).join('')}</ul>`:'<p class="muted">詳細内訳なし</p>'}</details>`).join('')}</div>`;
  const s = expenseDetailSummary(config);
  const cls = Math.abs(s.difference) < 0.01 ? 'pos' : '';
  reconcile.innerHTML = `<dl><div><dt>月額合計</dt><dd>${formatMan(s.monthlyTotal,1)}万円</dd></div><div><dt>基本生活費・年額</dt><dd>${formatMan(s.annualOperating,1)}万円</dd></div><div><dt>旅行費・年額</dt><dd>${formatMan(s.travelAnnual,1)}万円</dd></div><div><dt>内訳合計</dt><dd>${formatMan(s.combined,1)}万円</dd></div><div><dt>年間予算基準</dt><dd>${formatMan(s.reference,1)}万円</dd></div><div><dt>調整差</dt><dd class="${cls}">${s.difference>=0?'+':''}${formatMan(s.difference,1)}万円</dd></div></dl><p class="muted">内訳は管理・整合確認用です。年間資産計算では年代別年間予算を正本とし、二重計上しません。</p>`;
}

function derivePending() {
  const items = [];
  if (config.income?.pensions?.spouse?.certainty === 'unknown') items.push({type:'要確認', title:'配偶者の公的年金額', reason:`設定中の配偶者年金 ${formatMan(config.income?.pensions?.spouse?.annualAtStart||0,1)}万円/年は暫定値です。ねんきん定期便等で確認後に更新します。`});
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
  const form=el('certaintyForm');
  if(!form) return;
  const labels={initialAsset:'64歳開始資産',returnRate:'運用利回り',inflation:'インフレ率',laborIncome:'労働収入',pension:'年金',dc:'DC受取',budgets:'年間予算',retirement:'退職金'};
  const order=Object.keys(labels);
  const options=Object.entries(CERTAINTY_LABELS).map(([value,label])=>`<option value="${value}">${label}</option>`).join('');
  form.innerHTML=order.map(key=>`<label>${labels[key]}<select name="${key}">${options}</select></label>`).join('')+'<button class="primary" type="submit">確度区分を保存</button>';
  order.forEach(key=>{ if(form.elements[key]) form.elements[key].value=config.certainty?.[key] || 'unknown'; });
}

function saveCertainty(ev){
  ev.preventDefault(); const f=ev.currentTarget;
  config.certainty ||= {};
  for(const key of ['initialAsset','returnRate','inflation','laborIncome','pension','dc','budgets','retirement']) config.certainty[key]=f.elements[key].value;
  if(config.income?.pensions?.primary) config.income.pensions.primary.certainty=config.certainty.pension;
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
    <div><dt>支出の正本</dt><dd>年代別年間予算（税・社保を含む）</dd></div>
    <div><dt>iDeCo一時金</dt><dd>${idecoTax}</dd></div>
    <div><dt>95歳末</dt><dd>${money(result.finalAsset)}</dd></div>
  </dl><p class="muted">月末資産＝月初資産＋月次運用益＋各種収入－インフレ調整後支出－臨時支出。制度ツールの税・社会保険詳細は手取・予算内訳確認用で、年代別年間予算へ重ねて加算しません。</p>`;
  const entries=Object.values(RULES).filter(r=>r&&typeof r==='object'&&r.title);
  source.innerHTML=`<p><strong>制度基準日 ${escapeHtml(RULES.asOf)}</strong></p><ul class="source-list">${entries.map(r=>`<li><a href="${r.url}" target="_blank" rel="noopener">${escapeHtml(r.title)}：${escapeHtml(r.source)}</a></li>`).join('')}</ul><p class="muted">将来の退職・受取時は、その時点の法令・自治体保険料・運営管理機関条件で再確認します。</p>`;
}

function renderRules(){
