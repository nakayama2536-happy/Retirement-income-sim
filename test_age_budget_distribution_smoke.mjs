import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {stageAgeBudgetRelease} from './tools/stage-age-budget-release.mjs';
import {spawnSync} from 'node:child_process';
const source=path.dirname(fileURLToPath(import.meta.url));
test('公開候補のHTTP配信相当バイトとmanifestのSHA-256がすべて一致',async()=>{
 const crypto=await import('node:crypto');
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'lifeplan-http-smoke-'));
 try{
  const stage=path.join(tmp,'stage'),publicDir=path.join(tmp,'public');
  stageAgeBudgetRelease(source,stage,'v0.9.34-age-budget-preview-validation-20261103');
  const built=spawnSync(process.execPath,[path.join(stage,'tools/package-public.mjs'),stage,publicDir],{encoding:'utf8',timeout:30000});
  assert.equal(built.status,0,built.stderr);
  const manifest=JSON.parse(fs.readFileSync(path.join(publicDir,'distribution-manifest.json'),'utf8'));
  for(const f of manifest.files){
   const data=fs.readFileSync(path.join(publicDir,f.name));
   assert.equal(data.byteLength,f.size,f.name+' size');
   assert.equal(crypto.createHash('sha256').update(data).digest('hex'),f.sha256,f.name+' digest');
  }
  const app=fs.readFileSync(path.join(publicDir,'app.mjs'),'utf8');
  const sw=fs.readFileSync(path.join(publicDir,'sw.js'),'utf8');
  assert.match(app,/import \{mountAgeBudgetComparison\} from '\.\/age-budget-ui\.mjs'/);
  for(const name of ['age-budget-ui.mjs','age-budget-candidate.mjs','age-budget-preview-export.mjs','discretionary-travel.mjs'])assert.ok(fs.existsSync(path.join(publicDir,name)),name);
  assert.match(sw,/age-budget-ui\.mjs/);
  assert.ok(!fs.existsSync(path.join(publicDir,'test_age_budget_ui.mjs')));
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
