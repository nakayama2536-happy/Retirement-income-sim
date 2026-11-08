import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const f=p=>readFileSync(new URL('./'+p,import.meta.url),'utf8');
const html=f('index.html'),ui=f('pension-ui.mjs'),css=f('styles.css');
test('three pension summary cards display adopted values rather than invented amounts',()=>{
 for(const id of ['pensionQuickReference','pensionQuickPrimary','pensionQuickSpouse','pensionOpenReference','pensionOpenPrimary','pensionOpenSpouse','pensionEditWorkspace'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(ui,/c\.income\.pensions\[key\]/);
 assert.match(ui,/pensionQuickPrimary/);
 assert.match(ui,/pensionQuickSpouse/);
});
test('only selected family member editor opens; draft and adopted calculation stay separate',()=>{
 assert.match(ui,/el\('pensionEditWorkspace'\)\.open=true/);
 assert.match(ui,/el\('pensionReferenceMaster'\)\.open=target==='reference'/);
 assert.match(ui,/el\(key\+'PensionPlanDetails'\)\.open=target===key/);
 assert.match(ui,/pensionDraftMatches\(c,draft\)/);
});
test('print hides detailed editors and advanced tools, leaving a compact family summary',()=>{
 assert.match(css,/@media print/);
 assert.match(css,/#pension \.pension-edit-workspace/);
 assert.match(css,/#pension \.pension-home-cards/);
});
