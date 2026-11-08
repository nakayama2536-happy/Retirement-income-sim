import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('./app.mjs',import.meta.url),'utf8');

test('家族向け入口は既存の読み取り・比較・予算画面だけへ移動する',()=>{
  const block=html.match(/<nav class="card" aria-label="家族向けのかんたん操作"[\s\S]*?<\/nav>/)?.[0];
  assert.ok(block,'家族向け入口が存在する');
  const targets=[...block.matchAll(/<button[^>]+data-open-tab="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(targets,['cashflow','mortality','budget']);
  for(const target of targets){
    assert.match(html,new RegExp('<section id="'+target+'"'));
    assert.match(html,new RegExp('data-tab="'+target+'"'));
  }
  assert.equal((block.match(/<button /g)||[]).length,3);
  assert.equal((block.match(/type="button"/g)||[]).length,3);
  assert.ok(!/data-(?:apply|save|delete|restore)|type="submit"/.test(block));
});

test('家族向け入口は既存の画面移動経路を使い保存処理を呼ばない',()=>{
  assert.match(app,/document\.addEventListener\('click',\s*e=>\{[\s\S]*?closest\('\[data-open-tab\]'\)/);
  assert.match(app,/switchTab\(navigation\.dataset\.openTab\)/);
  assert.match(html,/見るだけでは現在の計画や保存データは変わりません/);
  assert.match(html,/試算と保存は別の操作です/);
});

test('将来資産を示してから操作入口を表示し、3画面からホームに戻れる',()=>{
  const hero=html.indexOf('<div class="hero-grid">');
  const quick=html.indexOf('aria-label="家族向けのかんたん操作"');
  const guide=html.indexOf('id="familyFirstGuide"');
  assert.ok(hero>=0 && hero<quick && quick<guide);
  for(const target of ['cashflow','mortality','budget']){
    const section=html.split('<section id="'+target+'" class="panel" hidden>')[1];
    assert.ok(section?.startsWith('<div class="family-lite-back"'),'戻る導線が各画面の先頭にある');
    assert.match(section.slice(0,300),/data-open-tab="home"/);
  }
  const links=[...html.matchAll(/class="family-lite-back"/g)];
  assert.equal(links.length,4,'既存3画面と新設の遺族年金専用画面に戻る導線がある');
  assert.match(html,/<section id="survivorPension" class="panel" hidden><div class="family-lite-back"/);
});

test('家族向け操作ガイドは保存・反映を行わず、手順を示すだけ',()=>{
 const workflow=readFileSync(new URL('./workflow-tabs.mjs',import.meta.url),'utf8');
 const mortality=readFileSync(new URL('./mortality-ui.mjs',import.meta.url),'utf8');
 assert.match(workflow,/mortalityStepNext/);
 assert.match(workflow,/mortalityStepPrevious/);
 assert.match(workflow,/type='button'/);
 assert.match(workflow,/操作案内/);
 assert.match(mortality,/id=\\"mortalityOpenPension\\"/);
 assert.match(mortality,/details.open=true/);
 assert.match(mortality,/年金額の入力欄を開く/);
 assert.doesNotMatch(workflow,/localStorage|replaceState|commitState|submit\(/);
});
