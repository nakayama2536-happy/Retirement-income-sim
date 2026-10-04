import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateConfig} from './storage.mjs';
import {annualCashflowSummaries} from './annual-cashflow.mjs';
import {ANNUAL_CSV_COLUMNS,annualCsvRows,annualCsvText,downloadAnnualCsv,japanDate} from './annual-csv.mjs';

function fixture(){
 const c=migrateConfig({people:{primary:{birthDate:'1980-08-27'},spouse:{birthDate:'1981-05-01'}},plan:{startAge:64,endAge:66,startDate:'2044-08-27',initialAsset:100,afterTaxReturn:0,inflation:0,initialAssetIncludesIdeco:false},employment:{primary:{mainRetirement:{baseDate:'2045-08-27'},sideWork:{monthlyGross:0,startDate:'2044-08-27'}},spouse:{sideWork:{monthlyGross:0}}},income:{pensions:{primary:{annualAtStart:0},spouse:{annualAtStart:0}}},unemployment:{baselineMode:'none'},budgets:[{fromAge:65,toAge:66,annualBudget:36}],cashflow:{salaryLife:{mode:'net-transfer-v1',lastSalaryMonth:'2045-07',monthlyAddition:0,monthlyWithdrawal:0,postSalaryLabor:{mode:'none'}}},events:[]});
 c.expenseDetail={monthlyCategories:[{key:'living',label:'生活費',amount:2}],travelAnnualBase:0};return c;
}
test('CSVの全行が年間収支サマリーと同じ値',()=>{
 const c=fixture(),summaries=annualCashflowSummaries(c,{sourceProfile:'work-v0.9.7'}),rows=annualCsvRows(c,{sourceProfile:'work-v0.9.7'});assert.equal(rows.length,summaries.length);
 rows.forEach((r,i)=>{const s=summaries[i];assert.equal(r.age,s.age);assert.equal(r.incomeTotal,s.incomeTotal);assert.equal(r.managementExpense,s.managementExpense);assert.equal(r.totalExpense,s.totalExpense);assert.equal(r.investmentGain,s.investmentGain);assert.equal(r.endAsset,s.endAsset);assert.equal(r.identityStatus,'一致');});
});
test('家計内振替とiDeCo掛金は内数列で、合計へ再加算しない',()=>{
 const c=fixture();Object.assign(c.cashflow.salaryLife,{monthlyAddition:2,monthlyWithdrawal:1});c.ideco={asOfDate:'2044-08-27',currentBalance:0,monthlyContribution:1,contributionEndDate:'2045-08-27',lumpDate:'2045-08-27',accumulationReturn:0,lumpPercent:100,annuityPercent:0,annuityYears:5,annuityReturn:0};c.cashflow.salaryLife.idecoFunding={before:{source:'salary'}};
 const r=annualCsvRows(c,{sourceProfile:'work-v0.9.7'})[0];assert.equal(r.householdAddition,24);assert.equal(r.householdWithdrawal,12);assert.equal(r.idecoContributionFromAsset,0);assert.equal(r.incomeTotal,24);assert.equal(r.totalExpense,12);assert.equal(r.cashBalance,12);
});
test('未選択・未確定の参考値は空欄で、0円に変換しない',()=>{
 const c=fixture();c.cashflow.expenseCategories=[{key:'living',items:[{key:'base',periods:[{fromAge:64,toAge:90,amount:8}]}]}];const rows=annualCsvRows(c),text=annualCsvText(c);
 assert.equal(rows[1].referenceSource,'未選択');assert.equal(rows[1].referenceDetail,null);assert.equal(rows[1].unresolvedMonthCount,null);const lines=text.trim().split(/\r?\n/);assert.ok(lines[2].includes(',未選択,,,'));
});
test('列数は全行で一定、BOM・CRLF・日本語見出しを持つ',()=>{
 const text=annualCsvText(fixture(),{sourceProfile:'work-v0.9.7'});assert.ok(text.startsWith('\uFEFF年齢期,'));assert.ok(text.endsWith('\r\n'));const lines=text.slice(1).trim().split('\r\n');assert.equal(lines.length,4);
 for(const line of lines)assert.equal(line.split(',').length,ANNUAL_CSV_COLUMNS.length);
});
test('引用符・改行・表計算式を無害化する',()=>{
 const c=fixture();c.events=[{date:'2045-09-01',type:'income',label:'=CMD,"改行\n項目"',amount:5,fundingTreatment:'separate'}];const text=annualCsvText(c,{sourceProfile:'work-v0.9.7'});
 assert.match(text,/"2045-09-27 =CMD,""改行\n項目"" 5万円"/);assert.ok(!text.includes('\r\n=CMD'));assert.ok(text.includes(',-31,0,-31,69,'));
});
test('日本時間の日付をファイル名に使う',async()=>{
 const now=new Date('2026-09-28T15:30:00Z');assert.equal(japanDate(now),'2026-09-29');let clicked=0,revoked='',blob;
 const documentRef={createElement:()=>({click(){clicked++;}})},urlRef={createObjectURL:b=>{blob=b;return 'blob:test';},revokeObjectURL:u=>revoked=u};
 const out=downloadAnnualCsv(fixture(),{sourceProfile:'work-v0.9.7',now,documentRef,urlRef});assert.equal(out.filename,'lifeplan-annual-cashflow-2026-09-29.csv');assert.equal(out.rowCount,3);assert.equal(clicked,1);assert.equal(blob.type,'text/csv;charset=utf-8');
 await new Promise(r=>setTimeout(r,1010));assert.equal(revoked,'blob:test');
});
test('CSV生成は設定・比較用データを書き換えない',()=>{
 const c=fixture(),before=structuredClone(c);annualCsvText(c,{sourceProfile:'work-v0.9.7'});assert.deepEqual(c,before);
});
