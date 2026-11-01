import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateConfig} from './storage.mjs';
import {runRetirementPlan,projectIdeco} from './calc.mjs';
import {detailProposal,verifyDetailProposal,changedPaths,undoDetail} from './detail-settings.mjs';
import {projectNisaWithdrawal} from './withdrawal-plan.mjs';
import {wideDetailedReport,detailedReport,trendCsv} from './detailed-report.mjs';
import {currentSummaryHtml,currentSummaryRows} from './current-summary.mjs';
import {createFullBackup,restoreFullBackup} from './full-backup.mjs';
import {inspectBackupCompatibility,createConfigBackup,CURRENT_FEATURES} from './backup-compatibility.mjs';
import {validateSavedState} from './migration.mjs';
export function fixture(){
 const config=migrateConfig({people:{primary:{birthDate:'1980-08-27'},spouse:{birthDate:'1981-05-01'}},plan:{startAge:65,endAge:67,startDate:'2045-08-27',initialAsset:1000,initialAssetIncludesIdeco:false,afterTaxReturn:0,inflation:0},employment:{primary:{mainRetirement:{baseDate:'2045-08-27'}},spouse:{}},income:{labor:{annual:0},pensions:{primary:{startDate:'2050-08-01',annualAtStart:0},spouse:{startDate:'2051-05-01',annualAtStart:0}}},budgets:[{fromAge:65,toAge:95,annualBudget:0}],unemployment:{baselineMode:'none'},nisa:{marketValue:120,usageYear:2045,tsumitateUsed:0,growthUsed:0,lifetimeBookUsed:100,future:{keep:true}},ideco:{asOfDate:'2045-08-27',contributionEndDate:'2045-08-27',joinDate:'2010-01-01',lumpDate:'2045-08-27',currentBalance:600,monthlyContribution:0,accumulationReturn:0,lumpPercent:50,annuityPercent:50,annuityYears:5,annuityReturn:0,applyCurrentLawTaxReference:false},events:[],expenseDetail:{monthlyCategories:[],travelAnnualBase:0},cashflow:{periodOverrides:[]}});
 return {config,scenarios:[{id:'base',name:'架空基本案',role:'baseline',selected:true,config:structuredClone(config)}]};
}
const plan=(v={})=>({mode:'fixed',startMonth:'2045-08',endMonth:'2046-07',monthlyAmount:20,...v});
const proposal=(s,v={})=>detailProposal(s,'nisaWithdrawal',plan(v));
const amount=(r,row,item)=>row.values[r.columns.find(c=>c.item===item).id];
test('定額取り崩しは残高上限で停止し、不足を別表示する',()=>{
 const s=fixture(),p=proposal(s),r=projectNisaWithdrawal(p.candidate);assert.equal(r.total,120);assert.equal(r.shortfall,120);assert.equal(r.rows[5].endBalance,0);assert.equal(r.rows[6].withdrawal,0);assert.equal(r.rows[6].unmet,20);assert.equal(r.depletedMonth,'2046-01');assert.equal(r.rows[12].requested,0);assert.equal(p.before,p.after);
 assert.deepEqual(runRetirementPlan(p.candidate,{includeMonthlyDetails:true}),runRetirementPlan(s.config,{includeMonthlyDetails:true}));assert.equal(s.config.nisa.withdrawal,undefined);
});
test('開始・終了月を含み、期間外の運用は継続する',()=>{
 const s=fixture();s.config.plan.afterTaxReturn=12;const p=proposal(s,{startMonth:'2045-09',endMonth:'2045-09',monthlyAmount:10}),r=projectNisaWithdrawal(p.candidate);const factor=Math.pow(1.12,1/12);
 assert.equal(r.rows[0].withdrawal,0);assert.equal(r.rows[1].withdrawal,10);assert.ok(Math.abs(r.rows[1].endBalance-(120*factor*factor-10))<1e-9);assert.equal(r.rows[2].withdrawal,0);assert.ok(r.rows[2].gain>0);
});
test('定率は運用後残高へ毎月適用し、年率と混同しない',()=>{
 const r=projectNisaWithdrawal(proposal(fixture(),{mode:'rate',monthlyRate:10}).candidate);assert.equal(r.rows[0].withdrawal,12);assert.equal(r.rows[1].withdrawal,10.8);assert.ok(Math.abs(r.rows[11].endBalance-120*Math.pow(.9,12))<1e-8);assert.equal(r.shortfall,0);
});
test('一括取り崩しは指定月に一度だけ発生する',()=>{
 const r=projectNisaWithdrawal(proposal(fixture(),{mode:'all',startMonth:'2045-09'}).candidate);assert.equal(r.rows[0].withdrawal,0);assert.equal(r.rows[1].withdrawal,120);assert.equal(r.total,120);assert.equal(r.rows[2].withdrawal,0);
});
test('明示0と負の運用利回りは有効',()=>{
 const s=fixture();s.config.plan.afterTaxReturn=-12;const r=projectNisaWithdrawal(proposal(s,{monthlyAmount:0}).candidate);assert.equal(r.total,0);assert.ok(r.rows[0].gain<0);assert.ok(r.endBalance>0);
});
for(const values of [{monthlyAmount:''},{monthlyAmount:null},{monthlyAmount:-1},{monthlyAmount:Infinity},{mode:'unknown'},{startMonth:'2045-13'},{startMonth:'2044-01'},{endMonth:'2050-01'},{endMonth:'2045-07'},{mode:'rate',monthlyRate:101}])test('不正・未入力・計画外のNISA設定を拒否 '+JSON.stringify(values),()=>assert.throws(()=>proposal(fixture(),values)));
test('残高未設定を0扱いせず、開始資産の内数を検証する',()=>{
 const s=fixture();delete s.config.nisa.marketValue;assert.throws(()=>proposal(s),/評価額/);s.config.nisa.marketValue=1001;assert.throws(()=>proposal(s),/評価額/);
});
test('停止はNISA評価額・利用枠・未知フィールドを保持する',()=>{
 const s=fixture();s.config=proposal(s).candidate;const p=detailProposal(s,'nisaWithdrawal',{mode:'none'});assert.equal(projectNisaWithdrawal(p.candidate).status,'disabled');assert.equal(p.candidate.nisa.marketValue,120);assert.equal(p.candidate.nisa.future.keep,true);
});
test('総資産より参考NISA残高が大きい月を検出し勝手に売却しない',()=>{
 const s=fixture();s.config.plan.initialAsset=120;s.config.ideco.currentBalance=0;s.config.budgets[0].annualBudget=120;const r=projectNisaWithdrawal(proposal(s,{monthlyAmount:0}).candidate);assert.equal(r.conflictMonth,'2045-08');assert.equal(r.total,0);assert.equal(r.endBalance,120);
});
test('月次・年齢期・暦年CSVはNISAの期首期末を加算せず資金移動だけ合算する',()=>{
 const c=proposal(fixture(),{monthlyAmount:5}).candidate;const ms=projectNisaWithdrawal(c).rows;
 for(const period of ['monthly','annual','calendar']){
  const r=wideDetailedReport(c,{period});for(const row of r.rows){const selected=ms.filter(m=>m.date>=row.startDate&&m.date<=row.endDate);assert.equal(amount(r,row,'NISA期首残高（参考）'),selected[0].startBalance);assert.equal(amount(r,row,'NISA期末残高（参考）'),selected.at(-1).endBalance);assert.equal(amount(r,row,'NISA取崩し可能額（参考）'),selected.reduce((a,m)=>a+m.withdrawal,0));}
  const csv=trendCsv(r,r.columns.filter(c=>c.section==='NISA').map(c=>c.id));assert.ok(csv.includes('NISA取崩し可能額'));assert.ok(!csv.includes('iDeCo年金'));
 }
 const r=detailedReport(c);assert.equal(r.rows.find(x=>x.period==='65歳期'&&x.item==='NISA期末残高（参考）').amount,60);
});
test('NISAプランはバックアップ・復元に残り、非対応版は読込停止する',()=>{
 const s=fixture();s.config=proposal(s).candidate;const backup=createFullBackup(s),features=CURRENT_FEATURES.filter(x=>x!=='nisa-withdrawal-reference-v1');assert.equal(inspectBackupCompatibility(backup,{features}).compatible,false);assert.equal(inspectBackupCompatibility(createConfigBackup(s.config),{features}).compatible,false);
 let saved;const restored=restoreFullBackup(fixture(),backup,{save:next=>{saved=structuredClone(next);return next;}});assert.deepEqual(restored.config.nisa,s.config.nisa);assert.deepEqual(saved.config.nisa,s.config.nisa);assert.deepEqual(restored.scenarios,s.scenarios);
 const bad=structuredClone(backup);bad.config.nisa.withdrawal.monthlyAmount='';assert.throws(()=>validateSavedState(bad));
});
test('試算後の入力以外の変更も再試算を要求し、取消は別設定を保持する',()=>{
 const s=fixture(),p=proposal(s);s.scenarios[0].name='別案';assert.throws(()=>verifyDetailProposal(s,p),/再試算/);const later=structuredClone(p.candidate);later.reserve.total=50;const undone=undoDetail(later,changedPaths(fixture().config,p.candidate));assert.equal(undone.reserve.total,50);assert.equal(undone.nisa.withdrawal,undefined);
});
const receipt=(v={})=>({receiptMode:'combined',lumpDate:'2045-08-27',lumpPercent:25,annuityYears:10,annuityReturn:0,...v});
test('iDeCo専用設定は既存月次計算に接続し、積立・税・原資・比較案を保持',()=>{
 const s=fixture(),p=detailProposal(s,'idecoWithdrawal',receipt());const i=projectIdeco(p.candidate);assert.equal(i.lumpGross,150);assert.equal(i.annuityMonthly,3.75);assert.equal(p.candidate.ideco.annuityPercent,75);assert.equal(p.candidate.ideco.currentBalance,600);assert.equal(p.candidate.ideco.applyCurrentLawTaxReference,false);assert.deepEqual(p.candidate.cashflow,s.config.cashflow);
 const direct=structuredClone(s.config);Object.assign(direct.ideco,{lumpPercent:25,annuityPercent:75,annuityYears:10});assert.deepEqual(runRetirementPlan(p.candidate),runRetirementPlan(direct));
});
test('一時金・年金の全額選択は割合を整合させる',()=>{
 const s=fixture();const a=detailProposal(s,'idecoWithdrawal',receipt({receiptMode:'lump'})).candidate;assert.equal(projectIdeco(a).lumpGross,600);assert.equal(projectIdeco(a).annuityMonthly,0);
 const b=detailProposal(s,'idecoWithdrawal',receipt({receiptMode:'annuity'})).candidate;assert.equal(projectIdeco(b).lumpGross,0);assert.equal(projectIdeco(b).annuityMonthly,5);
});
for(const value of [{lumpDate:'2044-08-27'},{lumpDate:'2055-08-27'},{annuityYears:4},{annuityYears:10.5},{annuityReturn:''},{lumpPercent:100}])test('iDeCoプランの順序・期間・欠落を検証 '+JSON.stringify(value),()=>assert.throws(()=>detailProposal(fixture(),'idecoWithdrawal',receipt(value))));
test('概要は保存値・税引前・本人配偶者・未登録を区別して安全に表示',()=>{
 const s=fixture();s.config.employment.primary.regularWork={monthlyGross:0,startDate:'2045-08-01',endDate:'2046-08-01'};const html=currentSummaryHtml(s.config,'salary');assert.ok(html.includes('0万円'));assert.ok(html.includes('配偶者・正社員'));assert.ok(html.includes('未登録'));assert.ok(html.includes('保存済み'));s.config.events=[{label:'<script>alert(1)</script>',type:'expense',amount:1,date:'2046-01-01'}];assert.ok(!currentSummaryHtml(s.config,'events').includes('<script>'));
 for(const tab of ['salary','nisa','ideco','pension','retirement','expenses','events','settings'])assert.ok(currentSummaryRows(s.config,tab).length>0);
});

