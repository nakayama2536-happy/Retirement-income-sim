import test from 'node:test';
import assert from 'node:assert/strict';
import {ageExpenseReference,discretionaryTravelEnvelope,compareCareScenario} from './discretionary-travel.mjs';
test('79/80/84/85/99歳の医療費・車両費・交通費の境界',()=>{
 for(const [age,amount] of [[79,44],[80,47],[84,47],[85,44.1],[99,44.1]])assert.ok(Math.abs(ageExpenseReference(age).monthly-amount)<1e-8);
 assert.equal(ageExpenseReference(84).vehicleActive,true);
 assert.equal(ageExpenseReference(85).vehicleActive,false);
});
test('旅行余力を二重加算せず不足額は独立に報告',()=>{
 assert.equal(discretionaryTravelEnvelope({annualBudget:700,nonTravelExpense:528}).travelBudget,172);
 assert.equal(discretionaryTravelEnvelope({annualBudget:500,nonTravelExpense:528}).travelBudget,0);
 assert.equal(discretionaryTravelEnvelope({annualBudget:500,nonTravelExpense:528}).shortfall,28);
 assert.equal(discretionaryTravelEnvelope({annualBudget:528,nonTravelExpense:528}).travelBudget,0);
});
test('未照合費用は旅行予算に自動転用しない',()=>{
 assert.equal(discretionaryTravelEnvelope({annualBudget:700,sourceComplete:false}).status,'unresolved');
 assert.throws(()=>discretionaryTravelEnvelope({annualBudget:700}),/未入力/);
});
test('介護追加費用は非採用の比較案として350万円を計算',()=>{
 assert.deepEqual(compareCareScenario(),{months:60,extraMonthly:5,oneTime:50,additionalTotal:350,adopted:false});
});
