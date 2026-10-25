// Source-level contract checks complement the full application browser checks.
// They must not accept inert/decorative replacement controls.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const text=p=>readFileSync(new URL(p,import.meta.url),'utf8');
const html=text('./index.html'),app=text('./app.mjs'),layout=text('./simple-layout.mjs');
const style=text('./styles.css'),firebase=text('./sync-firebase.mjs'),panel=text('./sync-panel.mjs');
test('1-1 top bar has no generic subtitle and retains the app title',()=>{
 const bar=html.match(/<header class="topbar">([\s\S]*?)<\/header>/)?.[1];
 assert.ok(bar);assert.match(bar,/<h1>ライフプランシミュレーター<\/h1>/);
 assert.doesNotMatch(bar,/<p[ >]/);assert.doesNotMatch(bar,/条件を設定し、収支と資産の変化を確認/);
});
test('1-2 separately named release, legal basis and authoritative cloud save time',()=>{
 for(const id of ['appVersion','rulesVersion','cloudDataSavedAt'])assert.match(html,new RegExp(`id="${id}"`));
 assert.match(app,/el\('rulesVersion'\)\.textContent=RULES\.asOf/);
 assert.match(firebase,/stamp\.toDate/);assert.match(firebase,/updatedAt/);
 assert.match(panel,/onCloudMetadata\(remote\?\.updatedAt\?\?null\)/);
 assert.match(panel,/pending-server-timestamp/);
 assert.match(app,/保存時刻は再照合待ち/);
});
test('2-1 home status is compact and still distinguishes saved from unadopted inputs',()=>{
 assert.doesNotMatch(html,/class="card simulation-context"/);
 assert.match(html,/id="simulationPeriod" class="home-plan-range"/);
 assert.match(app,/保存済みの計画：/);assert.match(app,/未反映の入力は含みません/);
});
test('3-1 age100 reference goal is offered independently from adopted age95 calculation',()=>{
 const detail=text('./detail-ui.mjs'),d=text('./detail-settings.mjs');
 assert.match(detail,/100-Number\(c\.plan\.startAge\)/);
 assert.match(detail,/現在の計算期間外/);
 assert.match(detail,/endAge=Number\(getState\(\)\.config\.plan\.endAge\)/); // Never reference out-of-scope c during form interaction.
 assert.match(d,/num\(d\.age,'目標年齢',Number\(c\.plan\.startAge\),100\)/);
 assert.match(detail,/全体シミュレーションに反映/);
});
test('4-1 numbered read-only inspection distinct from directional actions and ③-B retained',()=>{
 assert.match(panel,/日常の確認/);assert.match(panel,/手動の書込み・読込み/);
 assert.match(panel,/action\(checkActions,4\)/);assert.match(panel,/for\(const n of \[2,3\]\)/);
 assert.match(panel,/data-sync-conflict-backup/);assert.match(panel,/③-B-1/);
});
test('5-1 NISA/iDeCo monthly withdrawal labels and controls fit small screens',()=>{
 for(const kind of ['nisaWithdrawal','idecoWithdrawal','ideco'])assert.match(style,new RegExp(`data-detail-kind='${kind}'`));
 assert.match(style,/@media\(max-width:760px\)/);assert.match(style,/grid-template-columns:minmax\(0,1fr\)/);
 assert.match(style,/overflow-wrap:anywhere/);
});
test('6-1 all five settings groups reuse original editable nodes',()=>{
 for(const group of ['backup','finance','goals','compare','maintenance'])assert.match(layout,new RegExp(`group\\('${group}'`));
 for(const original of ['privateSyncCard','settingsCurrentSummary','settingsForm','detail-horizon','detail-goal','step8TrialCard','detailUndo']){
  assert.match(html,new RegExp(`id="${original}"`));assert.match(layout,new RegExp(`byId\\('${original}'\\)`));
 }
 assert.match(layout,/settings\.append\(box\)/);assert.match(layout,/body\.append\(node\)/);
});
