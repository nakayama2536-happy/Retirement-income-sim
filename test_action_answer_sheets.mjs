import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Document} from './tools/cloud-ui-test/dom.mjs';
import {mountActionAnswer} from './action-answer.mjs';

test('アンサーはボタン直下に現れ、試算と保存完了を厳密に区別',()=>{
 const doc=new Document(),root=doc.createElement('div'),button=doc.createElement('button');
 root.append(button);const feedback=mountActionAnswer(button);
 assert.equal(root.children[1],feedback.node);
 feedback.show({kind:'info',body:'試算できました。現在の計画は未変更です。'});
 assert.equal(feedback.node.dataset.kind,'info');
 assert.match(feedback.node.textContent,/未保存/);
 assert.throws(()=>feedback.show({kind:'success',body:'保存しました'}),/実処理の確認/);
 feedback.show({kind:'success',body:'保存済みです。',confirmed:true});
 assert.equal(feedback.node.dataset.kind,'success');
 feedback.invalidate();
 assert.equal(feedback.node.dataset.kind,'warning');
 assert.match(feedback.node.textContent,/再確認/);
 feedback.show({kind:'error',body:'保存に失敗しました。'});
 assert.equal(feedback.node.getAttribute('role'),'alert');
 feedback.clear();assert.equal(feedback.node.hidden,true);
});

test('生活費・追加収入の試算・反映・取消だけに確認済みアンサーを追加',()=>{
 for(const name of ['expense-ui.mjs','income-ui.mjs']){
  const src=fs.readFileSync(new URL('./'+name,import.meta.url),'utf8');
  assert.match(src,/mountActionAnswer/);
  assert.match(src,/\['Trial','Apply','Undo'\]/);
  assert.match(src,/staleAnswers\(\)/);
  assert.match(src,/respond\('Trial','info'/);
  assert.match(src,/respond\(undo\?'Undo':'Apply','pending'/);
  assert.match(src,/respond\(undo\?'Undo':'Apply','error'/);
  assert.match(src,/respond\(undo\?'Undo':'Apply','warning'/);
  assert.match(src,/respond\(undo\?'Undo':'Apply','success'/);
  assert.match(src,/保存済みですが表示|保存処理は完了/);
 }
});
