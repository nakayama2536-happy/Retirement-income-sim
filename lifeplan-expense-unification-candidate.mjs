/**
 * Candidate-only expense conversion for Retirement-income-sim v0.9.38.
 * No persistence, no browser, no network. The output is NOT safe to adopt in
 * v0.9.38 until its standard resolver supports explicit missing-coverage.
 */
import {inspectLegacyExpenseMigration} from './lifeplan-expense-migration-preflight.mjs';

const isObj=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const copy=x=>structuredClone(x);
const ident=x=>typeof x==='string'&&x.trim()!=='';
const own=(x,k)=>Object.prototype.hasOwnProperty.call(x,k);
export const MIGRATION_FORMAT='legacy-expense-to-standard-candidate-v1';

export function prepareExpenseUnification(config){
  const inspection=inspectLegacyExpenseMigration(config);
  const errors=[...inspection.diagnostics.filter(x=>x.severity==='block')];
  // Never silently resolve coexistence, implicit defaults, unusual categories,
  // price semantics, tax, travel, or already converted candidates.
  if(inspection.standardGroupCount>0)errors.push({severity:'block',code:'STANDARD_EXISTS',path:'/expenseDetail/monthlyCategories'});
  if(config?.expenseUnificationCandidate)errors.push({severity:'block',code:'CANDIDATE_ALREADY_PRESENT',path:'/expenseUnificationCandidate'});
  if(!isObj(config?.cashflow))errors.push({severity:'block',code:'NO_CASHFLOW',path:'/cashflow'});
  if(errors.length)return {status:'blocked',inspection,errors,candidate:null};
  const groups=[];const overrides=[];const coverage=[];
  const legacy=config.cashflow.expenseCategories;
  for(let gi=0;gi<legacy.length;gi++){
    const g=legacy[gi];
    if(!ident(g.key))continue;
    if(own(g,'amount')||own(g,'fallbackMonthly')||own(g,'periods'))errors.push({severity:'block',code:'UNSUPPORTED_GROUP_FIELDS',path:`/cashflow/expenseCategories/${gi}`});
    const rows=[];
    for(let ri=0;ri<g.items.length;ri++){
      const r=g.items[ri],src=`/cashflow/expenseCategories/${gi}/items/${ri}`;
      if(!ident(r.key)||!Array.isArray(r.periods))continue;
      // Preserve explicit period meaning and original order/metadata only in evidence;
      // no 0-value base row is asserted as the user's actual amount.
      if(['taxSocial'].includes(r.key)||own(r,'amount'))errors.push({severity:'block',code:'SPECIAL_ITEM_FIELDS',path:src});
      const periods=r.periods.map(x=>({fromAge:x.fromAge,toAge:x.toAge,amount:x.amount})).sort((a,b)=>a.fromAge-b.fromAge);
      rows.push({key:r.key,label:typeof r.label==='string'?r.label:r.key,amount:0});
      const coverageKey=`${g.key}/${r.key}`;
      coverage.push({key:coverageKey,groupKey:g.key,itemKey:r.key,sourcePath:src,periods:copy(periods)});
      for(const p of periods){
        overrides.push({kind:'expense',key:r.key,label:typeof r.label==='string'?r.label:r.key,
          fromAge:p.fromAge,toAge:p.toAge,amount:p.amount,unit:'monthly',
          source:'legacy-expense-unification-candidate'});
      }
    }
    groups.push({key:g.key,label:typeof g.label==='string'?g.label:g.key,items:rows});
  }
  // Work overrides use row.key globally; unlike the old parent-scoped key,
  // duplicate item keys across distinct groups are ambiguous.
  const used=new Map();
  for(const c of coverage){
    if(used.has(c.itemKey))errors.push({severity:'block',code:'CROSS_GROUP_ITEM_KEY_COLLISION',path:c.sourcePath});
    used.set(c.itemKey,c.sourcePath);
  }
  // Existing work overrides might collide even without an active work group.
  if(config.cashflow.periodOverrides?.some(x=>x?.kind==='expense'))errors.push({severity:'block',code:'EXISTING_EXPENSE_OVERRIDES',path:'/cashflow/periodOverrides'});
  if(config.cashflow.travel?.length||config.expenseDetail?.travelAnnualBase!==undefined)errors.push({severity:'block',code:'TRAVEL_SEPARATE_REVIEW',path:'/cashflow/travel'});
  if(errors.length)return {status:'blocked',inspection,errors,candidate:null};
  const candidate=copy(config);
  candidate.expenseDetail??={};
  candidate.expenseDetail.monthlyCategories=groups;
  candidate.cashflow.periodOverrides=[...(candidate.cashflow.periodOverrides??[]),...overrides];
  // A staging-only schema. Existing v0.9.38 resolver ignores this metadata;
  // adoption remains deliberately blocked until resolver is patched and tested.
  candidate.expenseUnificationCandidate={format:MIGRATION_FORMAT,adopted:false,
    sourceProfile:'public-v0.9',targetProfile:'work-v0.9.7',coverage,
    safety:'DO_NOT_ADOPT_WITH_V0.9.38_RESOLVER'};
  return {status:'candidate-only',inspection,errors:[],candidate,
    summary:{groups:groups.length,items:coverage.length,periodOverrides:overrides.length,
      95:coverage.filter(x=>x.periods.some(p=>p.fromAge<=95&&95<=p.toAge)).length,
      96:coverage.filter(x=>x.periods.some(p=>p.fromAge<=96&&96<=p.toAge)).length}};
}
/** Resolution semantics required after integration. Null is not zero. */
export function resolveUnifiedExpenseAtAge(candidate,groupKey,itemKey,age){
  if(!Number.isInteger(age)||age<0||age>120)throw Error('Invalid age');
  const m=candidate?.expenseUnificationCandidate;
  if(m?.format!==MIGRATION_FORMAT)throw Error('No compatible candidate');
  const found=m.coverage.filter(x=>x.groupKey===groupKey&&x.itemKey===itemKey);
  if(found.length!==1)return {status:found.length?'conflict':'missing',amount:null};
  const active=found[0].periods.filter(p=>p.fromAge<=age&&age<=p.toAge);
  return active.length===1?{status:'resolved',amount:active[0].amount}:active.length?{status:'conflict',amount:null}:{status:'missing',amount:null,reason:'outside-original-coverage'};
}