test('予算不足方式は余剰月0・不足月のみ、臨時支出と収入を一度だけ計上',()=>{
 const s=fixture();s.config.ideco.currentBalance=0;s.config.budgets[0].annualBudget=240;
 s.config.income.pensions.primary={startDate:'2045-08-01',annualAtStart:120};
 const p=proposal(s,{mode:'budget'}),r=projectNisaWithdrawal(p.candidate);
 assert.equal(r.rows[0].requested,10);assert.equal(r.total,120);assert.equal(p.before,p.after);
 const months=runRetirementPlan(p.candidate,{includeMonthlyDetails:true}).monthlyDetails;
 months[0].totalIncome=30;months[1].extraExpense=7;
 const modified=projectNisaWithdrawal(p.candidate,months);
 assert.equal(modified.rows[0].requested,0);assert.equal(modified.rows[1].requested,17);
 assert.equal(modified.rows[12].requested,0);
});
test('予算不足方式は物価反映後支出を使い、運用益を収入へ混ぜない',()=>{
 const s=fixture();s.config.ideco.currentBalance=0;s.config.budgets[0].annualBudget=240;s.config.plan.inflation=12;s.config.plan.afterTaxReturn=50;
 const p=proposal(s,{mode:'budget'}),m=runRetirementPlan(p.candidate,{includeMonthlyDetails:true}).monthlyDetails,r=projectNisaWithdrawal(p.candidate);
 assert.equal(r.rows[0].requested,20);assert.equal(r.rows[1].requested,m[1].expense);assert.ok(r.rows[1].requested>20);assert.ok(r.shortfall>0);assert.equal(r.rows.at(-1).endBalance,0);
});
test('予算不足方式は入力後の予算変更で再試算を要求、反映後は現在条件で再計算',()=>{
 const s=fixture();s.config.ideco.currentBalance=0;s.config.budgets[0].annualBudget=120;
 const p=proposal(s,{mode:'budget'});s.config.budgets[0].annualBudget=240;assert.throws(()=>verifyDetailProposal(s,p),/再試算/);
 const r=projectNisaWithdrawal(proposal(s,{mode:'budget'}).candidate);assert.equal(r.rows[0].requested,20);
});
test('予算不足方式のバックアップは旧機能集合に対して復元を停止',()=>{
 const s=fixture();s.config=proposal(s,{mode:'budget'}).candidate;const b=createFullBackup(s);
 assert.equal(inspectBackupCompatibility(b,{features:CURRENT_FEATURES.filter(f=>f!=='nisa-budget-shortfall-v1')}).compatible,false);
 const restored=restoreFullBackup(fixture(),b,{save:next=>next});assert.equal(restored.config.nisa.withdrawal.mode,'budget');
 assert.deepEqual(projectNisaWithdrawal(restored.config),projectNisaWithdrawal(s.config));
});
test('予算不足方式は月次情報の欠落を0として扱わない',()=>{
 const c=proposal(fixture(),{mode:'budget'}).candidate,m=runRetirementPlan(c,{includeMonthlyDetails:true}).monthlyDetails;
 delete m[0].totalIncome;assert.throws(()=>projectNisaWithdrawal(c,m),/未確定/);
});
test('予算不足方式のCSV・年次集計は月次取崩しと一致し総資産に再加算しない',()=>{
 const s=fixture();s.config.ideco.currentBalance=0;s.config.budgets[0].annualBudget=120;
 const c=proposal(s,{mode:'budget'}).candidate;
 for(const period of ['monthly','annual','calendar']){
  const report=wideDetailedReport(c,{period});assert.equal(report.rows.reduce((v,r)=>v+amount(report,r,'NISA取崩し可能額（参考）'),0),120);
 }
 assert.deepEqual(runRetirementPlan(c),runRetirementPlan(s.config));
});

