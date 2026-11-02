// Dry-run release guard. Does not modify main, Service Worker, manifest or local user data.
import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {collect} from './tools/package-public.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
test('比較画面を配布する際は依存モジュール4件を全て梱包する',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'lifeplan-age-bundle-'));
 try{
  const src=path.join(tmp,'src');fs.cpSync(root,src,{recursive:true});
  const app=path.join(src,'app.mjs'),sw=path.join(src,'sw.js');
  fs.writeFileSync(app,"import {mountAgeBudgetComparison} from './age-budget-ui.mjs';\n"+fs.readFileSync(app,'utf8'));
  const original=fs.readFileSync(sw,'utf8');
  assert.throws(()=>collect(src),/missing-import:app.mjs:age-budget-ui.mjs/);
  const assets=["age-budget-ui.mjs","age-budget-candidate.mjs","age-budget-preview-export.mjs","discretionary-travel.mjs"];
  fs.writeFileSync(sw,original.replace('const URLS=','ASSETS.push('+assets.map(x=>JSON.stringify('./'+x)).join(',')+');\nconst URLS='));
  const result=collect(src),names=new Set(result.runtime);
  for(const f of assets)assert.ok(names.has(f));
  assert.equal(result.runtime.length,collect(root).runtime.length+assets.length);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
