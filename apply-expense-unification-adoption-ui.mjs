/** Apply test-only adoption UI and compatible feature to an isolated checkout.
 * Must run AFTER apply-expense-unification-review.mjs.
 * Original checked-in runtime is not modified.
 */
import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {patchExpenseSource} from './apply-expense-unification-coverage.mjs';
const source=resolve(fileURLToPath(new URL('.',import.meta.url)));
export function patchIsolatedAdoption(target){
 const root=resolve(target);if(root===source)throw Error('SOURCE_DIR_PROTECTED');
 const read=p=>readFileSync(join(root,p),'utf8');
 const insert=(s,anchor,addition)=>{
   if(s.includes(addition))throw Error('ALREADY_PATCHED');
   if(s.split(anchor).length!==2)throw Error('UNEXPECTED_UPSTREAM_ANCHOR: '+anchor);
   return s.replace(anchor,addition+'\n'+anchor);
 };
 let app=read('app.mjs'),compat=read('backup-compatibility.mjs'),cashflow=read('cashflow-sources.mjs');
 if(!app.includes('mountExpenseUnificationReview')||!compat.includes("'mortality-expense-preset-v1'"))throw Error('MISSING_REVIEW_OR_BACKUP_ANCHOR');
 app=insert(app,"import {mountExpenseSheet} from './expense-ui.mjs';","import {mountExpenseUnificationAdoptionUi} from './lifeplan-expense-unification-adoption-ui.mjs';");
 app=insert(app,'const incomeSheet=mountIncomeSheet(',"const expenseUnificationAdoptionUi=mountExpenseUnificationAdoptionUi({getState:()=>({config,scenarios}),writeAllowed:()=>writeAccess.writable,onCommit:()=>{const saved=loadState();config=saved.config;scenarios=saved.scenarios;refresh();}});");
 const refresh='function refresh({calculated=null}={}) {';
 if(app.split(refresh).length!==2)throw Error('REFRESH_ANCHOR_MISSING');
 app=app.replace(refresh,refresh+'\n  expenseUnificationAdoptionUi.clear();');
 const k="'mortality-expense-preset-v1'";
 compat=compat.replace(k,k+",'legacy-expense-unification-v1'");
 if(compat===read('backup-compatibility.mjs'))throw Error('COMPAT_PATCH_FAILED');
 const mod=['lifeplan-expense-unification-adoption-ui.mjs','lifeplan-expense-unification-transaction.mjs','lifeplan-expense-unification-adoption.mjs','expense-unification-coverage.mjs'];
 const changed=['app.mjs','backup-compatibility.mjs','cashflow-sources.mjs',...mod];
 for(const m of mod){readFileSync(join(source,m),'utf8');}
 for(const m of mod)copyFileSync(join(source,m),join(root,m));
 const guarded=patchExpenseSource(cashflow);
 if(!guarded.changed)throw Error('COVERAGE_GUARD_ALREADY_INSTALLED');
 writeFileSync(join(root,'app.mjs'),app);writeFileSync(join(root,'backup-compatibility.mjs'),compat);writeFileSync(join(root,'cashflow-sources.mjs'),guarded.content);
 return {status:'patched',files:changed,originalUntouched:true};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log(JSON.stringify(patchIsolatedAdoption(process.argv[2])))}catch(e){console.error(e.message);process.exitCode=1;}
}
