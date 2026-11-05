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
 assert.match(source,/確定額として試算欄には自動入力しません/);
 assert.doesNotMatch(source,/hypotheticalTotal\.toFixed/);
 assert.match(source,/automaticPensionValue=null/);
 assert.match(source,/65歳基準の参考合計は試算欄へ自動入力しません/);
 assert.match(source,/老齢基礎年金（繰下げ参考年額）/);
 assert.match(source,/老齢厚生年金（繰下げ参考年額）/);
 assert.match(source,/遺族厚生年金の追加差額/);
 assert.match(source,/公的年金合計（全て65歳基準・受給資格未確認）/);
 assert.match(source,/繰下げ後の遺族年金込み合計（内訳未確認）/);
});
