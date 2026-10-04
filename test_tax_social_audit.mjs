import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {migrateConfig} from './storage.mjs';
import {runRetirementPlan} from './calc.mjs';
import {publicV09TaxSocialReference,taxSocialMethodAudit,taxSocialMethodHtml} from './tax-social-audit.mjs';

function fixture(){
  const c=migrateConfig({
    people:{primary:{birthDate:'1980-08-27'},spouse:{birthDate:'1979-05-01'}},
    plan:{startAge:64,endAge:72,startDate:'2044-08-27',initialAsset:1234,initialAssetIncludesIdeco:false,afterTaxReturn:0,inflation:0},
    employment:{primary:{mainRetirement:{baseDate:'2045-08-27'},sideWork:{monthlyGross:0,startDate:'2045-11-01',endDate:'2049-08-01'}},spouse:{sideWork:{monthlyGross:0,startDate:'2044-08-27',endDate:'2049-05-01'}}},
    income:{pensions:{primary:{startDate:'2050-08-01',annualAtStart:120},spouse:{startDate:'2049-05-01',annualAtStart:80}}},
    unemployment:{baselineMode:'none'},budgets:[{fromAge:64,toAge:72,annualBudget:360}],events:[],
    cashflow:{taxSocialMode:'auto_if_possible',expenseCategories:[{key:'taxSocial',label:'税・社会保険',fallbackMonthly:4}],periodOverrides:[],manualIncomeItems:[]},
    expenseDetail:{monthlyCategories:[{key:'taxSocial',label:'税・社会保険',amount:null}],travelAnnualBase:0},
    taxPolicy:{budgetIncludesTaxSocial:true,reviewDeltaAnnual:0,rulesAsOf:'2026-09-24'}
  });
  return c;
}
const row=(m,id)=>m.rows.find(x=>x.id===id);

test('資産推移だけが採用経路で、管理予算支出と一致する',()=>{
  const c=fixture(),m=taxSocialMethodAudit(c,70),plan=runRetirementPlan(c).rows.find(x=>x.age===70);
  assert.equal(m.status,'ready');assert.equal(row(m,'asset').status,'adopted');assert.equal(row(m,'asset').amount,plan.expense);
  assert.deepEqual(m.rows.filter(x=>x.assetEffect).map(x=>x.id),['asset']);
});
test('公開元自動概算とWork概算を別経路・別基準で表示する',()=>{
  const m=taxSocialMethodAudit(fixture(),70),pub=row(m,'public-v0.9'),work=row(m,'work');
  assert.equal(pub.status,'reference');assert.equal(work.status,'reference');assert.ok(Number.isFinite(pub.amount));assert.ok(Number.isFinite(work.amount));
  assert.equal(pub.rulesAsOf,'2026-09-25');assert.equal(work.rulesAsOf,'2026-09-24');assert.equal(m.difference,work.amount-pub.amount);
});
test('公開元の設定済み月額は年額化するが資産へ加算しない',()=>{
  const c=fixture();c.cashflow.taxSocialMode='manual';c.cashflow.expenseCategories[0].fallbackMonthly=5;
  const r=row(taxSocialMethodAudit(c,70),'public-v0.9');assert.equal(r.status,'manual');assert.equal(r.amount,60);assert.equal(r.assetEffect,false);
});
test('公開元の0円・欠落は旧版の月4万円代替と元値を区別する',()=>{
  for(const raw of [0,null,undefined]){
    const c=fixture();c.cashflow.taxSocialMode='manual';
    if(raw===undefined)delete c.cashflow.expenseCategories[0].fallbackMonthly;else c.cashflow.expenseCategories[0].fallbackMonthly=raw;
    const r=row(taxSocialMethodAudit(c,70),'public-v0.9');assert.equal(r.status,'substitute');assert.equal(r.amount,48);assert.equal(r.rawMonthly,raw??null);
  }
});
test('項目未登録を0円とせず、参考計算と採用状態を分ける',()=>{
  const c=fixture();c.expenseDetail.monthlyCategories=[];c.cashflow.expenseCategories=[];
  const m=taxSocialMethodAudit(c,70);assert.equal(row(m,'work').status,'not-registered');assert.equal(row(m,'public-v0.9').status,'not-registered');
  assert.ok(Number.isFinite(row(m,'work').amount));assert.ok(Number.isFinite(row(m,'public-v0.9').amount));
});
test('年次実績は表示するが過去年の資産計算へ再加算しない',()=>{
  const c=fixture();c.actuals={70:{taxSocial:55,endAsset:5000}};
  const r=row(taxSocialMethodAudit(c,70),'actual');assert.equal(r.status,'actual');assert.equal(r.amount,55);assert.equal(r.assetEffect,false);
  delete c.actuals[70].taxSocial;assert.equal(row(taxSocialMethodAudit(c,70),'actual').status,'unentered');
});
test('給与生活の家計参考期間は資産控除済みと表示しない',()=>{
  const c=fixture();c.cashflow.salaryLife={mode:'net-transfer-v1',lastSalaryMonth:'2045-07',monthlyAddition:0,monthlyWithdrawal:0,pre65MonthlyBudget:30,postSalaryLabor:{mode:'none'},idecoFunding:{before:{source:'salary'}}};
  const asset=row(taxSocialMethodAudit(c,64),'asset');assert.equal(asset.status,'family-reference');assert.equal(asset.amount,0);
});
test('公開元経路だけはiDeCo年金を本人年金所得へ含める差を明示できる',()=>{
  const c=fixture();c.ideco={asOfDate:'2044-08-27',currentBalance:600,monthlyContribution:0,contributionEndDate:'2050-08-27',lumpDate:'2050-08-27',accumulationReturn:0,lumpPercent:50,annuityPercent:50,annuityYears:5,annuityReturn:0};
  const pub=publicV09TaxSocialReference(c,70),work=row(taxSocialMethodAudit(c,70),'work').details;
  assert.ok(pub.incomeBasis.idecoAnnuity>0);assert.equal(Object.hasOwn(work.incomeBasis,'idecoAnnuity'),false);
});
test('対象外年齢は0円を作らず対象期間なしとする',()=>{const m=taxSocialMethodAudit(fixture(),99);assert.equal(m.status,'no-period');assert.match(taxSocialMethodHtml(m),/計算結果はありません/);});
test('読取り比較は設定を変更せず、凍結入力でも動作する',()=>{
  const c=fixture(),before=structuredClone(c);(function freeze(x){if(x&&typeof x==='object'){Object.values(x).forEach(freeze);Object.freeze(x);}})(c);
  taxSocialMethodAudit(c,70);assert.deepEqual(c,before);
});
test('HTMLは採用・参考・未対応と二重加算禁止を同時表示する',()=>{
  const html=taxSocialMethodHtml(taxSocialMethodAudit(fixture(),70));assert.match(html,/採用中/);assert.match(html,/公開元 v0\.9/);assert.match(html,/制度タブ手取ツール/);assert.match(html,/重ねて加算しません/);assert.match(html,/将来の税額・保険料を確定しません/);
});
test('画面・キャッシュへ読取り専用方式差表示を接続する',()=>{
  const app=fs.readFileSync(new URL('./app.mjs',import.meta.url),'utf8'),html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8'),sw=fs.readFileSync(new URL('./sw.js',import.meta.url),'utf8');
  assert.match(app,/taxSocialMethodAudit\(config,age\)/);assert.match(html,/id="taxSocialMethodAudit"/);assert.match(sw,/tax-social-audit\.mjs/);
});
