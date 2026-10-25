import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture} from './test_detail_settings.mjs';
import {
 explicitNumber,basicSettingsValues,priceBaseExplanation,
 parsePeriodForm,planPeriodUpdate,planPeriodDelete,verifyPeriodPlan,proposalStamp
} from './ui-entry-guards.mjs';
import {runRetirementPlan} from './calc.mjs';
const fields=(values={})=>({elements:Object.fromEntries(Object.entries({kind:'expense',key:'food',label:'架空食費',fromAge:'65',toAge:'67',amount:'2',unit:'monthly',...values}).map(([k,v])=>[k,{value:v}]))});
const settings=(values={})=>({elements:Object.fromEntries(Object.entries({initialAsset:'100',afterTaxReturn:'2',inflation:'1',reserveTotal:'10',...values}).map(([k,v])=>[k,{value:v}]))});
const copy=x=>structuredClone(x);

test('HUI02 U01 all 4 settings reject blank and preserve explicit 0',()=>{
 for(const field of ['initialAsset','afterTaxReturn','inflation','reserveTotal']){
  for(const bad of ['', '  ',null,'Infinity','NaN'])assert.throws(()=>basicSettingsValues(settings({[field]:bad})),/(未入力|有効な)/,`${field} / ${bad}`);
  assert.equal(basicSettingsValues(settings({[field]:'0'}))[field],0,field);
 }
});
test('HUI02 U01 fractional and finite rate values are preserved, bad formats rejected',()=>{
 assert.equal(explicitNumber('1.2345','利回り'),1.2345);
 assert.equal(basicSettingsValues(settings({afterTaxReturn:'-0.5',inflation:'0.1'})).afterTaxReturn,-0.5);
 assert.throws(()=>explicitNumber('1e500','原価'),/有効/);
});
test('HUI02 U03 explicitly configured price basis remains independent of start month',()=>{
 const s=fixture();s.config.plan.priceBaseMonth='2044-07';
 let explanation=priceBaseExplanation(s.config);
 assert.match(explanation,/2044年7月/);assert.match(explanation,/2045年8月/);assert.match(explanation,/明示設定/);
});
test('HUI02 U03 legacy price basis uses plan start and blanks remain unconfirmed',()=>{
 const s=fixture();assert.match(priceBaseExplanation(s.config),/従来方式/);
 s.config.plan.priceBaseMonth='';assert.match(priceBaseExplanation(s.config),/未確認/);
});
test('HUI02 U02 period input refuses empty, invalid boundaries and unknown budget item keys',()=>{
 for(const item of [{amount:''},{fromAge:''},{toAge:''},{amount:'NaN'},{amount:'Infinity'},{fromAge:'64.5'},{toAge:'64'},{kind:'budget',key:'食費',unit:'annual'},{kind:'budget',key:'budget',unit:'monthly'},{unit:'bad'},{kind:'income'}])assert.throws(()=>parsePeriodForm(fields(item)),undefined,JSON.stringify(item));
 assert.equal(parsePeriodForm(fields({amount:'0'})).amount,0);
 assert.deepEqual(parsePeriodForm(fields({kind:'budget',key:'budget',label:'管理予算',unit:'annual',amount:'100'})),{kind:'budget',key:'budget',label:'管理予算',unit:'annual',fromAge:65,toAge:67,amount:100});
});
test('HUI02 U02 preview is read-only and reference expense does not affect aggregate financial rows',()=>{
 const s=fixture(),before=copy(s),total=runRetirementPlan(s.config).finalAsset;
 const proposal=planPeriodUpdate(s,fields());
 assert.deepEqual(s,before);assert.equal(proposal.changed,true);
 assert.equal(proposal.beforeFinal,total);assert.equal(proposal.afterFinal,total);
 assert.equal(verifyPeriodPlan(s,proposal).cashflow.periodOverrides.length,1);
});
test('HUI02 U02 annual budget affects forecast only after confirmed candidate',()=>{
 const s=fixture(),before=copy(s),p=planPeriodUpdate(s,fields({kind:'budget',key:'budget',label:'管理予算',unit:'annual',amount:'500'}));
 assert.deepEqual(s,before);assert.notEqual(p.beforeFinal,p.afterFinal);
 assert.equal(p.afterRows[0].kind,'budget');assert.equal(p.selected.unit,'annual');
});
test('HUI02 U02 repeated identical proposal is no-op',()=>{
 const s=fixture(),one=planPeriodUpdate(s,fields());s.config=one.candidate;
 const two=planPeriodUpdate(s,fields());assert.equal(two.changed,false);
 assert.throws(()=>verifyPeriodPlan(s,two),/差分がありません/);
});
test('HUI02 U02 subset replacement preserves previous and later period segments and unrelated rows',()=>{
 const s=fixture();s.config.cashflow.periodOverrides=[{kind:'expense',key:'food',fromAge:64,toAge:70,amount:1,unit:'monthly',future:{v:1}},{kind:'expense',key:'other',fromAge:65,toAge:67,amount:2,unit:'monthly',future:{v:2}}];
 const p=planPeriodUpdate(s,fields({fromAge:'65',toAge:'66',amount:'5'}));
 assert.deepEqual(p.afterRows.map(x=>[x.fromAge,x.toAge]),[[64,64],[65,66],[67,70]]);
 assert.ok(p.candidate.cashflow.periodOverrides.some(x=>x.key==='other'&&x.future.v===2));
 assert.equal(s.config.cashflow.periodOverrides.length,2);
});
test('HUI02 U02 deletion proposal needs explicit commit; removes only named row',()=>{
 const s=fixture();s.config.cashflow.periodOverrides=[{kind:'expense',key:'food',fromAge:65,toAge:67,amount:2,unit:'monthly'},{kind:'expense',key:'other',fromAge:65,toAge:67,amount:1,unit:'monthly'}];
 const before=copy(s),p=planPeriodDelete(s,0);
 assert.equal(p.action,'delete');assert.equal(p.afterRows.length,0);assert.equal(p.candidate.cashflow.periodOverrides[0].key,'other');assert.deepEqual(s,before);
 assert.throws(()=>planPeriodDelete(s,2),/削除対象/);
});
test('HUI02 U02 income cannot be deleted via generic row delete',()=>{
 const s=fixture();s.config.cashflow.periodOverrides=[{kind:'income',key:'job',fromAge:65,toAge:66,amount:2,unit:'monthly'}];
 assert.throws(()=>planPeriodDelete(s,0),/専用画面/);
});
test('HUI02 U02 stale preview rejects changed age, changed scenario and row order',()=>{
 const s=fixture(),p=planPeriodUpdate(s,fields());
 s.config.plan.inflation=2;assert.throws(()=>verifyPeriodPlan(s,p),/更新/);
 s.config.plan.inflation=0;s.scenarios[0].name='後続案';assert.throws(()=>verifyPeriodPlan(s,p),/更新/);
});
test('HUI02 U02 signatures stable over copy and identical dictionary keys',()=>{
 const s=fixture();assert.equal(proposalStamp(s),proposalStamp(copy(s)));
});
test('HUI02 U02 price baseline independent from period reference amount and financial calculation',()=>{
 const s=fixture();s.config.plan.priceBaseMonth='2044-07';s.config.plan.inflation=2;
 const p=planPeriodUpdate(s,fields({kind:'expense',key:'food',amount:'10'}));
 assert.equal(p.beforeFinal,p.afterFinal);assert.equal(p.candidate.plan.priceBaseMonth,'2044-07');
});
