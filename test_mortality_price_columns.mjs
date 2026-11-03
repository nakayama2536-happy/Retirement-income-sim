import test from 'node:test';
import assert from 'node:assert/strict';
import {registeredMonthlyAmount} from './mortality-itemized-ui.mjs';
import {inspectMortalityExpenseBudget} from './mortality-itemized.mjs';
import {runRetirementPlan} from './calc.mjs';
import {readFileSync} from 'node:fs';
const rootConfig=JSON.parse(readFileSync(new URL('./tools/browser-test/mortality-synthetic.json',import.meta.url),'utf8')).config;
test('registered monthly money is separated from inflated month values',()=>{
 const item={id:'rent',priceBasis:'plan-start-base'};
 const month={priceFactor:1.051,amounts:{rent:11*1.051}};
 assert.ok(Math.abs(registeredMonthlyAmount(item,month)-11)<1e-10);
 assert.equal(registeredMonthlyAmount({...item,priceBasis:'target-period-nominal'},month),11*1.051);
 assert.equal(registeredMonthlyAmount({...item,priceBasis:'unresolved'},month),null);
 assert.equal(registeredMonthlyAmount(item,{priceFactor:null,amounts:month.amounts}),null);
 assert.equal(registeredMonthlyAmount(item,{priceFactor:0,amounts:month.amounts}),null);
 assert.equal(registeredMonthlyAmount(item,{priceFactor:1,amounts:{rent:0}}),0);
});
test('existing monthly reconciliation is not mutated by display-only metadata',()=>{
 const c=structuredClone(rootConfig);
 const original=JSON.stringify(c);
 const run=runRetirementPlan(c,{includeMonthlyDetails:true});
 const budget=inspectMortalityExpenseBudget(c,run.monthlyDetails,{sourceProfile:'work-v0.9.7'});
 assert.ok(budget.months.length>0);
 assert.equal(JSON.stringify(c),original);
 assert.ok(budget.months.every(m=>m.priceFactor===null||(typeof m.priceFactor==='number'&&m.priceFactor>0)));
 assert.ok(budget.items.every(m=>Object.hasOwn(m,'priceBasis')));
});
test('five headings, three money columns and per-column mobile labels stay available',()=>{
 const ui=readFileSync(new URL('./mortality-itemized-ui.mjs',import.meta.url),'utf8');
 const css=readFileSync(new URL('./styles.css',import.meta.url),'utf8');
 for(const text of ['登録月額（基準額）','の月額（物価反映後）','万一の後の倍率','万一の後の概算額'])assert.ok(ui.includes(text));
 assert.match(ui,/registeredMonthlyAmount\(item,month\)/);
 assert.match(ui,/row\.append\(\.\.\.cells,factorCell,impact\)/);
 assert.match(css,/data-mortality-column/);
});
