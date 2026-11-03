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
