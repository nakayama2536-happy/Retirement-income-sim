import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {migrateConfig} from './storage.mjs';
import {runRetirementPlan} from './calc.mjs';
import {simulateMortalityPreview,estimateSurvivorReference65,monthlyIndex} from './mortality-preview.mjs';
import {blankMortalityAllocation,fictionalMortalityAllocation,validateMortalityAllocation,allocateMortalityBudgetRows,calculateMortalityComparison,survivorPensionTiming,agePeriodComparisonRows} from './mortality-comparison.mjs';
const approx=(a,b,t=1e-7)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
function fixture(){
 const c=migrateConfig(JSON.parse(fs.readFileSync(new URL('./tools/browser-test/synthetic-full.json',import.meta.url))).config);
 c.people={primary:{birthDate:'1980-01-15'},spouse:{birthDate:'1981-04-20'}};
 c.plan={...c.plan,startAge:70,endAge:95,startDate:'2050-01-15',priceBaseMonth:'2050-01',calendarMode:'anchored-months-v1',initialAsset:6500,afterTaxReturn:2.4,inflation:1,initialAssetIncludesIdeco:false};
 c.employment={primary:{mainRetirement:{baseDate:'2045-01-15'},sideWork:{monthlyGross:0,startDate:'2050-01-01',endDate:'2055-01-01'}},spouse:{sideWork:{monthlyGross:0,startDate:'2050-01-01',endDate:'2055-01-01'}}};
 c.income={pensions:{primary:{startDate:'2050-01-01',annualAtStart:300},spouse:{startDate:'2050-01-01',annualAtStart:140}}};
 c.unemployment={baselineMode:'none'};c.cashflow={periodOverrides:[]};c.events=[];c.budgets=[{fromAge:70,toAge:95,annualBudget:660}];
 delete c.ideco;delete c.nisa;return c;
}
function compare(c=fixture(),overrides={}){return calculateMortalityComparison({config:c,baseline:runRetirementPlan(c),deathPerson:'primary',deathMonth:'2060-01',survivorTotalAnnual:210,survivorPensionBeforeClaimAnnual:null,funeralExpenseMan:0,allocation:fictionalMortalityAllocation(),planCalculator:runRetirementPlan,acknowledged:true,...overrides});}
function engine(c=fixture(),overrides={}){return simulateMortalityPreview({monthlyRows:allocateMortalityBudgetRows(runRetirementPlan(c,{includeMonthlyDetails:true}).monthlyDetails,blankMortalityAllocation()),deceased:'primary',deathMonth:'2060-01',survivorPublicPensionAnnual:210,pensionEvidence:'assumption',costFactors:Object.fromEntries(blankMortalityAllocation().map(x=>[x.key,x.factor])),funeralExpenseMan:0,annualAfterTaxReturnPct:c.plan.afterTaxReturn,...overrides});}
const ref=()=>({deceasedEmployeeEarningsAnnualBase:160,survivorOwnEmployeeAnnual:50,survivorOwnBasicAnnual:90,survivorAge:70,entitlementConfirmed:true,ownPensionClaimConfirmed:true,deferralConflictReviewed:true});
test('reference is own basic + own employee + topup, not 75% of combined household pension',()=>{const r=estimateSurvivorReference65(ref());approx(r.survivorTopUpAnnual,70);approx(r.totalSurvivingPublicPensionAnnual,210);});
test('higher own pension is paid without a negative survivor topup',()=>{const r=estimateSurvivorReference65({...ref(),survivorOwnEmployeeAnnual:200});approx(r.survivorTopUpAnnual,0);approx(r.totalSurvivingPublicPensionAnnual,290);});
for(const k of ['entitlementConfirmed','ownPensionClaimConfirmed','deferralConflictReviewed'])for(const v of [false,'true',1,null])test(`reference requires explicit boolean: ${k}=${v}`,()=>assert.throws(()=>estimateSurvivorReference65({...ref(),[k]:v}),{code:'survivor-eligibility-unconfirmed'}));
for(const age of [64,65.5,undefined])test(`reference disallows unsupported age ${age}`,()=>assert.throws(()=>estimateSurvivorReference65({...ref(),survivorAge:age}),{code:'survivor-age'}));
for(const n of [null,'',undefined,NaN,Infinity,-1])test(`reference invalid amount ${n}`,()=>assert.throws(()=>estimateSurvivorReference65({...ref(),deceasedEmployeeEarningsAnnualBase:n})));
test('default allocation is explicitly 100% unallocated at 1x',()=>{const a=blankMortalityAllocation(),v=validateMortalityAllocation(a);assert.equal(v.weights.unallocated,1);assert.equal(v.factors.unallocated,1);});
test('fictional allocation adds to 100% and is a different object every call',()=>{const a=fictionalMortalityAllocation();approx(validateMortalityAllocation(a).total,100,1e-5);a[0].share=0;assert.notEqual(fictionalMortalityAllocation()[0].share,0);});
for(const value of [0,.7,1.1])test(`unallocated cannot be changed to ${value}x`,()=>{const a=blankMortalityAllocation();a.at(-1).factor=value;assert.throws(()=>validateMortalityAllocation(a),{code:'unknown-factor'});});
for(const value of [null,'',NaN,-1,101])test(`allocation rejects missing or invalid share ${value}`,()=>{const a=blankMortalityAllocation();a[0].share=value;assert.throws(()=>validateMortalityAllocation(a));});
test('allocation ID duplicates are rejected',()=>{const a=blankMortalityAllocation();a[0].key=a[1].key;assert.throws(()=>validateMortalityAllocation(a),{code:'allocation-key'});});
test('allocation never double applies inflation or changes original monthly data',()=>{const c=fixture(),rows=runRetirementPlan(c,{includeMonthlyDetails:true}).monthlyDetails,before=structuredClone(rows),a=allocateMortalityBudgetRows(rows,fictionalMortalityAllocation());for(const r of a)approx(Object.values(r.expenseComponents).reduce((x,y)=>x+y,0),r.expense);assert.deepEqual(rows,before);});
test('death month keeps baseline; switch occurs in next month',()=>{const x=compare(),i=x.original.monthlyDetails.findIndex(r=>r.month==='2060-01');for(let j=0;j<=i;j++){approx(x.mortality.monthly[j].endAsset,x.original.monthlyDetails[j].endAsset);approx(x.mortality.monthly[j].income,x.original.monthlyDetails[j].totalIncome);}approx(x.mortality.monthly[i+1].publicPension,210/12);assert.equal(x.mortality.firstChangedMonth,'2060-02');});
test('year-end death rolls forward to January',()=>assert.equal(compare(fixture(),{deathMonth:'2060-12'}).mortality.firstChangedMonth,'2061-01'));
test('last month without one-off expense equals original result',()=>{const c=fixture(),b=runRetirementPlan(c,{includeMonthlyDetails:true}),x=compare(c,{deathMonth:b.monthlyDetails.at(-1).month});approx(x.mortality.finalAsset,b.finalAsset);assert.equal(x.mortality.firstChangedMonth,null);});
test('explicit zero survivor pension is accepted, blank is not zero',()=>{const c=fixture();approx(compare(c,{survivorTotalAnnual:0}).mortality.monthly.find(x=>x.postDeath).publicPension,0);assert.throws(()=>compare(c,{survivorTotalAnnual:''}));});
test('month before normal claim does not require unused pre-claim input',()=>{const c=fixture();c.income.pensions.spouse.startDate='2060-02-01';assert.equal(survivorPensionTiming(c,'primary','2060-01').needsPreClaim,false);const x=compare(c);approx(x.mortality.monthly.find(r=>r.month==='2060-02').publicPension,210/12);});
test('real intermediate months require explicit pre-claim annual amount',()=>{const c=fixture();c.income.pensions.spouse.startDate='2060-04-01';assert.equal(survivorPensionTiming(c,'primary','2060-01').needsPreClaim,true);assert.throws(()=>compare(c),{code:'pension-before-claim'});});
test('two-stage pension uses 120 before claim then 210; no double adding surviving old pension',()=>{const c=fixture();c.income.pensions.spouse.startDate='2060-04-01';const x=compare(c,{survivorPensionBeforeClaimAnnual:120}).mortality.monthly;for(const month of ['2060-02','2060-03'])approx(x.find(r=>r.month===month).publicPension,10);approx(x.find(r=>r.month==='2060-04').publicPension,17.5);});
test('invalid pension date is rejected, not silently truncated to a valid month',()=>{const c=fixture();c.income.pensions.spouse.startDate='2060-02-31';assert.throws(()=>survivorPensionTiming(c,'primary','2060-01'),{code:'pension-date'});});
test('funeral expense is paid once in the death month and earns no extra return that month',()=>{const a=compare(),b=compare(fixture(),{funeralExpenseMan:80}),i=a.mortality.monthly.findIndex(r=>r.month==='2060-01');approx(b.mortality.monthly[i].endAsset-a.mortality.monthly[i].endAsset,-80);assert.equal(b.mortality.monthly.filter(r=>r.funeralExpense!==0).length,1);});
test('food factor affects only its share; unallocated share stays at 1',()=>{const c=fixture();c.plan.afterTaxReturn=0;c.plan.inflation=0;const a=blankMortalityAllocation();a[0].share=20;a.at(-1).share=80;const x=compare(c,{allocation:a}).mortality.monthly.find(r=>r.postDeath);approx(x.expense,660/12*(.2*.7+.8));});
test('medical stress multiplier 1.5 increases costs without touching base',()=>{const c=fixture(),a=fictionalMortalityAllocation(),b=structuredClone(a);b.find(r=>r.key==='medical').factor=1.5;assert.ok(compare(c,{allocation:b}).mortality.finalAsset<compare(c,{allocation:a}).mortality.finalAsset);});
test('surviving spouse labor continues but deceased primary labor stops',()=>{const c=fixture();c.employment.primary.sideWork={monthlyGross:5,startDate:'2050-01-01',endDate:'2076-01-01'};c.employment.spouse.sideWork={monthlyGross:3,startDate:'2050-01-01',endDate:'2076-01-01'};const x=compare(c).mortality.monthly.find(r=>r.postDeath);approx(x.income,210/12+3);});
test('primary survives: primary labor continues and spouse labor stops',()=>{const c=fixture();c.employment.primary.sideWork={monthlyGross:5,startDate:'2050-01-01',endDate:'2076-01-01'};c.employment.spouse.sideWork={monthlyGross:3,startDate:'2050-01-01',endDate:'2076-01-01'};const x=compare(c,{deathPerson:'spouse',survivorTotalAnnual:300}).mortality.monthly.find(r=>r.postDeath);approx(x.income,300/12+5);});
test('existing extraordinary expense is preserved once and separately aggregated',()=>{const c=fixture();c.events=[{date:'2060-06-01',label:'Fictional repair',type:'expense',amount:20}];const x=compare(c,{funeralExpenseMan:80}),y=agePeriodComparisonRows(x.original.monthlyDetails,x).find(r=>r.age===80);approx(y.baselineExtraExpense,20);approx(y.previewExtraExpense,100);});
test('year totals exactly reproduce monthly totals and end asset',()=>{const x=compare(),rows=agePeriodComparisonRows(x.original.monthlyDetails,x);approx(rows.reduce((a,r)=>a+r.previewIncome,0),x.mortality.monthly.reduce((a,r)=>a+r.income,0));approx(rows.at(-1).previewEndAsset,x.mortality.finalAsset);assert.equal(rows.reduce((a,r)=>a+r.months,0),x.mortality.monthly.length);});
test('input config and baseline objects remain byte-for-byte JSON identical',()=>{const c=fixture(),b=runRetirementPlan(c),s=JSON.stringify([c,b]);compare(c,{baseline:b});assert.equal(JSON.stringify([c,b]),s);});
for(const [name,mutate,code] of [
 ['continuity',r=>{r[0].endAsset++;},'base-ledger-identity'],
 ['missing month',r=>{r.splice(2,1);},'nonconsecutive-month'],
 ['duplicate month',r=>{r[2].month=r[1].month;},'nonconsecutive-month'],
 ['gain',r=>{r[0].investmentGain++;r[0].endAsset++;},'base-return-rate'],
 ['unknown phase',r=>{r.find(x=>x.month==='2060-02').phase='unrecognized';},'unknown-phase'],
 ['salary phase',r=>{r.find(x=>x.month==='2060-02').phase='salary';},'household-phase-unmodeled'],
 ['legacy salary phase',r=>{r.find(x=>x.month==='2060-02').phase='legacy-before-retirement';},'household-phase-unmodeled'],
 ['labor mismatch',r=>{r.find(x=>x.month==='2060-02').primaryLabor=4;},'labor-components-mismatch'],
 ['budget mismatch',r=>{r[0].expenseComponents.unallocated++;},'budget-not-reconciled']
])test(`fail closed on ${name}`,()=>{const c=fixture(),rows=allocateMortalityBudgetRows(runRetirementPlan(c,{includeMonthlyDetails:true}).monthlyDetails,blankMortalityAllocation());mutate(rows);assert.throws(()=>engine(c,{monthlyRows:rows}),{code});});
for(const month of ['2049-12','2076-02','bad','2060-13'])test(`invalid/outside death month ${month}`,()=>assert.throws(()=>compare(fixture(),{deathMonth:month})));
test('unknown one-off income after death stops instead of assigning to survivor',()=>{const c=fixture();c.events=[{date:'2060-06-01',label:'Unassigned receipt',type:'income',amount:10}];assert.throws(()=>compare(c),{code:'other-income-owner-unclear'});});
test('explicit acknowledgement is mandatory',()=>assert.throws(()=>compare(fixture(),{acknowledged:false}),{code:'not-reviewed'}));
test('changed baseline final asset prevents stale comparison',()=>{const c=fixture(),b=runRetirementPlan(c);b.finalAsset++;assert.throws(()=>compare(c,{baseline:b}),{code:'baseline-stale'});});
test('negative assets are only a depletion flag with first month recorded',()=>{const c=fixture();c.plan.initialAsset=10;const x=compare(c);assert.equal(x.mortality.firstNegativeMonth,x.mortality.monthly.find(r=>r.endAsset<0).month);assert.ok(x.mortality.warnings.some(s=>s.includes('借入')));});
