import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('./mortality-itemized-ui.mjs',import.meta.url),'utf8');
test('only a unique reconciled comparison source may be auto-selected',()=>{
 assert.match(ui,/if\(!select\.value\)/);
 assert.match(ui,/if\(valid\.length===1\)/);
 assert.match(ui,/else if\(valid\.length>1\)/);
 assert.match(ui,/どの費目内訳も検証に通りません/);
 assert.match(ui,/保存済みの採用条件には反映しません/);
});
