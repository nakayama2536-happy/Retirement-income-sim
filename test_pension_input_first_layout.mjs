import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=name=>readFileSync(new URL(name,import.meta.url),'utf8');
const ui=read('./pension-ui.mjs'),html=read('./index.html'),app=read('./app.mjs'),css=read('./styles.css');
test('pension statement is the first collapsed section and retained values are read from current draft',()=>{
 assert.match(ui,/id=\"pensionReferenceMaster\"/);
 assert.match(ui,/referencePanel\+PENSION_PEOPLE\.map/);
 assert.match(ui,/pensionReferenceMaster'\)\.open=PENSION_PEOPLE\.some/);
 assert.match(ui,/draft\[key\]\.reference65\|\|\{\}/);
 assert.match(ui,/pensionReferenceDone/);
 assert.match(css,/pension-reference-master\{grid-column:1 \/ -1/);
});
test('one-click import reads 65-year evidence and requires valid sum, source and start-month estimate',()=>{
 assert.match(ui,/PensionImport65/);
 assert.match(ui,/Math\.abs\(v\[0\]\+v\[1\]\+v\[2\]-v\[3\]\)>\.01/);
 assert.match(ui,/if\(!el\(key\+'Pension65Source'\)\.value\.trim\(\)\)/);
 assert.match(ui,/const r=estimate\(key\)/);
 assert.match(ui,/el\(key\+'PensionAmount'\)\.value=String\(r\.annual\)/);
 assert.match(ui,/el\(key\+'PensionCertainty'\)\.value='scenario'/);
 assert.match(ui,/saveDraft\(\);state\(\);renderEstimate\(key\)/);
});
test('optional age and tax tools are hidden in details without losing the tax tool swap',()=>{
 assert.match(html,/id=\"pensionComparisonExtra\"/);
 assert.match(html,/id=\"pensionTaxExtra\"/);
 assert.match(app,/id==='pension'&&el\('pensionTaxExtra'\)/);
});
test('reference values come from the private pension state, not hardcoded defaults',()=>{
 assert.match(ui,/draft\[key\]\.reference65\|\|\{\}/);
 assert.match(ui,/Pension_PEOPLE|PENSION_PEOPLE/);
 assert.doesNotMatch(ui,/Pension65Total[^\n]*value=\d/);
});
