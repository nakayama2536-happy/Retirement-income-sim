import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const markup=readFileSync(new URL('./mortality-ui.mjs',import.meta.url),'utf8');
const logic=readFileSync(new URL('./mortality-itemized-ui.mjs',import.meta.url),'utf8');
test('comparison defaults to work format but can use an explicit verified private preset source',()=>{
 assert.match(markup,/type="hidden" id="mortalityExpenseSource" value="work-v0.9.7"/);
 assert.doesNotMatch(markup,/<option value="public-v0.9">/);
 assert.match(logic,/readMortalityExpensePreset\(cfg\)/);
 assert.match(logic,/registered\?\.sourceProfile\|\|'work-v0\.9\.7'/);
 assert.match(logic,/preset=registered\?\.deceased===deceased\?registered:null/);
});
