import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const s=readFileSync(new URL('./mortality-itemized.mjs',import.meta.url),'utf8');
test('expense conflicts expose code and source path without financial amounts',()=>{assert.match(s,/issues\.map\(d=>\(\{code:d\.code,path:d\.path\}\)\)/);assert.match(s,/evidence\.slice\(0,5\)/);assert.match(s,/元の登録データは変更しません/);});
