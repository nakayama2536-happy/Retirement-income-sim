import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const markup=readFileSync(new URL('./mortality-ui.mjs',import.meta.url),'utf8');
const logic=readFileSync(new URL('./mortality-itemized-ui.mjs',import.meta.url),'utf8');
test('comparison uses current format without legacy picker',()=>{
 assert.match(markup,/type="hidden" id="mortalityExpenseSource" value="work-v0.9.7"/);
 assert.doesNotMatch(markup,/<option value="public-v0.9">/);
 assert.match(logic,/sourceProfile:'work-v0.9.7'/);
 assert.match(logic,/Historical draft profile is ignored/);
});
