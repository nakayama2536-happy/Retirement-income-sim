/**
 * Apply the read-only integration to a COPY of upstream cashflow-sources.mjs.
 * Run on pinned v0.9.38 source (SHA 3de8df5...). Idempotent and fail-closed.
 * Does not edit any other file or write to GitHub.
 *
 * node apply-expense-unification-coverage.mjs ./cashflow-sources.mjs ./candidate/cashflow-sources.mjs
 */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
const importLine="import {stagedExpenseCoverageGuard} from './expense-unification-coverage.mjs';";
const anchor='const PUBLIC = \'public-v0.9\', WORK = \'work-v0.9.7\';';
const ruleAnchor='  const all=view.rules.filter(r=>r.itemId === itemId && r.profile === profile);';
const inserted='  const stagedCoverage=stagedExpenseCoverageGuard(view,v,all,age);\n  if(stagedCoverage)return stagedCoverage;';
export function patchExpenseSource(source){
 if(typeof source!=='string')throw new TypeError('Source is not text');
 const hasImport=source.includes(importLine),hasGuard=source.includes(inserted);
 if(hasImport!==hasGuard)throw Error('partial-integration-detected');
 if(hasImport)return {content:source,changed:false};
 if(source.split(anchor).length!==2||source.split(ruleAnchor).length!==2)throw Error('upstream-code-anchor-drift');
 let result=source.replace(anchor,importLine+'\n'+anchor).replace(ruleAnchor,ruleAnchor+'\n'+inserted);
 if(result===source)throw Error('no-patch-applied');
 return {content:result,changed:true};
}
if(process.argv[1]&&resolve(process.argv[1])===new URL(import.meta.url).pathname){
 const [src,dest]=process.argv.slice(2);
 if(!src||!dest)throw Error('input path and separate output path are required');
 if(resolve(src)===resolve(dest))throw Error('in-place-patching-is-prohibited');
 const result=patchExpenseSource(readFileSync(src,'utf8'));
 mkdirSync(dirname(dest),{recursive:true});
 writeFileSync(dest,result.content,{flag:'wx'});
 console.log(JSON.stringify({changed:result.changed,destination:dest}));
}