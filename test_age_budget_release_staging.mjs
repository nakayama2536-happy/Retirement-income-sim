import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {stageAgeBudgetRelease} from './tools/stage-age-budget-release.mjs';
import {collect} from './tools/package-public.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
test('新しいリリース候補は隔離して生成し、元ファイルは不変',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'lifeplan-staged-'));
 try{
  const dest=path.join(tmp,'candidate'),before=fs.readFileSync(path.join(root,'app.mjs'));
  const r=stageAgeBudgetRelease(root,dest,'v0.9.34-age-budget-preview-validation-20261103');
  assert.deepEqual([r.status,r.published,r.runtimeFiles,r.manifestFiles],['staged-only',false,78,80]);
  assert.deepEqual(fs.readFileSync(path.join(root,'app.mjs')),before);
  const manifest=JSON.parse(fs.readFileSync(path.join(dest,'distribution-manifest.json'),'utf8'));
  assert.equal(manifest.runtime,'v0.9.34-age-budget-preview-validation-20261103');
  assert.deepEqual(manifest.files,JSON.parse(collect(dest).out.get('distribution-manifest.json').toString()).files);
  const sw=fs.readFileSync(path.join(dest,'sw.js'),'utf8');
  assert.doesNotMatch(sw,/caches\.delete\s*\(|skipWaiting\s*\(|clients\.claim\s*\(/);
  assert.match(fs.readFileSync(path.join(dest,'app.mjs'),'utf8'),/mountAgeBudgetComparison/);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('同一版・既存出力・不正な版を拒否する',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'lifeplan-staged-'));
 try{
  assert.throws(()=>stageAgeBudgetRelease(root,path.join(tmp,'old'),'v0.9.39-mortality-expense-audit-20261107'),/unchanged/);
  fs.mkdirSync(path.join(tmp,'existing'));
  assert.throws(()=>stageAgeBudgetRelease(root,path.join(tmp,'existing'),'v0.9.34-age-budget-preview-validation-20261103'),/destination-exists/);
  assert.throws(()=>stageAgeBudgetRelease(root,path.join(tmp,'draft'),'v0.9.33-draft-20261103'),/invalid-build-id/);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
