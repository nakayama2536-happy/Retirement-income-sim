// Synthetic acceptance fixtures only. Private backups must never be bundled.
import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectCashflowSources as inspect, resolveBaseAmount as resolve, cashflowSourceSignature as signature} from './cashflow-sources.mjs';

const PUBLIC='public-v0.9', WORK='work-v0.9.7';
const rent='expense/key:housing/key:rent', housing='expense/key:housing';
const config=()=>({
  plan:{startAge:64,endAge:72,inflation:0,initialAsset:1234,initialAssetIncludesIdeco:false},
  budgets:[{fromAge:65,toAge:72,annualBudget:120,travelReference:4,note:'retain',future:{a:[1,2]}}],
  expenseDetail:{monthlyCategories:[{key:'housing',label:'住居',items:[{key:'rent',label:'家賃',amount:5}]}],travelAnnualBase:4},
  cashflow:{taxSocialMode:'manual',expenseCategories:[{key:'housing',label:'住居',items:[{key:'rent',label:'家賃',periods:[{fromAge:64,toAge:64,amount:5},{fromAge:65,toAge:72,amount:8}]}]}],travel:[{fromAge:64,toAge:72,annualAmount:4}],manualIncomeItems:[],periodOverrides:[]},
  actuals:{65:{endAsset:1200,future:{x:1}}},reviews:{65:{note:'kept'}},futureConfig:{history:[{id:'h1',amount:3}]} 
});
const value=(c,id=rent,age=65,profile=WORK)=>resolve(inspect(c,{sourceProfile:profile}),{itemId:id,age});
const override=(kind,key,amount,extra={})=>({kind,key,amount,unit:'monthly',fromAge:65,toAge:65,...extra});
const codes=v=>v.diagnostics.map(d=>d.code);
function freeze(x){ if(x && typeof x === 'object'){Object.values(x).forEach(freeze);Object.freeze(x);}return x; }

