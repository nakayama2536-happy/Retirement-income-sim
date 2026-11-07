/**
 * Lifeplan v0.9.38 legacy expense migration PREFLIGHT, standalone, read-only.
 * No browser access, no remote calls, no writes, no migration/adoption.
 * Accept only synthetic or authorized local config snapshots. Never log raw amounts.
 * node lifeplan-expense-migration-preflight.mjs fictional-input.json
 */
const isRecord=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const integer=n=>Number.isInteger(n)&&n>=0&&n<=120;
const validMoney=x=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const itemId=(parent,row)=>`${parent}/${String(row.key)}`;
export function inspectLegacyExpenseMigration(config){
  if(!isRecord(config))throw new TypeError('Config object required');
  const legacy=config.cashflow?.expenseCategories;
  const standard=config.expenseDetail?.monthlyCategories;
  const diagnostics=[];const rows=[];const ids=new Set();
  const issue=(severity,code,path)=>diagnostics.push({severity,code,path});
  if(!Array.isArray(legacy))issue('block','NO_LEGACY_LIST','/cashflow/expenseCategories');
  if(standard!==undefined&&!Array.isArray(standard))issue('block','INVALID_STANDARD','/expenseDetail/monthlyCategories');
  if(Array.isArray(standard)&&standard.length)issue('review','STANDARD_ALREADY_PRESENT','/expenseDetail/monthlyCategories');
  const start=config.plan?.startAge,end=config.plan?.endAge;
  if(!integer(start)||!integer(end)||start>end)issue('block','INVALID_PLAN_RANGE','/plan');
  if(Array.isArray(legacy))legacy.forEach((group,gi)=>{
    const gp=`/cashflow/expenseCategories/${gi}`;
    if(!isRecord(group)||typeof group.key!=='string'||!group.key.trim()) {issue('block','GROUP_KEY_INVALID',gp);return;}
    if(group.key==='taxSocial') {issue('block','SPECIAL_TAX_MODE',gp);return;}
    if(!Array.isArray(group.items)) {issue('block','NO_CHILD_LIST',gp+'/items');return;}
    if(!group.items.length)issue('review','EMPTY_GROUP',gp);
    group.items.forEach((row,ri)=>{
      const path=`${gp}/items/${ri}`;
      if(!isRecord(row)||typeof row.key!=='string'||!row.key.trim()) {issue('block','ITEM_KEY_INVALID',path);return;}
      const id=itemId(group.key,row);
      if(ids.has(id))issue('block','DUPLICATE_ID',path);
      ids.add(id);
      if(!Array.isArray(row.periods)||row.periods.length===0){issue('block','NO_EXPLICIT_PERIODS',path);return;}
      const periods=[];
      row.periods.forEach((p,pi)=>{
        const pp=path+`/periods/${pi}`;
        if(!isRecord(p)||!integer(p.fromAge)||!integer(p.toAge)||p.fromAge>p.toAge||!validMoney(p.amount)){
          issue('block','INVALID_PERIOD_OR_AMOUNT',pp);return;
        }
        if(integer(start)&&integer(end)&&(p.fromAge<start||p.toAge>end))issue('review','OUTSIDE_PLAN_RANGE',pp);
        periods.push({fromAge:p.fromAge,toAge:p.toAge,amount:p.amount});
      });
      periods.sort((a,b)=>a.fromAge-b.fromAge||a.toAge-b.toAge);
      for(let i=1;i<periods.length;i++)if(periods[i].fromAge<=periods[i-1].toAge)issue('block','OVERLAP',path);
      const first=periods[0]?.fromAge,last=periods.at(-1)?.toAge;
      if(integer(end)&&last<end)issue('review','ENDS_BEFORE_PLAN',path);
      rows.push({sourcePath:path,id,groupKey:group.key,itemKey:row.key,periods,firstAge:first,lastAge:last});
    });
  });
  const legacyCount=rows.length;
  return {status:diagnostics.some(x=>x.severity==='block')?'blocked':diagnostics.some(x=>x.severity==='review')?'review-required':'eligible-for-mapping-review',
    legacyCount,standardGroupCount:Array.isArray(standard)?standard.length:null,
    referenceAge95:rows.filter(r=>r.periods.some(p=>p.fromAge<=95&&95<=p.toAge)).length,
    referenceAge96:rows.filter(r=>r.periods.some(p=>p.fromAge<=96&&96<=p.toAge)).length,
    diagnostics,
    // Deliberately no proposed replacement values: null and missing are not zero.
    proposedWrites:0,existingDataModified:false};
}