test('予算不足方式は給与生活の純入出金を使用して予算を重ねない',()=>{
 const s=fixture();s.config.ideco.currentBalance=0;s.config.budgets[0].annualBudget=240;
 s.config.cashflow.salaryLife={mode:'net-transfer-v1',lastSalaryMonth:'2045-09',monthlyAddition:3,monthlyWithdrawal:8,postSalaryLabor:{mode:'existing_confirmed'}};
 const p=proposal(s,{mode:'budget'}),r=projectNisaWithdrawal(p.candidate);
 assert.equal(r.rows[0].requested,5);assert.equal(r.rows[1].requested,5);assert.equal(r.rows[2].requested,20);
});

test('NISA不足は取崩し指定額の未充足であり家計全体の不足ではないと明示',()=>{
 const s=fixture();s.config.nisa.withdrawal={version:1,...plan()};
 const rows=currentSummaryRows(s.config,'nisa');
 const ref=rows.find(([label])=>label==='参考試算');
 assert.ok(ref);assert.match(ref[1],/NISAで賄えなかった取崩し指定額の累計/);
 assert.match(ref[1],/家計全体の資金不足ではありません/);
});

test('NISAの不足が正のときだけ概要を赤字強調し、ゼロは赤くしない',()=>{
 const s=fixture();s.config.nisa.withdrawal={version:1,...plan()};
 let html=currentSummaryHtml(s.config,'nisa');assert.match(html,/class="neg" aria-label="NISA取崩し不足額"/);
 s.config.nisa.withdrawal={version:1,...plan({monthlyAmount:0})};
 html=currentSummaryHtml(s.config,'nisa');assert.doesNotMatch(html,/class="neg" aria-label="NISA取崩し不足額"/);
});

