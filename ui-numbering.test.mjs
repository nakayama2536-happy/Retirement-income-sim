import test from 'node:test';import assert from 'node:assert/strict';
import {navigationNumber,MAIN_SECTIONS,CHILD_SECTIONS} from './ui-numbering.mjs';
test('numbering: stable main sections',()=>assert.deepEqual(MAIN_SECTIONS.map(([group])=>navigationNumber(group)),['1','2','3','4','5']));
test('numbering: unique child tab references',()=>{const keys=[];for(const group of Object.keys(CHILD_SECTIONS))for(const tab of CHILD_SECTIONS[group])keys.push(navigationNumber(group,tab));assert.equal(new Set(keys).size,keys.length);assert.equal(navigationNumber('income','pension'),'2-5');assert.equal(navigationNumber('expense','expenses'),'4-1');});
test('numbering: unknown entries return null',()=>{assert.equal(navigationNumber('nope'),null);assert.equal(navigationNumber('income','nope'),null);});
