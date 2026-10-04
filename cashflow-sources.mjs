// I-02A: read-only adapters. Deliberately not imported by the running application.
// Amounts are in 万円. No inflation, tax calculation, persistence, or plan adoption.
const PUBLIC = 'public-v0.9', WORK = 'work-v0.9.7';
const PROFILES = [PUBLIC, WORK];
const own = (o, k) => o != null && Object.hasOwn(o, k);
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const clone = x => structuredClone(x);
const escape = x => String(x).replaceAll('~', '~0').replaceAll('/', '~1');
const component = x => encodeURIComponent(String(x));
const presentKey = x => (typeof x === 'string' && x.trim() !== '') || (typeof x === 'number' && Number.isFinite(x));

// An exact canonical comparison token, not a cryptographic hash. Contains private
// source values; callers must not log/export it as a public diagnostic.
export function cashflowSourceSignature(value) {
  if (value === undefined) return 'undefined';
  if (typeof value === 'number' && !Number.isFinite(value)) return `number:${value}`;
  if (Array.isArray(value)) return '[' + value.map(cashflowSourceSignature).join(',') + ']';
  if (object(value)) return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + cashflowSourceSignature(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
function numeric(raw) {
  if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) return {status:'missing', amount:null};
  if (!['number','string'].includes(typeof raw) || !Number.isFinite(Number(raw)) || Number(raw) < 0) return {status:'unsupported', amount:null};
  return {status:'resolved', amount:Number(raw)};
}
function ageRange(row) {
  const a = numeric(row?.fromAge), b = numeric(row?.toAge);
  if (a.status !== 'resolved' || b.status !== 'resolved' || !Number.isInteger(a.amount) || !Number.isInteger(b.amount) || b.amount < a.amount) return {type:'invalid'};
  return {type:'age', fromAge:a.amount, toAge:b.amount};
}
const covers = (period, age) => period.type === 'all' || (period.type === 'age' && age >= period.fromAge && age <= period.toAge);
const overlap = (a,b) => a.type === 'all' || b.type === 'all' || (a.type === 'age' && b.type === 'age' && a.fromAge <= b.toAge && b.fromAge <= a.toAge);
const convert = (amount, from, to) => from === to ? amount : from === 'monthly' ? amount * 12 : amount / 12;

export function inspectCashflowSources(config, {sourceProfile='unknown', identityBindings=[]}={}) {
  if (!object(config)) throw new TypeError('設定はオブジェクトで指定してください');
  if (![...PROFILES,'unknown'].includes(sourceProfile)) throw new TypeError('読取り元の形式が不明です');
  if (!Array.isArray(identityBindings)) throw new TypeError('確認済み対応は配列で指定してください');
  const source = clone(config), items = new Map(), rules = [], diagnostics = [], blockers = [], usedBindings = new Set();
  const cf = object(source.cashflow) ? source.cashflow : {}, detail = object(source.expenseDetail) ? source.expenseDetail : {};
  const hasPublic = own(source,'cashflow') && (!object(source.cashflow) || ['expenseCategories','travel','manualIncomeItems'].some(k=>own(cf,k)));
  const hasWork = own(source,'expenseDetail') || (own(cf,'periodOverrides') && (!Array.isArray(cf.periodOverrides) || cf.periodOverrides.length > 0));
  const availableProfiles = [hasPublic && PUBLIC, hasWork && WORK].filter(Boolean);
  const ref = (path,value) => ({path, signature:cashflowSourceSignature(value)});
  function diagnostic(code, path, message, details={}) { diagnostics.push({code,path,message,...details}); }
  function block(profile,kinds,path) {
    blockers.push({profile,kinds,path,reason:'invalid-source-container'});
    diagnostic('invalid-source-container',path,'読取り元が不正です。正常な旧値へ黙って戻りません',{profile,kinds});
  }
  if (own(source,'cashflow') && !object(source.cashflow)) for (const profile of PROFILES) block(profile,['expense','travel','budget','income'],'/cashflow');
  if (own(source,'expenseDetail') && !object(source.expenseDetail)) block(WORK,['expense','travel'],'/expenseDetail');
  if (own(cf,'periodOverrides') && !Array.isArray(cf.periodOverrides)) block(WORK,['expense','travel','budget','income'],'/cashflow/periodOverrides');
  function array(value, path) {
    if (value === undefined) return [];
    if (!Array.isArray(value)) { diagnostic('invalid-container',path,'配列ではないため旧値へ代替しません'); return []; }
    return value;
  }
  function bind(defaultId, path, row) {
    const matches = identityBindings.filter(b=>b?.sourcePath === path);
    if (!matches.length) return {itemId:defaultId, bindingStatus:'unbound'};
    matches.forEach(b=>usedBindings.add(b));
    if (matches.length !== 1 || typeof matches[0].itemId !== 'string' || !matches[0].itemId || matches[0].sourceSignature !== cashflowSourceSignature(row)) {
      diagnostic('invalid-identity-binding',path,'確認済み対応の重複・古い署名・対象IDを確認してください');
      return {itemId:defaultId,bindingStatus:'conflict'};
    }
    return {itemId:matches[0].itemId,bindingStatus:'confirmed'};
  }
  function item(profile, data, path, row) {
    const binding = data.fixed ? {itemId:data.itemId,bindingStatus:'fixed'} : bind(data.itemId,path,row);
    const itemId = binding.itemId;
    const variant = {...data, parentId:data.parentId ?? null, itemId, profile, sourceRefs:[ref(path,row)], children:[], identityStatus:data.identityStatus || 'resolved', bindingStatus:binding.bindingStatus};
    if (binding.bindingStatus === 'conflict') variant.identityStatus = 'conflict';
    const existing = items.get(itemId);
    if (existing) {
      if (existing.kind !== data.kind || existing.route !== data.route || existing.parentId !== (data.parentId ?? null)) {
        variant.identityStatus = 'conflict'; existing.variants.forEach(v=>v.identityStatus='conflict');
        diagnostic('incompatible-identity',path,'異なる用途や親を同じ項目IDへ結び付けられません',{itemId});
      }
      if (existing.variants.some(v=>v.profile === profile)) {
        variant.identityStatus = 'conflict'; existing.variants.filter(v=>v.profile === profile).forEach(v=>v.identityStatus='conflict');
        diagnostic('duplicate-identity',path,'同じ形式内で項目IDが重複しています',{itemId});
      }
      existing.variants.push(variant); existing.sourceRefs.push(...variant.sourceRefs);
    } else items.set(itemId,{itemId,parentId:data.parentId || null,kind:data.kind,label:data.label,unit:data.unit,route:data.route,priceBasis:data.priceBasis,sourceRefs:[...variant.sourceRefs],variants:[variant]});
    if (presentKey(data.key)) {
      const sameKeys=[...items.values()].flatMap(i=>i.variants).filter(v=>v !== variant && v.profile === profile && v.kind === data.kind && v.route === data.route && v.parentId === (data.parentId ?? null) && String(v.key) === String(data.key));
      if (sameKeys.length) {
        variant.identityStatus='conflict'; sameKeys.forEach(v=>v.identityStatus='conflict');
        diagnostic('duplicate-key',path,'同じ親の中でキーが重複しています',{itemId});
      }
    }
    return variant;
  }
  function rule(v, path, row, rawAmount, unit, period={type:'all'}, priority=10, options={}) {
    const parsed = numeric(rawAmount);
    let status = options.status || parsed.status;
    if (!['monthly','annual','once'].includes(unit) || period.type === 'invalid') status = 'unsupported';
    if (status !== 'resolved') diagnostic(period.type === 'invalid' ? 'invalid-period' : !['monthly','annual','once'].includes(unit) ? 'unknown-unit' : options.reason || 'invalid-or-missing-amount',path,'未入力・不正・未対応の値を0へ補正しません',{itemId:v.itemId,profile:v.profile,status});
    const result = {ruleRef:`${v.profile}:${component(v.itemId)}:${path}`,itemId:v.itemId,profile:v.profile,period,rawAmount:clone(rawAmount),amount:parsed.amount,unit,priceBasis:v.priceBasis,priority,status,sourceRefs:[ref(path,row)],metadata:clone(row),...options};
    // An explicit unsupported status never carries a usable computed amount.
    rules.push(result); return result;
  }
  function identity(row, path, prefix) {
    if (presentKey(row?.id)) return {itemId:`${prefix}/id:${component(row.id)}`,identityStatus:'resolved'};
    if (presentKey(row?.key)) return {itemId:`${prefix}/key:${component(row.key)}`,identityStatus:'resolved'};
    diagnostic('missing-identity',path,'キー・IDがありません。表示名や配列位置を永続IDにしません');
    return {itemId:`unresolved:${path}`,identityStatus:'missing'};
  }
  function periods(v, value, path, amountField, unit, priority=10) {
    if (value === undefined) { diagnostic('missing-periods',path,'期間未指定を明示0と区別します',{itemId:v.itemId}); return; }
    if (!Array.isArray(value)) { rule(v,path,value,undefined,unit,{type:'invalid'},priority); return; }
    for (let i=0;i<value.length;i++) rule(v,`${path}/${i}`,value[i],value[i]?.[amountField],unit,ageRange(value[i]),priority);
  }
  const baseBudgetRows = array(source.budgets,'/budgets');
  for (const profile of PROFILES) {
    const v = item(profile,{fixed:true,itemId:'management-budget',kind:'budget',label:'管理予算',unit:'annual',route:'budget-total',priceBasis:'plan-start-base'},'/budgets',source.budgets);
    periods(v,source.budgets,'/budgets','annualBudget','annual');
  }
  function expenses(profile, value, root) {
    if (value !== undefined && !Array.isArray(value)) {
      block(profile,['expense'],root); return;
    }
    const cats = array(value,root);
    for (let i=0;i<cats.length;i++) {
      const cat = cats[i], path = `${root}/${i}`;
      if (!object(cat)) { diagnostic('invalid-expense-row',path,'項目がオブジェクトではありません',{profile}); continue; }
      const v = item(profile,{...identity(cat,path,'expense'),parentId:null,kind:'expense',key:cat.key,label:cat.label ?? cat.key ?? '未確定項目',unit:'monthly',route:'budget-detail',priceBasis:cat.key === 'taxSocial' ? 'tax-method-dependent' : 'plan-start-base'},path,cat);
      const isTax = cat.key === 'taxSocial';
      if (isTax) {
        const manual = profile === PUBLIC && cf.taxSocialMode !== 'auto_if_possible';
        v.priceBasis = manual ? 'target-period-nominal' : 'tax-method-dependent';
        v.method = profile === PUBLIC ? (manual ? 'public-manual-fallback' : 'public-auto-if-possible') : 'work-income-tax-estimate-or-fallback';
        rule(v,path,cat,profile === PUBLIC ? cat.fallbackMonthly : cat.amount,'monthly',{type:'all'},10,manual ? {method:v.method} : {status:'unsupported',reason:'deferred-tax-calculation',method:v.method});
        if (profile === PUBLIC && !cat.fallbackMonthly) diagnostic('legacy-tax-fallback-default',path,'旧公開元はこの値を月4へ代替します。元値と旧挙動を分けて保持します',{itemId:v.itemId,legacyMonthlyAmount:4,legacyAnnualAmount:48,rawAmount:clone(cat.fallbackMonthly)});
        continue;
      }
      if (own(cat,'items') && !Array.isArray(cat.items)) { rule(v,`${path}/items`,cat.items,undefined,'monthly',{type:'invalid'}); continue; }
      const children = Array.isArray(cat.items) ? cat.items : [];
      v.aggregate = profile === PUBLIC || children.length > 0;
      for (let j=0;j<children.length;j++) {
        const child = children[j], childPath = `${path}/items/${j}`;
        if (!object(child)) { diagnostic('invalid-expense-row',childPath,'子項目が不正です',{profile}); v.incompleteChildren=true; continue; }
        const childTax = profile === WORK && child.key === 'taxSocial';
        const c = item(profile,{...identity(child,childPath,v.itemId),parentId:v.itemId,kind:'expense',key:child.key,label:child.label ?? child.key ?? '未確定項目',unit:'monthly',route:'budget-detail',priceBasis:childTax ? 'tax-method-dependent' : 'plan-start-base'},childPath,child);
        v.children.push(c.itemId);
        if (profile === PUBLIC) periods(c,child.periods,`${childPath}/periods`,'amount','monthly');
        else rule(c,childPath,child,child.amount,'monthly',{type:'all'},10,childTax ? {status:'unsupported',reason:'deferred-tax-calculation',method:'work-income-tax-estimate-or-fallback'} : {});
      }
      if (!v.aggregate) rule(v,path,cat,cat.amount,'monthly');
    }
  }
  expenses(PUBLIC,cf.expenseCategories,'/cashflow/expenseCategories');
  expenses(WORK,detail.monthlyCategories,'/expenseDetail/monthlyCategories');

  for (const profile of PROFILES) {
    const v = item(profile,{fixed:true,itemId:'travel-plan',kind:'travel',label:'旅行費',unit:'annual',route:'budget-detail',priceBasis:'plan-start-base'},profile === PUBLIC ? '/cashflow/travel' : '/expenseDetail/travelAnnualBase',profile === PUBLIC ? cf.travel : detail.travelAnnualBase);
    if (profile === PUBLIC) {
      if (own(cf,'travel')) periods(v,cf.travel,'/cashflow/travel','annualAmount','annual',20);
      baseBudgetRows.forEach((b,i)=>{
        const field = b?.travelReference != null ? 'travelReference' : 'travelMax';
        rule(v,`/budgets/${i}`,b,b?.[field],'annual',ageRange(b),10,{fallback:true,fallbackField:field});
      });
    } else {
      rule(v,'/expenseDetail/travelAnnualBase',detail.travelAnnualBase,detail.travelAnnualBase,'annual');
      if (!Array.isArray(detail.monthlyCategories) || !detail.monthlyCategories.length) v.unavailableReason = 'work-detail-not-active';
    }
  }
  for (const [i,row] of array(cf.manualIncomeItems,'/cashflow/manualIncomeItems').entries()) {
    const path = `/cashflow/manualIncomeItems/${i}`;
    if (!object(row)) { diagnostic('invalid-income-row',path,'追加収入参考が不正です'); continue; }
    for (const profile of PROFILES) {
      const v = item(profile,{...identity(row,path,'income-reference'),kind:'income',key:row.key,label:row.label ?? row.key,unit:row.unit,route:'income-reference',priceBasis:'nominal-fixed',adopted:false},path,row);
      periods(v,row.periods,`${path}/periods`,'amount',row.unit);
    }
  }

  const workExpenseVariants = () => [...items.values()].flatMap(i=>i.variants).filter(v=>v.profile === WORK && v.kind === 'expense');
  const overrideRows = array(cf.periodOverrides,'/cashflow/periodOverrides');
  for (const [i,row] of overrideRows.entries()) {
    const path = `/cashflow/periodOverrides/${i}`;
    if (!object(row)) { block(WORK,['expense','travel','budget','income'],path); continue; }
    let targets = [];
    if (row.kind === 'expense' && presentKey(row.key)) targets = workExpenseVariants().filter(v=>String(v.key) === String(row.key));
    if (row.kind === 'budget' && row.key === 'budget') targets = items.get('management-budget').variants.filter(v=>v.profile === WORK);
    if (row.kind === 'travel' && row.key === 'travel') targets = items.get('travel-plan').variants.filter(v=>v.profile === WORK);
    if (row.kind === 'income' && presentKey(row.key)) {
      const itemId = `income-posted/override/key:${component(row.key)}`;
      const existing = items.get(itemId)?.variants.find(v=>v.profile === WORK);
      targets = [existing || item(WORK,{itemId,kind:'income',key:row.key,label:row.label ?? row.key,unit:'annual',route:'income-posted',priceBasis:'nominal-fixed'},path,row)];
    }
    if (row.kind === 'expense' && targets.length === 0 && presentKey(row.key)) {
      const v = item(WORK,{itemId:`expense-added/key:${component(row.key)}`,kind:'expense',key:row.key,label:row.label ?? row.key,unit:'monthly',route:'budget-detail',priceBasis:'plan-start-base'},path,row);
      if (!Array.isArray(detail.monthlyCategories) || !detail.monthlyCategories.length) v.unavailableReason = 'work-detail-not-active';
      diagnostic('legacy-added-expense',path,'既存Workで追加内訳となる行。通常内訳へ自動結合しません',{itemId:v.itemId}); targets=[v];
    }
    if (targets.length !== 1) {
      diagnostic(targets.length ? 'ambiguous-override' : 'unmapped-override',path,'対象を一意に確定できません。表示名で修正・一括上書きしません',{targetIds:targets.map(v=>v.itemId)});
      for (const target of targets) rule(target,path,row,row.amount,row.unit,ageRange(row),30,{status:'conflict',reason:'ambiguous-override'});
      if (!targets.length) {
        const v = item(WORK,{itemId:`unresolved:${path}`,identityStatus:'missing',kind:row.kind,label:row.label ?? row.key,unit:row.unit,route:'unknown',priceBasis:'unknown'},path,row);
        rule(v,path,row,row.amount,row.unit,ageRange(row),30,{status:'unsupported',reason:'unmapped-override'});
      }
    } else rule(targets[0],path,row,row.amount,row.unit,ageRange(row),30,{priceBasis:row.kind === 'income' ? 'nominal-fixed' : 'plan-start-base',fundingTreatment:clone(row.fundingTreatment),generatedBy:row.source ?? null});
  }
  for (const [i,row] of array(source.events,'/events').entries()) {
    const path=`/events/${i}`;
    if (!object(row)) { diagnostic('invalid-event',path,'イベントが不正です'); continue; }
    for (const profile of PROFILES) {
      const v = item(profile,{...identity(row,path,'event'),kind:'event',label:row.label ?? row.name ?? row.type,unit:'once',route:row.type === 'income' ? 'income-posted' : row.type === 'expense' ? 'extra-expense' : 'unknown',priceBasis:row.type === 'expense' && row.inflationAdjusted ? 'plan-start-base' : 'nominal-fixed'},path,row);
      rule(v,path,row,row.amount,'once',{type:'date',date:clone(row.date)},10,{status:'unsupported',reason:'date-resolution-deferred',fundingTreatment:clone(row.fundingTreatment)});
    }
  }
  if (own(cf,'salaryLife')) {
    const v = item(WORK,{fixed:true,itemId:'pre65-budget',kind:'budget',label:'65歳前の採用済み給与生活設定',unit:'monthly',route:'budget-total',priceBasis:'plan-start-base'},'/cashflow/salaryLife',cf.salaryLife);
    rule(v,'/cashflow/salaryLife',cf.salaryLife,cf.salaryLife?.pre65MonthlyBudget,'monthly',{type:'funding-switch'},10,{status:'unsupported',reason:'monthly-funding-resolution-deferred'});
  }
  if (own(source,'ideco')) for (const profile of PROFILES) {
    const v = item(profile,{fixed:true,itemId:'ideco-transfer',kind:'asset-transfer',label:'iDeCo残高・受取・原資',unit:null,route:'asset-transfer',priceBasis:'unknown'},'/ideco',source.ideco);
    rule(v,'/ideco',source.ideco,undefined,null,{type:'funding-switch'},10,{status:'unsupported',reason:'asset-transfer-resolution-deferred'});
  }

  for (const b of identityBindings) if (!usedBindings.has(b)) diagnostic('unused-identity-binding',b?.sourcePath ?? '', '対応元がありません。古い対応を使い回しません');
  for (let i=0;i<rules.length;i++) for (let j=i+1;j<rules.length;j++) {
    const a=rules[i],b=rules[j];
    if (a.itemId === b.itemId && a.profile === b.profile && a.priority === b.priority && overlap(a.period,b.period)) diagnostic('overlapping-rules',a.sourceRefs[0].path,'同じ優先順位の期間指定が重複しています',{itemId:a.itemId,profile:a.profile,ruleRefs:[a.ruleRef,b.ruleRef]});
  }
  // Top-level descriptors must not display a shadow format's unit/label as the
  // selected profile's value. Unknown provenance exposes variant differences.
  for (const entry of items.values()) {
    const variants=sourceProfile === 'unknown' ? entry.variants : entry.variants.filter(v=>v.profile === sourceProfile);
    for (const field of ['label','unit','priceBasis']) entry[field]=variants.length && variants.every(v=>v[field] === variants[0][field]) ? variants[0][field] : null;
  }
  const view = {profile:sourceProfile,availableProfiles:availableProfiles.length ? availableProfiles : [...PROFILES],items:[...items.values()],rules,candidates:[{profile:PUBLIC,sourcePaths:['/cashflow/expenseCategories','/cashflow/travel','/cashflow/manualIncomeItems']},{profile:WORK,sourcePaths:['/expenseDetail','/cashflow/periodOverrides']}],diagnostics,blockers,retainedSource:source,retainedSourceSignature:cashflowSourceSignature(config)};
  // Evaluate finite age boundaries to expose cross-format differences at inspect
  // time as well as when resolving an individual value. Never choose a winner.
  if (sourceProfile === 'unknown' && view.availableProfiles.length === 2) {
    const ages = new Set([0]);
    for (const r of rules) if (r.period.type === 'age') { ages.add(r.period.fromAge); ages.add(r.period.toAge+1); }
    for (const entry of view.items) {
      const conflictAge = [...ages].find(age=>resolveBaseAmount(view,{itemId:entry.itemId,age}).reason === 'source-conflict');
      if (conflictAge !== undefined) diagnostic('source-conflict',entry.sourceRefs[0]?.path ?? '', '保存形式間の読取り結果が一致しません',{itemId:entry.itemId,exampleAge:conflictAge});
    }
  }
  return view;
}

function result(status, extra={}) { return {status,amount:null,unit:null,priceBasis:null,sourceRefs:[],suppressedRules:[],...extra}; }
function resolveProfile(view,itemId,age,profile,ancestors=new Set(),ignoreParent=false) {
  const entry=view.items.find(i=>i.itemId === itemId), variants=entry?.variants.filter(v=>v.profile === profile) || [];
  const blocked=view.blockers.filter(b=>b.profile === profile && b.kinds.includes(entry?.kind));
  if (blocked.length) return result('unsupported',{reason:'invalid-source-container',profile,sourceRefs:blocked.map(b=>({path:b.path}))});
  if (!variants.length) return result('missing',{reason:'source-not-present',profile});
  if (variants.length !== 1 || variants.some(v=>v.identityStatus !== 'resolved')) return result('conflict',{reason:'identity-unresolved',profile,sourceRefs:variants.flatMap(v=>v.sourceRefs)});
  const v=variants[0], base={profile,unit:v.unit,priceBasis:v.priceBasis,route:v.route,sourceRefs:v.sourceRefs};
  if (v.unavailableReason) return result('unsupported',{...base,reason:v.unavailableReason});
  if (ancestors.has(itemId)) return result('conflict',{...base,reason:'identity-cycle'});
  const next = new Set([...ancestors,itemId]);
  const all=view.rules.filter(r=>r.itemId === itemId && r.profile === profile);
  if (!ignoreParent && v.parentId) {
    const parentOverrides=view.rules.filter(r=>r.itemId === v.parentId && r.profile === profile && r.priority === 30 && (covers(r.period,age) || r.period.type === 'invalid'));
    if (parentOverrides.length) return result('unsupported',{...base,reason:'suppressed-by-parent',suppressedRules:all.filter(r=>covers(r.period,age)).map(r=>r.ruleRef),suppressedBy:parentOverrides.map(r=>r.ruleRef)});
  }
  const invalid=all.filter(r=>r.period.type === 'invalid');
  if (invalid.length) return result('unsupported',{...base,reason:'invalid-period',sourceRefs:invalid.flatMap(r=>r.sourceRefs)});
  const active=all.filter(r=>covers(r.period,age));
  if (active.length) {
    const priority=Math.max(...active.map(r=>r.priority)), winners=active.filter(r=>r.priority === priority);
    const suppressed=active.filter(r=>r.priority < priority);
    if (v.aggregate && priority === 30) suppressed.push(...view.rules.filter(r=>r.profile === profile && v.children.includes(r.itemId) && covers(r.period,age)));
    const facts={...base,priceBasis:winners.length === 1 ? winners[0].priceBasis : base.priceBasis,sourceRefs:winners.flatMap(r=>r.sourceRefs),suppressedRules:suppressed.map(r=>r.ruleRef),periods:winners.map(r=>r.period)};
    if (winners.length !== 1) return result('conflict',{...facts,reason:'overlapping-rules'});
    const r=winners[0];
    if (r.status !== 'resolved') return result(r.status,{...facts,reason:r.reason || 'invalid-or-missing-amount',rawAmount:clone(r.rawAmount)});
    if (!['monthly','annual'].includes(v.unit) || !['monthly','annual'].includes(r.unit)) return result('unsupported',{...facts,reason:'unknown-unit'});
    const amount=convert(r.amount,r.unit,v.unit);
    if (!Number.isFinite(amount)) return result('unsupported',{...facts,reason:'amount-overflow'});
    return result('resolved',{...facts,amount,fallback:Boolean(r.fallback),valueOrigin:r.fallback ? 'legacy-fallback' : 'explicit',method:r.method ?? null,fundingTreatment:clone(r.fundingTreatment)});
  }
  if (v.aggregate) {
    if (!v.children.length) return result('missing',{...base,reason:'empty-detail',legacyDefaultAmount:0});
    const children=v.children.map(id=>resolveProfile(view,id,age,profile,next,true));
    const partial=children.reduce((sum,c)=>sum+(c.status === 'resolved' ? convert(c.amount,c.unit,v.unit) : 0),0);
    if (!Number.isFinite(partial)) return result('unsupported',{...base,reason:'amount-overflow'});
    const status=children.some(c=>c.status === 'conflict') ? 'conflict' : children.some(c=>c.status === 'unsupported') ? 'unsupported' : children.some(c=>c.status !== 'resolved') || v.incompleteChildren ? 'missing' : 'resolved';
    return result(status,{...base,amount:status === 'resolved' ? partial : null,knownSubtotal:partial,unresolvedCount:children.filter(c=>c.status !== 'resolved').length+(v.incompleteChildren ? 1 : 0),sourceRefs:children.flatMap(c=>c.sourceRefs),suppressedRules:children.flatMap(c=>c.suppressedRules),periods:children.flatMap(c=>c.periods || []),reason:status === 'resolved' ? 'child-aggregate' : 'incomplete-detail'});
  }
  if (all.some(r=>!['age','all'].includes(r.period.type))) return result('unsupported',{...base,reason:all[0].reason || 'period-resolution-deferred'});
  return result('missing',{...base,reason:'no-period',...(profile === PUBLIC ? {legacyDefaultAmount:0} : {})});
}

export function resolveBaseAmount(view,{itemId,age}) {
  if (typeof age !== 'number' || !Number.isInteger(age) || age < 0) return result('unsupported',{reason:'invalid-query-age'});
  if (!view.items.some(i=>i.itemId === itemId)) return result('missing',{reason:'unknown-item'});
  if (view.profile !== 'unknown') return clone(resolveProfile(view,itemId,age,view.profile));
  const candidates=view.availableProfiles.map(profile=>resolveProfile(view,itemId,age,profile));
  if (candidates.length === 1) return clone({...candidates[0],candidates});
  const semantic=r=>cashflowSourceSignature({status:r.status,amount:r.amount,unit:r.unit,priceBasis:r.priceBasis,route:r.route,periods:r.periods || [],reason:r.status === 'resolved' ? null : r.reason,method:r.method ?? null,fundingTreatment:r.fundingTreatment});
  if (candidates.every(c=>semantic(c) === semantic(candidates[0]))) return clone({...candidates[0],profile:'common',sourceRefs:candidates.flatMap(c=>c.sourceRefs),suppressedRules:candidates.flatMap(c=>c.suppressedRules),candidates});
  return result('conflict',{reason:'source-conflict',candidates:clone(candidates),sourceRefs:clone(candidates.flatMap(c=>c.sourceRefs))});
}
