// Synthetic data only; this suite is not an iPhone lifecycle test.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {migrateConfig,loadState,saveState,STATE_KEY,configSignature} from './storage.mjs';
import {createFullBackup,restoreFullBackup} from './full-backup.mjs';
import {inspectMigration,migrateSelected,SOURCES,validateSavedState} from './migration.mjs';
import {assertBackupCompatibility,recoveryPair,APP_BUILD} from './backup-compatibility.mjs';
import {harness} from './test_service_worker.mjs';
import {checkRecoveryFile,mountRecoveryCheck} from './recovery-ui.mjs';
function fixture(asset=100){
 const config=migrateConfig({people:{primary:{birthDate:'1980-01-01'},spouse:{birthDate:'1981-01-01'}},plan:{startAge:64,endAge:72,startDate:'2044-01-01',initialAsset:asset,initialAssetIncludesIdeco:false,afterTaxReturn:0,inflation:0},income:{pensions:{primary:{annualAtStart:0},spouse:{annualAtStart:0}}},unemployment:{baselineMode:'none'},budgets:[{fromAge:64,toAge:72,annualBudget:10}],actuals:{65:{endAsset:98,unknown:'actual'}},reviews:{65:{memo:'check'}},events:[],future:{history:['one']}});
 return {schemaVersion:'0.9',config,scenarios:[{id:'a',name:'A',role:'scenario',selected:true,config:structuredClone(config)},{id:'b',name:'B',role:'reference',selected:false,config:structuredClone(config)}],unknown:{history:['one']}};
}
class Memory{
 data=new Map();writes=0;fail=false;hook=null;
 getItem(k){if(this.hook){const hook=this.hook;this.hook=null;hook(this);}return this.data.get(k)??null;}
 setItem(k,v){if(this.fail)throw new Error('QuotaExceeded');this.data.set(k,String(v));this.writes++;}
 removeItem(){throw new Error('Original keys must remain');}
}
const setup=()=>{globalThis.localStorage=new Memory();saveState(fixture());return loadState();};
const legacy=(storage,version='0.9',state=fixture())=>{const source=SOURCES.find(s=>s.id===`public-v${version}`);storage.data.set(source.configKey,JSON.stringify(state.config));storage.data.set(source.scenarioKey,JSON.stringify(state.scenarios));return source;};
test('I08 取得失敗後も旧本体用の全キャッシュバイトを保持',async()=>{
 const h=harness(),old=`lifeplan-sim:${encodeURIComponent(h.scope)}:old`,bytes=new Map([['app.mjs','old bundle'],['index.html','old html']]);h.stores.set(old,bytes);h.flags.failInstall=true;
 await assert.rejects(h.run('install'));assert.equal(h.stores.get(old),bytes);assert.deepEqual([...bytes.values()],['old bundle','old html']);assert.equal(h.takeovers(),0);
});
for(const flag of ['partialInstall','badResponse','failOpen','failMatch'])test(`I08 インストール失敗 ${flag} は旧版保持`,async()=>{
 const h=harness();h.stores.set('prior-complete',new Map([['old','ok']]));h.flags[flag]=true;
 await assert.rejects(h.run('install'));assert.ok(h.stores.has('prior-complete'));assert.equal(h.takeovers(),0);assert.deepEqual(h.deleted,[]);
});
test('I08 有効化中の読取り失敗でも旧版を失わない',async()=>{
 const h=harness();h.stores.set('prior-complete',new Map());await h.run('install');h.flags.failMatch=true;await assert.rejects(h.run('activate'),/CacheRead/);assert.ok(h.stores.has('prior-complete'));assert.deepEqual(h.deleted,[]);
});
test('I08 正常準備だけがactivateを完了し旧版を保持',async()=>{
 const h=harness();h.stores.set('prior-complete',new Map());await h.run('install');await h.run('activate');h.flags.offline=true;assert.equal((await h.fetchRequest(new Request(h.scope))).response.status,200);assert.ok(h.stores.has('prior-complete'));assert.equal(h.takeovers(),0);
});
test('I08 削除失敗を設定しても削除へ入らず両版保持',async()=>{
 const h=harness();h.stores.set('prior-complete',new Map());h.flags.failDelete=true;await h.run('install');await h.run('activate');assert.equal(h.deleted.length,0);assert.ok(h.stores.has('prior-complete'));assert.ok(h.current());
});
test('I08 更新完了後の部分欠損をネットワーク・旧資材で補完しない',async()=>{
 const h=harness();await h.run('install');await h.run('activate');h.stores.get(h.current()).delete(h.scope+'app.mjs');h.flags.offline=true;const r=await h.fetchRequest(new Request(h.scope+'app.mjs'));assert.equal(r.response.status,503);assert.equal(h.network.length,0);
});
test('I08 統合正常と新旧併存は現在状態を優先、全体不変',()=>{
 const s=setup();legacy(localStorage);legacy(localStorage,'0.8',fixture(90));const before=localStorage.getItem(STATE_KEY),inspection=inspectMigration();assert.equal(inspection.integrated.status,'valid');assert.throws(()=>migrateSelected(inspection,'public-v0.8'),/保持/);assert.equal(localStorage.getItem(STATE_KEY),before);assert.deepEqual(loadState(),s);
});
test('I08 統合破損から旧設定へ黙って戻らず候補を保持',()=>{
 globalThis.localStorage=new Memory();legacy(localStorage);localStorage.data.set(STATE_KEY,'{broken');const view=inspectMigration();assert.equal(view.integrated.status,'invalid');assert.throws(()=>loadState());assert.throws(()=>migrateSelected(view,'public-v0.9'),/破損/);assert.equal(localStorage.getItem(STATE_KEY),'{broken');assert.equal(view.candidates.length,1);
});
for(const version of ['0.9','0.8','0.7','0.6','0.5','0.4','0.3','0.2'])test(`I08 公開元v${version}のみ明示移行→再起動→再移行で不増殖`,()=>{
 globalThis.localStorage=new Memory();const source=legacy(localStorage,version),original=[localStorage.getItem(source.configKey),localStorage.getItem(source.scenarioKey)];const first=migrateSelected(inspectMigration(),source.id);assert.equal(first.alreadySaved,false);const expected=fixture();assert.deepEqual(loadState(),{config:expected.config,scenarios:expected.scenarios});const again=migrateSelected(inspectMigration(),source.id);assert.equal(again.alreadySaved,true);assert.equal(localStorage.writes,1);assert.equal(loadState().scenarios.length,2);assert.deepEqual(original,[localStorage.getItem(source.configKey),localStorage.getItem(source.scenarioKey)]);
});
test('I08 設定のみは確認まで不採用、比較案のみとは結合しない',()=>{
 globalThis.localStorage=new Memory();const source=legacy(localStorage);localStorage.data.delete(source.scenarioKey);const other=legacy(localStorage,'0.8');localStorage.data.delete(other.configKey);const view=inspectMigration();assert.equal(view.candidates.find(c=>c.id===other.id).valid,false);assert.throws(()=>migrateSelected(view,source.id),/確認/);assert.equal(localStorage.writes,0);migrateSelected(view,source.id,{acceptConfigOnly:true});assert.equal(loadState().scenarios.length,0);
});
test('I08 新旧競合候補を選ぶまでは保存0回',()=>{
 globalThis.localStorage=new Memory();legacy(localStorage);legacy(localStorage,'0.8',fixture(80));const view=inspectMigration();assert.equal(view.candidates.length,2);assert.equal(localStorage.getItem(STATE_KEY),null);assert.equal(localStorage.writes,0);
});
for(const [label,change] of [
 ['必須設定',s=>delete s.config],['必須比較案',s=>delete s.scenarios],['開始資産',s=>delete s.config.plan.initialAsset],['管理予算',s=>delete s.config.budgets],['重複ID',s=>s.scenarios[1].id='a'],['不正ID',s=>s.scenarios[0].id={}],['比較案設定',s=>delete s.scenarios[1].config],['実績',s=>s.config.actuals={999:{endAsset:1}}],['年次点検',s=>s.config.reviews=[]],['新schema',s=>s.schemaVersion='1.0'],['未知schema',s=>s.schemaVersion='future-state-v2'],['比較案の新schema',s=>s.scenarios[1].config.meta.schemaVersion='1.0'],['新protocol',s=>s.recoveryCompatibility={protocol:2,producerBuild:'future',requiredFeatures:[]}],['未知必須機能',s=>s.recoveryCompatibility={protocol:1,producerBuild:'future',requiredFeatures:['unknown-feature']}]
])test(`I08 ${label} の不正バックアップは全体拒否し保存0回`,()=>{
 const current=setup(),before=localStorage.getItem(STATE_KEY),writes=localStorage.writes,backup=fixture();change(backup);const copy=structuredClone(backup);assert.throws(()=>restoreFullBackup(current,backup));assert.equal(localStorage.writes,writes);assert.equal(localStorage.getItem(STATE_KEY),before);assert.deepEqual(backup,copy);
});
test('I08 壊れたJSONはparseで停止し元保存を保持',()=>{setup();const before=localStorage.getItem(STATE_KEY);assert.throws(()=>JSON.parse('{broken'));assert.equal(localStorage.getItem(STATE_KEY),before);});
test('I08 保存途中Quota失敗は採用値と候補を保持し再起動可',()=>{
 const current=setup(),backup=createFullBackup(fixture(120)),copy=structuredClone(backup);localStorage.fail=true;assert.throws(()=>restoreFullBackup(current,backup),/Quota/);localStorage.fail=false;assert.deepEqual(loadState(),current);assert.deepEqual(backup,copy);restoreFullBackup(current,backup);assert.deepEqual(loadState(),backup);
});
test('I08 同一バックアップ反復復元で比較案・実績・履歴不増殖',()=>{
 setup();const backup=createFullBackup(fixture());for(let i=0;i<3;i++)restoreFullBackup(loadState(),backup);assert.deepEqual(loadState(),backup);assert.equal(loadState().scenarios.length,2);
});
test('I08 全体の未知フィールド更新も古い復元を拒否',()=>{
 const stale=setup(),other=structuredClone(stale);other.unknown.history.push('other');saveState(other);const bytes=localStorage.getItem(STATE_KEY);assert.throws(()=>restoreFullBackup(stale,createFullBackup(fixture(120))),/別画面/);assert.equal(localStorage.getItem(STATE_KEY),bytes);
});
test('I08 移行候補の別画面更新を保存前に拒否',()=>{
 globalThis.localStorage=new Memory();const source=legacy(localStorage),view=inspectMigration();localStorage.data.set(source.scenarioKey,JSON.stringify(fixture(200).scenarios));assert.throws(()=>migrateSelected(view,source.id),/別画面/);assert.equal(localStorage.getItem(STATE_KEY),null);
});
test('I08 古いバックアップ→現在版は全体保持・互換情報を出力',()=>{
 const current=setup(),old=fixture(80);restoreFullBackup(current,old);assert.deepEqual(loadState(),old);const exported=createFullBackup(loadState());assert.equal(exported.recoveryCompatibility.producerBuild,APP_BUILD);assert.deepEqual(exported.config,old.config);assert.deepEqual(exported.scenarios,old.scenarios);
});
for(const [feature,mutate] of [
 ['salary-net-transfer-v1',s=>s.config.cashflow.salaryLife={mode:'net-transfer-v1'}],['anchored-months-v1',s=>s.scenarios[1].config.plan.calendarMode='anchored-months-v1'],['expense-adoption-v1',s=>s.config.expenseWorkflow={history:[]}],['income-adoption-v1',s=>s.config.incomeWorkflow={history:[]}]
])test(`I08 新バックアップ→非対応旧本体 ${feature} は全体停止`,()=>{
 const backup=fixture();mutate(backup);const copy=structuredClone(backup);const check=recoveryPair(backup,{appBuild:'public-v0.9',features:[]});assert.equal(check.compatible,false);assert.match(check.message,/このアプリ版/);assert.match(check.message,/対応するアプリ版/);assert.match(check.message,/変更されていません/);assert.match(check.message,/更新前/);assert.deepEqual(backup,copy);
});
test('I08 旧本体＋更新前バックアップは復旧可能な組と表示',()=>{
 const pair=recoveryPair(fixture(),{appBuild:'public-v0.9',features:[]});assert.equal(pair.compatible,true);assert.match(pair.action,/全体検証/);
});
test('I08 互換性判定の未知フィールドは不変',()=>{const b=fixture(),copy=structuredClone(b);assertBackupCompatibility(b);validateSavedState(b);assert.deepEqual(b,copy);});
test('I08 importは非対応の全体を設定だけとして扱わない接続',()=>{
 const app=fs.readFileSync(new URL('./app.mjs',import.meta.url),'utf8');assert.ok(app.indexOf('assertBackupCompatibility(parsed)')<app.indexOf('const full=isFullBackup(parsed)'));assert.match(app,/必須項目が不足/);assert.match(app,/restoreFullBackup\(expected,parsed\)/);assert.match(app,/同じ設定は採用済み/);
});
test('I08 全保存入口へ同時編集保護を接続、旧本体との混用は保証外',()=>{
 for(const name of ['storage.mjs','migration.mjs','salary-workflow.mjs','expense-workflow.mjs','income-workflow.mjs'])assert.match(fs.readFileSync(new URL('./'+name,import.meta.url),'utf8'),/assertWriteAccess\(\)/);
 assert.match(fs.readFileSync(new URL('./app.mjs',import.meta.url),'utf8'),/await acquireWriteAccess\(\)/);
});
const lockModule=async suffix=>import(`./write-access.mjs?test=${suffix}`);
test('I08 Web Locks未対応は書込み停止、読取りは可能',async()=>{const m=await lockModule('unsupported');assert.equal((await m.acquireWriteAccess({locks:null})).writable,false);assert.throws(()=>m.assertWriteAccess(),/読み取り専用/);});
test('I08 同時起動は編集者1画面だけ、再起動後に取得可能',async()=>{
 let owned=false;const locks={request:async(_name,_opts,callback)=>{if(owned)return callback(null);owned=true;try{return await callback({});}finally{owned=false;}}};
 const target=()=>({events:new Map(),addEventListener(name,fn){this.events.set(name,fn);}}),a=await lockModule('owner-a'),b=await lockModule('owner-b'),first=target(),second=target();
 assert.equal((await a.acquireWriteAccess({locks,target:first})).writable,true);a.assertWriteAccess();assert.equal((await b.acquireWriteAccess({locks,target:second})).writable,false);assert.throws(()=>b.assertWriteAccess());first.events.get('pagehide')();await new Promise(resolve=>setImmediate(resolve));assert.throws(()=>a.assertWriteAccess());assert.equal((await b.acquireWriteAccess({locks,target:second})).writable,true);second.events.get('pagehide')();
});
test('I08 ロック取得異常も保存停止',async()=>{const m=await lockModule('error');const result=await m.acquireWriteAccess({locks:{request:async()=>{throw new Error('failed');}}});assert.equal(result.writable,false);assert.throws(()=>m.assertWriteAccess());});
test('I08 復旧画面は旧本体への新機能読込を止め対応する組合せを表示',()=>{const b=fixture();b.config.plan.calendarMode='anchored-months-v1';assert.match(checkRecoveryFile(b,'public-v0.9'),/このアプリ版.*読み込めません/);assert.match(checkRecoveryFile(b,'current'),/事前検証を通過/);});
test('I08 復旧画面は読取りのみ・保存0回、JSON破損と必須欠落を停止',async()=>{
 setup();const writes=localStorage.writes,nodes={recoveryCheckFile:{files:[{text:async()=>'{broken'}],addEventListener(){}},recoveryTarget:{value:'current',addEventListener(){}},recoveryCheckResult:{}};
 const panel=mountRecoveryCheck({document:{getElementById:id=>nodes[id]}});await panel.check();assert.match(nodes.recoveryCheckResult.textContent,/停止/);nodes.recoveryCheckFile.files=[{text:async()=>JSON.stringify({config:fixture().config})}];await panel.check();assert.match(nodes.recoveryCheckResult.textContent,/停止/);assert.equal(localStorage.writes,writes);
});
test('I08 復旧候補選択を途中変更したとき古い読取結果を表示しない',async()=>{
 let release;const nodes={recoveryCheckFile:{files:[{text:()=>new Promise(r=>release=r)}],addEventListener(){}},recoveryTarget:{value:'current',addEventListener(){}},recoveryCheckResult:{}};
 const panel=mountRecoveryCheck({document:{getElementById:id=>nodes[id]}}),pending=panel.check();nodes.recoveryCheckFile.files=[];await panel.check();const before=nodes.recoveryCheckResult.textContent;release(JSON.stringify(fixture()));await pending;assert.equal(nodes.recoveryCheckResult.textContent,before);
});
test('I08 操作記録が無くても追加収入の採用行から旧版非互換を検出',()=>{const b=fixture();b.config.cashflow.periodOverrides=[{source:'income-adoption-v1',incomeAdoption:{sourceItemId:'synthetic'},kind:'income',key:'i05:synthetic'}];assert.equal(recoveryPair(b,{appBuild:'public-v0.9',features:[]}).compatible,false);});
