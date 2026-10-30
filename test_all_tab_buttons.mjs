import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('./styles.css',import.meta.url),'utf8');
const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
test('全タブ共通の主操作・補助操作・無効・キーボード表示が定義されている',()=>{
  assert.match(css,/Shared action-button clarity for all tabs/);
  for(const target of [
    '.panel button.primary:not(:disabled)',
    '.panel button.secondary:not(:disabled)',
    '.panel button.primary:disabled',
    '.panel button.link-btn:not(:disabled)',
    '.panel button:focus-visible',
    'prefers-reduced-motion:reduce'
  ])assert.ok(css.includes(target),target);
  assert.match(css,/min-height:44px/);
  assert.match(css,/opacity:1;/);
});
test('結果・収入・支出・設定のナビゲーションと主要ボタンの定義を保持',()=>{
  for(const group of ['results','income','expense','manage'])assert.ok(html.includes('data-group="'+group+'"'),group);
  for(const tab of ['home','cashflow','mortality','scenarios','pension','salary','expenses','settings','backup'])assert.ok(html.includes('data-tab="'+tab+'"'),tab);
  assert.match(html,/id="pensionApply"/);
  assert.match(html,/id="salaryApply"/);
});
