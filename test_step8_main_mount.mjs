import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {collect} from './tools/package-public.mjs';
const read=f=>fs.readFileSync(new URL(f,import.meta.url),'utf8');
const app=read('./app.mjs'),html=read('./index.html'),sw=read('./sw.js');

test('step8 comparison card is retained on settings while backup uses its own tab',()=>{
  assert.match(html,/<section id="settings" class="panel" hidden>\s*<article[^>]*id="privateSyncCard"/);
  assert.match(html,/<article[^>]*id="step8TrialCard"/);
  assert.match(html,/<div id="privateSyncContainer"><\/div>/);
  assert.match(html,/<div id="step8TrialContainer"><\/div>/);
  assert.match(app,/import \{mountStep8TrialCard\} from '\.\/step8-trial-ui\.mjs'/);
  assert.match(app,/mountStep8TrialCard\(el\('step8TrialContainer'\),\(\)=>config\)/);
  assert.match(app,/detailUI\.render\(\);\s*step8TrialCard\.reset\(\);/);
});

test('step8 trial fields are excluded from existing saved dashboard input snapshot',()=>{
  assert.match(app,/input\.closest\([^\n]*#step8TrialContainer/);
  assert.ok(!app.includes("querySelectorAll('#step8TrialContainer input, #step8TrialContainer select')"));
});

test('trial modules have no persistence or adopting save/import actions',()=>{
  for(const name of ['step8-trial-ui.mjs','step8-trial-workflow.mjs','full-plan-ui.mjs','full-plan-comparison.mjs']){
    const code=read('./'+name);
    for(const forbidden of [/\blocalStorage\b/,/\bindexedDB\b/,/\bsaveState\s*\(/,/\bcommitPlanState\s*\(/,/\bfetch\s*\(/]){
      assert.doesNotMatch(code,forbidden,`${name}: ${forbidden}`);
    }
  }
  assert.match(html,/比較試算（未採用案の保存可）/);
});

test('offline candidate assets and module dependency closure are included',()=>{
  const {out,runtime}=collect(new URL('.',import.meta.url).pathname);
  for(const name of ['step8-trial-ui.mjs','step8-trial-workflow.mjs','full-plan-ui.mjs','full-plan-comparison.mjs','full-plan-saved.mjs','app.mjs','calc.mjs','retirement-comment.mjs','mortality-preview.mjs','mortality-comparison.mjs','mortality-ui.mjs']){
    assert.ok(out.has(name),name);
    assert.ok(runtime.includes(name),name);
    assert.match(sw,new RegExp("\\./"+name.replaceAll('.','\\.')));
  }
  assert.equal(runtime.length,66);
  assert.equal(out.size,69);
});

test('candidate service worker is versioned separately without cache deletion or forced update',()=>{
  assert.match(sw,/const CACHE=`\$\{CACHE_PREFIX\}v0\.9\.13-expense-source-20261031`/);
  assert.doesNotMatch(sw,/caches\.delete\(/);
  assert.doesNotMatch(sw,/skipWaiting\s*\(/);
});
