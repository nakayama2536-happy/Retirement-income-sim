import test from 'node:test';
import assert from 'node:assert/strict';
import {migrateConfig} from './storage.mjs';
import {expenseDisplayModel,expenseDisplayHtml,expenseUnresolvedGuidance} from './expense-display.mjs';

const fixture=({key,amount,tax=false,old=false}={})=>{
 const c=migrateConfig({people:{primary:{birthDate:'1980-08-27'},spouse:{birthDate:'1981-05-01'}},plan:{startAge:65,endAge:66,startDate:'2045-08-27',initialAsset:1000,initialAssetIncludesIdeco:false,afterTaxReturn:0,inflation:0},income:{pensions:{primary:{annualAtStart:0},spouse:{annualAtStart:0}}},budgets:[{fromAge:65,toAge:66,annualBudget:120}],unemployment:{baselineMode:'none'},events:[]});
 const item={label:'架空の家賃'};if(key!==undefined)item.key=key;if(amount!==undefined)item.amount=amount;
 c.expenseDetail={monthlyCategories:[{key:'fixed',label:'架空固定費',items:[item]},...(tax?[{key:'taxSocial',label:'架空税社保',amount:4}]:[])],travelAnnualBase:0};
 if(old)c.cashflow={...c.cashflow,expenseCategories:[{key:'fixed',label:'旧値',items:[{key:'rent',periods:[{fromAge:65,toAge:66,amount:8}]}]}]};
 return c;
};
const detail=c=>{const m=expenseDisplayModel(c,65);return {m,html:expenseDisplayHtml(m,c).detail};};
test('unresolved identity is explained without auto-adoption',()=>{const c=fixture({amount:5}),before=JSON.stringify(c),r=detail(c);assert.match(r.html,/項目を識別するID・キーが不足/);assert.doesNotMatch(r.html,/架空の家賃：60万円/);assert.equal(JSON.stringify(c),before);});
test('missing amount remains unresolved, not zero',()=>{const {html}=detail(fixture({key:'rent'}));assert.match(html,/金額が未入力または不正/);assert.doesNotMatch(html,/架空の家賃：0万円/);});
test('unknown identity and amount produce separate guidance messages',()=>{const {html}=detail(fixture());assert.match(html,/ID・キーが不足/);assert.match(html,/金額が未入力または不正/);});
test('known amount and identity remain resolved, including explicit zero',()=>{for(const amount of [0,5]){const {html}=detail(fixture({key:'rent',amount}));assert.match(html,new RegExp('架空の家賃：'+amount*12+'万円'));}});
test('old source does not silently fill missing standard amount',()=>{const {html}=detail(fixture({key:'rent',old:true}));assert.match(html,/金額が未入力または不正/);});
test('tax reason is separate from ordinary amount',()=>{const {html}=detail(fixture({key:'rent',amount:5,tax:true}));assert.match(html,/税・社会保険の算定条件が未確定/);});
test('user-visible page does not lead with internal paths and diagnostic HTML is escaped',()=>{const {html}=detail(fixture({key:'rent',amount:null}));assert.match(html,/<summary>技術情報（確認用）<\/summary>/);assert.match(html,/未確定の費目は0円として合計せず/);const txt=expenseUnresolvedGuidance(['totally-new-reason']);assert.match(txt[0],/内訳に未確定/);});
test('explanation never changes forecast or saved conditions',()=>{const c=fixture({key:'rent'}),before=structuredClone(c);const a=detail(c),b=detail(c);assert.deepEqual(c,before);assert.equal(a.html,b.html);});
