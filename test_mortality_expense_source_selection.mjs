import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ui=readFileSync(new URL('./mortality-itemized-ui.mjs',import.meta.url),'utf8');
test('source selection requires explicit saved preset, never ambiguous source inference',()=>{
 assert.match(ui,/readMortalityExpensePreset\(cfg\)/);
 assert.match(ui,/selectedProfile=suggested\|\|\(available\.length===1\?available\[0\]:''\)/);
 assert.match(ui,/available\.length>1&&!selectedProfile/);
 assert.match(ui,/!available\.includes\(selectedProfile\)/);
 assert.match(ui,/sourceProfile:select\.value/);
 assert.doesNotMatch(ui,/if\(valid\.length===1\)/);
 assert.match(ui,/same-config local draft takes precedence/);
});
