import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import crypto from 'node:crypto';
import {collect} from './tools/package-public.mjs';
import {mountMortalityComparison} from './mortality-ui.mjs';
import {runRetirementPlan} from './calc.mjs';
const read=n=>fs.readFileSync(new URL(n,import.meta.url),'utf8');
const app=read('app.mjs'),html=read('index.html'),ui=read('mortality-ui.mjs'),comparison=read('mortality-comparison.mjs');
test('read-only comparison has its own results subtab and mount',()=>{assert.match(html,/data-group-item="results" data-tab="mortality"/);assert.match(html,/id="mortalityComparisonContainer"/);assert.match(app,/mountMortalityComparison\(document.getElementById\('mortalityComparisonContainer'\)/);});
test('new mortality inputs do not count as adopted unsaved financial controls',()=>assert.match(app,/input\.closest\('#mortality, #pension/));
test('refresh invalidates a trial and external saved-state notifications block the cached baseline',()=>{assert.match(app,/mortalityCard\.invalidate\(\)/);assert.match(app,/mortalityCard\.invalidate\(\{external:true\}\)/);});
test('mortality modules have no persistent data, network, adoption or restore calls',()=>{for(const n of ['mortality-ui.mjs','mortality-comparison.mjs','mortality-preview.mjs'])assert.doesNotMatch(read(n),/\b(?:localStorage|sessionStorage|indexedDB)\s*[.\[]|\b(?:fetch|commitState|replaceState|restoreFullBackup|setItem)\s*\(/);});
test('full browser gate uses synthetic file and disallows external origins',()=>{const t=read('tools/browser-test/mortality-ui-check.mjs');assert.match(t,/mortality-synthetic\.json/);assert.match(t,/r\.abort\(\)/);assert.match(t,/__mortalityWrites/);assert.match(t,/\['webkit',webkit\]/);});
test('new cached assets have matching manifest entries and source bytes',()=>{const {out,runtime}=collect(new URL('.',import.meta.url).pathname),manifest=JSON.parse(out.get('distribution-manifest.json'));for(const name of ['mortality-preview.mjs','mortality-comparison.mjs','mortality-ui.mjs']){assert.ok(runtime.includes(name));const row=manifest.files.find(x=>x.name===name);assert.ok(row);assert.equal(row.sha256,crypto.createHash('sha256').update(out.get(name)).digest('hex'));}});
test('UI uses shared stage boundary, no age or 70-year pension inferred from existing totals',()=>{assert.match(ui,/survivorPensionTiming\(c,p,val\)/);assert.match(comparison,/needsPreClaim:monthlyIndex\(start\)>firstIndex/);assert.match(ui,/未配分/);});
test('totals explain extra expenses and same-month income change',()=>{assert.match(ui,/mortalityMonthlyTransition/);assert.match(ui,/mortalityCostBreakdown/);assert.match(ui,/比較：臨時支出（死亡費用込）/);assert.match(ui,/同じ年月の基準案と比較案/);});

// Small event/element model: exercises the actual UI handlers and real monthly
// calculator without claiming browser or persistent-storage integration coverage.
function withMortalityUI(check){
 const ids=new Map(),attrs=new Map(),previousDocument=globalThis.document;
 class Element{
  constructor(){this.value='';this.checked=false;this.hidden=false;this.required=false;this.disabled=false;this.dataset={};this.handlers={};this.children=[];this.textContent='';}
  append(...v){this.children.push(...v);}
  replaceChildren(...v){this.children=[...v];}
  setAttribute(k,v){attrs.set(`[${k}="${v}"]`,this);}
  querySelector(q){return ids.get(q)||attrs.get(q);}
  addEventListener(name,callback){this.handlers[name]=callback;}
 }
 globalThis.document={createElement:()=>new Element()};
 try{
  const root=new Element(),form=new Element();ids.set('#mortalityForm',form);
  for(const id of ['mortalityState','mortalityResults','mortalityCostRows','mortalityAllocationTotal','mortalityAgeHint','mortalityPreClaimRow','mortalityPreClaimHint','mortalityEstimateNotice','mortalityFictionalCosts','mortalityResetCosts','mortalitySuggestAge','mortalityEstimatePension','mortalityClear','mortalityRun'])ids.set('#'+id,new Element());
  form.elements={};
  for(const name of ['deceased','deathMonth','survivorPension','preClaimPension','funeral','deceasedEarnings','survivorEmployee','survivorBasic','entitlement','claimed','deferral','reviewed'])form.elements[name]=new Element();
  const source={config:JSON.parse(read('tools/browser-test/mortality-synthetic.json')).config};source.baseline=runRetirementPlan(source.config);
  form.elements.deceased.value='primary';form.elements.funeral.value='0';
  const card=mountMortalityComparison(root,{getConfig:()=>source.config,getBaseline:()=>source.baseline,runPlan:runRetirementPlan});
  form.elements.deathMonth.value='2060-01';form.elements.survivorPension.value='210';
  const run=()=>{form.elements.reviewed.checked=true;form.handlers.submit({preventDefault(){}});return card.getCurrentComparison();};
  check({source,form,card,ids,run});
 }finally{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;}
}
test('external invalidation blocks stale retry and cached reference actions until reload',()=>withMortalityUI(({form,card,ids,run})=>{
 assert.ok(run());card.invalidate({external:true});
 assert.equal(card.getCurrentComparison(),null);assert.equal(form.elements.reviewed.checked,false);
 for(const id of ['mortalityRun','mortalityEstimatePension','mortalitySuggestAge'])assert.equal(ids.get('#'+id).disabled,true);
 assert.equal(run(),null);assert.match(ids.get('#mortalityState').textContent,/別画面.*再読み込み/);
 form.elements.survivorPension.value='999';form.elements.deceasedEarnings.value='160';form.elements.survivorEmployee.value='50';form.elements.survivorBasic.value='90';
 for(const key of ['entitlement','claimed','deferral'])form.elements[key].checked=true;
 ids.get('#mortalityEstimatePension').handlers.click();assert.equal(form.elements.survivorPension.value,'999');
 form.elements.deathMonth.value='2061-01';ids.get('#mortalitySuggestAge').handlers.click();assert.equal(form.elements.deathMonth.value,'2061-01');
 card.invalidate();assert.equal(run(),null);assert.equal(ids.get('#mortalityRun').disabled,true);
}));
test('same-screen adopted-condition refresh permits a new calculation on the latest baseline',()=>withMortalityUI(({source,form,card,ids,run})=>{
 const initial=run();assert.ok(initial);const oldFinal=initial.original.finalAsset;
 source.config=structuredClone(source.config);source.config.plan.initialAsset+=1000;source.baseline=runRetirementPlan(source.config);
 card.invalidate();assert.equal(card.getCurrentComparison(),null);assert.equal(form.elements.reviewed.checked,false);assert.equal(ids.get('#mortalityRun').disabled,false);
 const current=run();assert.ok(current);assert.equal(current.original.finalAsset,source.baseline.finalAsset);assert.notEqual(current.original.finalAsset,oldFinal);
}));
