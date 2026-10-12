import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './test_withdrawal.mjs';
import {runRetirementPlan} from './calc.mjs';
import {groupedYearHtml,wideDetailedReport} from './detailed-report.mjs';
import {projectNisaWithdrawal} from './withdrawal-plan.mjs';
const cells=html=>[...html.matchAll(/<tr>(.*?)<\/tr>/g)].map(m=>[...m[1].matchAll(/<td>(.*?)<\/td>/g)].map(c=>c[1]));
test('年次NISA列は定額・自動不足の月次実行可能額とCSVに一致し資産計算を変えない',()=>{
 for(const mode of ['fixed','budget']){
 const {config:c}=fixture();c.budgets[0].annualBudget=240;c.nisa.withdrawal={version:1,mode,startMonth:'2045-08',endMonth:'2047-07',monthlyAmount:20};
 const r=runRetirementPlan(c,{includeMonthlyDetails:true}),before=JSON.stringify(r),n=projectNisaWithdrawal(c,r.monthlyDetails),csv=wideDetailedReport(c,{period:'annual'}),col=csv.columns.find(c=>c.item==='NISA取崩し可能額（参考）');
 for(const view of ['summary','income','expense']){
 const h=groupedYearHtml(r,view,c);assert.match(h.head,/NISA取崩額（資金移動）/);
 cells(h.body).forEach((row,i)=>{const expected=n.rows.filter(m=>m.annualAge===r.rows[i].age).reduce((s,m)=>s+m.withdrawal,0);assert.equal(row.at(-2),expected.toLocaleString('ja-JP',{maximumFractionDigits:2}));assert.ok(Math.abs(csv.rows[i].values[col.id]-expected)<1e-8);});
 }
 assert.equal(JSON.stringify(r),before);assert.equal(n.total,120);
 }
});
test('年次NISA列は未設定と取崩しなしの0を区別する',()=>{
 const {config:c}=fixture(),r=runRetirementPlan(c,{includeMonthlyDetails:true});assert.equal(cells(groupedYearHtml(r,'summary',c).body)[0].at(-2),'未設定');c.nisa.withdrawal={version:1,mode:'none'};assert.equal(cells(groupedYearHtml(r,'summary',c).body)[0].at(-2),'0');
});
