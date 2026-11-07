import test from 'node:test';import assert from 'node:assert/strict';
import {navigationNumber,MAIN_SECTIONS,CHILD_SECTIONS,assignReferenceNumber} from './ui-numbering.mjs';
test('numbering: stable main sections',()=>assert.deepEqual(MAIN_SECTIONS.map(([group])=>navigationNumber(group)),['1','2','3','4','5']));
test('numbering: unique child tab references',()=>{const keys=[];for(const group of Object.keys(CHILD_SECTIONS))for(const tab of CHILD_SECTIONS[group])keys.push(navigationNumber(group,tab));assert.equal(new Set(keys).size,keys.length);assert.equal(navigationNumber('income','pension'),'2-5');assert.equal(navigationNumber('expense','expenses'),'4-1');});
test('numbering: unknown entries return null',()=>{assert.equal(navigationNumber('nope'),null);assert.equal(navigationNumber('income','nope'),null);});

test('numbering: DOM labels retain their original title while receiving a reference',()=>{
 const active=new Set(),attrs={};
 const node={nodeType:1,childNodes:[{nodeType:3,textContent:'基本生活費内訳'}],dataset:{},
   classList:{toggle:(name,enabled)=>{if(enabled)active.add(name);else active.delete(name);}},
   setAttribute:(key,value)=>{attrs[key]=value;}};
 assignReferenceNumber(node,'4-1-3');
 assert.equal(node.dataset.stepNo,'4-1-3');
 assert.equal(attrs['data-navigation-reference'],'4-1-3');
 assert.equal(node.childNodes[0].textContent,'基本生活費内訳');
 assert.equal(active.has('step-numbered'),true);
});
test('numbering: never duplicate a number already printed in the original title',()=>{
 const classes=new Set();
 const node={nodeType:1,childNodes:[{nodeType:3,textContent:'1．誰が・いつ万一となるか'}],dataset:{},
 classList:{toggle:(name,on)=>{if(on)classes.add(name);else classes.delete(name);}},
 setAttribute(){}};
 assignReferenceNumber(node,'1-3-1');
 assert.equal(classes.has('step-numbered'),false);
 assert.equal(node.dataset.stepNo,'1-3-1');
});
