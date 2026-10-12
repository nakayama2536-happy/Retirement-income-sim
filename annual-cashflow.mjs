import {dateWithAge} from './date-display.mjs';
// Annual summary derived from the same monthly calculation used for assets.
import {reconcileCashflow} from './cashflow-reconciliation.mjs';
import {expenseDisplayProfile} from './expense-display.mjs';
const close=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)<=1e-8*Math.max(1,Math.abs(a),Math.abs(b));
export function annualCashflowSummary(config,age,{sourceProfile=''}={}){
 const profile=expenseDisplayProfile(config,sourceProfile);
 // The engine totals are valid without a chosen detail source. Use one explicit
 // available profile only for the reference-detail comparison.
 const calcProfile=profile||'unknown',rec=reconcileCashflow(config,{sourceProfile:calcProfile});
 return summaryFromReconciliation(rec,Number(age),profile);
}
export function annualCashflowSummaries(config,{sourceProfile=''}={}){
 const profile=expenseDisplayProfile(config,sourceProfile),rec=reconcileCashflow(config,{sourceProfile:profile||'unknown'});
 return rec.calculation.rows.map(row=>summaryFromReconciliation(rec,row.age,profile));
}
function summaryFromReconciliation(rec,age,profile){
 const row=rec.calculation.rows.find(r=>r.age===age),period=rec.periods.find(p=>p.age===age);
 if(!row||!period)return {status:'no-period',age:Number(age),sourceProfile:profile,message:'この年齢期の計算結果はありません。'};
 const months=rec.months.filter(m=>m.annualRowIndex===period.annualRowIndex);
 // Calculation row is the authoritative aggregation. Subcomponents below are
 // explanatory and must never be added again to totalIncome/totalExpense.
 const components={labor:row.labor,primaryPension:row.primaryPension,spousePension:row.spousePension,idecoAnnuity:row.idecoAnnuity,unemployment:row.unemployment,extraIncome:row.extraIncome};
 const observations=rec.calculation.monthlyDetails.filter(m=>m.annualAge===age);
 components.idecoLumpReceipt=observations.reduce((n,m)=>n+m.idecoLumpReceipt,0);
 components.retirementReceipt=observations.reduce((n,m)=>n+m.retirementReceipt,0);
 components.otherExtraIncome=row.extraIncome-components.idecoLumpReceipt-components.retirementReceipt-Number(row.householdAddition||0);
 const incomeTotal=row.totalIncome,managementExpense=row.expense,extraExpense=row.extraExpense,totalExpense=managementExpense+extraExpense;
 const cashBalance=incomeTotal-totalExpense,assetChange=row.endAsset-row.startAsset;
 const identity=row.startAsset+row.investmentGain+cashBalance;
 const householdAddition=Number(row.householdAddition||0),householdWithdrawal=Number(row.householdWithdrawal||0),idecoContributionFromAsset=Number(row.idecoContributionFromAsset||0);
 return {status:'ready',age,sourceProfile:profile,monthCount:period.monthCount,assetFundedMonthCount:period.assetFundedMonthCount,familyReferenceMonthCount:period.familyReferenceMonthCount,
  startDate:months[0]?.date??null,endDate:months.at(-1)?.date??null,startAsset:row.startAsset,endAsset:row.endAsset,investmentGain:row.investmentGain,
  incomeTotal,components,managementExpense,extraExpense,totalExpense,cashBalance,assetChange,identityMatches:close(identity,row.endAsset),
  householdAddition,householdWithdrawal,idecoContributionFromAsset,
  referenceDetail:profile?period.detailTotal:null,referenceKnownSubtotal:profile?months.filter(m=>m.scope==='asset-funded').reduce((n,m)=>n+Number(m.knownSubtotal||0),0):null,referenceGap:profile?period.gap:null,overBudgetMonths:profile?period.overBudgetMonths:[],unresolvedMonthCount:profile?period.unresolvedMonthCount:null,
  events:row.events||[],limitations:rec.limitations};
}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>n===null||n===undefined||!Number.isFinite(n)?'未確定':`${n.toLocaleString('ja-JP',{maximumFractionDigits:2})}万円`;
export function annualCashflowHtml(s,config){
 if(s.status!=='ready')return `<p>${esc(s.message)}</p>`;
 const c=s.components,source=s.sourceProfile==='public-v0.9'?'旧形式の生活費内訳':s.sourceProfile==='work-v0.9.7'?'標準の生活費内訳':'未選択';
 const refs=s.sourceProfile?`参考内訳 ${money(s.referenceDetail)}（確認済み小計 ${money(s.referenceKnownSubtotal)}）／管理予算との差 ${money(s.referenceGap)}／未確定 ${s.unresolvedMonthCount}か月`:'参考内訳は出典未選択のため未表示';
 const events=s.events.length?`<details><summary>臨時イベント ${s.events.length}件</summary><ul>${s.events.map(e=>`<li>${esc(e.date?dateWithAge(e.date,config):'日付未設定')}：${esc(e.label||e.type||'イベント')} ${money(Number(e.amount||0))}</li>`).join('')}</ul></details>`:'';
 return `<p>${s.age}歳期（${esc(dateWithAge(s.startDate,config))}～${esc(dateWithAge(s.endDate,config))}、${s.monthCount}か月）</p><dl>
 <div><dt>現金収入合計</dt><dd>${money(s.incomeTotal)}</dd></div><div><dt>労働収入</dt><dd>${money(c.labor)}</dd></div><div><dt>本人公的年金</dt><dd>${money(c.primaryPension)}</dd></div><div><dt>配偶者公的年金</dt><dd>${money(c.spousePension)}</dd></div><div><dt>iDeCo年金</dt><dd>${money(c.idecoAnnuity)}</dd></div><div><dt>雇用保険</dt><dd>${money(c.unemployment)}</dd></div><div><dt>iDeCo一時金（資産計上額）</dt><dd>${money(c.idecoLumpReceipt)}</dd></div><div><dt>連動設定した退職金受取</dt><dd>${money(c.retirementReceipt)}</dd></div><div><dt>家計から資産への追加</dt><dd>${money(s.householdAddition)}</dd></div><div><dt>その他の臨時・追加収入</dt><dd>${money(c.otherExtraIncome)}</dd></div>
 <div><dt>管理予算支出</dt><dd>${money(s.managementExpense)}</dd></div><div><dt>臨時・別枠支出</dt><dd>${money(s.extraExpense)}</dd></div><div><dt>支出合計</dt><dd>${money(s.totalExpense)}</dd></div><div><dt>現金収支</dt><dd>${money(s.cashBalance)}</dd></div>
 <div><dt>資産運用益</dt><dd>${money(s.investmentGain)}</dd></div><div><dt>期首 → 期末資産</dt><dd>${money(s.startAsset)} → ${money(s.endAsset)}</dd></div></dl>
 <p>内数・参考：家計への取崩し ${money(s.householdWithdrawal)}、計画資産原資のiDeCo掛金 ${money(s.idecoContributionFromAsset)}。現金収入・支出へ再加算しません。</p>
 <p>内訳出典：${source}。${refs}。資産負担月 ${s.assetFundedMonthCount}か月、給与生活等の家計参考月 ${s.familyReferenceMonthCount}か月。</p>
 ${events}<p>${s.identityMatches?'期首資産＋運用益＋現金収支＝期末資産を確認しました。':'資産増減の一致を確認できません。'}</p>`;
}
