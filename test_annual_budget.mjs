import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './test_withdrawal.mjs';
import {runRetirementPlan} from './calc.mjs';
import {groupedYearHtml} from './detailed-report.mjs';
test('管理予算は全表示で月次支出と一致し臨時支出を含めず結果を変更しない',()=>{
 const {config:c}=fixture();c.budgets[0].annualBudget=240;c.plan.inflation=2;
 c.events=[{type:'expense',date:'2045-09-01',amount:35,label:'架空臨時支出'}];
 const r=runRetirementPlan(c,{includeMonthlyDetails:true}),before=JSON.stringify(r);
 for(const mode of ['summary','income','expense']){
  const h=groupedYearHtml(r,mode,c),heads=[...h.head.matchAll(/<th>(.*?)<\/th>/g)].map(x=>x[1]);
  const index=heads.indexOf('管理予算（資産負担分）');assert.ok(index>=0);assert.equal(heads.filter(x=>x==='管理予算（資産負担分）').length,1);
  const rows=[...h.body.matchAll(/<tr>(.*?)<\/tr>/g)].map(x=>[...x[1].matchAll(/<td>(.*?)<\/td>/g)].map(y=>y[1]));
  rows.forEach((row,i)=>{const sum=r.monthlyDetails.filter(m=>m.annualAge===r.rows[i].age).reduce((n,m)=>n+m.expense,0);assert.equal(row[index],sum.toLocaleString('ja-JP',{maximumFractionDigits:2}));assert.equal(row.length,heads.length);});
 }
 assert.equal(JSON.stringify(r),before);assert.equal(r.rows[0].extraExpense,35);
 c.budgets[0].annualBudget=0;const z=groupedYearHtml(runRetirementPlan(c,{includeMonthlyDetails:true}),'expense',c);assert.match(z.body,/<td>0<\/td>/);
});