test('A01 public periods are monthly; known provenance uses 8 and retains Work 5',()=>{
  const c=config(),v=inspect(c,{sourceProfile:PUBLIC});
  const r=resolve(v,{itemId:rent,age:65});
  assert.equal(r.amount,8);assert.equal(r.unit,'monthly');assert.equal(r.route,'budget-detail');
  assert.equal(value(c,rent,65,WORK).amount,5);assert.equal(value(c,rent,64,PUBLIC).amount,5);
  assert.equal(r.sourceRefs[0].path,'/cashflow/expenseCategories/0/items/0/periods/1');
  assert.deepEqual(v.retainedSource,c);
});
test('A01 public-only and Work-only sources can be read without inventing the other',()=>{
  const p=config();delete p.expenseDetail;delete p.cashflow.periodOverrides;
  assert.equal(value(p,rent,65,'unknown').amount,8);
  const w=config();w.cashflow={};assert.equal(value(w,rent,65,'unknown').amount,5);
  assert.equal(value(w,rent,65,PUBLIC).status,'missing');
});
test('A02 parent override replaces the category; child remains recorded and suppressed',()=>{
  const c=config();c.cashflow.periodOverrides=[override('expense','housing',7),override('expense','rent',8)];
  const v=inspect(c,{sourceProfile:WORK}),r=resolve(v,{itemId:housing,age:65});
  assert.equal(r.amount,7);assert.ok(r.suppressedRules.some(x=>x.endsWith('/periodOverrides/1')));
  assert.equal(resolve(v,{itemId:rent,age:65}).reason,'suppressed-by-parent');
  assert.equal(resolve(v,{itemId:housing,age:66}).amount,5);
  assert.deepEqual(v.retainedSource.cashflow.periodOverrides,c.cashflow.periodOverrides);
});
test('A02 child override uses annual-to-monthly conversion exactly once',()=>{
  const c=config();c.cashflow.periodOverrides=[override('expense','rent',96,{unit:'annual'})];
  assert.equal(value(c).amount,8);assert.equal(value(c,housing).amount,8);
});
test('A03 unknown source conflicts instead of choosing 8 over 5',()=>{
  const c=config(),v=inspect(c),r=resolve(v,{itemId:rent,age:65});
  assert.equal(r.status,'conflict');assert.equal(r.reason,'source-conflict');assert.equal(r.amount,null);
  assert.deepEqual(r.candidates.map(x=>x.amount),[8,5]);assert.ok(codes(v).includes('source-conflict'));
});
test('A03 equal shared budgets may be viewed together with both references',()=>{
  const r=value(config(),'management-budget',65,'unknown');assert.equal(r.status,'resolved');assert.equal(r.amount,120);assert.equal(r.sourceRefs.length,2);
});
test('A03 equal amount with a different period basis is still not declared identical',()=>{
  const c=config();c.cashflow.expenseCategories[0].items[0].periods[1].amount=5;
  assert.equal(value(c,rent,65,'unknown').status,'conflict');
});
test('A03 broken main source is not replaced by the old fixed source',()=>{
  const c=config();c.cashflow.expenseCategories[0].items[0].periods='{broken';
  assert.equal(value(c,rent,65,PUBLIC).status,'unsupported');assert.equal(value(c,rent,65,'unknown').status,'conflict');
});
test('A04 explicit travel zero wins over a fallback; unmatched period identifies fallback',()=>{
  const c=config();c.cashflow.travel=[{fromAge:65,toAge:65,annualAmount:0}];
  assert.equal(value(c,'travel-plan',65,PUBLIC).amount,0);assert.equal(value(c,'travel-plan',65,PUBLIC).fallback,false);
  const r=value(c,'travel-plan',66,PUBLIC);assert.equal(r.amount,4);assert.equal(r.valueOrigin,'legacy-fallback');
  assert.equal(value(c,'travel-plan',64,PUBLIC).status,'missing');
});
test('A04 a matching blank travel rule does not silently use the fallback',()=>{
  const c=config();c.cashflow.travel=[{fromAge:65,toAge:65,annualAmount:null}];
  assert.equal(value(c,'travel-plan',65,PUBLIC).status,'missing');assert.equal(value(c,'travel-plan',65,PUBLIC).amount,null);
});
test('A04 missing travel fields do not become a complete zero-cost forecast',()=>{
  const c=config();delete c.cashflow.travel;delete c.budgets[0].travelReference;delete c.expenseDetail.travelAnnualBase;
  assert.equal(value(c,'travel-plan',65,PUBLIC).status,'missing');assert.equal(value(c,'travel-plan').status,'missing');
});
test('A05 same child key in different parents has separate IDs; ambiguous override stops',()=>{
  const c=config();c.expenseDetail.monthlyCategories.push({key:'transport',label:'移動',items:[{key:'rent',label:'家賃',amount:2}]});
  const other='expense/key:transport/key:rent';assert.equal(value(c,other).amount,2);
  c.cashflow.periodOverrides=[override('expense','rent',8)];
  const v=inspect(c,{sourceProfile:WORK});assert.ok(codes(v).includes('ambiguous-override'));
  assert.equal(resolve(v,{itemId:rent,age:65}).status,'conflict');assert.equal(resolve(v,{itemId:other,age:65}).status,'conflict');
  assert.equal(resolve(v,{itemId:other,age:66}).amount,2);
});
test('A06 duplicate key inside one category cannot be resolved by array order',()=>{
  const c=config();c.expenseDetail.monthlyCategories[0].items.push({key:'rent',label:'別名',amount:3});
  assert.equal(value(c).status,'conflict');assert.ok(codes(inspect(c)).includes('duplicate-identity'));
});
test('A06 missing ID/key is diagnostic; a display label is not silently used as a key',()=>{
  const c=config();delete c.expenseDetail.monthlyCategories[0].items[0].key;
  const v=inspect(c,{sourceProfile:WORK}),u=v.items.find(i=>i.itemId.startsWith('unresolved:'));
  assert.ok(codes(v).includes('missing-identity'));assert.equal(resolve(v,{itemId:u.itemId,age:65}).status,'conflict');
  assert.equal(resolve(v,{itemId:housing,age:65}).status,'conflict');
});
test('A06 different explicit IDs do not conceal a duplicate legacy key',()=>{
  const c=config();c.expenseDetail.monthlyCategories[0].items=[{id:'a',key:'rent',amount:2},{id:'b',key:'rent',amount:3}];
  const v=inspect(c,{sourceProfile:WORK});assert.ok(codes(v).includes('duplicate-key'));assert.equal(value(c,housing).status,'conflict');
});
test('A07 scoped IDs survive row reorder and label edits when identifiers are unique',()=>{
  const c=config();c.expenseDetail.monthlyCategories[0].items=[{id:'a',key:'rent',label:'旧名',amount:2},{id:'b',key:'utility',label:'水道',amount:3}];
  const first=inspect(c,{sourceProfile:WORK});c.expenseDetail.monthlyCategories[0].items.reverse();c.expenseDetail.monthlyCategories[0].items[1].label='新名';
  const second=inspect(c,{sourceProfile:WORK});
  assert.deepEqual(first.items.map(i=>i.itemId).sort(),second.items.map(i=>i.itemId).sort());
  assert.equal(resolve(second,{itemId:'expense/key:housing/id:a',age:65}).amount,2);
  assert.notEqual(first.retainedSourceSignature,second.retainedSourceSignature);
});
test('A07 explicit binding needs the exact source signature; stale bindings stop',()=>{
  const c=config(),row=c.cashflow.expenseCategories[0].items[0];row.key='public-rent';
  const b={sourcePath:'/cashflow/expenseCategories/0/items/0',sourceSignature:signature(row),itemId:rent};
  const good=inspect(c,{sourceProfile:PUBLIC,identityBindings:[b]});assert.equal(resolve(good,{itemId:rent,age:65}).amount,8);
  row.label='変更';const stale=inspect(c,{sourceProfile:PUBLIC,identityBindings:[b]});
  assert.ok(codes(stale).includes('invalid-identity-binding'));assert.equal(resolve(stale,{itemId:'expense/key:housing/key:public-rent',age:65}).status,'conflict');
});
for (const [raw,status] of [[0,'resolved'],['0','resolved'],['','missing'],[' ','missing'],[null,'missing'],[undefined,'missing'],[-1,'unsupported'],['not a number','unsupported'],[false,'unsupported'],[Infinity,'unsupported']]) {
  test(`A08 amount ${String(raw)} remains ${status} without coercing to zero`,()=>{
    const c=config();c.expenseDetail.monthlyCategories[0].items[0].amount=raw;
    const r=value(c);assert.equal(r.status,status);assert.equal(r.amount,status==='resolved'?0:null);
  });
}
test('A08 unknown unit and monthly budget identity are not silently relabelled',()=>{
  const c=config();c.cashflow.periodOverrides=[override('expense','rent',8,{unit:'week'})];assert.equal(value(c).status,'unsupported');
  c.cashflow.periodOverrides=[override('budget','管理予算',200,{unit:'annual'})];
  assert.equal(value(c,'management-budget').amount,120);assert.ok(codes(inspect(c)).includes('unmapped-override'));
});
test('A08 public expense periods remain monthly even if unknown metadata says annual',()=>{
  const c=config();c.cashflow.expenseCategories[0].items[0].unit='annual';
  assert.equal(value(c,rent,65,PUBLIC).unit,'monthly');assert.equal(value(c,rent,65,PUBLIC).amount,8);
});
test('A08 excessive finite inputs cannot overflow to a resolved Infinity',()=>{
  const c=config();c.cashflow.periodOverrides=[override('budget','budget',Number.MAX_VALUE,{unit:'monthly'})];
  assert.equal(value(c,'management-budget').status,'unsupported');
});
test('A09 overlapping equal-priority rules conflict, even with equal amounts',()=>{
  const c=config();c.cashflow.periodOverrides=[override('expense','rent',8),override('expense','rent',8)];
  assert.equal(value(c).reason,'overlapping-rules');assert.ok(codes(inspect(c)).includes('overlapping-rules'));
});
test('A09 inclusive boundaries and adjacent rules have no extra overlap',()=>{
  const c=config();c.cashflow.periodOverrides=[override('expense','rent',8,{fromAge:65,toAge:66}),override('expense','rent',9,{fromAge:67,toAge:68})];
  assert.equal(value(c,rent,64).amount,5);assert.equal(value(c,rent,66).amount,8);assert.equal(value(c,rent,67).amount,9);assert.equal(value(c,rent,69).amount,5);
});
test('A09 invalid range does not fall through to a valid old amount',()=>{
  const c=config();c.cashflow.periodOverrides=[override('expense','rent',8,{fromAge:'',toAge:66})];
  assert.equal(value(c).status,'unsupported');assert.ok(codes(inspect(c)).includes('invalid-period'));
});
test('A10 reference income and posted income with equal labels/amounts stay separate',()=>{
  const c=config();c.cashflow.manualIncomeItems=[{key:'extra',label:'入金',unit:'annual',periods:[{fromAge:65,toAge:65,amount:100}]}];
  c.cashflow.periodOverrides=[override('income','extra',100,{label:'入金',unit:'annual',fundingTreatment:'separate'})];
  c.events=[{id:'payment-1',type:'income',label:'入金',date:'2045-01-01',amount:100}];
  const v=inspect(c,{sourceProfile:WORK});
  assert.equal(resolve(v,{itemId:'income-reference/key:extra',age:65}).route,'income-reference');
  const posted=resolve(v,{itemId:'income-posted/override/key:extra',age:65});assert.equal(posted.amount,100);assert.equal(posted.route,'income-posted');
  assert.equal(posted.fundingTreatment,'separate');assert.equal(v.items.filter(i=>i.kind==='income').length,2);
  assert.equal(resolve(v,{itemId:'event/id:payment-1',age:65}).status,'unsupported');
});
test('A10 monthly reference income keeps its unit; an unspecified unit remains unsupported',()=>{
  const c=config();c.cashflow.manualIncomeItems=[{key:'extra',unit:'monthly',periods:[{fromAge:65,toAge:65,amount:3}]}];
  assert.equal(value(c,'income-reference/key:extra').amount,3);assert.equal(value(c,'income-reference/key:extra').unit,'monthly');
  delete c.cashflow.manualIncomeItems[0].unit;assert.equal(value(c,'income-reference/key:extra').status,'unsupported');
});
test('A11 tax fallback zero is preserved alongside the old 4/month discrepancy',()=>{
  const c=config();c.cashflow.expenseCategories=[{key:'taxSocial',fallbackMonthly:0}];
  const v=inspect(c,{sourceProfile:PUBLIC}),r=resolve(v,{itemId:'expense/key:taxSocial',age:65});
  assert.equal(r.amount,0);assert.equal(r.method,'public-manual-fallback');assert.equal(r.priceBasis,'target-period-nominal');
  const d=v.diagnostics.find(d=>d.code==='legacy-tax-fallback-default');assert.equal(d.rawAmount,0);assert.equal(d.legacyAnnualAmount,48);
});
test('A11 automatic tax methods remain deferred rather than claiming a computed zero',()=>{
  const c=config();c.cashflow.taxSocialMode='auto_if_possible';c.cashflow.expenseCategories=[{key:'taxSocial',fallbackMonthly:0}];
  c.expenseDetail.monthlyCategories=[{key:'taxSocial',amount:0}];
  for(const profile of [PUBLIC,WORK]) {const r=value(c,'expense/key:taxSocial',65,profile);assert.equal(r.status,'unsupported');assert.equal(r.amount,null);}
});
test('A12 repeated reads preserve all fields of the current plan and two scenarios',()=>{
  const cfg=config(),bundle={config:cfg,scenarios:[{id:'a',name:'基準',role:'baseline',selected:false,config:structuredClone(cfg),future:{a:1}},{id:'b',name:'比較',role:'scenario',selected:true,config:structuredClone(cfg),history:[1]}]};
  const before=structuredClone(bundle);freeze(bundle);
  for(const c of [bundle.config,...bundle.scenarios.map(x=>x.config)]) {
    const first=inspect(c);for(let i=0;i<3;i++) {const next=inspect(c);assert.deepEqual(next,first);assert.deepEqual(next.retainedSource,c);}
    first.retainedSource.budgets[0].future.a.push(3);assert.deepEqual(c.budgets[0].future.a,[1,2]);
  }
  assert.deepEqual(bundle,before);
});
test('A12 reading and resolving access no DOM, storage, or clock APIs',()=>{
  const c=config(),names=['localStorage','document'],old=names.map(n=>Object.getOwnPropertyDescriptor(globalThis,n));
  let accesses=0;const oldNow=Date.now;
  try {
    names.forEach(n=>Object.defineProperty(globalThis,n,{configurable:true,get(){accesses++;throw new Error('forbidden API');}}));
    Date.now=()=>{accesses++;throw new Error('clock forbidden');};
    const v=inspect(c);resolve(v,{itemId:rent,age:65});assert.equal(accesses,0);
  } finally { Date.now=oldNow;names.forEach((n,i)=>old[i]?Object.defineProperty(globalThis,n,old[i]):delete globalThis[n]); }
});
test('car-disposal source and displaced records are retained with no transfer double entry',()=>{
  const c=config();c.cashflow.carDisposalDisplaced=[override('expense','car',2,{future:{note:'keep'}})];
  c.cashflow.periodOverrides=[override('expense','car',0,{source:'car-disposal'}),override('expense','careTransit',2,{source:'car-disposal'})];
  const v=inspect(c,{sourceProfile:WORK});assert.equal(resolve(v,{itemId:'expense-added/key:car',age:65}).amount,0);
  assert.equal(v.rules.find(r=>r.metadata?.key==='careTransit').generatedBy,'car-disposal');assert.deepEqual(v.retainedSource,c);
});
test('new expense rows with the same key across adjacent periods remain one item',()=>{
  const c=config();c.cashflow.periodOverrides=[override('expense','newCost',2),override('expense','newCost',3,{fromAge:66,toAge:67})];
  const v=inspect(c,{sourceProfile:WORK});assert.equal(v.items.filter(i=>i.itemId==='expense-added/key:newCost').length,1);
  assert.equal(resolve(v,{itemId:'expense-added/key:newCost',age:66}).amount,3);
});
test('unknown metadata on budget, event, iDeCo and salary mode is retained without adoption',()=>{
  const c=config();c.ideco={currentBalance:300,future:{a:1}};c.cashflow.salaryLife={mode:'net-transfer-v1',pre65MonthlyBudget:4,future:{a:1}};
  c.events=[{id:'exp',date:'2045-01-01',type:'expense',amount:10,inflationAdjusted:true,fundingTreatment:'budget',future:{a:1}}];
  const v=inspect(c,{sourceProfile:WORK});assert.equal(resolve(v,{itemId:'ideco-transfer',age:65}).route,'asset-transfer');
  assert.equal(resolve(v,{itemId:'pre65-budget',age:64}).status,'unsupported');assert.equal(v.items.find(i=>i.itemId==='event/id:exp').priceBasis,'plan-start-base');
  assert.deepEqual(v.retainedSource,c);assert.equal(inspect(config()).retainedSource.cashflow.salaryLife,undefined);
});
test('incomplete child rows report subtotal and missing count, never a complete total',()=>{
  const c=config();c.expenseDetail.monthlyCategories[0].items.push({key:'utility',amount:null});
  const r=value(c,housing);assert.equal(r.status,'missing');assert.equal(r.amount,null);assert.equal(r.knownSubtotal,5);assert.equal(r.unresolvedCount,1);
});
test('absent Work detail blocks legacy added-expense/travel activity',()=>{
  const c=config();c.expenseDetail.monthlyCategories=[];c.cashflow.periodOverrides=[override('expense','extra',3)];
  assert.equal(value(c,'travel-plan').status,'unsupported');assert.equal(value(c,'expense-added/key:extra').status,'unsupported');
});
test('source inspection and result snapshots do not alias the caller or one another',()=>{
  const c=config(),v=inspect(c,{sourceProfile:PUBLIC}),r=resolve(v,{itemId:rent,age:65});r.sourceRefs[0].path='changed';r.periods[0].fromAge=0;
  assert.equal(resolve(v,{itemId:rent,age:65}).periods[0].fromAge,65);assert.equal(c.cashflow.expenseCategories[0].items[0].periods[1].fromAge,65);
});
test('invalid source option and invalid ages cannot become an implicit default',()=>{
  assert.throws(()=>inspect(config(),{sourceProfile:'latest'}));assert.throws(()=>inspect(null));
  for(const age of [null,'65',65.5,-1,Infinity]) assert.equal(value(config(),rent,age).status,'unsupported');
});
test('malformed override collection blocks Work budget/detail rather than using old values',()=>{
  const c=config();c.cashflow.periodOverrides='broken';
  for(const id of [rent,housing,'management-budget','travel-plan']) assert.equal(value(c,id).reason,'invalid-source-container');
  assert.equal(value(c,'management-budget',65,PUBLIC).amount,120);
  assert.equal(value(c,'management-budget',65,'unknown').status,'conflict');
});
test('null cashflow cannot silently be treated as an empty valid source',()=>{
  const c=config();c.cashflow=null;
  assert.equal(value(c,'management-budget',65,PUBLIC).status,'unsupported');assert.equal(value(c,rent).status,'unsupported');
});
test('posted income uses a stable annual unit regardless of period ordering',()=>{
  const c=config();c.cashflow.periodOverrides=[override('income','extra',3),override('income','extra',48,{fromAge:66,toAge:67,unit:'annual'})];
  const id='income-posted/override/key:extra';assert.equal(value(c,id).amount,36);assert.equal(value(c,id).unit,'annual');
  c.cashflow.periodOverrides.reverse();assert.equal(value(c,id).amount,36);assert.equal(value(c,id,66).amount,48);
});
test('selected format supplies its own label; a manual tax override has base-price semantics',()=>{
  const c=config();c.expenseDetail.monthlyCategories[0].items[0].label='Work側の名称';
  assert.equal(inspect(c,{sourceProfile:WORK}).items.find(i=>i.itemId===rent).label,'Work側の名称');
  c.expenseDetail.monthlyCategories=[{key:'taxSocial',amount:0}];c.cashflow.periodOverrides=[override('expense','taxSocial',2)];
  const r=value(c,'expense/key:taxSocial');assert.equal(r.amount,2);assert.equal(r.priceBasis,'plan-start-base');
});
test('budget overlap and missing coverage remain separate from explicit zero',()=>{
  const c=config();assert.equal(value(c,'management-budget',64).status,'missing');
  c.budgets[0].annualBudget=0;assert.equal(value(c,'management-budget').amount,0);
  c.budgets.push({fromAge:65,toAge:65,annualBudget:0});assert.equal(value(c,'management-budget').status,'conflict');
});
test('no birth dates, price indexes or persisted history are computed by read adapters',()=>{
  const c=config(),before=structuredClone(c);c.plan.inflation=12;const v=inspect(c,{sourceProfile:PUBLIC});
  assert.equal(resolve(v,{itemId:rent,age:65}).amount,8);assert.equal(resolve(v,{itemId:'management-budget',age:65}).amount,120);
  assert.equal(c.people,undefined);assert.deepEqual(c.futureConfig,before.futureConfig);
});
test('a corrupt unidentifiable override row prevents silent reuse of base amounts',()=>{
  const c=config();c.cashflow.periodOverrides=[null];
  assert.equal(value(c,'management-budget').status,'unsupported');assert.equal(value(c,rent).status,'unsupported');
});
test('budget and its travel reference have distinct rule IDs even on the same source row',()=>{
  const v=inspect(config()),ids=v.rules.map(r=>r.ruleRef);
  assert.equal(new Set(ids).size,ids.length);
  const sameSource=v.rules.filter(r=>r.profile===PUBLIC&&r.sourceRefs[0].path==='/budgets/0');
  assert.equal(sameSource.length,2);assert.notEqual(sameSource[0].ruleRef,sameSource[1].ruleRef);
});
test('aggregate overflow cannot be presented as a confirmed subtotal',()=>{
  const c=config();c.expenseDetail.monthlyCategories[0].items=[{key:'a',amount:Number.MAX_VALUE},{key:'b',amount:Number.MAX_VALUE}];
  assert.equal(value(c,housing).status,'unsupported');assert.equal(value(c,housing).amount,null);
});
