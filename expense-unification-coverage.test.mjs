import test from 'node:test';
import assert from 'node:assert/strict';
import {stagedExpenseCoverageGuard} from './expense-unification-coverage.mjs';
import {patchExpenseSource} from './apply-expense-unification-coverage.mjs';
import {prepareExpenseUnification} from './lifeplan-expense-unification-candidate.mjs';
function config(){return {plan:{startAge:65,endAge:99},cashflow:{expenseCategories:[{key:'living',label:'生活費',items:[{key:'food',label:'食費',periods:[{fromAge:65,toAge:95,amount:12}]}]}],periodOverrides:[]},expenseDetail:{monthlyCategories:[]}};}
function fixture(){
 const result=prepareExpenseUnification(config());assert.equal(result.status,'candidate-only');
 const c=result.candidate;
 const v={profile:'work-v0.9.7',kind:'expense',key:'food',parentId:'expense/key:living',sourceRefs:[{path:'/expenseDetail/monthlyCategories/0/items/0'}]};
 const generated=c.cashflow.periodOverrides.map((x,i)=>({itemId:'expense/key:food',profile:'work-v0.9.7',period:{type:'age',fromAge:x.fromAge,toAge:x.toAge},amount:x.amount,unit:x.unit,priority:30,status:'resolved',generatedBy:x.source,sourceRefs:[{path:'/cashflow/periodOverrides/'+i}]}));
 const all=[{itemId:'expense/key:food',profile:'work-v0.9.7',period:{type:'all'},amount:0,unit:'monthly',priority:10,status:'resolved',sourceRefs:[{path:'/expenseDetail/monthlyCategories/0/items/0'}]},...generated];
 return {v,all,view:{retainedSource:c}};
}
test('in coverage delegates to existing standard resolver',()=>{const {view,v,all}=fixture();assert.equal(stagedExpenseCoverageGuard(view,v,all,95),null)});
test('out of coverage is missing not explicit zero',()=>{const {view,v,all}=fixture();assert.deepEqual(stagedExpenseCoverageGuard(view,v,all,96).status,'missing');assert.equal(stagedExpenseCoverageGuard(view,v,all,96).amount,null)});
test('prior to start is also missing',()=>{const {view,v,all}=fixture();assert.equal(stagedExpenseCoverageGuard(view,v,all,64).status,'missing')});
test('no stage metadata leaves native standard logic intact',()=>{const {view,v,all}=fixture();delete view.retainedSource.expenseUnificationCandidate;assert.equal(stagedExpenseCoverageGuard(view,v,all,96),null)});
test('public-v0.9 source remains unchanged',()=>{const {view,v,all}=fixture();assert.equal(stagedExpenseCoverageGuard(view,{...v,profile:'public-v0.9'},all,96),null)});
test('stale work source path fails closed',()=>{const {view,v,all}=fixture();assert.equal(stagedExpenseCoverageGuard(view,{...v,sourceRefs:[{path:'/expenseDetail/monthlyCategories/1/items/0'}]},all,96).status,'conflict')});
test('valid native work item without migration coverage is unaffected',()=>{const {view,v,all}=fixture();view.retainedSource.expenseDetail.monthlyCategories.push({key:'extra',items:[{key:'medicine',amount:2}]});assert.equal(stagedExpenseCoverageGuard(view,{...v,key:'medicine',sourceRefs:[{path:'/expenseDetail/monthlyCategories/1/items/0'}]},all,96),null)});
test('changed override is rejected rather than preferred',()=>{const {view,v,all}=fixture();all[1].amount=15;assert.equal(stagedExpenseCoverageGuard(view,v,all,95).status,'conflict')});
test('manual override in addition to migration is rejected',()=>{const {view,v,all}=fixture();all.push({...all[1],generatedBy:null});assert.equal(stagedExpenseCoverageGuard(view,v,all,96).status,'conflict')});
test('missing generated override is rejected',()=>{const {view,v,all}=fixture();assert.equal(stagedExpenseCoverageGuard(view,v,all.slice(0,1),96).status,'conflict')});
test('candidate row amount was changed',()=>{const {view,v,all}=fixture();view.retainedSource.expenseDetail.monthlyCategories[0].items[0].amount=20;assert.equal(stagedExpenseCoverageGuard(view,v,all,95).status,'conflict')});
test('candidate coverage is invalid',()=>{const {view,v,all}=fixture();view.retainedSource.expenseUnificationCandidate.coverage[0].periods[0].fromAge=96;assert.equal(stagedExpenseCoverageGuard(view,v,all,95).status,'conflict')});
test('staging adoption cannot be marked true',()=>{const {view,v,all}=fixture();view.retainedSource.expenseUnificationCandidate.adopted=true;assert.equal(stagedExpenseCoverageGuard(view,v,all,95).status,'conflict')});
test('multiple coverage segments with gap keep gap missing',()=>{const {view,v,all}=fixture();const p=view.retainedSource.expenseUnificationCandidate.coverage[0].periods;p.splice(0,1,{fromAge:65,toAge:80,amount:12},{fromAge:85,toAge:95,amount:14});all.splice(1,1,{...all[1],period:{type:'age',fromAge:65,toAge:80},amount:12},{...all[1],period:{type:'age',fromAge:85,toAge:95},amount:14});assert.equal(stagedExpenseCoverageGuard(view,v,all,83).status,'missing');assert.equal(stagedExpenseCoverageGuard(view,v,all,85),null)});
test('altered base placeholder must not be treated as a valid migration',()=>{const {view,v,all}=fixture();all[0].amount=3;assert.equal(stagedExpenseCoverageGuard(view,v,all,95).status,'conflict');});
test('source patch adds import and guard only once',()=>{const src="// preface\nconst PUBLIC = 'public-v0.9', WORK = 'work-v0.9.7';\nfunction f(){\n  const all=view.rules.filter(r=>r.itemId === itemId && r.profile === profile);\n}";let p=patchExpenseSource(src);assert.equal(p.changed,true);assert.match(p.content,/stagedExpenseCoverageGuard\(view,v,all,age\)/);assert.deepEqual(patchExpenseSource(p.content),{content:p.content,changed:false})});
test('upstream unexpected code refuses patch',()=>assert.throws(()=>patchExpenseSource('const x=3;'),/anchor-drift/));
test('partial patch refuses',()=>assert.throws(()=>patchExpenseSource("import {stagedExpenseCoverageGuard} from './expense-unification-coverage.mjs';\nconst PUBLIC = 'public-v0.9', WORK = 'work-v0.9.7';"),/partial-integration/));