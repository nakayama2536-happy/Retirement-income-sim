import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./mortality-ui.mjs',import.meta.url),'utf8');
test('死亡月から既存65歳内訳を参照する画面を保持',()=>{
 assert.match(source,/id="mortalityPensionAuto"/);
 assert.match(source,/a=own\?\.reference65,b=dead\?\.reference65/);
 assert.match(source,/estimateSurvivorReference65\(/);
 assert.match(source,/autoPension\(\)/);
});
test('未確認と受給前の自動採用を防ぐ',()=>{
 assert.match(source,/65歳未満または誕生日境界/);
 assert.match(source,/年金合計を自動採用しません/);
 assert.match(source,/if\(hypotheticalTotal!==null&&!hasGap&&actualValid&&form\.elements\.survivorPension\.value===''/);
 assert.match(source,/未反映の入力欄に補完しました/);
 assert.match(source,/老齢基礎年金（繰下げ参考年額）/);
 assert.match(source,/老齢厚生年金（繰下げ参考年額）/);
 assert.match(source,/遺族厚生年金の追加差額/);
 assert.match(source,/参考合計（登録年額/);
});
