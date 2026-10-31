import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('./mortality-ui.mjs',import.meta.url),'utf8');
test('受給開始前にも65歳基準と遺族厚生参考額を表示',()=>{
 assert.match(source,/const beforeClaim=!dateParts\(start\)/);
 assert.match(source,/if\(beforeClaim\)\{/);
 assert.match(source,/老齢基礎年金・65歳基準/);
 assert.match(source,/老齢厚生年金・65歳基準/);
 assert.match(source,/遺族厚生年金・65歳基準の参考差額/);
 assert.match(source,/受給権・繰下げ影響未確認のため未確定/);
 assert.match(source,/受給前の合計を自動入力しません/);
});
