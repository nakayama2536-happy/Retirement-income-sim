import assert from 'node:assert/strict';
import { navigationNumber, numberExpenseDetailTree, assignReferenceNumber } from '../ui-numbering.mjs';

assert.equal(navigationNumber('results','mortality'),'1-3');
assert.equal(navigationNumber('expense','expenses'),'4-1');
assert.equal(navigationNumber('missing','x'),null);

function fakeSummary() {
  return {nodeType:1,dataset:{},childNodes:[{nodeType:3,textContent:'Expense category'}],
    classList:{toggle(){}},setAttribute(k,v){this[k]=v;}};
}
function category(children=[]) {
  const summary=fakeSummary();
  return {summary, children, matches(s){return s==='details';},
    querySelector(s){return s===':scope > summary'?summary:null;}};
}
const child=category();
const first=category([child]);
const second=category();
const host={children:[first,second]};
numberExpenseDetailTree(host);
assert.equal(first.summary.dataset.stepNo,'4-1-3-3');
assert.equal(second.summary.dataset.stepNo,'4-1-3-4');
assert.equal(child.summary.dataset.stepNo,'4-1-3-3-1');
numberExpenseDetailTree(host,'4-1-3-8');
assert.equal(first.summary.dataset.stepNo,'4-1-3-8');
assert.equal(second.summary.dataset.stepNo,'4-1-3-9');
assert.equal(child.summary.dataset.stepNo,'4-1-3-8-1');
assignReferenceNumber(first.summary,'4-1-3-8');
assert.equal(first.summary.dataset.stepNo,'4-1-3-8');
console.log('UI numbering reference regression: PASS');
