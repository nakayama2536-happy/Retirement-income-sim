import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {expenseDisplayProfile} from './expense-display.mjs';

const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const options=id=>{
 const found=html.match(new RegExp('<select id="'+id+'"[^>]*>([\\s\\S]*?)<\\/select>'));
 assert.ok(found,'Missing select: '+id);
 return found[1];
};
test('normal expense selectors expose only standard source',()=>{
 for(const id of ['budgetTravelSource','expenseSource','expenseDisplaySource','detailCsvSource']){
  const choices=options(id);
  assert.match(choices,/work-v0\\.9\\.7/);
  assert.doesNotMatch(choices,/public-v0\\.9|旧形式|以前の形式/);
 }
});
test('standard source is preferred and legacy-only does not silently become standard',()=>{
 const both={cashflow:{expenseCategories:[{key:'old'}],detailSourceProfile:'public-v0.9'},expenseDetail:{monthlyCategories:[{key:'standard'}]},expenseWorkflow:{lastApply:{sourceProfile:'public-v0.9'}}};
 assert.equal(expenseDisplayProfile(both),'work-v0.9.7');
 assert.equal(expenseDisplayProfile({cashflow:{expenseCategories:[{key:'old'}]}}),null);
});
test('legacy data remain available to explicit internal compatibility path',()=>{
 const old={cashflow:{expenseCategories:[{key:'old'}]}};
 const before=JSON.stringify(old);
 assert.equal(expenseDisplayProfile(old,'public-v0.9'),'public-v0.9');
 assert.equal(JSON.stringify(old),before);
});
test('expense editor does not auto-target an arbitrary existing row',()=>{
 const src=fs.readFileSync(new URL('./detail-ui.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(src,/entries\\[0\\]\\.path/);
 assert.match(src,/if\\(kind==='expense'&&e\\.target\\.name==='target'\\)/);
});
