/** Read-only UI connection on an isolated v0.9.38 checkout.
 * Do not execute on original repository or any deployed folder.
 * The caller is responsible for setting up a temporary, disposable copy.
 */
import {readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {copyFileSync} from 'node:fs';
const sourceDir=fileURLToPath(new URL('.',import.meta.url));
const importLine="import {mountExpenseUnificationReview} from './lifeplan-expense-unification-review.mjs';";
const initLine="const expenseUnificationReview=mountExpenseUnificationReview({getConfig:()=>config});";
const refreshLine="  expenseUnificationReview.clear();";
const uiLine="  ['#expenseUnificationReview > summary','4-1-6'],";
export function applyReadOnlyExpenseReviewOverlay(target){
 const root=resolve(target);
 if(root===resolve(sourceDir))throw Error('Do not patch source directory');
 const appFile=join(root,'app.mjs'), numberingFile=join(root,'ui-numbering.mjs');
 const app=readFileSync(appFile,'utf8'),numbering=readFileSync(numberingFile,'utf8');
 const insert=(value,anchor,replacement,name)=>{
  if(value.includes(replacement))throw Error('Overlay already installed: '+name);
  if(value.split(anchor).length!==2)throw Error('Unexpected upstream anchor: '+name);
  return value.replace(anchor,replacement+'\n'+anchor);
 };
 let updated=insert(app,"import {mountExpenseSheet} from './expense-ui.mjs';",importLine,'import');
 updated=insert(updated,'const incomeSheet=mountIncomeSheet(',initLine,'mount');
 const refreshAnchor='function refresh({calculated=null}={}) {';
 if(updated.split(refreshAnchor).length!==2)throw Error('Unexpected upstream anchor: refresh');
 updated=updated.replace(refreshAnchor,refreshAnchor+'\n'+refreshLine);
 // The details card is appended AFTER the existing 4-1-5 settings accordion.
 const numbered=insert(numbering,"  ['#periodEditForm','4-1-5-1'],",uiLine,'number');
 const mod='lifeplan-expense-unification-review.mjs';
 copyFileSync(join(sourceDir,mod),join(root,mod));
 // All anchors were verified before writing the replacement files.
 writeFileSync(appFile,updated);writeFileSync(numberingFile,numbered);
 return {installed:true,sourceUntouched:true,targets:['app.mjs','ui-numbering.mjs',mod]};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 try{const p=process.argv[2];if(!p)throw Error('Usage: node apply-expense-unification-review.mjs <isolated-repository-copy>');console.log(JSON.stringify(applyReadOnlyExpenseReviewOverlay(p)));}catch(e){console.error('Review UI overlay aborted: '+e.message);process.exitCode=1;}
}