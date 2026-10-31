import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const s=readFileSync(new URL('./cashflow-reconciliation.mjs',import.meta.url),'utf8');
test('diagnostics with implicit ownership are scoped by source format',()=>{
 assert.match(s,/startsWith\('\/expenseDetail'\)\?'work-v0.9.7'/);
 assert.match(s,/startsWith\('\/cashflow\/expenseCategories'\)\?'public-v0.9'/);
 assert.match(s,/diagnosticProfile\(d\)===sourceProfile/);
});

import {reconcileCashflow} from './cashflow-reconciliation.mjs';
import {migrateConfig} from './storage.mjs';
const source=JSON.parse(readFileSync(new URL('./tools/browser-test/mortality-synthetic.json',import.meta.url),'utf8')).config;
test('WORK missing identifiers never appear in PUBLIC-only diagnosis',()=>{
 const c=migrateConfig(structuredClone(source));
 c.cashflow ||= {};
 c.cashflow.expenseCategories=[{key:'housing',label:'住居',items:[{key:'rent',label:'家賃',periods:[{fromAge:65,toAge:95,amount:10}]}]}];
 c.expenseDetail={monthlyCategories:[{key:'housing',label:'住居',items:[{label:'家賃',amount:10}]}],travelAnnualBase:0};
 const a=reconcileCashflow(c,{sourceProfile:'public-v0.9'});
 const b=reconcileCashflow(c,{sourceProfile:'work-v0.9.7'});
 assert.equal(a.comparisonDiagnostics.some(d=>d.code==='missing-identity'&&String(d.path).startsWith('/expenseDetail')),false);
 assert.equal(b.comparisonDiagnostics.some(d=>d.code==='missing-identity'&&String(d.path).startsWith('/expenseDetail')),true);
});
