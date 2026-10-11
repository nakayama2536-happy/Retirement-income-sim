import {dateWithAge} from './date-display.mjs';
import {projectNisaWithdrawal,idecoReceiptSummary,NISA_MODES,IDECO_MODES} from './withdrawal-plan.mjs';
import {expenseDisplayProfile} from './expense-display.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const amount=(n,unit='万円')=>n==null||n===''||!Number.isFinite(Number(n))?'未設定':Number(n).toLocaleString('ja-JP',{maximumFractionDigits:2})+unit;
const receipt=t=>t==='net_transfer'?'家計の純入出金に含む（別加算なし）':t==='separate'?'資産へ別枠計上':'未設定';
export function currentSummaryRows(c,tab){
 const date=(v,who='primary')=>dateWithAge(v,c,who),s=c.cashflow?.salaryLife;
 if(tab==='salary'){
  const rows=[];
  for(const [person,label] of [['primary','本人'],['spouse','配偶者']])for(const [job,title] of [['regularWork','正社員'],['sideWork','アルバイト']]){
   const j=c.employment?.[person]?.[job],auto=job==='sideWork'&&person==='primary';const start=j?.startDate?date(j.startDate,person):auto?(j?.startMode==='at_retirement'?'退職月（既存の自動設定）':`退職から${c.unemployment?.baselineSideWorkDelayMonths??2}か月後（既存の自動設定）`):'未設定';const end=j?.endDate?date(j.endDate,person):auto?'76歳の誕生月（既存の自動設定）':'未設定';rows.push([`${label}・${title}`,j?`${amount(j.monthlyGross)}／月（税引前）、開始 ${start} ～ 終了 ${end}（終了月を含まない）`:'未登録']);
  }
  rows.push(['給与生活の計上方法',s?`給与生活最終月 ${date(s.lastSalaryMonth)}、追加 ${amount(s.monthlyAddition)}／月、取崩し ${amount(s.monthlyWithdrawal)}／月`:'従来方式（正社員の退職前登録額は家計参考）']);
  if(s)rows.push(['給与生活終了後',s.postSalaryLabor?.mode==='monthly'?`夫婦合計 ${amount(s.postSalaryLabor.monthlyAmount)}／月、${date(s.postSalaryLabor.lastMonth)}まで`:s.postSalaryLabor?.mode==='none'?'就労収入なし':s.postSalaryLabor?.mode==='existing_confirmed'?'本人・配偶者の個別就労条件を使用':'未設定']);
  return rows;
 }
 if(tab==='nisa'){
  const n=c.nisa||{},w=n.withdrawal,p=projectNisaWithdrawal(c);
  const rows=[['開始資産の内訳',`全体 ${amount(c.plan.initialAsset)} ／ NISA ${amount(n.marketValue)}`],['利用枠の確認年',amount(n.usageYear,'年')],['使用枠・簿価',`つみたて ${amount(n.tsumitateUsed)} ／ 成長 ${amount(n.growthUsed)} ／ 保有簿価 ${amount(n.lifetimeBookUsed)}`],['取り崩し方法',w?NISA_MODES[w.mode]:'未設定']];
  if(p.status==='configured')rows.push(['取り崩し期間',`${date(w.startMonth)} ～ ${date(w.endMonth)}（開始・終了月を含む）`],['取り崩し指定',w.mode==='fixed'?`${amount(w.monthlyAmount)}／月`:w.mode==='rate'?`運用後残高の ${amount(w.monthlyRate,'%')}／月`:'開始月に全額'],['参考試算',`期間内の取崩し計 ${amount(p.total)} ／ 最終NISA残高 ${amount(p.endBalance)} ／ 指定額に対する不足 ${amount(p.shortfall)}`]);
  rows.push(['計算への反映','NISA内の参考計画。資産内の移動のため収入・支出に重ねず、総資産推移は変えません。']);
  if(p.conflictMonth)rows.push(['要確認',`${date(p.conflictMonth)}から参考NISA残高が総資産を上回ります。他の資金で支出を賄えない可能性があり、取り崩し・予算の見直しが必要です。`]);
  return rows;
 }
 if(tab==='ideco'){
  const i=c.ideco||{},p=idecoReceiptSummary(c);
  const rows=[['残高と掛金',`${date(i.asOfDate)}時点 ${amount(i.currentBalance)} ／ 掛金 ${amount(i.monthlyContribution)}／月`],['掛金終了日',date(i.contributionEndDate)],['受取開始日',date(p?.startDate)],['受取方法',IDECO_MODES[p?.mode]||'未設定'],['受取割合',`一時金 ${amount(i.lumpPercent,'%')} ／ 年金 ${amount(i.annuityPercent,'%')}`],['年金受取の条件',`${amount(i.annuityYears,'年')} ／ 運用年率 ${amount(i.annuityReturn,'%')}`]];
  if(p)rows.push(['受取見込（税引前）',`一時金 ${amount(p.lumpGross)} ／ 年金 ${amount(p.annuityMonthly)}／月（年 ${amount(p.annuityAnnual)}）`]);
  rows.push(['一時金の税の扱い',i.applyCurrentLawTaxReference?'現行制度の参考税額を適用する設定':'税引前で計上する設定']);
  if(s)rows.push(['給与生活中の受取',receipt(s.receiptTreatment?.ideco)]);
  return rows;
 }
 if(tab==='pension')return ['primary','spouse'].map((who,k)=>{const p=c.income?.pensions?.[who];return [k?'配偶者':'本人',`開始 ${date(p?.startDate,who)} ／ ${amount(p?.annualAtStart)}／年（税引前）`];});
 if(tab==='retirement'){
  const r=c.retirement||{},e=(c.events||[]).find(x=>x.id&&x.id===r.receiptEventId);
  return [['退職金（税引前）',amount(r.amount)],['受取日',date(r.receiveDate)],['入社日・勤続年数',`${date(r.companyStartDate)} ／ ${amount(r.serviceYears,'年')}`],['連動した資産計上額',e?`${amount(e.amount)} ／ ${date(e.date)}`:'連動行なし。従来の臨時収入や開始資産に含むか確認してください。']];
 }
 if(tab==='expenses'){
  const source=expenseDisplayProfile(c),groups=source==='public-v0.9'?c.cashflow?.expenseCategories:c.expenseDetail?.monthlyCategories;
  const rows=[['支出の正本','年間予算。生活費・保険・税の内訳は別加算しません。'],['内訳の保存元',source==='public-v0.9'?'旧形式の生活費内訳':source==='work-v0.9.7'?'標準の生活費内訳':'未選択'],...(c.budgets||[]).map(b=>[`${b.fromAge}～${b.toAge}歳の基本予算`,amount(b.annualBudget)+'／年'])];
  for(const b of c.cashflow?.periodOverrides||[])if(b.kind==='budget')rows.push([`${b.fromAge}～${b.toAge}歳の優先予算`,amount(b.amount)+(b.unit==='monthly'?'／月':'／年')]);
  for(const g of groups||[])rows.push([g.label||g.key,Array.isArray(g.items)?`${g.items.length}項目：${g.items.map(i=>i.label||i.key).join('、')}`:`基本月額 ${amount(g.amount)}（期間指定・税計算があればそちらを使用）`]);
  return rows;
 }
 if(tab==='events'){
  const rows=(c.events||[]).map(e=>[`${e.type==='income'?'収入':'支出'}：${e.label||'名称未設定'}`,`${date(e.date)} ／ ${amount(e.amount)} ／ ${receipt(e.fundingTreatment)}`]);
  for(const r of c.cashflow?.periodOverrides||[])if(r.kind==='income')rows.push([`継続収入：${r.label||r.key}`,`${r.fromAge}～${r.toAge}歳期 ／ ${amount(r.amount)}${r.unit==='monthly'?'／月':'／年'} ／ ${receipt(r.fundingTreatment)}`]);
  return rows.length?rows:[['臨時・追加収支','未登録']];
 }
 if(tab==='settings')return [['計画期間',`${date(c.plan.startDate)}、本人 ${c.plan.startAge}～${c.plan.endAge}歳期`],['開始資産',amount(c.plan.initialAsset)],['運用利回り・物価上昇率',`税引後年率 ${amount(c.plan.afterTaxReturn,'%')} ／ 物価年率 ${amount(c.plan.inflation,'%')}`],['予備枠',amount(c.reserve?.total)],['保存範囲','この端末のブラウザ内。別端末へは一括バックアップで手動引継ぎ。']];
 return [];
}
export function currentSummaryHtml(c,tab){return `<h3>現在の設定の概要</h3><p class="muted">保存済みの条件です。入力途中・未反映の試算は含みません。</p><dl class="current-setting-list">${currentSummaryRows(c,tab).map(([k,v])=>`<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>`;}
export function renderCurrentSummaries(c){for(const tab of ['salary','nisa','ideco','pension','retirement','expenses','events','settings']){const node=document.getElementById(`${tab}CurrentSummary`);if(node)node.innerHTML=currentSummaryHtml(c,tab);}}
