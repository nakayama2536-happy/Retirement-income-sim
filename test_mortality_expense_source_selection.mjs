import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('./mortality-itemized-ui.mjs',import.meta.url),'utf8');
test('current-format comparison ignores legacy draft and does not infer a source',()=>{
 assert.match(ui,/select\.value='work-v0\.9\.7'/);
 assert.match(ui,/sourceProfile:'work-v0\.9\.7'/);
 assert.doesNotMatch(ui,/if\(valid\.length===1\)/);
 assert.match(ui,/Historical draft profile is ignored/);
});
