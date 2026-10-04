import test from 'node:test';
import assert from 'node:assert/strict';
import {runRetirementPlan, runForecastFromLatestActual, projectIdeco, validateSalaryLife, factorDecomposition} from './calc.mjs';
import {migrateConfig} from './storage.mjs';
import {SalaryLifeValidationError} from './salary-life.mjs';

function fixture() {
  return migrateConfig({
    people:{primary:{birthDate:'1980-08-27'},spouse:{birthDate:'1981-05-01'}},
    plan:{startAge:64,endAge:64,startDate:'2044-08-27',initialAsset:100,afterTaxReturn:0,inflation:0,initialAssetIncludesIdeco:false},
    employment:{primary:{mainRetirement:{baseDate:'2045-08-27'},sideWork:{monthlyGross:20,startDate:'2044-08-27'}},spouse:{sideWork:{monthlyGross:10}}},
    income:{pensions:{primary:{annualAtStart:0},spouse:{annualAtStart:0}}},
    unemployment:{baselineMode:'none'},
    budgets:[{fromAge:65,toAge:80,annualBudget:36}],
    cashflow:{salaryLife:{mode:'net-transfer-v1',lastSalaryMonth:'2045-07',monthlyAddition:0,monthlyWithdrawal:0}},
    events:[]
  });
}
function withIdeco(c) {
  c.ideco={asOfDate:'2044-08-27',currentBalance:0,monthlyContribution:1,contributionEndDate:'2045-08-27',lumpDate:'2045-08-27',accumulationReturn:0,lumpPercent:100,annuityPercent:0,annuityYears:5,annuityReturn:0};
  c.cashflow.salaryLife.idecoFunding={before:{source:'salary'}};
  return c;
}
function early(c=fixture()) {
  Object.assign(c.cashflow.salaryLife,{lastSalaryMonth:'2045-06',pre65MonthlyBudget:3,postSalaryLabor:{mode:'none'}});
  return c;
}
function rejects(c, code) {
  assert.throws(()=>runRetirementPlan(c), e=>e instanceof SalaryLifeValidationError && e.issues.some(i=>i.code===`salary-life-${code}`));
}
test('給与を別に足さず、追加・取崩し0なら100のまま',()=>{
  const c=fixture(), copy=structuredClone(c), r=runRetirementPlan(c);
  assert.equal(r.finalAsset,100); assert.equal(r.rows[0].labor,0); assert.deepEqual(c,copy);
  assert.equal(r.rows[0].expense,0); assert.equal(r.rows[0].totalIncome,0);
});
test('追加2・引出1を12か月で112、内訳は二重加算しない',()=>{
  const c=fixture(); Object.assign(c.cashflow.salaryLife,{monthlyAddition:2,monthlyWithdrawal:1});
  c.expenseDetail={monthlyCategories:[{key:'living',amount:99}]};
  const r=runRetirementPlan(c), a=r.rows[0];
  assert.equal(r.finalAsset,112); assert.equal(a.householdAddition,24); assert.equal(a.householdWithdrawal,12);
  assert.equal(a.endAsset,a.startAsset+a.investmentGain+a.totalIncome-a.expense-a.extraExpense);
});
for(const [source,expected] of [['salary',100],['plan_asset',88]])test(`iDeCo原資${source}で${expected}、iDeCo残高は12`,()=>{
  const c=withIdeco(fixture()); c.cashflow.salaryLife.idecoFunding.before=source==='salary'?{source}:{source,accounting:'separate'};
  const r=runRetirementPlan(c); assert.equal(r.finalAsset,expected); assert.equal(r.idecoProjection.balance,12);
  assert.deepEqual(r.idecoProjection,projectIdeco(c));
});
test('引出に含むiDeCo掛金は再控除しない',()=>{
  const c=withIdeco(fixture()); c.cashflow.salaryLife.monthlyWithdrawal=1;
  c.cashflow.salaryLife.idecoFunding.before={source:'plan_asset',accounting:'withdrawal'};
  assert.equal(runRetirementPlan(c).finalAsset,88);
});
test('1か月前倒し、予算3・収入0なら差は-3',()=>{
  const base=fixture(), c=early(structuredClone(base));
  assert.equal(runRetirementPlan(c).finalAsset-runRetirementPlan(base).finalAsset,-3);
  assert.equal(c.employment.primary.mainRetirement.baseDate,base.employment.primary.mainRetirement.baseDate);
});
test('65歳通常切替は12か月の管理予算を計上する',()=>{
  const c=fixture(); c.plan.endAge=65; c.cashflow.salaryLife.postSalaryLabor={mode:'none'};
  const r=runRetirementPlan(c); assert.equal(r.rows[0].endAsset,100); assert.equal(r.rows[1].expense,36); assert.equal(r.finalAsset,64);
});
test('12月最終なら1月から負担、年の境界で抜けない',()=>{
  const c=early(); c.cashflow.salaryLife.lastSalaryMonth='2044-12';
  assert.equal(runRetirementPlan(c).finalAsset,79); // Jan-Jul = 7 months
});
test('計画開始月からの負担も明示可能、64歳より前には拡張しない',()=>{
  const c=early(); c.cashflow.salaryLife.lastSalaryMonth='2044-07';
  assert.equal(runRetirementPlan(c).finalAsset,64);
  c.cashflow.salaryLife.lastSalaryMonth='2044-06'; rejects(c,'last-month');
});
test('前倒し後の掛金に給与原資を自動継承しない',()=>{
  const c=early(withIdeco(fixture())); rejects(c,'funding-after');
  c.cashflow.salaryLife.idecoFunding.after={source:'salary'}; rejects(c,'funding-after');
  c.cashflow.salaryLife.idecoFunding.after={source:'plan_asset',accounting:'separate'};
  assert.equal(runRetirementPlan(c).finalAsset,96);
  c.cashflow.salaryLife.idecoFunding.after={source:'plan_asset',accounting:'budget'};
  assert.equal(runRetirementPlan(c).finalAsset,97);
  c.cashflow.salaryLife.idecoFunding.after={source:'household'};
  assert.equal(runRetirementPlan(c).finalAsset,97);
});
test('掛金の二重指定・含有額不足を拒否する',()=>{
  const c=withIdeco(fixture()), s=c.cashflow.salaryLife;
  s.idecoFunding.before={source:'salary',accounting:'separate'}; rejects(c,'funding-before-duplicate');
  s.idecoFunding.before={source:'plan_asset',accounting:['separate','withdrawal']}; rejects(c,'funding-before-accounting');
  s.idecoFunding.before={source:'plan_asset',accounting:'withdrawal'}; rejects(c,'contribution-withdrawal');
  early(c); s.idecoFunding.before={source:'salary'}; s.idecoFunding.after={source:'plan_asset',accounting:'budget'}; s.pre65MonthlyBudget=0;
  rejects(c,'contribution-budget');
});
for(const bad of [undefined,null,'',false,'0',-1,NaN,Infinity])test(`未入力・不正額を0扱いしない：${String(bad)}(${typeof bad})`,()=>{
  const c=fixture(); c.cashflow.salaryLife.monthlyAddition=bad; rejects(c,'monthlyAddition');
});
test('前倒し予算・終了後収入・既存期間予算の衝突を検出する',()=>{
  const c=fixture(); c.cashflow.salaryLife.lastSalaryMonth='2045-06';
  rejects(c,'pre65-budget'); rejects(c,'post-labor');
  early(c); c.cashflow.periodOverrides=[{kind:'budget',key:'budget',fromAge:64,toAge:64,unit:'annual',amount:36}];
  rejects(c,'pre65-budget-overlap');
});
test('不明方式・不正月・64歳前の開始残高流用を拒否する',()=>{
  const c=fixture(); c.cashflow.salaryLife.mode='future'; rejects(c,'mode');
  c.cashflow.salaryLife.mode='net-transfer-v1'; c.cashflow.salaryLife.lastSalaryMonth='2045-13'; rejects(c,'last-month');
  c.cashflow.salaryLife.lastSalaryMonth='2045-07'; c.plan.startAge=63; c.plan.startDate='2043-08-27'; rejects(c,'before-64');
});
test('切替前のイベントは未分類を拒否し、別枠・純入出金内を区別',()=>{
  const c=fixture(); c.events=[{date:'2044-09-01',type:'income',amount:10},{date:'2044-10-01',type:'expense',amount:4}];
  rejects(c,'event-0'); rejects(c,'event-1');
  c.events.forEach(x=>x.fundingTreatment='separate'); assert.equal(runRetirementPlan(c).finalAsset,106);
  c.events.forEach(x=>x.fundingTreatment='net_transfer'); assert.equal(runRetirementPlan(c).finalAsset,100);
});
test('切替後の予算内支出は重ねず、別枠なら控除する',()=>{
  const c=early(); c.events=[{date:'2045-07-01',type:'expense',amount:2,fundingTreatment:'budget'}];
  assert.equal(runRetirementPlan(c).finalAsset,97);
  c.events[0].fundingTreatment='separate'; assert.equal(runRetirementPlan(c).finalAsset,95);
  c.events[0].fundingTreatment='net_transfer'; rejects(c,'event-0');
});
test('期間別収入も計上先を明示し、切替をまたぐ矛盾は拒否',()=>{
  const c=fixture(); c.cashflow.periodOverrides=[{kind:'income',key:'gift',fromAge:64,toAge:64,amount:12,unit:'annual'}];
  rejects(c,'period-0'); c.cashflow.periodOverrides[0].fundingTreatment='separate'; assert.equal(runRetirementPlan(c).finalAsset,112);
  c.cashflow.periodOverrides[0].fundingTreatment='net_transfer'; assert.equal(runRetirementPlan(c).finalAsset,100);
  early(c); rejects(c,'period-0');
});
test('給与生活中の年金と給付は内包・別枠を明示する',()=>{
  const c=fixture(), s=c.cashflow.salaryLife;
  c.income.pensions.primary={startDate:'2044-08-27',annualAtStart:12}; rejects(c,'receipt-pension');
  s.receiptTreatment={pension:'net_transfer'}; assert.equal(runRetirementPlan(c).finalAsset,100);
  s.receiptTreatment.pension='separate'; assert.equal(runRetirementPlan(c).finalAsset,112);
  c.unemployment={baselineMode:'retire_at_65',preRetirementAnnualSalary:100,highAgeDays:50};
  c.employment.primary.mainRetirement.baseDate='2044-09-27'; rejects(c,'receipt-unemployment');
  s.receiptTreatment.unemployment='net_transfer'; assert.equal(runRetirementPlan(c).finalAsset,112);
  s.receiptTreatment.unemployment='separate'; assert.ok(runRetirementPlan(c).finalAsset>112);
});
test('給与生活中のiDeCo受取は明示し、拠出を重ねない',()=>{
  const c=withIdeco(fixture()), s=c.cashflow.salaryLife;
  c.ideco.contributionEndDate='2045-07-27'; c.ideco.lumpDate='2045-07-27';
  rejects(c,'receipt-ideco'); s.receiptTreatment={ideco:'separate'};
  assert.equal(runRetirementPlan(c).finalAsset,111); assert.equal(projectIdeco(c).balance,11);
  s.receiptTreatment.ideco='net_transfer'; assert.equal(runRetirementPlan(c).finalAsset,100);
});
test('終了後収入は確認済み既存値または夫婦合計指定で置換する',()=>{
  const c=early(), s=c.cashflow.salaryLife;
  s.postSalaryLabor={mode:'existing_confirmed'}; assert.equal(runRetirementPlan(c).finalAsset,127);
  s.postSalaryLabor={mode:'monthly',monthlyAmount:2,lastMonth:'2045-07'}; assert.equal(runRetirementPlan(c).finalAsset,99);
  delete s.postSalaryLabor.lastMonth; rejects(c,'post-labor-monthly');
});
test('未指定の旧設定は移行後も新方式を勝手に有効化しない',()=>{
  const c=fixture(); delete c.cashflow.salaryLife; const migrated=migrateConfig(c);
  assert.equal(migrated.cashflow.salaryLife,undefined);
  assert.deepEqual(runRetirementPlan(migrated),runRetirementPlan(c));
  const newConfig=fixture(); assert.deepEqual(migrateConfig(JSON.parse(JSON.stringify(newConfig))),newConfig);
  assert.equal(runRetirementPlan(migrateConfig(newConfig)).finalAsset,100);
});
test('新方式を未対応の要因分解に混ぜない',()=>{
  assert.throws(()=>factorDecomposition(fixture(),fixture()),/要因分解は未対応/);
});
for(const birth of ['1980-08-31','1980-02-29'])test(`月末・閏日の誕生日でも12か月と再予測を維持：${birth}`,()=>{
  const c=fixture(); c.people.primary.birthDate=birth; c.plan.startDate=birth.replace('1980','2044'); c.plan.endAge=66;
  const feb=birth.endsWith('02-29');
  c.cashflow.salaryLife.lastSalaryMonth=feb?'2045-01':'2045-07';
  c.cashflow.salaryLife.postSalaryLabor={mode:'none'};
  const r=runRetirementPlan(c); assert.equal(r.rows[0].endAsset,100);
  assert.equal(r.rows[1].expense,36); assert.equal(r.rows[2].expense,36);
  c.actuals={64:{endAsset:100}};
  assert.deepEqual(runForecastFromLatestActual(c).projection.rows,r.rows.slice(1));
});
for(const inflation of [0,1,3])for(const actualAge of [64,65,69,70,74])test(`新方式の計画同額実績から全行一致：${inflation}%・${actualAge}歳`,()=>{
  const c=early(withIdeco(fixture())); c.plan.endAge=75; c.plan.afterTaxReturn=2; c.plan.inflation=inflation;
  c.cashflow.salaryLife.idecoFunding.after={source:'plan_asset',accounting:'separate'};
  c.income.pensions.primary={startDate:'2050-08-27',annualAtStart:20};
  c.income.pensions.spouse={startDate:'2051-05-01',annualAtStart:12};
  c.ideco.lumpPercent=50; c.ideco.annuityPercent=50;
  c.budgets=[{fromAge:65,toAge:69,annualBudget:36},{fromAge:70,toAge:75,annualBudget:30}];
  c.events=[{date:'2052-01-01',type:'expense',amount:2,inflationAdjusted:true,fundingTreatment:'separate'},{date:'2053-01-01',type:'income',amount:3,fundingTreatment:'separate'}];
  const base=runRetirementPlan(c); c.actuals={[actualAge]:{endAsset:base.rows.find(x=>x.age===actualAge).endAsset}};
  const supplied=structuredClone(c), forecast=runForecastFromLatestActual(c).projection;
  assert.deepEqual(forecast.rows,base.rows.filter(x=>x.age>actualAge)); assert.equal(forecast.finalAsset,base.finalAsset); assert.deepEqual(c,supplied);
  assert.deepEqual(validateSalaryLife(c),[]);
});
