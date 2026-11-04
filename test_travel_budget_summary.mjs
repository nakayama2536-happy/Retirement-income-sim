import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeTravelBudget} from './travel-budget-summary.mjs';
const expense={itemId:'food',kind:'expense',label:'食費',variants:[{key:'food'}]};
const travel={itemId:'travel-plan',kind:'travel',label:'旅行費',variants:[{key:'travel'}]};
const items=[expense,travel];
function fixture({budget=60,other=48,travelReference=8,months=12}={}){
 const rows=Array.from({length:months},()=>({annualRowIndex:0,scope:'asset-funded',actual:{expense:budget},budget:{check:{status:'resolved',amount:budget}},
  details:[{itemId:'food',priced:{status:'resolved',amount:other}},{itemId:'travel-plan',priced:{status:'resolved',amount:travelReference}}]}));
 return {sourceProfile:'work-v0.9.7',periods:[{age:70,annualRowIndex:0,monthCount:months}],months:rows,blockers:[],comparisonDiagnostics:[]};
}
const eq=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('annual budget minus other costs equals travel allowance without double counting',()=>{
 const rec=fixture(),original=JSON.stringify(rec),r=summarizeTravelBudget(rec,items,70);
 eq(r.annualBudget,720);eq(r.nonTravelExpense,576);eq(r.travelBudget,144);eq(r.registeredTravel,96);eq(r.travelDifference,48);
 assert.equal(JSON.stringify(rec),original);
});
test('other expenses above the budget report zero travel and explicit shortfall',()=>{
 const r=summarizeTravelBudget(fixture({budget:45,other:50}),items,70);
 assert.equal(r.status,'over-budget');eq(r.travelBudget,0);eq(r.shortfall,60);
});
test('unresolved tax or other costs do not become zero',()=>{
 const rec=fixture();rec.months[2].details[0].priced={status:'unresolved',amount:null};
 assert.equal(summarizeTravelBudget(rec,items,70).status,'unresolved');
});
test('missing travel reference does not block known remaining budget but stays unconfirmed',()=>{
 const rec=fixture();rec.months[0].details[1].priced={status:'missing',amount:null};
 const r=summarizeTravelBudget(rec,items,70);eq(r.travelBudget,144);assert.equal(r.registeredTravel,null);
});
test('mixed salary and asset-funded periods stop',()=>{
 const rec=fixture();rec.months[0].scope='family-reference';assert.equal(summarizeTravelBudget(rec,items,70).status,'unresolved');
});
test('ambiguous travel category inside ordinary expenses stops',()=>{
 const bad=[{...expense,label:'旅行費'},travel];assert.equal(summarizeTravelBudget(fixture(),bad,70).status,'unresolved');
});
test('identity conflict and mismatched budget stop',()=>{
 const a=fixture();a.comparisonDiagnostics=[{code:'duplicate-key'}];assert.equal(summarizeTravelBudget(a,items,70).status,'unresolved');
 const b=fixture();b.months[3].budget.check.amount=42;assert.equal(summarizeTravelBudget(b,items,70).status,'unresolved');
});
test('partial age period uses its actual month count',()=>{
 const r=summarizeTravelBudget(fixture({months:6}),items,70);eq(r.annualBudget,360);eq(r.nonTravelExpense,288);eq(r.travelBudget,72);
});
