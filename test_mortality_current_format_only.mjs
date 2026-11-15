import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const markup=readFileSync(new URL('./mortality-ui.mjs',import.meta.url),'utf8');
const logic=readFileSync(new URL('./mortality-itemized-ui.mjs',import.meta.url),'utf8');

test('comparison requires an explicit source when two registered expense formats exist',()=>{
 assert.match(markup,/<select id="mortalityExpenseSource"/);
 assert.doesNotMatch(markup,/type="hidden" id="mortalityExpenseSource"/);
 assert.match(logic,/inspectCashflowSources\(cfg,\{sourceProfile:'unknown'\}\)/);
 assert.match(logic,/available\.length>1&&!selectedProfile/);
 assert.match(logic,/available\.length===0/);
 assert.match(logic,/!available\.includes\(selectedProfile\)/);
 assert.match(logic,/readMortalityExpensePreset\(cfg\)/);
 assert.match(logic,/preset=registered\?\.deceased===deceased\?registered:null/);
 assert.doesNotMatch(logic,/registered\?\.sourceProfile\|\|'work-v0\.9\.7'/);
});
