import test from 'node:test';
import assert from 'node:assert/strict';
import {runRetirementPlan,runForecastFromLatestActual} from './calc.mjs';
import {migrateConfig} from './storage.mjs';

function fixture(inflation){return migrateConfig({
 people:{primary:{birthDate:'1980-08-27'},spouse:{birthDate:'1981-05-01'}},
 plan:{startAge:64,endAge:80,startDate:'2044-08-27',initialAsset:4000,afterTaxReturn:2,inflation,initialAssetIncludesIdeco:false},
 employment:{primary:{mainRetirement:{baseDate:'2045-08-27'},sideWork:{monthlyGross:0}},spouse:{sideWork:{monthlyGross:0}}},
 income:{pensions:{primary:{startDate:'2050-08-27',annualAtStart:200},spouse:{startDate:'2051-05-01',annualAtStart:100}}},
 ideco:{asOfDate:'2044-08-27',currentBalance:500,monthlyContribution:1,contributionEndDate:'2045-08-27',lumpDate:'2045-08-27',accumulationReturn:3,lumpPercent:50,annuityPercent:50,annuityYears:5,annuityReturn:2},
 budgets:[{fromAge:65,toAge:69,annualBudget:300},{fromAge:70,toAge:80,annualBudget:250}],
 unemployment:{baselineMode:'none'},
 events:[{date:'2046-09-01',type:'income',amount:40},{date:'2052-01-01',type:'expense',amount:80,inflationAdjusted:true},{date:'2053-01-01',type:'expense',amount:60,inflationAdjusted:false}]
});}
for(const inflation of [0,1,3])for(const age of [64,65,68,69,70,72,79]){
 test(`計画と同額の${age}歳実績から再予測：インフレ${inflation}%`,()=>{
  const c=fixture(inflation),original=structuredClone(c),base=runRetirementPlan(c);
  c.actuals={[age]:{endAsset:base.rows.find(r=>r.age===age).endAsset}};
  const supplied=structuredClone(c),f=runForecastFromLatestActual(c).projection;
  assert.deepEqual(f.rows,base.rows.filter(r=>r.age>age));
  assert.equal(f.finalAsset,base.finalAsset);
  assert.deepEqual(c,supplied);
  delete c.actuals;delete original.actuals;assert.deepEqual(c,original);
 });
}
