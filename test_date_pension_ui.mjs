// Fictional data only. Minimal DOM checks are not browser/device evidence.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {dateWithAge,ageOn} from './date-display.mjs';
import {estimatePensionAtMonth as estimate} from './pension-estimate.mjs';
import {mountPensionSheet} from './pension-ui.mjs';
import {migrateConfig,saveConfig,loadConfig} from './storage.mjs';
const config={people:{primary:{birthDate:'1980-08-27'},spouse:{birthDate:'1981-05-01'}}};
test('date display distinguishes both people, birthday and exact date without mutating config',()=>{
 const original=JSON.stringify(config);
 assert.equal(dateWithAge('2050-08',config),'2050年8月（本人69→70歳）');
 assert.equal(dateWithAge('2050-08-26',config),'2050年8月26日（本人69歳）');
 assert.equal(dateWithAge('2050-08-27',config),'2050年8月27日（本人70歳）');
 assert.equal(dateWithAge('2051-05',config,'spouse'),'2051年5月（配偶者70歳）');
 assert.equal(dateWithAge('',config),'未設定');
 assert.equal(dateWithAge('2050-08',{}),'2050年8月（本人年齢未確認）');
 assert.equal(dateWithAge('2050-02-30',config),'2050-02-30');
 assert.equal(ageOn('2051-02-28','1980-02-29'),70);
 assert.equal(ageOn('2051-03-01','1980-02-29'),71);
 assert.equal(JSON.stringify(config),original);
});
test('pension helper independently matches official ordinary-rate examples and monthly increments',()=>{
 const value=startMonth=>estimate({birthDate:'1980-08-27',base65:120,startMonth});
 assert.equal(value('2040-09').annual,91.2); // 60-year claim: 24% decrease
 assert.equal(value('2045-09').annual,120); // normal
 assert.equal(value('2046-09').annual,130.08); // 66-year claim: 8.4%
 assert.equal(value('2050-09').annual,170.4); // 70-year claim: 42%
 assert.equal(value('2050-10').annual,171.24);
 assert.equal(value('2055-09').annual,220.8); // 75-year claim: 84%
 assert.equal(value('2045-10').ok,false);
 assert.equal(value('2046-08').ok,false);
 assert.equal(value('2040-08').ok,false);
 assert.equal(value('2055-10').ok,false);
});
test('pension legal attainment treats first-of-month and leap birthdays explicitly',()=>{
 assert.equal(estimate({birthDate:'1981-05-01',base65:100,startMonth:'2051-05'}).annual,142);
 assert.equal(estimate({birthDate:'1980-01-01',base65:100,startMonth:'2050-01'}).claimMonth,'2049-12');
 assert.equal(estimate({birthDate:'1980-02-29',base65:100,startMonth:'2050-03'}).annual,142);
});
test('missing or invalid pension evidence does not become zero or inferred base amount',()=>{
 for(const base65 of ['',null,undefined,-1,'abc',Infinity])assert.equal(estimate({birthDate:'1980-08-27',base65,startMonth:'2050-09'}).ok,false);
 assert.equal(estimate({birthDate:'1980-08-27',base65:0,startMonth:'2050-09'}).annual,0);
 for(const birthDate of ['', '1981-02-29','1960-01-01'])assert.equal(estimate({birthDate,base65:100,startMonth:'2050-09'}).ok,false);
 for(const startMonth of ['', '2050-00','2050-13','2050-09-01'])assert.equal(estimate({birthDate:'1980-08-27',base65:100,startMonth}).ok,false);
});
class Element {
 value='';textContent='';hidden=false;disabled=false;dataset={};listeners={};_html='';
 constructor(id,doc){this.id=id;this.doc=doc;}
 set innerHTML(v){this._html=v;this.doc.parse(v);}get innerHTML(){return this._html;}
 addEventListener(type,fn){(this.listeners[type]||=[]).push(fn);}
 emit(type,target=this){if(type==='click'&&this.disabled)return;for(const fn of this.listeners[type]||[])fn({target,preventDefault(){}});}
 scrollIntoView(){}
}
class DOM {nodes=new Map();parse(s){for(const [,id] of s.matchAll(/\bid="([^"]+)"/g))this.nodes.set(id,new Element(id,this));}getElementById(id){return this.nodes.get(id)||null;}}
class Storage {values=new Map();getItem(k){return this.values.get(k)??null;}setItem(k,v){this.values.set(k,String(v));}removeItem(k){this.values.delete(k);}}
function setup(){
 globalThis.document=new DOM();document.parse(fs.readFileSync(new URL('./index.html',import.meta.url),'utf8'));globalThis.localStorage=new Storage();
 let current=migrateConfig({...structuredClone(config),plan:{startAge:64,endAge:75,startDate:'2044-08-27',initialAsset:1000,afterTaxReturn:0,inflation:0},employment:{primary:{mainRetirement:{baseDate:'2045-08-27'},sideWork:{monthlyGross:0}},spouse:{sideWork:{monthlyGross:0}}},income:{pensions:{primary:{startDate:'2050-09-01',annualAtStart:170.4,certainty:'official_estimate',alternatives:{65:120}},spouse:{startDate:'2051-05-01',annualAtStart:60,certainty:'assumption'}}},budgets:[{fromAge:65,toAge:75,annualBudget:100}],unemployment:{baselineMode:'none'},events:[]});
 saveConfig(current);const notices=[];const api=mountPensionSheet({getConfig:()=>current,onCommit:r=>current=r.config,showNotice:s=>notices.push(s)});api.render();
 const node=id=>document.getElementById(id),set=(id,v)=>{node(id).value=v;node('pensionForm').emit('input',node(id));};
 return {node,set,api,notices,current:()=>current};
}
test('month edit shows draft estimate; clicking estimate and trial do not alter adopted settings',()=>{
 const t=setup(),before=JSON.stringify(loadConfig());
 t.set('primaryPensionMonth','2051-09');
 assert.match(t.node('primaryPensionMonthAge').textContent,/本人71歳/);
 assert.match(t.node('primaryPensionEstimate').textContent,/180.48/);
 assert.equal(t.node('primaryPensionEstimateDetails').open,true);
 assert.equal(t.node('primaryPensionAmount').value,170.4);
 t.node('primaryPensionUseEstimate').emit('click');
 assert.equal(t.node('primaryPensionAmount').value,'180.48');
 assert.equal(t.node('primaryPensionCertainty').value,'scenario');
 assert.match(t.node('primaryPensionSource').value,/65歳年額120万円/);
 t.node('pensionForm').emit('submit');
 assert.equal(t.node('pensionPreview').hidden,false);
 assert.equal(JSON.stringify(loadConfig()),before);
 t.node('pensionApply').emit('click');
 assert.equal(loadConfig().income.pensions.primary.annualAtStart,180.48);
 assert.equal(loadConfig().income.pensions.primary.startDate,'2051-09-01');
 assert.equal(loadConfig().income.pensions.primary.alternatives[65],120);
});
test('estimate re-evaluates after repeated edits; reset restores adopted fields and never erases adopted data',()=>{
 const t=setup(),before=JSON.stringify(loadConfig());
 t.set('primaryPensionMonth','2051-09');t.node('primaryPensionUseEstimate').emit('click');t.node('pensionForm').emit('submit');
 t.set('primaryPensionMonth','2052-09');assert.equal(t.node('pensionPreview').hidden,true);
 t.node('primaryPensionUseEstimate').emit('click');assert.equal(t.node('primaryPensionAmount').value,'190.56');
 t.set('primaryPensionBase65','');assert.equal(t.node('primaryPensionUseEstimate').disabled,true);
 t.node('pensionReset').emit('click');assert.equal(t.node('primaryPensionMonth').value,'2050-09');assert.equal(t.node('primaryPensionAmount').value,170.4);
 assert.equal(JSON.stringify(loadConfig()),before);
 assert.equal(t.node('spousePensionBase65').value,'');assert.equal(t.node('spousePensionUseEstimate').disabled,true);
});
test('manual official amount remains possible; base input is transient and draft is preserved across sheet rebuild',()=>{
 const t=setup();t.set('spousePensionMonth','2052-05');t.set('spousePensionAmount','65');
 t.set('spousePensionBase65','100');t.api.reset({forget:false});t.api.render();
 assert.equal(t.node('spousePensionAmount').value,'65');assert.equal(t.node('spousePensionMonth').value,'2052-05');assert.equal(t.node('spousePensionBase65').value,'');
 t.node('pensionForm').emit('submit');assert.equal(t.node('pensionPreview').hidden,false);
 assert.equal(loadConfig().income.pensions.spouse.annualAtStart,60);
});
