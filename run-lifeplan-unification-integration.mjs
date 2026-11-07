/**
 * Isolated integration harness for an explicitly provided local Git checkout.
 * Strictly read-only on repository; all edits and test execution are in OS temp.
 * No network, cloud, personal config, or GitHub writes. Run only on synthetic fixture repo.
 * node run-lifeplan-unification-integration.mjs /path/to/Retirement-income-sim
 */
import {spawnSync} from 'node:child_process';
import {cpSync,copyFileSync,existsSync,lstatSync,mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename,dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {patchExpenseSource} from './apply-expense-unification-coverage.mjs';
export const EXPECTED='3de8df5465b1484028bd7d1b1d9db7ddbf9df81a';
const LOCAL=dirname(fileURLToPath(import.meta.url));
const EXTRAS=['expense-unification-coverage.mjs','lifeplan-expense-migration-preflight.mjs','lifeplan-expense-unification-candidate.mjs','apply-expense-unification-coverage.mjs','expense-unification-coverage.test.mjs','lifeplan-expense-migration-preflight.test.mjs','lifeplan-expense-unification-candidate.test.mjs','test_unification_actual_engine.mjs','lifeplan-unification-equivalence.mjs','lifeplan-unification-equivalence.test.mjs'];
const REGRESSION=['test_mortality_comparison.mjs','test_mortality_itemized.mjs','test_mortality_expense_source_selection.mjs','test_mortality_expense_totals.mjs','test_mortality_unidentified_remainder.mjs','test_mortality_expense_preset.mjs','test_mortality_stale_budget_guard.mjs','test_mortality_price_columns.mjs','test_age_expense_reconciliation_preview.mjs','test_expense_preview.mjs','test_expense_ui.mjs','test_expense_workflow.mjs','test_service_worker.mjs'];
function command(cmd,args,cwd){const r=spawnSync(cmd,args,{cwd,encoding:'utf8',maxBuffer:20*1024*1024,timeout:120000});if(r.error||r.status!==0)throw Error(`${cmd} ${args.join(' ')} failed: ${r.error?.message||r.stderr?.slice(-1500)||r.stdout?.slice(-1500)}`);return r.stdout.trim();}
export function inspectCheckout(repo,{expected=EXPECTED}={}){
 const root=resolve(repo);
 const sha=command('git',['rev-parse','HEAD'],root);
 if(sha!==expected)throw Error(`WRONG_COMMIT ${sha} (expected ${expected})`);
 const changed=command('git',['status','--porcelain','--untracked-files=no'],root);
 if(changed)throw Error('DIRTY_TRACKED_FILES');
 const tracked=command('git',['ls-files','-z'],root).split('\0').filter(Boolean);
 if(!tracked.includes('cashflow-sources.mjs'))throw Error('MISSING_UPSTREAM_FILE');
 return {root,sha,tracked};
}
/** Copy only git-tracked paths; never copy personal untracked files. */
export function prepareIsolatedCheckout(repo,settings={}){
 const {root,sha,tracked}=inspectCheckout(repo,settings);
 const stage=mkdtempSync(join(tmpdir(),'lifeplan-unification-'));
 try{
  for(const path of tracked){const source=join(root,path),target=join(stage,path);const stat=lstatSync(source);if(!stat.isFile())throw Error(`NON_REGULAR_TRACKED_FILE ${path}`);mkdirSync(dirname(target),{recursive:true});copyFileSync(source,target);}
  for(const path of EXTRAS){if(existsSync(join(stage,path)))throw Error(`STAGING_NAME_COLLISION ${path}`);copyFileSync(join(LOCAL,path),join(stage,path));}
  const main=join(stage,'cashflow-sources.mjs');
  const patch=patchExpenseSource(readFileSync(main,'utf8'));
  if(!patch.changed)throw Error('UPSTREAM_ALREADY_PATCHED');
  writeFileSync(main,patch.content);
  return {stage,sha,trackedCount:tracked.length};
 }catch(e){rmSync(stage,{recursive:true,force:true});throw e;}
}
export function requiredIntegrationTests(){
 return [...EXTRAS.filter(x=>x.endsWith('.test.mjs') || x==='test_unification_actual_engine.mjs'),...REGRESSION];
}
export function runIntegration(repo,settings={}){
 const {stage,sha,trackedCount}=prepareIsolatedCheckout(repo,settings);
 try{
  const requested=requiredIntegrationTests();
  const missing=REGRESSION.filter(x=>!existsSync(join(stage,x)));
  if(missing.length)throw Error(`MISSING_EXPECTED_TESTS ${missing.join(',')}`);
  const proc=spawnSync(process.execPath,['--test',...requested],{cwd:stage,encoding:'utf8',timeout:180000,maxBuffer:20*1024*1024});
  return {sha,trackedCount,testsRequested:requested,status:proc.status,stdout:proc.stdout?.slice(-14000),stderr:proc.stderr?.slice(-4000),error:proc.error?.message||null,sourceUnchanged:true};
 }finally{rmSync(stage,{recursive:true,force:true});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const path=process.argv[2];if(!path)throw Error('Provide the path to a clean checkout of the pinned main commit');
 const report=runIntegration(path);
 console.log(JSON.stringify(report,null,2));
 if(report.status!==0)process.exitCode=1;
}