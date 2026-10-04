// Audit reproductions: known-gap tests passing do NOT mean the gap is fixed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {migrateConfig,STATE_KEY} from './storage.mjs';
import {runRetirementPlan,expenseDetailSummary,scenarioMetrics,formatMan} from './calc.mjs';
import {inspectCashflowSources} from './cashflow-sources.mjs';
import {createExpenseDraft,previewExpenseChanges} from './expense-preview.mjs';
import {applyExpensePreview,undoExpenseApply} from './expense-workflow.mjs';
import {expenseDisplayModel,expenseDisplayHtml,expenseDisplayProfile} from './expense-display.mjs';
const app=fs.readFileSync(new URL('./app.mjs',import.meta.url),'utf8');
function setup(){
 const config=migrateConfig({people:{primary:{birthDate:'1980-08-27'},spouse:{birthDate:'1981-05-01'}},plan:{startAge:64,endAge:67,startDate:'2044-08-27',initialAsset:1234,afterTaxReturn:0,inflation:0},income:{pensions:{primary:{annualAtStart:0},spouse:{annualAtStart:0}}},budgets:[{fromAge:65,toAge:90,annualBudget:120,travelReference:12}],unemployment:{baselineMode:'none'},events:[]});
 config.expenseDetail={monthlyCategories:[{key:'housing',label:'住居',items:[{key:'rent',label:'家賃',amount:5}]}],travelAnnualBase:12};
 config.cashflow={periodOverrides:[],expenseCategories:[{key:'housing',label:'住居',items:[{key:'rent',label:'家賃',periods:[{fromAge:64,toAge:90,amount:8}]}]}],travel:[{fromAge:64,toAge:90,annualAmount:12}],taxSocialMode:'manual'};
 const state={config,scenarios:[{id:'a',name:'A',role:'scenario',selected:true,config:structuredClone(config)},{id:'b',name:'B',role:'reference',selected:false,config:structuredClone(config)}],unknown:{keep:true}};
 const storage={raw:JSON.stringify(state),getItem:k=>{assert.equal(k,STATE_KEY);return storage.raw;},setItem:(k,v)=>{assert.equal(k,STATE_KEY);storage.raw=v;}};
 return {state,storage};
}
function preview(state,profile='work-v0.9.7',kind='detail',amount=6){
 const id=kind==='budget'?'management-budget':'expense/key:housing/key:rent';
 const r=inspectCashflowSources(state.config,{sourceProfile:profile}).rules.find(r=>r.profile===profile&&r.itemId===id);
 const d=createExpenseDraft(state,{sourceProfile:profile,kind});d.edits=[{itemId:id,ruleRef:r.ruleRef,unit:r.unit,priceBasis:r.priceBasis,amount}];return previewExpenseChanges(state,d);
}
function yearCells(state,result){
 const rows=[];const body={innerHTML:'',appendChild:r=>rows.push(r.innerHTML)};
 const start=app.indexOf('function renderYearTable()'),end=app.indexOf('\nfunction ',start+10);
 vm.runInNewContext(app.slice(start,end)+';renderYearTable();',{config:state.config,result,formatMan,el:()=>body,document:{createElement:()=>({innerHTML:''})}});
 return rows.map(r=>[...r.matchAll(/<td[^>]*>(.*?)<\/td>/g)].map(x=>x[1]));
}
for(const kind of ['detail','budget'])test(`integrated ${kind}: saved result, annual table and undo agree`,async()=>{
 const {state,storage}=setup(),before=runRetirementPlan(state.config),p=preview(state,'work-v0.9.7',kind,kind==='budget'?144:6);
 const n=await applyExpensePreview(state,p,{storage}),reload=JSON.parse(storage.raw),computed=runRetirementPlan(reload.config);
 assert.deepEqual(n.result,computed);const cells=yearCells(reload,n.result);
 n.result.rows.forEach((r,i)=>{assert.equal(cells[i][9],formatMan(r.expense+r.extraExpense));assert.equal(cells[i][10],formatMan(r.endAsset));});
 if(kind==='detail'){assert.deepEqual(computed,before);assert.equal(expenseDetailSummary(reload.config,65).annualOperating,72);}else{assert.notEqual(computed.finalAsset,before.finalAsset);assert.equal(expenseDetailSummary(reload.config,65).reference,144);}
 const u=await undoExpenseApply(reload,{storage});assert.deepEqual(u.result,before);
});
test('saved comparison metrics and scenario attributes remain independent of current adoption',async()=>{
 const {state,storage}=setup(),metrics=state.scenarios.map(s=>scenarioMetrics(s.config));
 const n=await applyExpensePreview(state,preview(state,'work-v0.9.7','budget',144),{storage});
 assert.deepEqual(n.state.scenarios,state.scenarios);assert.deepEqual(n.state.scenarios.map(s=>scenarioMetrics(s.config)),metrics);
});
test('FIX A: public-format saved detail appears in the shared display',async()=>{
 const {state,storage}=setup(),p=preview(state,'public-v0.9','detail',9);
 assert.ok(p.months.some(m=>m.detailBefore!==m.detailAfter||m.knownSubtotalBefore!==m.knownSubtotalAfter));
 const n=await applyExpensePreview(state,p,{storage});assert.equal(n.state.config.cashflow.expenseCategories[0].items[0].periods[0].amount,9);
 const display=expenseDisplayModel(n.state.config,65);assert.equal(display.sourceProfile,'public-v0.9');assert.equal(display.rows.find(r=>r.itemId==='expense/key:housing').amount,108);
 const rendered=expenseDisplayHtml(display);assert.match(rendered.detail,/108万円/);assert.match(rendered.detail,/公開元/);
});
test('FIX B: public-only data is displayed without a Work detail object',()=>{
 const {state}=setup();delete state.config.expenseDetail;assert.equal(expenseDetailSummary(state.config,65),null);
 assert.ok(inspectCashflowSources(state.config,{sourceProfile:'public-v0.9'}).rules.some(r=>r.itemId==='expense/key:housing/key:rent'));
 const display=expenseDisplayModel(state.config,65);assert.equal(display.status,'ready');assert.equal(display.rows.find(r=>r.itemId==='expense/key:housing').amount,96);assert.ok(!app.includes('if (!detail?.monthlyCategories?.length)'));
});
test('mixed formats require explicit source and are never summed',()=>{
 const {state}=setup();assert.equal(expenseDisplayModel(state.config,65).status,'choose-source');
 assert.equal(expenseDisplayModel(state.config,65,{sourceProfile:'work-v0.9.7'}).rows.find(r=>r.itemId==='expense/key:housing').amount,60);
 assert.equal(expenseDisplayModel(state.config,65,{sourceProfile:'public-v0.9'}).rows.find(r=>r.itemId==='expense/key:housing').amount,96);
});
test('display is immutable and period budget/total/gap match preview after adoption',()=>{
 const {state}=setup(),before=structuredClone(state),p=preview(state,'public-v0.9','detail',9),m=expenseDisplayModel(p.candidate.config,65,{sourceProfile:'public-v0.9'});
 const months=p.months.filter(x=>m.months.some(y=>y.date===x.date));assert.equal(m.period.actualExpense,months.reduce((s,x)=>s+x.expenseAfter,0));
 if(m.period.detailTotal!==null)assert.equal(m.period.detailTotal,months.reduce((s,x)=>s+x.detailAfter,0));assert.deepEqual(state,before);
});
test('stored last source survives reload; explicit other display does not change stored choice',async()=>{
 const {state,storage}=setup();await applyExpensePreview(state,preview(state,'public-v0.9','detail',9),{storage});const c=JSON.parse(storage.raw).config;
 assert.equal(expenseDisplayProfile(c),'public-v0.9');assert.equal(expenseDisplayProfile(c,'work-v0.9.7'),'work-v0.9.7');assert.equal(c.expenseWorkflow.lastApply.sourceProfile,'public-v0.9');
});
test('unknown source is not silently replaced and labels are HTML escaped',()=>{
 const {state}=setup();assert.equal(expenseDisplayModel(state.config,65,{sourceProfile:'unexpected'}).status,'choose-source');state.config.expenseDetail.monthlyCategories[0].label='<img src=x onerror=evil()>';
 assert.ok(!expenseDisplayHtml(expenseDisplayModel(state.config,65,{sourceProfile:'work-v0.9.7'})).detail.includes('<img'));
});
test('real detail render function displays public-only data and uses chosen period',()=>{
 const {state}=setup();delete state.config.expenseDetail;
 const nodes={expenseDetail:{},expenseReconcile:{},annualCashflowSummary:{},cashflowViewAge:{value:'65'},expenseDisplaySource:{value:''}};
 const start=app.indexOf('function renderExpenseDetail()'),end=app.indexOf('\nfunction ',start+10);
 vm.runInNewContext(app.slice(start,end)+';renderExpenseDetail();',{config:state.config,el:id=>nodes[id],expenseDisplayModel,expenseDisplayHtml,expenseDisplayProfile,annualCashflowSummary:()=>({status:'ready'}),annualCashflowHtml:()=>'<p>annual</p>',renderPeriodOverrides(){}});
 assert.equal(nodes.expenseDisplaySource.value,'public-v0.9');assert.match(nodes.expenseDetail.innerHTML,/96万円/);assert.match(nodes.expenseReconcile.innerHTML,/120万円/);
});
test('FIX C: CSV action and annual cashflow summary are connected to development entrypoints',()=>{
 const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
 assert.equal(html.includes('id="exportAnnualCsvBtn"'),true);assert.equal(html.includes('id="annualCashflowSummary"'),true);assert.equal(app.includes('downloadAnnualCsv'),true);
});
test('FIX D: full export reads integrated state and preserves its envelope',()=>{
 const exportHandler=app.split("el('exportFullBtn').addEventListener")[1].split('\n')[0];
 assert.ok(exportHandler.includes('loadState()'));assert.ok(exportHandler.includes('createFullBackup(state)'));assert.equal(exportHandler.includes('config, scenarios}'),false);
});
