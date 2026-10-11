// Synthetic DOM checks. This is not a browser layout or device test.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {runRetirementPlan,formatMan} from './calc.mjs';
const source=fs.readFileSync(new URL('./app.mjs',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
function fn(name){const start=source.indexOf(`function ${name}(`),end=source.indexOf('\nfunction ',start+1);assert.ok(start>=0);return source.slice(start,end<0?undefined:end);}
class Node {textContent='';innerHTML='';className='';dataset={};children=[];attrs={};appendChild(n){this.children.push(n);}setAttribute(k,v){this.attrs[k]=v;}}
function setup(){
 const config=JSON.parse(fs.readFileSync(new URL('./tools/browser-test/synthetic-full.json',import.meta.url))).config;
 const nodes=new Map();const el=id=>{if(!nodes.has(id))nodes.set(id,new Node());return nodes.get(id);};
 const context=vm.createContext({config,result:runRetirementPlan(config),forecast:null,showActuals:false,el,document:{createElement:()=>new Node(),createElementNS:()=>new Node()},money:v=>`${formatMan(v,0)}万円`,formatMan,projectIdeco:()=>null,renderReviewAlerts(){},renderPending(){},escapeHtml:s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;')});
 vm.runInContext(['renderHome','derivePending','renderYearTable','drawPolyline','drawChart'].map(fn).join('\n'),context);
 return {context,el,config};
}
test('home shows target then prediction; final success does not hide intermediate shortfalls',()=>{
 const {context:c,el}=setup();c.result={...c.result,startAge:60,endAge:90,finalAsset:1200,finalThreshold:1000,keyAges:[{age:80,asset:700,threshold:900,margin:-200},{age:90,asset:1200,threshold:1000,margin:200}]};
 const before=JSON.stringify(c.config);c.renderHome();
 assert.equal(el('status').textContent,'達成');assert.match(el('targetStatusNote').textContent,/80歳末/);assert.equal(el('finalMargin').textContent,'+200万円');assert.equal(el('finalPredictionLabel').textContent,'90歳末の予測資産額');
 assert.match(el('keyAges').children[0].innerHTML,/<td>900万円<\/td><td>700万円<\/td>/);assert.equal(JSON.stringify(c.config),before);
 c.result.finalAsset=850;c.renderHome();assert.equal(el('status').textContent,'未達');assert.equal(el('finalMargin').textContent,'-150万円');
 c.result.keyAges=[];c.renderHome();assert.equal(el('status').textContent,'未設定');assert.equal(el('finalMargin').textContent,'—');
});
test('simulation graph excludes saved actuals without changing them; display switch can restore them',()=>{
 const {context:c,el}=setup();c.config.actuals={65:{endAsset:111}};c.forecast={actual:{age:65,endAsset:111},projection:{rows:[{age:66,endAsset:110}]}};
 const before=JSON.stringify(c.config);c.drawChart();assert.ok(!el('assetChart').children.some(n=>['forecast-line','actual-point'].includes(n.attrs.class)));
 el('assetChart').children=[];c.showActuals=true;c.drawChart();assert.ok(el('assetChart').children.some(n=>n.attrs.class==='forecast-line'));assert.ok(el('assetChart').children.some(n=>n.attrs.class==='actual-point'));assert.equal(JSON.stringify(c.config),before);
});
test('pending actions point at the actual adopted-value inputs and distinguish unsupported editing',()=>{
 const {context:c}=setup();c.config.income.pensions.spouse.certainty='unknown';c.config.nisa={accountBreakdownStatus:'pending'};c.config.retirement={majorSpendDetailStatus:'pending'};c.config.care={};c.config.taxPolicy={rulesAsOf:'2026-01-01'};c.config.pendingDecisions=['<script>fictional</script>'];
 const before=JSON.stringify(c.config),items=c.derivePending();assert.equal(items.find(i=>i.title==='配偶者の公的年金額').action.target,'spousePensionAmount');
 assert.ok(items.find(i=>i.title.includes('NISA')).limitation);assert.ok(!items.find(i=>i.title.includes('NISA')).action);
 assert.equal(items.find(i=>i.title.includes('大型支出')).action.target,'initialAssetInput');assert.equal(items.find(i=>i.title.includes('介護費')).action.target,'expenseKind');
 for(const i of items.filter(i=>i.action)){assert.ok(html.includes(`id="${i.action.tab}"`));if(i.action.target!=='spousePensionAmount')assert.ok(html.includes(`id="${i.action.target}"`));}
 vm.runInContext(fn('renderPending'),c);c.renderPending();assert.ok(!c.el('pendingList').innerHTML.includes('<script>'));assert.equal(JSON.stringify(c.config),before);
});
test('default simulation view retains accessible opt-in and matching actual columns',()=>{
 const {context:c,el}=setup();c.renderYearTable();assert.ok(html.includes('<body class="simulation-only">'));assert.ok(html.includes('id="showActuals"'));assert.ok(html.includes('data-tab="actuals" class="actual-only"'));
 assert.match(el('yearRows').children[0].innerHTML,/<td class="actual-only">/);
 assert.ok(html.indexOf('id="finalThreshold"')<html.indexOf('id="finalAsset"'));
});
test('pending navigation focuses and scrolls without triggering input events or saving',()=>{
 const target={parentElement:{tagName:'DETAILS',open:false,parentElement:null},classList:{add(){}},matches:()=>true,focus(){this.focused=true;},scrollIntoView(){this.scrolled=true;}};
 const listeners={};let active=null;
 const context=vm.createContext({document:{addEventListener:(name,cb)=>listeners[name]=cb,querySelectorAll:()=>[]},el:()=>target,switchTab:id=>active=id});
 const start=source.indexOf("document.addEventListener('click', e=>{"),end=source.indexOf("document.addEventListener('change'",start);
 vm.runInContext(source.slice(start,end),context);
 listeners.click({target:{closest:s=>s==='[data-open-tab]'?{dataset:{openTab:'pension',focusTarget:'spousePensionAmount'}}:null}});
 assert.equal(active,'pension');assert.equal(target.parentElement.open,true);assert.equal(target.focused,true);assert.equal(target.scrolled,true);
});