test('退職金の未連動は資産へ自動加算しないと表示し、既存の受取行照合を促す',()=>{
 const s=fixture();s.config.retirement={amount:1400,receiveDate:'2045-01-01',serviceYears:30,companyStartDate:'2015-01-01',receiptEventId:null};
 const rows=currentSummaryRows(s.config,'retirement');
 const posting=rows.find(([k])=>k==='資産予測への反映');
 assert.ok(posting);assert.match(posting[1],/未計上/);
 const linked=rows.find(([k])=>k==='連動した資産計上額');assert.equal(linked[1],'なし');
 assert.match(rows.find(([k])=>k==='二重計上の確認')[1],/既存の臨時収入や開始資産/);
});

test('退職金の連動受取行がある場合は資産計上済みと表示する',()=>{
 const s=fixture();s.config.retirement={amount:1400,receiveDate:'2045-01-01',serviceYears:30,companyStartDate:'2015-01-01',receiptEventId:'synthetic-linked'};
 s.config.events=[{id:'synthetic-linked',type:'income',date:'2045-01-01',amount:1300}];
 const rows=currentSummaryRows(s.config,'retirement');
 assert.match(rows.find(([k])=>k==='資産予測への反映')[1],/計上済み/);
 assert.match(rows.find(([k])=>k==='連動した資産計上額')[1],/1,300万円/);
});
