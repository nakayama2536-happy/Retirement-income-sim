import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';
import {collect} from './tools/package-public.mjs';
import {mountMortalityComparison} from './mortality-ui.mjs';
import {requiredAdditionalCapitalAt64} from './mortality-comparison.mjs';
import {runRetirementPlan} from './calc.mjs';
const read=n=>fs.readFileSync(new URL(n,import.meta.url),'utf8');
const app=read('app.mjs'),html=read('index.html'),ui=read('mortality-ui.mjs'),comparison=read('mortality-comparison.mjs');
test('read-only comparison has its own results subtab and mount',()=>{assert.match(html,/data-group-item="results" data-tab="mortality"/);assert.match(html,/id="mortalityComparisonContainer"/);assert.match(app,/mountMortalityComparison\(document.getElementById\('mortalityComparisonContainer'\)/);});
test('new mortality inputs do not count as adopted unsaved financial controls',()=>assert.match(app,/input\.closest\('#mortality, #pension/));
test('refresh invalidates a trial and external saved-state notifications block the cached baseline',()=>{assert.match(app,/mortalityCard\.invalidate\(\)/);assert.match(app,/mortalityCard\.invalidate\(\{external:true\}\)/);});
test('mortality modules have no persistent data, network, adoption or restore calls',()=>{for(const n of ['mortality-ui.mjs','mortality-comparison.mjs','mortality-preview.mjs'])assert.doesNotMatch(read(n),/\b(?:localStorage|sessionStorage|indexedDB)\s*[.\[]|\b(?:fetch|commitState|replaceState|restoreFullBackup|setItem)\s*\(/);});
test('full browser gate uses synthetic file and disallows external origins',()=>{const t=read('tools/browser-test/mortality-ui-check.mjs');assert.match(t,/mortality-synthetic\.json/);assert.match(t,/r\.abort\(\)/);assert.match(t,/__mortalityWrites/);assert.match(t,/\['webkit',webkit\]/);});
test('new cached assets have matching manifest entries and source bytes',()=>{const {out,runtime}=collect(new URL('.',import.meta.url).pathname),manifest=JSON.parse(out.get('distribution-manifest.json'));for(const name of ['mortality-preview.mjs','mortality-comparison.mjs','mortality-ui.mjs']){assert.ok(runtime.includes(name));const row=manifest.files.find(x=>x.name===name);assert.ok(row);assert.equal(row.sha256,crypto.createHash('sha256').update(out.get(name)).digest('hex'));}});
test('65-year pension is the default source for survivor reference without deriving deferred pension',()=>{
 assert.match(ui,/own\?\.reference65/);
 assert.match(ui,/dead\?\.reference65/);
 assert.match(ui,/form\.elements\.survivorBasic\.value=String\(basic\)/);
 assert.match(ui,/form\.elements\.survivorEmployee\.value=String\(employee\)/);
 assert.match(ui,/form\.elements\.deceasedEarnings\.value=String\(deceasedBase\)/);
 assert.match(ui,/65歳基準の参考内訳/);
 assert.match(ui,/70歳以降の実際の年金内訳ではなく/);
});
test('standard and worst simulation results are separate switchable panels',()=>withMortalityUI(({ids,run,find,content})=>{
 assert.ok(run());
 const root=ids.get('#mortalityResults');
 const standard=find(root,'#mortalityStandardResultPanel'),worst=find(root,'#mortalityWorstResultPanel');
 const stdTab=find(root,'#mortalityStandardTab'),worstTab=find(root,'#mortalityWorstTab');
 assert.ok(standard&&worst&&stdTab&&worstTab);
 assert.equal(standard.hidden,true);assert.equal(worst.hidden,false);
 assert.match(content(standard),/標準シミュレーション/);
 stdTab.handlers.click();assert.equal(standard.hidden,false);assert.equal(worst.hidden,true);
 worstTab.handlers.click();assert.equal(standard.hidden,true);assert.equal(worst.hidden,false);
}));
test('UI uses shared stage boundary, no age or 70-year pension inferred from existing totals',()=>{assert.match(ui,/survivorPensionTiming\(c,p,val\)/);assert.match(comparison,/needsPreClaim:monthlyIndex\(start\)>firstIndex/);assert.match(ui,/未配分/);});
test('totals explain extra expenses and same-month income change',()=>{assert.match(ui,/mortalityMonthlyTransition/);assert.match(ui,/mortalityCostBreakdown/);assert.match(ui,/比較：臨時支出（一時費用込）/);assert.match(ui,/同じ年月の基準案と比較案/);});

// Small event/element model: exercises the actual UI handlers and real monthly
// calculator without claiming browser or persistent-storage integration coverage.
function withMortalityUI(check){
 const ids=new Map(),attrs=new Map(),previousDocument=globalThis.document;
 class Element{
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.name='';this.value='';this.checked=false;this.hidden=false;this.required=false;this.disabled=false;this.dataset={};this.handlers={};this.children=[];this.textContent='';this.attributes=new Map();}
  append(...v){for(const child of v)if(child&&typeof child!=='string')child.parentElement=this;this.children.push(...v);}
  replaceChildren(...v){this.children=[...v];}
  setAttribute(k,v){this.attributes.set(k,String(v));attrs.set(`[${k}="${v}"]`,this);}
  matches(selector){return selector.split(',').some(part=>{
   const q=part.trim(),attribute=q.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
   if(q.startsWith('#'))return this.id===q.slice(1);
   if(!attribute)return this.tagName.toLowerCase()===q;
   const key=attribute[1],datasetKey=key.startsWith('data-')?key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase()):null;
   const value=this.attributes.get(key)??(datasetKey?this.dataset[datasetKey]:this[key]);
   return attribute[2]===undefined?value!==undefined:String(value)===attribute[2];
  });}
  querySelector(q){return find(this,q)||ids.get(q)||attrs.get(q);}
  addEventListener(name,callback){this.handlers[name]=callback;}
 }
 const find=(node,selector)=>{for(const child of node.children){if(typeof child==='string')continue;if(child.matches(selector))return child;const found=find(child,selector);if(found)return found;}return undefined;};
 globalThis.document={createElement:tag=>new Element(tag)};
 try{
  const root=new Element(),form=new Element('form');ids.set('#mortalityForm',form);root.append(form);
  for(const id of ['mortalityState','mortalityResults','mortalityCostRows','mortalityAllocationTotal','mortalityAgeHint','mortalityPreClaimRow','mortalityPreClaimHint','mortalityEstimateNotice','mortalityPensionBreakdown','mortalityFictionalCosts','mortalityResetCosts','mortalityEstimatePension','mortalityClear','mortalityRun']){const element=new Element();element.id=id;ids.set('#'+id,element);root.append(element);}
  form.elements={};
  for(const name of ['deceased','deathMonth','survivorPension','preClaimPension','funeral','deceasedEarnings','survivorEmployee','survivorBasic','entitlement','claimed','deferral','reviewed']){form.elements[name]=new Element('input');form.elements[name].name=name;form.append(form.elements[name]);}
  const source={config:JSON.parse(read('tools/browser-test/mortality-synthetic.json')).config};source.baseline=runRetirementPlan(source.config);
  form.elements.deceased.value='primary';form.elements.funeral.value='0';
  const card=mountMortalityComparison(root,{getConfig:()=>source.config,getBaseline:()=>source.baseline,runPlan:runRetirementPlan});
  form.elements.deathMonth.value='2060-01';form.elements.survivorPension.value='210';
  const run=()=>{form.elements.reviewed.checked=true;form.handlers.submit({preventDefault(){}});return card.getCurrentComparison();};
  const dispatch=(target,type='input')=>form.handlers[type]({target:typeof target==='string'?form.elements[target]:target});
  const content=node=>[node.textContent,...node.children.map(child=>typeof child==='string'?child:content(child))].join(' ');
  const estimate=()=>{for(const [name,value] of [['deceasedEarnings','160'],['survivorEmployee','50'],['survivorBasic','90']])form.elements[name].value=value;for(const key of ['entitlement','claimed','deferral'])form.elements[key].checked=true;ids.get('#mortalityEstimatePension').handlers.click();};
  check({source,root,form,card,ids,run,dispatch,content,find,estimate});
 }finally{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
}
test('external invalidation blocks stale retry and cached reference actions until reload',()=>withMortalityUI(({form,card,ids,run,estimate})=>{
 estimate();assert.equal(ids.get('#mortalityPensionBreakdown').dataset.pensionState,'reference');
 assert.ok(run());card.invalidate({external:true});
 assert.equal(card.getCurrentComparison(),null);assert.equal(form.elements.reviewed.checked,false);
 assert.equal(ids.get('#mortalityPensionBreakdown').dataset.pensionState,'unknown');
 for(const id of ['mortalityRun','mortalityEstimatePension'])assert.equal(ids.get('#'+id).disabled,true);
 assert.equal(run(),null);assert.match(ids.get('#mortalityState').textContent,/別画面.*再読み込み/);
 form.elements.survivorPension.value='999';form.elements.deceasedEarnings.value='160';form.elements.survivorEmployee.value='50';form.elements.survivorBasic.value='90';
 for(const key of ['entitlement','claimed','deferral'])form.elements[key].checked=true;
 ids.get('#mortalityEstimatePension').handlers.click();assert.equal(form.elements.survivorPension.value,'999');
 form.elements.deathMonth.value='2061-01';assert.equal(form.elements.deathMonth.value,'2061-01');
 card.invalidate();assert.equal(run(),null);assert.equal(ids.get('#mortalityRun').disabled,true);
}));
test('same-screen adopted-condition refresh permits a new calculation on the latest baseline',()=>withMortalityUI(({source,form,card,ids,run,estimate})=>{
 estimate();const initial=run();assert.ok(initial);const oldFinal=initial.original.finalAsset;
 source.config=structuredClone(source.config);source.config.plan.initialAsset+=1000;source.baseline=runRetirementPlan(source.config);
 card.invalidate();assert.equal(card.getCurrentComparison(),null);assert.equal(form.elements.reviewed.checked,false);assert.equal(ids.get('#mortalityRun').disabled,false);
 assert.equal(ids.get('#mortalityPensionBreakdown').dataset.pensionState,'unknown');
 const current=run();assert.ok(current);assert.equal(current.original.finalAsset,source.baseline.finalAsset);assert.notEqual(current.original.finalAsset,oldFinal);
}));

test('manually entered pension total, including explicit zero, never fabricates a component breakdown',()=>withMortalityUI(({form,ids,run,dispatch,content,find})=>{
 const panel=ids.get('#mortalityPensionBreakdown');
 for(const amount of ['210','0']){
  form.elements.survivorPension.value=amount;dispatch('survivorPension');assert.ok(run());
  assert.equal(panel.dataset.pensionState,'unknown');assert.match(content(panel),/内訳未確認/);
  for(const part of ['own-basic','own-employee','own-total','survivor-topup'])assert.equal(find(panel,`[data-pension-component="${part}"]`),undefined);
 }
}));

test('confirmed reference shows own pensions plus survivor top-up with no configuration mutation',()=>withMortalityUI(({source,form,ids,run,estimate,content,find})=>{
 const original=structuredClone(source.config),panel=ids.get('#mortalityPensionBreakdown');estimate();
 assert.equal(form.elements.survivorPension.value,'210');assert.equal(panel.dataset.pensionState,'reference');
 for(const [part,expected] of [['own-basic',90],['own-employee',50],['own-total',140],['survivor-topup',70],['total',210]]){
  const cell=find(panel,`[data-pension-component="${part}"]`);assert.ok(cell,part);
  assert.equal(Number(content(cell).replaceAll(',','').match(/-?\d+(?:\.\d+)?/)?.[0]),expected,part);
 }
 assert.ok(run());assert.deepEqual(source.config,original);assert.equal(panel.dataset.pensionState,'reference');
}));

for(const [name,value,type] of [
 ['survivorPension','211','input'],['preClaimPension','10','input'],
 ['deceasedEarnings','161','input'],['survivorEmployee','51','input'],['survivorBasic','91','input'],
 ['deathMonth','2060-02','change'],['deceased','spouse','change'],
 ['entitlement',false,'change'],['claimed',false,'change'],['deferral',false,'change']
])test(`pension reference and trial invalidate when ${name} changes`,()=>withMortalityUI(({form,card,ids,run,estimate,dispatch,content,find})=>{
 estimate();assert.ok(run());const panel=ids.get('#mortalityPensionBreakdown');assert.equal(panel.dataset.pensionState,'reference');
 if(typeof value==='boolean')form.elements[name].checked=value;else form.elements[name].value=value;
 dispatch(name,type);
 assert.equal(card.getCurrentComparison(),null);assert.equal(form.elements.reviewed.checked,false);
 assert.equal(panel.dataset.pensionState,'unknown');assert.match(content(panel),/内訳未確認/);
 assert.equal(find(panel,'[data-pension-component="survivor-topup"]'),undefined);
}));

for(const [name,value] of [['deathMonth','2060-02'],['deceased','spouse']])test(`input-only ${name} invalidates pension confirmations before blur`,()=>withMortalityUI(({form,card,ids,run,estimate,dispatch})=>{
 estimate();assert.ok(run());
 for(const key of ['entitlement','claimed','deferral'])assert.equal(form.elements[key].checked,true);
 assert.equal(ids.get('#mortalityPensionBreakdown').dataset.pensionState,'reference');
 form.elements[name].value=value;dispatch(name,'input');
 for(const key of ['entitlement','claimed','deferral'])assert.equal(form.elements[key].checked,false,`${name}: ${key}`);
 assert.equal(form.elements.reviewed.checked,false);assert.equal(card.getCurrentComparison(),null);
 assert.equal(ids.get('#mortalityPensionBreakdown').dataset.pensionState,'unknown');
 assert.match(ids.get('#mortalityEstimateNotice').textContent,/対象の方・年月.*確認を解除/);
}));

test('zero-allocation cost has no effect and weighted budget display preserves a valid pension reference',()=>withMortalityUI(({root,ids,run,estimate,dispatch,content,find})=>{
 estimate();const foodEffect=root.querySelector('[data-mortality-effect="food"]');assert.ok(foodEffect);assert.match(content(foodEffect),/配分0％.*影響0/);
 assert.match(ids.get('#mortalityAllocationTotal').textContent,/変更なし/);
 const food=root.querySelector('[data-mortality-share="food"]'),unallocated=root.querySelector('[data-mortality-share="unallocated"]');
 food.value='20';unallocated.value='80';root.querySelector('[data-mortality-factor="food"]').value='0.7';dispatch(food);
 assert.match(ids.get('#mortalityAllocationTotal').textContent,/94(?:\.0+)?％/);assert.match(ids.get('#mortalityAllocationTotal').textContent,/6(?:\.0+)?％/);
 assert.equal(ids.get('#mortalityPensionBreakdown').dataset.pensionState,'reference');
 const comparison=run();assert.ok(comparison);const equation=find(ids.get('#mortalityResults'),'#mortalityBudgetEquation');assert.ok(equation);
 const month=comparison.mortality.monthly.find(row=>row.postDeath);
 const expectations={baseline:month.baselineExpense,reduction:month.baselineExpense*0.06,result:month.baselineExpense*0.94};
 for(const [term,expected] of Object.entries(expectations)){
  const cell=find(equation,`[data-budget-term="${term}"]`);assert.ok(cell,term);
  const displayed=Number(content(cell).replaceAll(',','').match(/-?\d+(?:\.\d+)?/)?.[0]);
  assert.ok(Math.abs(displayed-expected)<=0.051,`${term}: ${displayed} vs ${expected}`);
 }
}));

test('reference signature rejects an unannounced adopted-config change on the next trial',()=>withMortalityUI(({source,ids,run,estimate})=>{
 estimate();assert.equal(ids.get('#mortalityPensionBreakdown').dataset.pensionState,'reference');
 source.config=structuredClone(source.config);source.config.plan.initialAsset+=1000;source.baseline=runRetirementPlan(source.config);
 const current=run();assert.ok(current);assert.equal(current.original.finalAsset,source.baseline.finalAsset);
 assert.equal(ids.get('#mortalityPensionBreakdown').dataset.pensionState,'unknown');
}));

test('64-year prefunding separates age-100 terminal shortfall from worst interim negative',()=>{
 const rows=[{annualAge:64,month:'2039-07'},{annualAge:65,month:'2040-07'},{annualAge:80,month:'2055-07'},{annualAge:100,month:'2075-07'}];
 const comparison={mortality:{monthly:[{endAsset:100},{endAsset:-100},{endAsset:50},{endAsset:-20}]}};
 const result=requiredAdditionalCapitalAt64(rows,comparison,0);
 assert.equal(result.available,true);
 assert.equal(result.boundaryMonth,'2039-07');
 assert.equal(result.terminalOnlyCapital,20);
 assert.equal(result.wholePeriodCapital,100);
 assert.equal(result.monthsAfter64,3);
 assert.equal(requiredAdditionalCapitalAt64(rows.slice(1),{mortality:{monthly:comparison.mortality.monthly.slice(1)}},0).available,false);
 assert.equal(requiredAdditionalCapitalAt64(rows.slice(0,3),{mortality:{monthly:comparison.mortality.monthly.slice(0,3)}},0).available,false);
});
