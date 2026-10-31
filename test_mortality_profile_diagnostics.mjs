import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const s=readFileSync(new URL('./cashflow-reconciliation.mjs',import.meta.url),'utf8');
test('diagnostics with implicit ownership are scoped by source format',()=>{
 assert.match(s,/startsWith\('\/expenseDetail'\)\?'work-v0.9.7'/);
 assert.match(s,/startsWith\('\/cashflow\/expenseCategories'\)\?'public-v0.9'/);
 assert.match(s,/diagnosticProfile\(d\)===sourceProfile/);
});
