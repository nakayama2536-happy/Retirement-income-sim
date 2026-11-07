import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const file=name=>readFileSync(new URL('./'+name,import.meta.url),'utf8');
const app=file('app.mjs'),ui=file('survivor-pension-ui.mjs'),mort=file('mortality-ui.mjs'),calc=file('survivor-pension-calculator.mjs');
test('reference screen reads saved 65-year reference without hardcoded pension amounts',()=>{
 assert.match(ui,/registeredSurvivorInputs\(getConfig\(\),deceased\.value\)/);
 assert.match(calc,/reference65/);
 assert.match(ui,/deceased\.addEventListener\('change'/);
 assert.doesNotMatch(ui,/localStorage|sessionStorage|fetch\(/);
});
test('transfer stages comparison only, clears old survivor total and entitlement',()=>{
 assert.match(app,/onTransfer:reference=>\{mortalityCard\.stageReference\(reference\);switchTab\('mortality'\)/);
 assert.match(mort,/stageReference\(input\)/);
 assert.match(mort,/form\.elements\.survivorPension\.value=''/);
 assert.match(mort,/for\(const key of \['entitlement','claimed','deferral','reviewed'\]\)form\.elements\[key\]\.checked=false/);
 assert.match(mort,/saveInputs\(\)/);
 assert.match(ui,/transfer\.disabled=true/);
});
test('reference field does not coerce missing values to zero and detects yen/man confusion',()=>{
 assert.match(calc,/raw===null\|\|raw===undefined\|\|raw===''\)/);
 assert.match(calc,/n>1000/);
 assert.match(ui,/円の数値をそのまま入力/);
});
