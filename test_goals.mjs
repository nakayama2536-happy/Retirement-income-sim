import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {migrateConfig} from './storage.mjs';
import {runRetirementPlan} from './calc.mjs';
import {detailProposal,verifyDetailProposal,changedPaths,undoDetail} from './detail-settings.mjs';
const fixture=()=>({config:migrateConfig(JSON.parse(fs.readFileSync(new URL('./tools/browser-test/synthetic-full.json',import.meta.url))).config),scenarios:[]});
test('目標だけを変更し月次収支・予測・比較案を維持',()=>{
 const s=fixture(),before=structuredClone(s),age=s.config.plan.endAge;
 const p=detailProposal(s,'goal',{age,amount:'1234'});
 assert.deepEqual(s,before);assert.equal(p.after,p.before);
 assert.deepEqual(runRetirementPlan(p.candidate,{includeMonthlyDetails:true}).monthlyDetails,runRetirementPlan(s.config,{includeMonthlyDetails:true}).monthlyDetails);
 assert.equal(p.candidate.management.thresholds[age],1234);
 assert.equal(runRetirementPlan(p.candidate).keyAges.find(x=>x.age===age).margin,p.after-1234);
 assert.deepEqual(verifyDetailProposal(s,p),p.candidate);
});
test('空欄・非数・負数・期間外・小数年齢を拒否',()=>{
 const s=fixture(),age=s.config.plan.endAge;
 for(const amount of ['',null,'NaN',-1,Infinity])assert.throws(()=>detailProposal(s,'goal',{age,amount}));
 for(const a of [s.config.plan.startAge-1,age+1,age-0.5,''])assert.throws(()=>detailProposal(s,'goal',{age:a,amount:1}));
});
test('明示的0と未設定を区別し再追加できる',()=>{
 const s=fixture(),age=s.config.plan.endAge;
 const zero=detailProposal(s,'goal',{age,amount:0});assert.equal(zero.candidate.management.thresholds[age],0);
 s.config=zero.candidate;
 const clear=detailProposal(s,'goal',{age,clearGoal:true});assert.equal(Object.hasOwn(clear.candidate.management.thresholds,age),false);
 assert.equal(runRetirementPlan(clear.candidate).keyAges.some(x=>x.age===age),false);
 s.config=clear.candidate;assert.equal(detailProposal(s,'goal',{age,amount:456}).candidate.management.thresholds[age],456);
});
test('条件変更・比較案変更・候補改変後は反映停止',()=>{
 for(const edit of [s=>s.config.plan.inflation+=1,s=>s.scenarios.push({id:'changed'})]){
  const s=fixture(),p=detailProposal(s,'goal',{age:s.config.plan.endAge,amount:123});edit(s);assert.throws(()=>verifyDetailProposal(s,p));
 }
 const s=fixture(),p=detailProposal(s,'goal',{age:s.config.plan.endAge,amount:123});p.candidate.management.thresholds[s.config.plan.endAge]=5;assert.throws(()=>verifyDetailProposal(s,p));
});
test('取消は対象目標だけ・後の変更を保護・同額反映は変更なし',()=>{
 const s=fixture(),age=s.config.plan.endAge,p=detailProposal(s,'goal',{age,amount:234});
 const patches=changedPaths(s.config,p.candidate),next=structuredClone(p.candidate);next.plan.inflation=2.5;
 const u=undoDetail(next,patches);assert.deepEqual(u.management,s.config.management);assert.equal(u.plan.inflation,2.5);
 next.management.thresholds[age]=999;assert.throws(()=>undoDetail(next,patches));
 assert.equal(detailProposal({config:p.candidate,scenarios:[]},'goal',{age,amount:234}).changed,false);
});
test('目標はJSON往復で保存、他年齢の目標と管理条件を保持',()=>{
 const s=fixture(),age=s.config.plan.endAge,p=detailProposal(s,'goal',{age,amount:765.5});
 const restored=migrateConfig(JSON.parse(JSON.stringify(p.candidate)));assert.deepEqual(restored.management,p.candidate.management);
 for(const [a,v] of Object.entries(s.config.management.thresholds))if(Number(a)!==age)assert.equal(restored.management.thresholds[a],v);
});
