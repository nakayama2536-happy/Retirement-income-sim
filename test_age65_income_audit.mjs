import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
const app=readFileSync(new URL('./app.mjs',import.meta.url),'utf8');

test('65歳期の収入検算は読取表示で採用・保存を伴わない',()=>{
 assert.match(html,/id="age65IncomeAudit"/);
 assert.match(app,/function renderAge65IncomeAudit\(\)/);
 assert.match(app,/renderYearTable\(\); renderAge65IncomeAudit\(\)/);
 const body=app.split('function renderAge65IncomeAudit(){')[1].split('\nfunction renderYearTable()')[0];
 assert.match(body,/row\.totalIncome/);
 assert.match(body,/idecoLump=sumDetail\('iDeCo\/DC一時金（資産計上額）'\)/);
 assert.match(body,/Math\.abs\(actual-total\)<1e-6/);
 assert.match(body,/受取予定であり支給確定ではありません/);
 assert.match(body,/iDeCoを開始資産に含めていない場合に限り/);
 assert.match(body,/税額は退職金との受取順序/);
 assert.doesNotMatch(body,/commitPlanState|replaceState|localStorage|fetch\(|saveState|config\s*=/);
});

test('65歳期の例示値は本人の実金額を固定せず動的に表示する',()=>{
 const body=app.split('function renderAge65IncomeAudit(){')[1].split('\nfunction renderYearTable()')[0];
 for(const name of ['row.labor','row.pension','row.idecoAnnuity','row.unemployment','row.extraIncome'])assert.ok(body.includes(name),name);
 for(const privateValue of ['824.64','1153.76','179.12','120.00'])assert.ok(!body.includes(privateValue),'実例金額を埋め込まない');
});
