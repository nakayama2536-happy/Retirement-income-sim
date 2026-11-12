import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeAnswer} from './action-answer.mjs';
import {syncAnswerFromResult} from './sync-answer-bridge.mjs';
const source=name=>readFileSync(new URL(name,import.meta.url),'utf8');
test('verified completion never inferred from a click or preview',()=>{
 assert.throws(()=>normalizeAnswer({kind:'success',body:'保存',confirmed:false}));
 assert.equal(normalizeAnswer({kind:'success',body:'保存',confirmed:true}).kind,'success');
 assert.equal(syncAnswerFromResult({status:'PREVIEW'},'確認').kind,'info');
 assert.equal(syncAnswerFromResult({status:'SYNCED'},'一致').kind,'info');
 assert.equal(syncAnswerFromResult({status:'BACKUP_STARTED'},'開始').kind,'info');
 assert.equal(syncAnswerFromResult({status:'UPLOADED'},'サーバー保存').kind,'success');
 assert.equal(syncAnswerFromResult({status:'DOWNLOADED'},'取込み').kind,'success');
 assert.equal(syncAnswerFromResult({status:'CONFLICT'},'競合').kind,'warning');
 assert.equal(syncAnswerFromResult({status:'STOP'},'停止').kind,'error');
});
test('two explicit vertical guided paths retain original controls',()=>{
 const ui=source('./sync-two-flows.mjs');
 assert.match(ui,/パソコンからクラウドへ保存/);
 assert.match(ui,/スマホでクラウドから読み込む/);
 for(const label of ['接続・暗号化解除','保存内容の差分を確認','バックアップを確認','保存・読込を実行','操作結果を確認'])assert.ok(ui.includes(label),label);
 assert.match(ui,/actions\[4\]\.textContent/);
 assert.doesNotMatch(ui,/\.cloneNode\(/);
 assert.doesNotMatch(ui,/\.click\(\)/);
});
test('integration preserves original sync handlers and no automatic success',()=>{
 const panel=source('./sync-panel.mjs');
 assert.match(panel,/organiseSyncTwoFlows/);
 assert.match(panel,/syncAnswerFromResult\(r,cloudResultText\(r\)\)/);
 for(const n of [2,3,6,7])assert.match(panel,new RegExp('actions\\['+n+'\\]\\.addEventListener'));
 assert.match(panel,/acceptLocalUpdate\(\)/);
 assert.match(panel,/acceptRemoteUpdate\(\)/);
 assert.match(panel,/initialUpload\(/);
 assert.match(panel,/initialDownload\(/);
});
test('offline package includes the new stylesheet and modules',()=>{
 const sw=source('./sw.js'),html=source('./index.html');
 for(const name of ['action-answer.mjs','action-answer.css','sync-answer-bridge.mjs','sync-two-flows.mjs','sync-two-flows.css'])assert.ok(sw.includes(name),name);
 assert.ok(html.includes('./action-answer.css'));
 assert.ok(html.includes('./sync-two-flows.css'));
 assert.doesNotMatch(html,/<article class="card" id="privateSyncCard"><details>/);
});
