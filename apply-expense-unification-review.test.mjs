import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {applyReadOnlyExpenseReviewOverlay} from './apply-expense-unification-review.mjs';
const app=[
 "import {mountExpenseSheet} from './expense-ui.mjs';",
 'const incomeSheet=mountIncomeSheet(',
 'function refresh({calculated=null}={}) {',
 '  if(!config)return;',
 '}'
].join('\n');
const numbering="  ['#periodEditForm','4-1-5-1'],";
const sandbox=fn=>{const dir=mkdtempSync(join(tmpdir(),'expense-ui-review-'));try{writeFileSync(join(dir,'app.mjs'),app);writeFileSync(join(dir,'ui-numbering.mjs'),numbering);return fn(dir);}finally{rmSync(dir,{recursive:true,force:true});}};
test('staged copy connects a read-only card and clears on each app refresh',()=>sandbox(dir=>{
 const result=applyReadOnlyExpenseReviewOverlay(dir);assert.equal(result.installed,true);
 const s=readFileSync(join(dir,'app.mjs'),'utf8');
 assert.match(s,/import \{mountExpenseUnificationReview\}/);
 assert.match(s,/const expenseUnificationReview=mountExpenseUnificationReview\(\{getConfig:\(\)=>config\}\)/);
 assert.match(s,/function refresh\(\{calculated=null\}=\{\}\) \{\n  expenseUnificationReview\.clear\(\);/);
 assert.match(readFileSync(join(dir,'ui-numbering.mjs'),'utf8'),/4-1-6/);
 assert.equal(readFileSync(join(dir,'lifeplan-expense-unification-review.mjs'),'utf8').includes('host.append(card)'),true);
 assert.throws(()=>applyReadOnlyExpenseReviewOverlay(dir),/already installed/);
}));
test('missing anchor blocks without changing source',()=>sandbox(dir=>{
 writeFileSync(join(dir,'ui-numbering.mjs'),'malformed');
 assert.throws(()=>applyReadOnlyExpenseReviewOverlay(dir),/Unexpected upstream anchor/);
 assert.equal(readFileSync(join(dir,'app.mjs'),'utf8'),app);
}));