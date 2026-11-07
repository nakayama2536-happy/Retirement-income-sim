import test from 'node:test';import assert from 'node:assert/strict';import {incomeGraphData,budgetGraphData,expenseGraphData} from './planning-charts.mjs';
const rows=[{age:65,labor:100,primaryPension:20,spousePension:15,idecoAnnuity:5,unemployment:0,extraIncome:10,totalIncome:150,expense:30,extraExpense:2},{age:66,labor:60,primaryPension:20,spousePension:15,idecoAnnuity:5,unemployment:0,extraIncome:0,totalIncome:100,expense:32,extraExpense:0}];
const monthly=[{annualRowIndex:0,expense:15,budget:{baseAnnualAmount:120}},{annualRowIndex:0,expense:15,budget:{baseAnnualAmount:120}},{annualRowIndex:1,expense:16,budget:{baseAnnualAmount:144}},{annualRowIndex:1,expense:16,budget:{baseAnnualAmount:144}}];
test('収入合計と内訳が一致',()=>assert.deepEqual(incomeGraphData(rows).map(x=>x.values[0]),[150,100]));
test('管理予算は計上月の月平均',()=>assert.deepEqual(budgetGraphData(rows,monthly).map(x=>x.values),[[15,10],[16,12]]));
test('予算未計上月は分母から除外',()=>{const x=structuredClone(monthly);x.push({annualRowIndex:1,expense:0,budget:null});assert.equal(budgetGraphData(rows,x)[1].months,2);});
test('管理予算不一致を拒否',()=>{const x=structuredClone(monthly);x[0].expense++;assert.throws(()=>budgetGraphData(rows,x),/不一致/);});
test('収入不一致を拒否',()=>{const x=structuredClone(rows);x[0].totalIncome++;assert.throws(()=>incomeGraphData(x),/不一致/);});
test('内訳の保存元未選択は推測しない',()=>assert.equal(expenseGraphData(rows,{status:'choose-source'}).items,null));
test('未確定費目を0円扱いしない',()=>assert.equal(expenseGraphData(rows,{status:'ready',age:65,rows:[{label:'未入力',amount:null}]}).items[0].amount,null));
test('入力の不変性',()=>{const x=structuredClone(rows),y=structuredClone(monthly);incomeGraphData(rows);budgetGraphData(rows,monthly);assert.deepEqual(rows,x);assert.deepEqual(monthly,y);});

test('3画面へSVGを表示し、採用済みデータには書き込まない',async()=>{
 const {mountPlanningCharts}=await import('./planning-charts.mjs');
 class Element {
  constructor(tag){this.tag=tag;this.children=[];this.style={};this.attrs={};this.value='';this.textContent='';}
  setAttribute(k,v){this.attrs[k]=v;}
  append(...kids){this.children.push(...kids);}
  replaceChildren(...kids){this.children=[...kids];}
 }
 const ids=Object.fromEntries(['planningIncomeChart','planningBudgetChart','planningExpenseChart','cashflowViewAge','expenseDisplaySource'].map(id=>[id,new Element('div')]));
 ids.cashflowViewAge.value='65';ids.expenseDisplaySource.value='work-v0.9.7';
 const doc={createElement:k=>new Element(k),createElementNS:(_ns,k)=>new Element(k),getElementById:k=>ids[k]};
 const config={plan:{startAge:65}},snapshot=structuredClone(rows);
 const chart=mountPlanningCharts({documentRef:doc,getConfig:()=>config,getResult:()=>({rows}),runPlan:()=>({monthlyDetails:monthly}),getExpenseModel:()=>({status:'ready',age:65,rows:[{label:'食費',amount:10},{label:'未確定',amount:null}]})});
 chart.render();
 for(const name of ['planningIncomeChart','planningBudgetChart','planningExpenseChart'])assert.ok(ids[name].children.some(el=>el.tag==='svg'),name);
 assert.deepEqual(rows,snapshot);
});
