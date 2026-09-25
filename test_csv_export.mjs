import assert from 'node:assert/strict';
import { runRetirementPlan } from './calc.mjs';
import { buildAnnualCsvDataset, buildAnnualCsvText } from './csv-export.mjs';

const config = {
  meta:{schemaVersion:'0.9',label:'csv-test'},
  people:{primary:{birthDate:'1980-01-01'},spouse:{birthDate:'1981-01-01'}},
  plan:{startAge:64,endAge:66,startDate:'2044-01-01',initialAsset:1000,afterTaxReturn:0,inflation:0},
  employment:{
    primary:{mainRetirement:{baseDate:'2045-01-01'},sideWork:{monthlyGross:2,startDate:'2045-01-01',endDate:'2046-01-01'}},
    spouse:{sideWork:{monthlyGross:1,startDate:'2045-01-01',endDate:'2046-01-01'}}
  },
  income:{pensions:{primary:{startDate:'2046-01-01',annualAtStart:30,certainty:'assumption'},spouse:{startDate:'2046-01-01',annualAtStart:20,certainty:'assumption'}}},
  budgets:[{fromAge:65,toAge:66,annualBudget:100}],
  events:[
    {date:'2046-01-01',type:'income',amount:50,inflationAdjusted:false,label:'臨時収入'},
    {date:'2046-01-01',type:'expense',amount:10,inflationAdjusted:false,label:'臨時支出'}
  ],
  reserve:{total:50,minimumSafeAsset:30,warningStrongBelow:25},
  management:{thresholds:{66:800},reserveUsedFinalThreshold:500},
  retirement:{amount:200,serviceYears:5},
  unemployment:{baselineMode:'none',preRetirementAnnualSalary:720,highAgeDays:50,pre65GeneralDays:150,pre65SpecialDays:240,dailyBenefitCap60to64Yen:7830},
  taxPolicy:{rulesAsOf:'2026-09-25'},
  cashflow:{
    taxSocialMode:'auto_if_possible',
    expenseCategories:[
      {key:'fixed',label:'固定費',items:[{key:'rent',label:'家賃',periods:[{fromAge:64,toAge:66,amount:5}]}]}
    ],
    travel:[{fromAge:64,toAge:66,annualAmount:4}],
    manualIncomeItems:[{key:'inheritance',label:'相続遺産',unit:'annual',periods:[{fromAge:66,toAge:66,amount:25}]}]
  },
  actuals:{65:{endAsset:925,expense:105,labor:36,pension:0,returnRate:0,taxSocial:0,reserveBalance:50,safeAssetBalance:30,note:'=要確認'}}
};

const result = runRetirementPlan(config);
const dataset = buildAnnualCsvDataset(config, result, {exportedAt:'2026-09-25T12:00:00+09:00'});
assert.equal(dataset.rows.length, result.rows.length);
assert.ok(dataset.columns.some(c=>c.label==='支出_固定費_家賃_万円'));
assert.ok(dataset.columns.some(c=>c.label==='追加収入_相続遺産_万円'));
assert.equal(dataset.rows.find(r=>r.age===65).actualEndAsset, 925);
assert.equal(dataset.rows.find(r=>r.age===66)['manualIncome:inheritance'], 25);
assert.equal(dataset.rows.find(r=>r.age===65).periodYear, 2045);

const csv = buildAnnualCsvText(config, result, {exportedAt:'2026-09-25T12:00:00+09:00'});
assert.ok(csv.includes('"支出_固定費_家賃_万円"'));
assert.ok(csv.includes('"追加収入_相続遺産_万円"'));
assert.ok(csv.includes("'=要確認"));
assert.ok(csv.endsWith('\r\n'));

console.log('OK: annual all-items CSV export');
