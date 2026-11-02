// Validate complete release dependency closure without modifying user data.
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {collect} from './tools/package-public.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
test('比較画面4モジュールの配布登録を維持し、欠落を拒否する',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'lifeplan-age-bundle-'));
 try{
  const src=path.join(tmp,'src');fs.cpSync(root,src,{recursive:true});
  const sw=path.join(src,'sw.js'),original=fs.readFileSync(sw,'utf8');
  const assets=['age-budget-ui.mjs','age-budget-candidate.mjs','age-budget-preview-export.mjs','discretionary-travel.mjs'];
  const before=collect(src);
  for(const name of assets)assert.ok(before.runtime.includes(name));
  const missing=original.replace('"./age-budget-ui.mjs",','');
  assert.notEqual(missing,original);
  fs.writeFileSync(sw,missing);
  assert.throws(()=>collect(src),/missing-import:app.mjs:age-budget-ui.mjs/);
  fs.writeFileSync(sw,original);
  assert.deepEqual(collect(src).runtime,before.runtime);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
