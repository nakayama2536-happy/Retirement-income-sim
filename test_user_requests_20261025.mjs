import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {CLOUD_ACTIONS,CLOUD_DISPLAY_NUMBERS} from './sync-panel.mjs';
const txt=p=>fs.readFileSync(new URL(p,import.meta.url),'utf8');
const html=txt('./index.html'),app=txt('./app.mjs'),layout=txt('./simple-layout.mjs');
const salary=txt('./salary-ui.mjs'),css=txt('./styles.css');
const controller=txt('./sync-controller.mjs'),ui=txt('./sync-panel.mjs');

test('R01: starting asset is correctly labeled as previous-age year-end, not the first simulated year-end',()=>{
 assert.match(app,/initialAssetLabel'\)\.textContent=`\$\{start-1\}歳期末想定資産`/);
 assert.match(app,/initialAssetHelp'\)\.textContent=`\$\{start\}歳期の計算開始残高/);
 assert.match(app,/initialAssetSettingLabel'\)\.textContent=`\$\{Number\(p.startAge\)-1\}歳期末資産/);
 assert.match(html,/id="currentAsset"/);
 assert.match(html,/id="initialAssetHelp"/);
 assert.doesNotMatch(app.slice(app.indexOf('function renderHome()'),app.indexOf('function renderExpenseDetail(')),/config\.plan\.initialAsset\s*=/);
});
test('R02-R05: pending assumptions and three explanations are independent accessible disclosure widgets',()=>{
 for(const label of ['保留事項（試算の仮定・要確認）','入力値の確度','試算条件','根拠となる制度と基準日'])assert.ok(layout.includes(label));
 assert.match(layout,/pendingBox\.querySelector\('summary'\)\.append\(byId\('pendingCount'\)\)/);
 for(const id of ['pendingList','checks','integritySummary','reviewAlerts','certaintySummary','calculationBasis','sourceStatus'])assert.ok(html.includes('id="'+id+'"'));
 assert.match(css,/\.home-explanation>summary/);
});
test('R06: age-year table header and leading age are CSS sticky, with its own bounded scroll container',()=>{
 assert.match(html,/class="table-wrap cashflow-table-scroll" role="region"/);
 assert.match(html,/id="yearCashflowTable"/);
 assert.match(css,/#yearCashflowTable thead th\{position:sticky;top:0/);
 assert.match(css,/#yearCashflowTable tr>th:first-child,#yearCashflowTable tr>td:first-child\{position:sticky;left:0/);
});
test('R08: salary fieldsets are wrapped in native details, but underlying four input names and form submit are retained',()=>{
 assert.match(salary,/salaryFieldsHtml\s*\.replace/);
 assert.match(salary,/salary-step/);
 assert.match(salary,/addEventListener\('invalid'/);
 for(const id of ['salary_lastSalaryMonth','salary_monthlyAddition','salary_monthlyWithdrawal','salary_pre65MonthlyBudget','salary_laborMode'])assert.ok(salary.includes('id="'+id+'"'));
 assert.match(html,/id="salaryForm"/);
});
test('R09: displayed ①②③④ is only a stable mapping over the previous secure action IDs',()=>{
 assert.deepEqual(['1','4','2','3'].map(key=>CLOUD_DISPLAY_NUMBERS[key]),['①','②','③','④']);
 assert.equal(CLOUD_DISPLAY_NUMBERS['3b'],'④-B');
 assert.deepEqual(['1','4','2','3'].map(key=>CLOUD_ACTIONS[key]),[
  'ログイン・ロック解除して開始','保存状況と差分を確認','今すぐクラウドに書き込む','クラウドの最新版を読み込む']);
 for(const fragment of ['action(checkActions,4)','for(const n of [2,3])','previewOK','conflictBackupDigest','data-sync-conflict-backup'])assert.ok(ui.includes(fragment));
 assert.match(ui,/手動更新は②の差分確認後に行えます/);
 assert.match(ui,/②だけで保存内容を確認でき、データは変更されません/);
 assert.doesNotMatch(ui,/④だけで保存内容を確認でき、データは変更されません/);
 assert.match(controller,/②で差分を再確認/);
});
test('R10: backup/sync is a real independent tab and reuses original import/export/recovery controls',()=>{
 assert.match(html,/data-group-item="manage" data-tab="backup"/);
 assert.match(html,/section id="backup" class="panel" hidden/);
 assert.match(layout,/host:byId\('backup'\)/);
 for(const id of ['privateSyncCard','importFile2','exportFullBtn','exportBtn','recoveryCheckFile'])assert.match(html,new RegExp(`id="${id}"`));
 assert.match(layout,/byId\('recoveryCheckFile'\)\?\.closest\('article'\)/);
 assert.match(css,/:is\(#settings,#backup\) \.settings-category/);
});
test('R07: death-month request is not silently adopted without financial event rules',()=>{
 assert.doesNotMatch(html,/id="deathDate|id="deathMonth/);
 assert.doesNotMatch(app,/deathDate\s*=|deathMonth\s*=/);
});
