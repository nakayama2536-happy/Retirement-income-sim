import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
test('six results pages use family-readable labels and preserve tab ids',()=>{
 for(const [id,label] of [['home','将来のお金の見通し'],['cashflow','年齢ごとの収入・支出'],['mortality','もしものときの家計'],['scenarios','暮らし方のプラン比較'],['allcsv','詳しい計算結果・保存'],['review','AIに相談する']]){
   assert.match(html,new RegExp('data-tab="'+id+'"[^>]*>'+label));
   assert.ok(html.includes('<section id="'+id+'"'));
 }
 assert.match(html,/自動送信されません/);
 assert.match(html,/試算であり、将来の資産額を保証するものではありません/);
 assert.match(html,/試算しただけでは、現在の計画や保存済みの金額は変更されません/);
});