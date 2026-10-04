import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {migrateConfig} from './storage.mjs';
import {runRetirementPlan} from './calc.mjs';
import {annualCashflowSummary,annualCashflowHtml} from './annual-cashflow.mjs';

function fixture(){
 const c=migrateConfig({people:{primary:{birthDate:'1980-08-27'},spouse:{birthDate:'1981-05-01'}},plan:{startAge:64,endAge:66,startDate:'2044-08-27',initialAsset:100,afterTaxReturn:0,inflation:0,initialAssetIncludesIdeco:false},employment:{primary:{mainRetirement:{baseDate:'2045-08-27'},sideWork:{monthlyGross:0,startDate:'2044-08-27'}},spouse:{sideWork:{monthlyGross:0}}},income:{pensions:{primary:{annualAtStart:0},spouse:{annualAtStart:0}}},unemployment:{baselineMode:'none'},budgets:[{fromAge:65,toAge:66,annualBudget:36}],cashflow:{salaryLife:{mode:'net-transfer-v1',lastSalaryMonth:'2045-07',monthlyAddition:0,monthlyWithdrawal:0,postSalaryLabor:{mode:'none'}}},events:[]});
 c.expenseDetail={monthlyCategories:[{key:'living',label:'生活費',amount:2}],travelAnnualBase:0};return c;
}
test('年次合計は資産計算行と一致し、恒等式を満たす',()=>{
 const c=fixture(),s=annualCashflowSummary(c,65,{sourceProfile:'work-v0.9.7'}),r=runRetirementPlan(c).rows.find(x=>x.age===65);
 assert.equal(s.status,'ready');assert.equal(s.incomeTotal,r.totalIncome);assert.equal(s.managementExpense,r.expense);assert.equal(s.extraExpense,r.extraExpense);assert.equal(s.endAsset,r.endAsset);assert.equal(s.identityMatches,true);
});
test('給与生活中の家計内追加・取崩しは内数で一度だけ計上',()=>{
 const c=fixture();Object.assign(c.cashflow.salaryLife,{monthlyAddition:2,monthlyWithdrawal:1});
 const s=annualCashflowSummary(c,64,{sourceProfile:'work-v0.9.7'});
 assert.equal(s.householdAddition,24);assert.equal(s.householdWithdrawal,12);assert.equal(s.incomeTotal,24);assert.equal(s.extraExpense,12);assert.equal(s.cashBalance,12);assert.equal(s.endAsset,112);
});
test('給与原資iDeCo掛金を収入・支出に重ねない',()=>{
 const c=fixture();c.ideco={asOfDate:'2044-08-27',currentBalance:0,monthlyContribution:1,contributionEndDate:'2045-08-27',lumpDate:'2045-08-27',accumulationReturn:0,lumpPercent:100,annuityPercent:0,annuityYears:5,annuityReturn:0};c.cashflow.salaryLife.idecoFunding={before:{source:'salary'}};
 const s=annualCashflowSummary(c,64,{sourceProfile:'work-v0.9.7'});assert.equal(s.idecoContributionFromAsset,0);assert.equal(s.incomeTotal,0);assert.equal(s.totalExpense,0);assert.equal(s.endAsset,100);
});
test('計画資産原資iDeCo掛金は別枠支出に一度だけ含む',()=>{
 const c=fixture();c.ideco={asOfDate:'2044-08-27',currentBalance:0,monthlyContribution:1,contributionEndDate:'2045-08-27',lumpDate:'2045-08-27',accumulationReturn:0,lumpPercent:100,annuityPercent:0,annuityYears:5,annuityReturn:0};c.cashflow.salaryLife.idecoFunding={before:{source:'plan_asset',accounting:'separate'}};
 const s=annualCashflowSummary(c,64,{sourceProfile:'work-v0.9.7'});assert.equal(s.idecoContributionFromAsset,12);assert.equal(s.extraExpense,12);assert.equal(s.totalExpense,12);assert.equal(s.endAsset,88);
});
test('内訳だけを変えても管理予算・期末資産は変わらない',()=>{
 const c=fixture(),a=annualCashflowSummary(c,65,{sourceProfile:'work-v0.9.7'});c.expenseDetail.monthlyCategories[0].amount=9;const b=annualCashflowSummary(c,65,{sourceProfile:'work-v0.9.7'});
 assert.equal(a.managementExpense,b.managementExpense);assert.equal(a.endAsset,b.endAsset);assert.notEqual(a.referenceKnownSubtotal,b.referenceKnownSubtotal);
});
test('混在出典は合算せず、合計は表示し参考内訳だけ未選択にする',()=>{
 const c=fixture();c.cashflow.expenseCategories=[{key:'living',label:'生活費',items:[{key:'base',label:'基本',periods:[{fromAge:64,toAge:90,amount:8}]}]}];
 const s=annualCashflowSummary(c,65);assert.equal(s.status,'ready');assert.equal(s.sourceProfile,null);assert.equal(s.referenceDetail,null);assert.equal(s.managementExpense,36);
 assert.match(annualCashflowHtml(s),/出典未選択/);
});
test('計画外の年齢は0円を作らず、対象期間なしを返す',()=>{
 const s=annualCashflowSummary(fixture(),99,{sourceProfile:'work-v0.9.7'});assert.equal(s.status,'no-period');assert.match(annualCashflowHtml(s),/計算結果はありません/);
});
test('HTMLはラベルをエスケープし、合計へ再加算しない説明を含む',()=>{
 const c=fixture();c.events=[{date:'2046-01-01',type:'income',label:'<img src=x>',amount:5,fundingTreatment:'separate'}];const html=annualCashflowHtml(annualCashflowSummary(c,65,{sourceProfile:'work-v0.9.7'}));
 assert.ok(!html.includes('<img src=x>'));assert.match(html,/現金収入・支出へ再加算しません/);assert.match(html,/期首資産＋運用益＋現金収支＝期末資産/);
});
test('画面入口とキャッシュに年間収支を接続',()=>{
 const app=fs.readFileSync(new URL('./app.mjs',import.meta.url),'utf8'),html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8'),sw=fs.readFileSync(new URL('./sw.js',import.meta.url),'utf8');
 assert.match(app,/annualCashflowSummary\(config,age/);assert.match(html,/id="annualCashflowSummary"/);assert.match(sw,/annual-cashflow\.mjs/);
});
