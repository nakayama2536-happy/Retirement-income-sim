import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {APP_BUILD} from './backup-compatibility.mjs';
import {collect} from './tools/package-public.mjs';

const ROOT=path.dirname(fileURLToPath(import.meta.url));
const read=path=>fs.readFileSync(new URL(path,import.meta.url),'utf8');
const app=read('./app.mjs'),sw=read('./sw.js'),packager=read('./tools/package-public.mjs');
const deployed=JSON.parse(read('./distribution-manifest.json'));

// The display, backup contract, offline scope, and deployed manifest must all
// describe the SAME build. A prior discrepancy was only detected on-device.
test('公開候補の版番号は画面・バックアップ・SW・manifest・配布生成で一致',()=>{
  const ui=app.match(/el\('appVersion'\)\.textContent='([^']+)'/)?.[1];
  const cache=sw.match(/const CACHE=`\$\{CACHE_PREFIX\}([^`]+)`/)?.[1];
  const packaged=packager.match(/runtime:'([^']+)',files/)?.[1];
  assert.ok(ui&&cache&&packaged,'missing release identity');
  assert.equal(ui,APP_BUILD);
  assert.equal(cache,APP_BUILD);
  assert.equal(packaged,APP_BUILD);
  assert.equal(deployed.runtime,APP_BUILD);
});

test('本番候補に旧公開版・RC・未公開の誤認ラベルを残さない',()=>{
  assert.ok(APP_BUILD.startsWith('v0.9.7-step9-'));
  assert.notEqual(APP_BUILD,'v0.9.7-ui-simple-20261012');
  for(const value of [APP_BUILD,app.match(/el\('appVersion'\)\.textContent='([^']+)'/)?.[1],sw.match(/const CACHE=`\$\{CACHE_PREFIX\}([^`]+)`/)?.[1],deployed.runtime]){
    assert.ok(value);
    assert.doesNotMatch(value,/\brc\b|未公開|\bdev\b/);
  }
});

test('登録済み配布manifestと実際の資材はバイト一致',()=>{
  const {out}=collect(ROOT);
  const expected=out.get('distribution-manifest.json');
  assert.ok(expected);
  assert.equal(read('./distribution-manifest.json'),expected.toString('utf8'));
  assert.equal(deployed.files.length,51);
  for(const entry of deployed.files){assert.ok(out.has(entry.name),entry.name);}
});

test('更新時に旧版キャッシュと現行端末データを自動消去しない',()=>{
  assert.doesNotMatch(sw,/caches\.delete\s*\(/);
  assert.doesNotMatch(sw,/(?:self\.)?skipWaiting\s*\(/);
  assert.doesNotMatch(sw,/clients\.claim\s*\(/);
  assert.doesNotMatch(sw,/localStorage|indexedDB/);
});

test('ユーザーの保存設定を公開梱包物に混入させない',()=>{
  const {out}=collect(ROOT);
  assert.ok(![...out.keys()].some(name=>/backup.*\.json|personal|^test_|private|\.env/i.test(name)));
  assert.equal(out.has('sw.js'),true);
});
