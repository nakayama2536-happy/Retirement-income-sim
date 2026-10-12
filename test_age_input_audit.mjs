import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {dateAgeHint,previousMonth,updateDateInputHints} from './date-display.mjs';
import {detailFormSourceSignature,detailEditorRefresh} from './detail-ui.mjs';
import {runRetirementPlan} from './calc.mjs';
import {detailProposal} from './detail-settings.mjs';
import {migrateConfig} from './storage.mjs';
const c={people:{primary:{birthDate:'1980-08-27'},spouse:{birthDate:'1981-05-01'}}};
test('入力欄は日付・月・西暦年に対し対象者の年齢を補足する',()=>{
 assert.equal(dateAgeHint('2045-08-26',c),'本人64歳11か月（誕生日基準）');
 assert.equal(dateAgeHint('2045-08-27',c),'本人65歳0か月（誕生日基準）');
 assert.equal(dateAgeHint('2045-08',c),'本人64歳11か月 → 65歳0か月（月内の年齢・誕生日基準）');
 assert.equal(dateAgeHint('2045-05',c,'spouse'),'配偶者64歳0か月（月内の年齢・誕生日基準）');
 assert.equal(dateAgeHint('2045',c),'本人64歳4か月 → 65歳4か月（年内の年齢・誕生日基準）');
});
test('空欄・不正日・生年月日未設定は年齢0歳にしない',()=>{
 assert.match(dateAgeHint('',c),/入力すると表示/);
 assert.match(dateAgeHint('2045-02-30',c),/有効な年月日/);
 assert.match(dateAgeHint('2045-08',{}),/生年月日未設定/);
 assert.match(dateAgeHint('1970-08',c),/生年月日より前/);
 const leap={people:{primary:{birthDate:'1980-02-29'}}};
 assert.match(dateAgeHint('2045-02-28',leap),/64歳11か月/);
 assert.match(dateAgeHint('2045-03-01',leap),/65歳0か月/);
 assert.equal(previousMonth('2045-01-01'),'2044-12');
 assert.equal(previousMonth('bad'),null);
});
test('入力の隣に補足を置き、編集・非表示・再表示で重複せず元値を保持',()=>{
 class Node{constructor(){this.attrs={};this.children=[];}setAttribute(k,v){this.attrs[k]=v;}append(n){this.children.push(n);}querySelector(){return this.children.find(x=>x.className?.includes('date-age-hint'));}}
 const labels=[new Node(),new Node()];
 const inputs=[{name:'startDate',value:'2045-05-01',disabled:false,closest:()=>labels[0],setAttribute(k,v){this[k]=v;}},{name:'endDate',value:'2046-06-01',disabled:false,closest:()=>labels[1],setAttribute(k,v){this[k]=v;}}];
 const form={id:'form-test',querySelectorAll:()=>inputs};
 const old=globalThis.document;globalThis.document={createElement:()=>new Node()};
 try{
  updateDateInputHints(form,c,'spouse');updateDateInputHints(form,c,'spouse');
  assert.equal(labels[0].children.length,1);assert.match(labels[0].children[0].textContent,/配偶者64歳0か月/);
  assert.match(labels[1].children[0].textContent,/収入の最終月：2046年5月（配偶者65歳）/);
  assert.equal(inputs[1]['aria-describedby'],'form-test-endDate-age');
  inputs[0].value='2046-05-01';inputs[1].disabled=true;updateDateInputHints(form,c,'spouse');
  assert.match(labels[0].children[0].textContent,/配偶者65歳0か月/);assert.equal(labels[1].children[0].hidden,true);
  inputs[1].disabled=false;updateDateInputHints(form,c,'spouse');assert.equal(labels[1].children[0].hidden,false);
  assert.equal(inputs[1].value,'2046-06-01');
 }finally{globalThis.document=old;}
});
const state=()=>({config:migrateConfig(JSON.parse(fs.readFileSync(new URL('./tools/browser-test/synthetic-full.json',import.meta.url))).config),scenarios:[]});
test('年齢補足の表示だけでは保存条件・月次計算は変わらない',()=>{
 const s=state(),before=JSON.stringify(s),trace=runRetirementPlan(s.config,{includeMonthlyDetails:true});
 for(const person of ['primary','spouse'])for(const v of ['2045-01-01','2045-12','2045',''])dateAgeHint(v,s.config,person);
 assert.equal(JSON.stringify(s),before);assert.deepEqual(runRetirementPlan(s.config,{includeMonthlyDetails:true}),trace);
});
test('iDeCoの別欄更新後は未編集なら同期、編集中なら古い値の試算を停止',()=>{
 const s=state();s.config.ideco={asOfDate:'2044-01-01',contributionEndDate:'2045-01-01',joinDate:'2010-01-01',lumpDate:'2045-01-01',currentBalance:100,monthlyContribution:1,accumulationReturn:0,lumpPercent:50,annuityPercent:50,annuityYears:5,annuityReturn:0};
 s.config.plan.initialAssetIncludesIdeco=false;
 const old=detailFormSourceSignature('ideco',s.config);
 const next=detailProposal(s,'idecoWithdrawal',{receiptMode:'annuity',lumpDate:'2045-01-01',annuityYears:10,annuityReturn:0}).candidate;
 const changed=detailFormSourceSignature('ideco',next);assert.notEqual(old,changed);
 assert.equal(detailEditorRefresh(old,changed,'initial','initial'),'reload');
 assert.equal(detailEditorRefresh(old,changed,'initial','edited'),'stale');
 assert.equal(detailEditorRefresh(old,old,'initial','edited'),'unchanged');
 assert.equal(next.ideco.lumpPercent,0);assert.equal(next.ideco.annuityYears,10);
});
test('関連しない欄の変更は編集中の入力を破棄しない',()=>{
 const s=state(),before=detailFormSourceSignature('laborSpouseSide',s.config);
 s.config.management.thresholds[95]=123;
 assert.equal(detailFormSourceSignature('laborSpouseSide',s.config),before);
 s.config.employment.spouse.sideWork.monthlyGross=99;
 assert.notEqual(detailFormSourceSignature('laborSpouseSide',s.config),before);
});
