/**
 * Integration acceptance for the isolated release candidate, not the live app.
 * The candidate is produced by the same stage function as the planned release.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {stageAgeBudgetRelease} from './tools/stage-age-budget-release.mjs';
import {collect} from './tools/package-public.mjs';
const source=path.dirname(fileURLToPath(import.meta.url));
test('隔離公開候補で支出比較・CSV・配布整合・版識別の回帰テストが成功する',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'lifeplan-age-integration-'));
 try{
  const dest=path.join(tmp,'release');
  const stage=stageAgeBudgetRelease(source,dest,'v0.9.33-age-budget-preview-20261103');
  assert.equal(stage.published,false);
  const tests=['test_age_budget_candidate.mjs','test_age_budget_preview_export.mjs','test_age_budget_ui.mjs','test_age_budget_release_preflight.mjs','test_distribution_audit.mjs','test_release_identity.mjs'];
  const result=spawnSync(process.execPath,['--test',...tests],{cwd:dest,encoding:'utf8',timeout:120000,maxBuffer:8*1024*1024});
  assert.equal(result.error,undefined,result.error?.message);
  assert.equal(result.status,0,[(result.stdout||'').slice(-5000),(result.stderr||'').slice(-2000)].join('\n'));
  const manifest=JSON.parse(fs.readFileSync(path.join(dest,'distribution-manifest.json'),'utf8'));
  const out=collect(dest).out;
  assert.equal(manifest.files.length,out.size-1);
  for(const file of manifest.files)assert.ok(out.has(file.name),file.name);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
