import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewExpenseUnification} from './lifeplan-expense-unification-review.mjs';
const fixture=()=>({plan:{startAge:65,endAge:99},cashflow:{expenseCategories:[{key:'food',items:[{key:'grocery',periods:[{fromAge:65,toAge:95,amount:12}]}]}],periodOverrides:[]}});
test('read-only preview reports 95 yes, 96 no without exposing monetary amounts',()=>{
 const c=fixture(),before=JSON.stringify(c),r=reviewExpenseUnification(c);
 assert.equal(r.status,'candidate-only');assert.equal(r.adoptable,false);assert.equal(r.candidateAvailable,true);
 assert.deepEqual(r.count,{legacy:1,standard:0,age95:1,age96:0});
 assert.equal(JSON.stringify(c),before);assert.equal(r.candidate,undefined);
 assert.equal(JSON.stringify(r).includes('"amount":12'),false);
});
test('coexisting standard configuration blocks automatic conversion',()=>{
 const c=fixture();c.expenseDetail={monthlyCategories:[{key:'food',amount:10}]};
 const r=reviewExpenseUnification(c);assert.equal(r.status,'blocked');assert.equal(r.adoptable,false);
 assert.ok(r.issues.some(i=>i.code==='STANDARD_EXISTS'));
});
test('explicit zero stays present through inspection; gap remains unregistered',()=>{
 const c=fixture();c.cashflow.expenseCategories[0].items[0].periods[0].amount=0;
 const r=reviewExpenseUnification(c);assert.equal(r.count.age95,1);assert.equal(r.count.age96,0);
});
test('invalid/missing money blocks rather than being filled as zero',()=>{
 const c=fixture();delete c.cashflow.expenseCategories[0].items[0].periods[0].amount;
 const r=reviewExpenseUnification(c);assert.equal(r.status,'blocked');assert.equal(r.adoptable,false);
});
test('empty config does not become an adopted zero',()=>{
 const r=reviewExpenseUnification(null);assert.equal(r.status,'no-config');assert.equal(r.adoptable,false);
});
test('source errors are not surfaced as leaked data',()=>{
 const c=fixture();c.cashflow.expenseCategories={};const r=reviewExpenseUnification(c);
 assert.equal(r.status,'blocked');assert.equal(r.adoptable,false);
});

// Browser-equivalent smoke with a minimal DOM: verifies the actual button,
// read-only output, duplicate guard and clearing without any saved-data API.
import {mountExpenseUnificationReview} from './lifeplan-expense-unification-review.mjs';
function fakeDocument(){
 const registry=new Map();
 class Element{
  constructor(tag){this.tagName=tag;this.children=[];this.listeners={};this.textContent='';this.attributes={};}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=[...items];}
  setAttribute(k,v){this.attributes[k]=v;}
  addEventListener(k,fn){this.listeners[k]=fn;}
  click(){this.listeners.click?.();}
  set id(v){this._id=v;registry.set(v,this);}
  get id(){return this._id;}
 }
 const host=new Element('section');registry.set('expenses',host);
 return {doc:{createElement:t=>new Element(t),getElementById:id=>registry.get(id)},host};
}
test('4-1-6 card opens and diagnoses using adopted data without writing it',()=>{
 const {doc,host}=fakeDocument();const c=fixture();const before=JSON.stringify(c);
 const mounted=mountExpenseUnificationReview({doc,getConfig:()=>c});
 assert.equal(host.children.length,1);assert.equal(mounted.root.id,'expenseUnificationReview');
 const [summary, note, button, output]=mounted.root.children;
 assert.equal(summary.textContent,'旧形式から標準形式への移行前確認（参照のみ）');
 assert.match(button.textContent,/4-1-6-1/);button.click();
 assert.match(output.children[1].textContent,/95歳に登録がある費目 1件／96歳に登録がある費目 0件/);
 assert.equal(JSON.stringify(c),before);mounted.clear();assert.equal(output.children.length,0);
 assert.throws(()=>mountExpenseUnificationReview({doc,getConfig:()=>c}),/already mounted/);
});
test('diagnostic result is cleared after refresh and next click uses new immutable input',()=>{
 const {doc}=fakeDocument();let c=fixture();const mounted=mountExpenseUnificationReview({doc,getConfig:()=>c});
 const button=mounted.root.children[2],output=mounted.root.children[3];
 button.click();assert.match(output.children[1].textContent,/96歳に登録がある費目 0件/);
 mounted.clear();c=fixture();c.cashflow.expenseCategories[0].items[0].periods[0].toAge=99;
 button.click();assert.match(output.children[1].textContent,/96歳に登録がある費目 1件/);
});