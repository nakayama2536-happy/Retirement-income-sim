/**
 * Read-only age-coverage adapter for an explicitly STAGED legacy-to-standard
 * expense candidate. Does not adopt, migrate, edit, or write config.
 * Only applies to the exact candidate schema; never changes native standard data.
 */
const WORK='work-v0.9.7';
const FORMAT='legacy-expense-to-standard-candidate-v1';
const SOURCE='legacy-expense-unification-candidate';
const record=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const validAge=x=>Number.isInteger(x)&&x>=0&&x<=120;
const money=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
const same=(a,b)=>a===b;
const out=(status,reason,sourceRefs=[])=>({status,reason,amount:null,unit:'monthly',priceBasis:'plan-start-base',sourceRefs,suppressedRules:[]});

/** Return null when the adapter does not apply, else a fail-closed resolution. */
export function stagedExpenseCoverageGuard(view,variant,allRules,age){
  if(variant?.profile!==WORK||variant?.kind!=='expense'||variant?.parentId==null)return null;
  const state=view?.retainedSource?.expenseUnificationCandidate;
  if(state===undefined)return null; // unchanged native standard handling
  const sourceRefs=variant.sourceRefs||[];
  const invalid=reason=>out('conflict',reason,sourceRefs);
  if(!record(state)||state.format!==FORMAT||!((state.adopted===false&&state.safety==='DO_NOT_ADOPT_WITH_V0.9.38_RESOLVER')||(state.adopted===true&&state.safety==='STANDARD_MIGRATED_WITH_COVERAGE_V1'))||state.targetProfile!==WORK||!Array.isArray(state.coverage))return invalid('migration-metadata-invalid');
  if(state.adopted===true&&(!record(view.retainedSource.expenseUnificationArchive)||Object.hasOwn(view.retainedSource.cashflow||{},'expenseCategories')||view.retainedSource.cashflow?.detailSourceProfile!==WORK))return invalid('migration-adoption-source-invalid');
  const path=sourceRefs[0]?.path;
  const m=/^\/expenseDetail\/monthlyCategories\/(\d+)\/items\/(\d+)$/.exec(String(path||''));
  if(!m)return null; // unrelated native standard item
  const group=view.retainedSource.expenseDetail?.monthlyCategories?.[Number(m[1])];
  const row=group?.items?.[Number(m[2])];
  if(!record(group)||!record(row)||row.key!==variant.key)return invalid('migration-item-changed');
  const entries=state.coverage.filter(c=>c.groupKey===group.key&&c.itemKey===row.key);
  if(entries.length===0)return null; // native item with no legacy coverage
  if(entries.length!==1||!Array.isArray(entries[0].periods)||row.amount!==0)return invalid('migration-candidate-drift');
  if(!validAge(age))return out('unsupported','invalid-query-age',sourceRefs);
  const periods=entries[0].periods;
  if(periods.some(p=>!record(p)||!validAge(p.fromAge)||!validAge(p.toAge)||p.fromAge>p.toAge||!money(p.amount)))return invalid('migration-period-invalid');
  const expected=[...periods].sort((a,b)=>a.fromAge-b.fromAge);
  if(expected.some((p,i)=>i>0&&p.fromAge<=expected[i-1].toAge))return invalid('migration-period-overlap');
  // Verify exact registered override values, without converting any omission to zero.
  const generated=allRules.filter(r=>r.generatedBy===SOURCE);
  // The standard source deliberately uses a zero-valued base placeholder.
  // It must not count as an unexpected manual override, but any alteration
  // of that placeholder remains a conflict.
  const base=allRules.filter(r=>r.generatedBy!==SOURCE && r.priority===10 && r.period?.type==='all' && r.status==='resolved' && r.amount===0 && r.unit==='monthly' && r.sourceRefs?.[0]?.path===path);
  const other=allRules.filter(r=>r.generatedBy!==SOURCE && !base.includes(r));
  if(base.length!==1||other.length||generated.length!==periods.length)return invalid('migration-overrides-changed');
  const seen=new Set();
  for(const r of generated){
    const i=expected.findIndex((p,i)=>!seen.has(i)&&r.period?.type==='age'&&same(r.period.fromAge,p.fromAge)&&same(r.period.toAge,p.toAge)&&same(r.amount,p.amount)&&r.status==='resolved'&&r.unit==='monthly'&&r.priority===30);
    if(i<0)return invalid('migration-overrides-changed');
    seen.add(i);
  }
  const matching=expected.filter(p=>p.fromAge<=age&&age<=p.toAge);
  if(matching.length===0)return out('missing','outside-original-coverage',sourceRefs);
  if(matching.length!==1)return invalid('migration-period-overlap');
  // The native Work resolver handles the verified in-range period override.
  return null;
}