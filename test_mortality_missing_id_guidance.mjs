import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./mortality-itemized.mjs',import.meta.url),'utf8');
test('missing current expense identifiers show local labels without storing them',()=>{
 assert.match(source,/const localLabel=path=>/);
 assert.match(source,/expenseDetail/);
 assert.match(source,/label\.slice\(0,40\)/);
 assert.match(source,/localLabel\(d\.path\)/);
});
